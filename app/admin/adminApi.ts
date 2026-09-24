// Admin-only Firebase operations: drafts, publishing and unpublishing. Loaded on demand (the
// admin panel and editing tools), so players never download it. Security rules only let
// accounts with the `admin` claim make these writes. Layout: shared/cloudPuzzles.ts.
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  setDoc,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";
import { connectStorageEmulator, getMetadata, getStorage, ref, uploadBytes } from "firebase/storage";
import {
  countMissingLetters,
  entryImageRefs,
  imageContentType,
  imageHash,
  imageStoragePath,
  MAX_PACK_BYTES,
  packForNewPuzzle,
  packHash,
  packOf,
  puzzleHash,
  type CatalogDoc,
  type CatalogPack,
  type ImageKind,
  type ImageRef,
  type PackDoc,
  type PackEntry,
} from "../../shared/cloudPuzzles";
import { validatePuzzleJson, type CrosswordJson } from "../../src/index";
import { db, firebaseApp, storageFileUrl, usingEmulators } from "../firebase";
import type { ImportFile, PlannedDraft } from "./importPlan";

export interface DraftImage {
  readonly path: string;
  readonly name: string;
  readonly hash: string;
}

interface DraftDoc {
  readonly schema: 1;
  readonly json: string;
  readonly file: string;
  readonly images: Partial<Record<ImageKind, DraftImage>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Draft {
  readonly id: string;
  readonly json: CrosswordJson;
  readonly jsonText: string;
  readonly file: string;
  readonly images: Partial<Record<ImageKind, DraftImage>>;
  readonly updatedAt: number;
  readonly solutionImageUrl: string | undefined;
  readonly sourceImageUrl: string | undefined;
}

const storage = getStorage(firebaseApp);
if (usingEmulators) connectStorageEmulator(storage, "127.0.0.1", 9199);

const catalogRef = doc(db, "catalog", "index");
const packRef = (packId: string) => doc(db, "puzzlePacks", packId);
const draftRef = (id: string) => doc(db, "drafts", id);

// Stored the way the local puzzle files are written.
const toJsonText = (json: CrosswordJson): string => `${JSON.stringify(json, null, 2)}\n`;

function toDraft(id: string, data: DraftDoc): Draft | undefined {
  try {
    const json = JSON.parse(data.json) as CrosswordJson;
    return {
      id,
      json,
      jsonText: data.json,
      file: data.file,
      images: data.images ?? {},
      updatedAt: data.updatedAt ?? 0,
      solutionImageUrl: data.images?.solution ? storageFileUrl(data.images.solution.path) : undefined,
      sourceImageUrl: data.images?.source ? storageFileUrl(data.images.source.path) : undefined,
    };
  } catch {
    console.warn(`[admin] draft ${id} holds unreadable JSON`);
    return undefined;
  }
}

export function listenDrafts(onChange: (drafts: Draft[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "drafts"),
    (snap) => onChange(snap.docs.flatMap((d) => toDraft(d.id, d.data() as DraftDoc) ?? [])),
    onError,
  );
}

// Problems that stop a puzzle from being published, in Persian for the admin UI.
export function publishProblems(json: CrosswordJson): string[] {
  const problems = validatePuzzleJson(json).issues.map((i) => i.message);
  const missing = countMissingLetters(json);
  if (missing) problems.push(`${missing.toLocaleString("fa-IR")} خانه هنوز حرف پاسخ ندارد؛ اول جدول را حل و ذخیره کنید.`);
  return problems;
}

function assertPublishable(json: CrosswordJson): void {
  const problems = publishProblems(json);
  if (problems.length) throw new Error(problems.join("\n"));
}

// Adds, replaces (entry) or removes (null) one published puzzle: its pack and the catalog change
// in one transaction, so players never see one without the other. `extra` adds writes (e.g. the
// draft) to the same transaction.
async function commitPuzzle(
  id: string,
  nextEntry: (current: PackEntry | undefined) => Promise<PackEntry | null>,
  extra?: (tx: Transaction) => void,
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const catalogSnap = await tx.get(catalogRef);
    const catalog = catalogSnap.data() as CatalogDoc | undefined;
    if (catalog && catalog.schema !== 2) throw new Error(`catalog/index has schema ${String(catalog.schema)}`);
    const packs: Record<string, CatalogPack> = { ...catalog?.packs };
    const existingPack = packOf(packs, id);
    const packId = existingPack ?? packForNewPuzzle(packs);
    const packSnap = await tx.get(packRef(packId));
    const stored = (packSnap.data() as PackDoc | undefined)?.puzzles ?? {};

    const entry = await nextEntry(existingPack ? stored[id] : undefined);
    const hashes: Record<string, string> = { ...packs[packId]?.puzzles };
    // The catalog lists what the pack holds; entries it doesn't list are leftovers.
    const entries: Record<string, PackEntry> = Object.fromEntries(Object.keys(hashes).flatMap((p) => (stored[p] ? [[p, stored[p]]] : [])));
    if (entry) {
      hashes[id] = entry.hash;
      entries[id] = entry;
    } else {
      delete hashes[id];
      delete entries[id];
    }

    if (Object.keys(hashes).length) {
      const hash = await packHash(hashes);
      const pack: PackDoc = { schema: 2, hash, puzzles: entries };
      const bytes = new TextEncoder().encode(JSON.stringify(pack)).length;
      if (bytes > MAX_PACK_BYTES) throw new Error(`بستهٔ ${packId} از حد مجاز Firestore بزرگ‌تر می‌شود.`);
      packs[packId] = { hash, puzzles: hashes };
      tx.set(packRef(packId), pack);
    } else {
      delete packs[packId];
      tx.delete(packRef(packId));
    }
    tx.set(catalogRef, { schema: 2, packs, updatedAt: Date.now() } satisfies CatalogDoc);
    extra?.(tx);
  });
}

export async function saveDraft(draft: Draft, json: CrosswordJson): Promise<void> {
  // A draft that fails validation could no longer be opened in the solver.
  const problems = validatePuzzleJson(json).issues.map((i) => i.message);
  if (problems.length) throw new Error(problems.join("\n"));
  await setDoc(draftRef(draft.id), { json: toJsonText(json), updatedAt: Date.now() }, { merge: true });
}

export async function deleteDraft(id: string): Promise<void> {
  await deleteDoc(draftRef(id));
}

export async function publishDraft(draft: Draft, json: CrosswordJson = draft.json): Promise<void> {
  assertPublishable(json);
  const images = Object.entries(draft.images).map(([kind, image]): ImageRef => ({ kind: kind as ImageKind, name: image.name, hash: image.hash }));
  const entry: PackEntry = {
    hash: await puzzleHash(json, images),
    file: draft.file,
    json: toJsonText(json),
    images: Object.fromEntries(Object.entries(draft.images).map(([kind, image]) => [kind, image.path])),
  };
  await commitPuzzle(
    draft.id,
    async (current) => {
      // A draft made from an unpublished puzzle reuses its id; a different live puzzle is never replaced.
      if (current) throw new Error(`جدول دیگری با شناسهٔ «${draft.id}» منتشر شده است.`);
      return entry;
    },
    (tx) => tx.delete(draftRef(draft.id)),
  );
}

// A fix to a published puzzle goes straight to players.
export async function savePublishedPuzzle(id: string, json: CrosswordJson): Promise<void> {
  const problems = validatePuzzleJson(json).issues.map((i) => i.message);
  if (problems.length) throw new Error(problems.join("\n"));
  await commitPuzzle(id, async (current) => {
    if (!current) throw new Error("این جدول منتشر نشده است.");
    return { ...current, json: toJsonText(json), hash: await puzzleHash(json, entryImageRefs(current, json)) };
  });
}

// Takes a puzzle off the players' list and keeps it as a draft for more work.
export async function unpublishPuzzle(id: string): Promise<void> {
  let draft: DraftDoc | undefined;
  await commitPuzzle(
    id,
    async (current) => {
      if (!current) throw new Error("این جدول منتشر نشده است.");
      const json = JSON.parse(current.json) as CrosswordJson;
      const images: Partial<Record<ImageKind, DraftImage>> = {};
      for (const image of entryImageRefs(current, json)) {
        const path = current.images[image.kind];
        if (path) images[image.kind] = { path, name: image.name, hash: image.hash };
      }
      const now = Date.now();
      draft = { schema: 1, json: current.json, file: current.file, images, createdAt: now, updatedAt: now };
      return null;
    },
    (tx) => {
      if (draft) tx.set(draftRef(id), draft);
    },
  );
}

async function uploadImage(id: string, file: ImportFile, name: string): Promise<DraftImage> {
  const hash = await imageHash(file.bytes);
  const path = imageStoragePath(id, { name, hash });
  const target = ref(storage, path);
  // Content-addressed: an existing file already holds these exact bytes.
  const exists = await getMetadata(target).then(
    () => true,
    () => false,
  );
  if (!exists) {
    await uploadBytes(target, file.bytes, {
      contentType: imageContentType(name),
      cacheControl: "public, max-age=31536000, immutable",
    });
  }
  return { path, name, hash };
}

export async function createDraft(planned: PlannedDraft): Promise<void> {
  const images: Partial<Record<ImageKind, DraftImage>> = {};
  for (const image of planned.images) images[image.kind] = await uploadImage(planned.id, image.file, image.name);
  const now = Date.now();
  const doc: DraftDoc = { schema: 1, json: planned.jsonText, file: planned.file, images, createdAt: now, updatedAt: now };
  // The panel's lists can be stale (startup, another tab): re-check the id where it's written.
  await runTransaction(db, async (tx) => {
    const [draftSnap, catalogSnap] = [await tx.get(draftRef(planned.id)), await tx.get(catalogRef)];
    const packs = (catalogSnap.data() as CatalogDoc | undefined)?.packs ?? {};
    if (draftSnap.exists() || packOf(packs, planned.id)) throw new Error(`شناسهٔ «${planned.id}» قبلاً استفاده شده است.`);
    tx.set(draftRef(planned.id), doc);
  });
}
