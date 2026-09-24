// Publishes the puzzles under puzzles/ to Firebase, where the app downloads new and changed ones.
//
//   node scripts/uploadPuzzles.ts [--dry-run] [--prune]
//
// Cloud layout (read by app/puzzleSync.ts):
//   catalog/index   { schema: 1, puzzles: { [id]: hash }, removed: [id], updatedAt }
//                   — the one document every app reads per check
//   puzzles/{id}    { schema: 1, hash, json: "<CrosswordJson text>", images: { solution?, source? } }
//                   — the JSON is stored as text because Firestore can't hold nested arrays
//   Storage puzzles/{id}/{imageHash}.{ext} — images; the name changes with the content
//
// Only puzzles whose hash differs from the catalog are written, and the catalog goes last so
// an app never sees an entry before its document exists. --prune marks puzzles that are in the
// catalog but no longer under puzzles/ as removed (apps hide them); without it they stay listed.
//
// Credentials: GOOGLE_APPLICATION_CREDENTIALS=<service-account.json>, or
// FIRESTORE_EMULATOR_HOST + FIREBASE_STORAGE_EMULATOR_HOST for the local emulators.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { readPuzzleFiles, type PuzzleFile, type PuzzleImageFile } from "./puzzleFiles.ts";

const PROJECT_ID = "persiancrossword";
const BUCKET = "persiancrossword.firebasestorage.app";
// Each puzzle document is ~10 KB; 100 per commit stays far below Firestore's request limits.
const CHUNK = 100;

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const imageStoragePath = (id: string, image: PuzzleImageFile): string =>
  `puzzles/${id}/${image.hash}${extname(image.name).toLowerCase()}`;

const listIds = (ids: readonly string[]): string =>
  ids.length > 20 ? `${ids.slice(0, 20).join(", ")}, … (+${ids.length - 20} more)` : ids.join(", ");

function findDuplicateIds(puzzles: readonly PuzzleFile[]): string[] {
  const seen = new Map<string, string>();
  const problems: string[] = [];
  for (const p of puzzles) {
    const other = seen.get(p.id);
    if (other) problems.push(`id "${p.id}" is used by both ${other} and ${p.relPath}`);
    seen.set(p.id, p.relPath);
  }
  return problems;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const prune = args.has("--prune");

  const puzzles = readPuzzleFiles(resolve(import.meta.dirname, ".."));
  const duplicates = findDuplicateIds(puzzles);
  if (duplicates.length) throw new Error(`Duplicate puzzle ids:\n  ${duplicates.join("\n  ")}`);
  if (!puzzles.length) throw new Error("No puzzles found under puzzles/ — refusing to publish an empty catalog.");

  const app = initializeApp({
    projectId: PROJECT_ID,
    storageBucket: BUCKET,
    ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }),
  });
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket();
  const catalogRef = db.doc("catalog/index");

  const snap = await catalogRef.get();
  const current = (snap.data() ?? {}) as { puzzles?: Record<string, string>; removed?: string[] };
  const listed: Record<string, string> = { ...current.puzzles };
  const changed = puzzles.filter((p) => listed[p.id] !== p.hash);
  const localIds = new Set(puzzles.map((p) => p.id));
  const gone = Object.keys(listed).filter((id) => !localIds.has(id));

  console.log(`${puzzles.length} puzzles on disk, ${Object.keys(listed).length} in the catalog.`);
  console.log(`${changed.length} new or changed${changed.length ? `: ${listIds(changed.map((p) => p.id))}` : ""}`);
  if (gone.length) {
    console.log(`${gone.length} in the catalog but not on disk: ${listIds(gone)}` + (prune ? " — marking removed" : " — kept (use --prune to remove)"));
  }
  const removing = prune ? gone : [];
  if (!changed.length && !removing.length) {
    console.log("Nothing to publish.");
    return;
  }
  if (dryRun) {
    console.log("Dry run: nothing written.");
    return;
  }

  for (const p of changed) {
    for (const image of p.images) {
      const file = bucket.file(imageStoragePath(p.id, image));
      // Content-addressed names: an existing file already holds these exact bytes.
      const [exists] = await file.exists();
      if (exists) continue;
      await file.save(readFileSync(image.absPath), {
        resumable: false,
        contentType: CONTENT_TYPES[extname(image.name).toLowerCase()] ?? "application/octet-stream",
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
      });
    }
  }

  for (let i = 0; i < changed.length; i += CHUNK) {
    const batch = db.batch();
    for (const p of changed.slice(i, i + CHUNK)) {
      const images: Record<string, string> = {};
      for (const image of p.images) images[image.kind] = imageStoragePath(p.id, image);
      batch.set(db.doc(`puzzles/${p.id}`), { schema: 1, hash: p.hash, json: p.jsonText, images });
    }
    await batch.commit();
  }

  for (const p of changed) listed[p.id] = p.hash;
  for (const id of removing) delete listed[id];
  const removed = new Set(current.removed ?? []);
  for (const id of removing) removed.add(id);
  // A puzzle published again is no longer removed.
  for (const id of Object.keys(listed)) removed.delete(id);
  await catalogRef.set({ schema: 1, puzzles: listed, removed: [...removed].sort(), updatedAt: Date.now() });
  console.log(`Published ${changed.length} puzzle(s)` + (removing.length ? `, removed ${removing.length}` : "") + ".");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
