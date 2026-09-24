// Publishes a local puzzle folder to Firebase in bulk (the admin panel handles single puzzles).
//
//   npm run puzzles:upload -- [--dir puzzles] [--dry-run] [--overwrite] [--prune]
//
// Every puzzle must pass the app's validation first. New puzzles are published; puzzles that
// are already published but differ from the folder are skipped unless --overwrite, since the
// admin panel may have fixed them after this folder was made (refresh it with
// `npm run puzzles:download`). --prune unpublishes puzzles missing from the folder.
//
// Only packs that change are rewritten, and the catalog goes last. A device that reads a pack
// between those writes (or after a failed run) still takes the pack as it is and re-checks it on
// its next sync (app/puzzleSync.ts). Layout: shared/cloudPuzzles.ts.
import { readFileSync } from "node:fs";
import {
  imageContentType,
  imageStoragePath,
  MAX_PACK_BYTES,
  planPacks,
  type CatalogDoc,
  type PackDoc,
  type PackEntry,
} from "../shared/cloudPuzzles.ts";
import { initAdmin, listIds, parseArgs } from "./firebaseAdmin.ts";
import { findInvalidPuzzles, readPuzzleFiles, type PuzzleFile } from "./puzzleFiles.ts";

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
  const overwrite = flags.has("--overwrite");
  const prune = flags.has("--prune");

  const puzzles = await readPuzzleFiles(dir);
  if (!puzzles.length) throw new Error(`No puzzles found in ${dir}.`);
  const duplicates = findDuplicateIds(puzzles);
  if (duplicates.length) throw new Error(`Duplicate puzzle ids:\n  ${duplicates.join("\n  ")}`);
  const invalid = findInvalidPuzzles(puzzles);
  if (invalid.length) throw new Error(`Fix these puzzles first (nothing was uploaded):\n  ${invalid.join("\n  ")}`);

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
  const added = puzzles.filter((p) => !published.has(p.id));
  const differing = puzzles.filter((p) => published.has(p.id) && published.get(p.id) !== p.hash);
  const changed = overwrite ? [...added, ...differing] : added;
  const localIds = new Set(puzzles.map((p) => p.id));
  const missing = [...published.keys()].filter((id) => !localIds.has(id));
  const plan = await planPacks(currentPacks, changed, prune ? missing : []);

  console.log(`${puzzles.length} puzzles in ${dir}, ${published.size} published.`);
  console.log(`${added.length} new${added.length ? `: ${listIds(added.map((p) => p.id))}` : ""}`);
  if (differing.length) {
    console.log(
      `${differing.length} differ from the published version: ${listIds(differing.map((p) => p.id))}` +
        (overwrite ? " — overwriting" : " — skipped (use --overwrite to replace the published version)"),
    );
  }
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
        contentType: imageContentType(image.name),
        metadata: { cacheControl: "public, max-age=31536000, immutable" },
      });
    }
  }

  const byId = new Map(changed.map((p) => [p.id, p]));
  for (const packId of plan.dirty) {
    const ref = db.doc(`puzzlePacks/${packId}`);
    const ids = Object.keys(plan.packs[packId]!.puzzles);
    // Puzzles this run doesn't change keep their stored entry.
    const old = ids.some((id) => !byId.has(id)) ? (((await ref.get()).data() as PackDoc | undefined)?.puzzles ?? {}) : {};
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
    const doc: PackDoc = { schema: 2, hash: plan.packs[packId]!.hash, puzzles: entries };
    const bytes = Buffer.byteLength(JSON.stringify(doc));
    if (bytes > MAX_PACK_BYTES) throw new Error(`Pack ${packId} would be ${bytes} bytes; lower PACK_SIZE in shared/cloudPuzzles.ts.`);
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
