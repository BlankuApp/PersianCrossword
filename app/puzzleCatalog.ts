// What the app knows about the cloud puzzle catalog (written by scripts/uploadPuzzles.ts; layout
// in scripts/firebaseAdmin.ts) and the packs it downloaded. Pure logic; app/puzzleSync.ts does
// the network and app/puzzleStore.ts the device storage.
import type { CrosswordJson } from "../src/index";

export interface RemoteCatalog {
  // Pack id → pack hash; a pack is re-downloaded when its hash changes.
  readonly packs: Readonly<Record<string, string>>;
}

export interface DownloadedPuzzle {
  readonly hash: string;
  readonly json: CrosswordJson;
  // Full image URLs.
  readonly solutionImageUrl?: string | undefined;
  readonly sourceImageUrl?: string | undefined;
}

export interface StoredPack {
  readonly hash: string;
  readonly puzzles: Readonly<Record<string, DownloadedPuzzle>>;
}

export interface StoredCatalog {
  // Every published puzzle this device has, by pack.
  readonly packs: Readonly<Record<string, StoredPack>>;
}

export const EMPTY_STORED_CATALOG: StoredCatalog = { packs: {} };

// Validates catalog/index; anything unexpected (another schema, a broken write) is ignored.
export function parseRemoteCatalog(data: unknown): RemoteCatalog | null {
  const d = data as { schema?: unknown; packs?: unknown } | null | undefined;
  if (d?.schema !== 2 || typeof d.packs !== "object" || d.packs === null) return null;
  const packs: Record<string, string> = {};
  for (const [id, pack] of Object.entries(d.packs as Record<string, unknown>)) {
    const hash = (pack as { hash?: unknown } | null)?.hash;
    if (typeof hash !== "string") return null;
    packs[id] = hash;
  }
  return { packs };
}

export interface SyncPlan {
  // Packs this device doesn't have in their published version.
  readonly fetch: readonly string[];
  // Packs still current; any other stored pack was unpublished and is dropped.
  readonly keep: Readonly<Record<string, StoredPack>>;
}

export function planSync(stored: StoredCatalog, remote: RemoteCatalog): SyncPlan {
  const fetch: string[] = [];
  const keep: Record<string, StoredPack> = {};
  for (const [id, hash] of Object.entries(remote.packs)) {
    const have = stored.packs[id];
    if (have?.hash === hash) keep[id] = have;
    else fetch.push(id);
  }
  return { fetch, keep };
}

export function storedPuzzles(stored: StoredCatalog): [string, DownloadedPuzzle][] {
  return Object.values(stored.packs).flatMap((pack) => Object.entries(pack.puzzles));
}

// Compares what two catalogs hold, not the (large) puzzle contents.
export function sameStoredCatalog(a: StoredCatalog, b: StoredCatalog): boolean {
  const key = (s: StoredCatalog) => JSON.stringify(Object.entries(s.packs).map(([id, p]) => [id, p.hash]).sort());
  return key(a) === key(b);
}
