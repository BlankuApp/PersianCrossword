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
  type PackDoc,
  type PackEntry,
} from "../../shared/cloudPuzzles";
import type { CrosswordJson } from "../../src/index";
import { validateStoredPuzzleJson } from "./puzzleValidation";
import { db, firebaseApp, storageFileUrl, usingEmulators } from "../firebase";
import { isValidPuzzleId, type ImportFile, type PlannedDraft } from "./importPlan";
import { toAsciiDigits } from "../persianNumbers";
import { ID_INVALID } from "../components/puzzleMeta";
import { computeProgress, loadProgress, localProgressIds, recordEdit } from "../progress";

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
  const problems = validateStoredPuzzleJson(json).issues.map((i) => i.message);
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
  nextEntry: (current: PackEntry | undefined, tx: Transaction) => Promise<PackEntry | null>,
  extra?: (tx: Transaction) => void,
): Promise<void> {
  if (!isValidPuzzleId(id)) throw new Error("شناسهٔ جدول نامعتبر است.");
  await runTransaction(db, async (tx) => {
    const catalogSnap = await tx.get(catalogRef);
    const catalog = catalogSnap.data() as CatalogDoc | undefined;
    if (catalog && catalog.schema !== 2) throw new Error(`catalog/index has schema ${String(catalog.schema)}`);
    const packs: Record<string, CatalogPack> = { ...catalog?.packs };
    const existingPack = packOf(packs, id);
    const packId = existingPack ?? packForNewPuzzle(packs);
    const packSnap = await tx.get(packRef(packId));
    const stored = (packSnap.data() as PackDoc | undefined)?.puzzles ?? {};

    const entry = await nextEntry(existingPack ? stored[id] : undefined, tx);
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
  const problems = validateStoredPuzzleJson(json).issues.map((i) => i.message);
  if (problems.length) throw new Error(problems.join("\n"));
  await setDoc(draftRef(draft.id), { json: toJsonText(json), updatedAt: Date.now() }, { merge: true });
}

export async function deleteDraft(id: string): Promise<void> {
  await deleteDoc(draftRef(id));
}

// The old local letters stay for other devices still syncing the previous id.
function copyLocalProgress(fromId: string, toId: string, json: CrosswordJson): void {
  try {
    if (localProgressIds().includes(fromId)) {
      const saved = loadProgress(fromId);
      recordEdit(toId, saved, computeProgress(json, saved));
    }
  } catch (error) {
    console.warn("[admin] draft renamed; original local progress retained", error);
  }
}

// Gives a draft a new id. Only drafts: a published puzzle's id keys players' progress for life.
// The draft document moves; its images stay where they are (storage paths are content-addressed).
export async function renameDraft(draft: Draft, json: CrosswordJson, newId: string): Promise<void> {
  const id = toAsciiDigits(newId.trim());
  if (!isValidPuzzleId(id)) throw new Error(ID_INVALID);
  if (id === draft.id) throw new Error("شناسهٔ تازه با شناسهٔ فعلی یکی است.");
  const problems = validateStoredPuzzleJson(json).issues.map((i) => i.message);
  if (problems.length) throw new Error(problems.join("\n"));
  const next: CrosswordJson = { ...json, meta: { ...json.meta, id } };
  await runTransaction(db, async (tx) => {
    const original = await tx.get(draftRef(draft.id));
    const target = await tx.get(draftRef(id));
    const catalogSnap = await tx.get(catalogRef);
    if (!original.exists()) throw new Error("این پیش‌نویس دیگر وجود ندارد؛ فهرست را دوباره بررسی کنید.");
    const source = original.data() as DraftDoc;
    // A newer draft must be reviewed instead of moving a stale snapshot over another admin's edits.
    if (source.json !== draft.jsonText) throw new Error("محتوای پیش‌نویس تغییر کرده است؛ آن را دوباره بررسی و ذخیره کنید.");
    if (target.exists()) throw new Error(`شناسهٔ «${id}» قبلاً استفاده شده است.`);
    if (packOf((catalogSnap.data() as CatalogDoc | undefined)?.packs ?? {}, id)) throw new Error(`جدول دیگری با شناسهٔ «${id}» منتشر شده است.`);
    const moved: DraftDoc = {
      schema: 1,
      json: toJsonText(next),
      file: draft.file.replace(/[^/]+$/, () => `${id}.json`),
      images: Object.fromEntries(Object.entries(draft.images).map(([kind, image]) => [kind, kind === "solution" ? { ...image, name: `${id}.png` } : image])),
      createdAt: source.createdAt,
      updatedAt: Date.now(),
    };
    tx.set(draftRef(id), moved);
    tx.delete(draftRef(draft.id));
  });
  copyLocalProgress(draft.id, id, next);
}

// A metadata save: the id only changes (a rename) when the form says so.
export async function saveDraftMeta(draft: Draft, json: CrosswordJson, newId: string): Promise<void> {
  if (newId.trim() === draft.id) await saveDraft(draft, json);
  else await renameDraft(draft, json, newId);
}

// Publishing never changes the id (rename the draft first). Players see the day it went live.
export async function publishDraft(draft: Draft, json: CrosswordJson = draft.json): Promise<void> {
  const id = draft.id;
  if (!isValidPuzzleId(id)) throw new Error(ID_INVALID);
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  json = { ...json, meta: { ...json.meta, id, publishedAt: today } };
  assertPublishable(json);
  const imagePaths = Object.fromEntries(Object.entries(draft.images).map(([kind, image]) => [kind, image.path]));
  const entry: PackEntry = { hash: "", file: draft.file, json: toJsonText(json), images: imagePaths };
  // Same fingerprint savePublishedPuzzle recomputes later (source image name = meta.sourceFile).
  const published: PackEntry = { ...entry, hash: await puzzleHash(json, entryImageRefs(entry, json)) };
  await commitPuzzle(
    id,
    async (current, tx) => {
      // A draft made from an unpublished puzzle reuses its id; a different live puzzle is never replaced.
      if (current) throw new Error(`جدول دیگری با شناسهٔ «${id}» منتشر شده است.`);
      const original = await tx.get(draftRef(id));
      if (!original.exists()) throw new Error("این پیش‌نویس دیگر وجود ندارد؛ فهرست را دوباره بررسی کنید.");
      // A newer draft must be reviewed instead of publishing a stale snapshot over another admin's edits.
      if ((original.data() as DraftDoc).json !== draft.jsonText) throw new Error("محتوای پیش‌نویس تغییر کرده است؛ آن را دوباره بررسی و منتشر کنید.");
      return published;
    },
    (tx) => tx.delete(draftRef(id)),
  );
}

// A fix to a published puzzle goes straight to players.
export async function savePublishedPuzzle(id: string, json: CrosswordJson): Promise<void> {
  // String(): older published puzzles can carry a numeric meta.id.
  if (json.meta?.id !== undefined && String(json.meta.id) !== id) throw new Error("شناسهٔ جدول منتشرشده قابل تغییر نیست.");
  const problems = validateStoredPuzzleJson(json).issues.map((i) => i.message);
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
  if (!isValidPuzzleId(planned.id)) throw new Error("شناسهٔ جدول نامعتبر است.");
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
