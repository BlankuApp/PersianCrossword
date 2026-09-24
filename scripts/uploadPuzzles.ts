// Publishes a local puzzle folder to Firebase — the app's only source of puzzles.
//
//   npm run puzzles:upload -- [--dir puzzles] [--dry-run] [--prune]
//
// Only packs holding new or changed puzzles are rewritten, and the catalog goes last so an app
// never sees a pack hash before the pack itself. Puzzles that are published but missing from
// the folder stay published unless --prune is given. Layout and credentials: firebaseAdmin.ts.
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { initAdmin, listIds, parseArgs, type CatalogDoc, type PackEntry } from "./firebaseAdmin.ts";
import { readPuzzleFiles, type PuzzleFile, type PuzzleImageFile } from "./puzzleFiles.ts";
import { planPacks } from "./puzzlePacks.ts";

// Firestore rejects documents over 1 MiB; leave room for field names and overhead.
const MAX_PACK_BYTES = 900_000;

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const imageStoragePath = (id: string, image: PuzzleImageFile): string =>
  `puzzles/${id}/${image.hash}${extname(image.name).toLowerCase()}`;

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
  const { flags, dir } = parseArgs(process.argv.slice(2));
  const dryRun = flags.has("--dry-run");
  const prune = flags.has("--prune");

  const puzzles = readPuzzleFiles(dir);
  if (!puzzles.length) throw new Error(`No puzzles found in ${dir}.`);
  const duplicates = findDuplicateIds(puzzles);
  if (duplicates.length) throw new Error(`Duplicate puzzle ids:\n  ${duplicates.join("\n  ")}`);

  const { db, bucket } = initAdmin();
  const catalogRef = db.doc("catalog/index");
  const snap = await catalogRef.get();
  const current = snap.data() as Partial<CatalogDoc> | undefined;
  if (current && current.schema !== 2) throw new Error(`catalog/index has schema ${String(current.schema)}; expected 2.`);
  const currentPacks = current?.packs ?? {};

  const published = new Map<string, string>();
  for (const pack of Object.values(currentPacks)) {
    for (const [id, hash] of Object.entries(pack.puzzles)) published.set(id, hash);
  }
  const changed = puzzles.filter((p) => published.get(p.id) !== p.hash);
  const localIds = new Set(puzzles.map((p) => p.id));
  const missing = [...published.keys()].filter((id) => !localIds.has(id));
  const plan = planPacks(currentPacks, puzzles, prune);

  console.log(`${puzzles.length} puzzles in ${dir}, ${published.size} published.`);
  console.log(`${changed.length} new or changed${changed.length ? `: ${listIds(changed.map((p) => p.id))}` : ""}`);
  if (missing.length) {
    console.log(`${missing.length} published but not in the folder: ${listIds(missing)}` + (prune ? " — unpublishing" : " — kept (use --prune to unpublish)"));
  }
  if (!plan.dirty.length && !plan.deleted.length) {
    console.log("Nothing to publish.");
    return;
  }
  console.log(`Packs to write: ${plan.dirty.join(", ") || "none"}` + (plan.deleted.length ? `; to delete: ${plan.deleted.join(", ")}` : ""));
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

  const byId = new Map(puzzles.map((p) => [p.id, p]));
  for (const packId of plan.dirty) {
    const ref = db.doc(`puzzlePacks/${packId}`);
    const ids = Object.keys(plan.packs[packId]!.puzzles);
    // Published puzzles missing from the folder (no --prune) keep their stored entry.
    const old = ids.some((id) => !byId.has(id))
      ? (((await ref.get()).data()?.puzzles ?? {}) as Record<string, PackEntry>)
      : {};
    const entries: Record<string, PackEntry> = {};
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) {
        const kept = old[id];
        if (!kept) throw new Error(`Puzzle ${id} is listed in pack ${packId} but its data is missing.`);
        entries[id] = kept;
        continue;
      }
      const images: Record<string, string> = {};
      for (const image of p.images) images[image.kind] = imageStoragePath(p.id, image);
      entries[id] = { hash: p.hash, file: p.relPath, json: p.jsonText, images };
    }
    const doc = { schema: 2, hash: plan.packs[packId]!.hash, puzzles: entries };
    const bytes = Buffer.byteLength(JSON.stringify(doc));
    if (bytes > MAX_PACK_BYTES) throw new Error(`Pack ${packId} would be ${bytes} bytes; lower PACK_SIZE in scripts/puzzlePacks.ts.`);
    await ref.set(doc);
  }

  const catalog: CatalogDoc = { schema: 2, packs: plan.packs, updatedAt: Date.now() };
  await catalogRef.set(catalog);
  for (const packId of plan.deleted) await db.doc(`puzzlePacks/${packId}`).delete();
  console.log(`Published: ${plan.dirty.length} pack(s) written` + (plan.deleted.length ? `, ${plan.deleted.length} deleted` : "") + ".");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
