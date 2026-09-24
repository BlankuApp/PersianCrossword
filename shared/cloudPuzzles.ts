// The published-puzzle layout in Firebase, shared by the upload/download scripts (Node) and the
// app's sync and admin panel (browser). Uses Web Crypto, available in both.
//
//   catalog/index      { schema: 2, packs: { [packId]: { hash, puzzles: { [id]: puzzleHash } } }, updatedAt }
//                      — the one document every app reads per check
//   puzzlePacks/{pack} { schema: 2, hash, puzzles: { [id]: PackEntry } }
//                      — up to PACK_SIZE puzzles; JSON is stored as text (Firestore can't hold nested arrays)
//   drafts/{id}        { schema: 1, json, file, images: { [kind]: DraftImage }, createdAt, updatedAt }
//                      — unpublished puzzles, admin only
//   Storage puzzles/{id}/{imageHash}.{ext} — images; the name changes with the content
//
// A puzzle keeps its pack for life (new ones fill the newest pack), so an edit re-sends one pack
// and a new puzzle only the newest.

// ~7.5 KB per puzzle at most today: 50 stays well under Firestore's 1 MiB document limit.
export const PACK_SIZE = 50;
// Firestore rejects documents over 1 MiB; leave room for field names and overhead.
export const MAX_PACK_BYTES = 900_000;

export type ImageKind = "solution" | "source";

export interface CatalogPack {
  // Changes whenever any puzzle in the pack does; the app compares only this.
  readonly hash: string;
  // Puzzle id → puzzle hash.
  readonly puzzles: Readonly<Record<string, string>>;
}

export interface CatalogDoc {
  readonly schema: 2;
  readonly packs: Readonly<Record<string, CatalogPack>>;
  readonly updatedAt: number;
}

export interface PackEntry {
  readonly hash: string;
  // Path inside a local puzzle folder ("1-50/14.json"), so a download restores the same layout.
  readonly file: string;
  readonly json: string;
  // Storage paths.
  readonly images: { readonly solution?: string; readonly source?: string };
}

export interface PackDoc {
  readonly schema: 2;
  readonly hash: string;
  readonly puzzles: Readonly<Record<string, PackEntry>>;
}

// An image as the fingerprint sees it: its file name beside the JSON and its content hash.
export interface ImageRef {
  readonly kind: ImageKind;
  readonly name: string;
  readonly hash: string;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
}

export async function imageHash(bytes: Uint8Array): Promise<string> {
  return (await sha256(bytes)).slice(0, 16);
}

// The fingerprint covers the parsed JSON (formatting-only edits don't count) and the images'
// contents, so replacing a picture also counts as a change. Solution image first, then source.
export async function puzzleHash(json: unknown, images: readonly ImageRef[]): Promise<string> {
  const ordered = [...images].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "solution" ? -1 : 1));
  const imagePart = ordered.map((i) => `${i.kind}:${i.name}:${i.hash}`).join("|");
  return (await sha256(`${JSON.stringify(json)}\n${imagePart}`)).slice(0, 16);
}

export async function packHash(puzzles: Readonly<Record<string, string>>): Promise<string> {
  return (await sha256(Object.entries(puzzles).map(([id, hash]) => `${id}:${hash}`).sort().join("\n"))).slice(0, 16);
}

const extension = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
};

export const imageStoragePath = (id: string, image: Pick<ImageRef, "name" | "hash">): string =>
  `puzzles/${id}/${image.hash}${extension(image.name)}`;

export const IMAGE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export const imageContentType = (name: string): string => IMAGE_CONTENT_TYPES[extension(name)] ?? "application/octet-stream";

// Images of a published entry, rebuilt for the fingerprint: the hash is in the storage path;
// the names follow the local-folder convention ({slug}.png and meta.sourceFile).
export function entryImageRefs(entry: Pick<PackEntry, "file" | "images">, json: { meta?: { sourceFile?: unknown } }): ImageRef[] {
  const refs: ImageRef[] = [];
  const hashOf = (path: string) => (path.split("/").pop() ?? "").replace(/\.[^.]*$/, "");
  if (entry.images.solution) {
    const slug = (entry.file.split("/").pop() ?? "").replace(/\.json$/i, "");
    refs.push({ kind: "solution", name: `${slug}.png`, hash: hashOf(entry.images.solution) });
  }
  const sourceFile = json.meta?.sourceFile;
  if (entry.images.source && typeof sourceFile === "string") {
    refs.push({ kind: "source", name: sourceFile.split("/").pop() ?? sourceFile, hash: hashOf(entry.images.source) });
  }
  return refs;
}

const packNumber = (packId: string): number => Number.parseInt(packId.replace(/^p/, ""), 10) || 0;
const packIdOf = (n: number): string => `p${String(n).padStart(3, "0")}`;

// The pack a new puzzle goes into: the newest one while it has room, else a new one.
export function packForNewPuzzle(packs: Readonly<Record<string, Pick<CatalogPack, "puzzles">>>): string {
  const newest = Math.max(0, ...Object.keys(packs).map(packNumber));
  const last = packs[packIdOf(newest)];
  return last && Object.keys(last.puzzles).length < PACK_SIZE ? packIdOf(newest) : packIdOf(newest + 1);
}

export function packOf(packs: Readonly<Record<string, CatalogPack>>, id: string): string | undefined {
  return Object.keys(packs).find((pack) => id in packs[pack]!.puzzles);
}

export interface PackPlan {
  readonly packs: Record<string, CatalogPack>;
  // Packs whose document must be (re)written.
  readonly dirty: string[];
  // Packs left empty by removals; their documents are deleted.
  readonly deleted: string[];
}

// Applies puzzle additions/changes (id → hash) and removals to the catalog's packs.
export async function planPacks(
  current: Readonly<Record<string, CatalogPack>>,
  changes: readonly { readonly id: string; readonly hash: string }[],
  removals: readonly string[] = [],
): Promise<PackPlan> {
  const members: Record<string, Record<string, string>> = {};
  for (const [pack, { puzzles }] of Object.entries(current)) members[pack] = { ...puzzles };

  for (const { id, hash } of changes) {
    const catalogView = Object.fromEntries(Object.entries(members).map(([p, puzzles]) => [p, { puzzles }]));
    const pack = Object.keys(members).find((p) => id in members[p]!) ?? packForNewPuzzle(catalogView);
    (members[pack] ??= {})[id] = hash;
  }
  for (const id of removals) {
    for (const puzzles of Object.values(members)) delete puzzles[id];
  }

  const packs: Record<string, CatalogPack> = {};
  const dirty: string[] = [];
  const deleted: string[] = [];
  for (const [pack, puzzles] of Object.entries(members).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Object.keys(puzzles).length) {
      if (current[pack]) deleted.push(pack);
      continue;
    }
    const hash = await packHash(puzzles);
    packs[pack] = { hash, puzzles };
    if (current[pack]?.hash !== hash) dirty.push(pack);
  }
  return { packs, dirty, deleted };
}

// Open cells whose answer letter is still missing (" " in the grid; "" is a block).
export function countMissingLetters(json: { grid?: unknown }): number {
  if (!Array.isArray(json.grid)) return 0;
  let missing = 0;
  for (const row of json.grid) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) if (typeof cell === "string" && cell !== "" && !cell.trim()) missing++;
  }
  return missing;
}
