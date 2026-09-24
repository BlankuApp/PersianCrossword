// Downloads every published puzzle and its images from Firebase into a local folder: a backup,
// or a fresh working copy for editing and re-uploading.
//
//   npm run puzzles:download -- [--dir puzzles] [--force]
//
// Files are written where they were uploaded from ("1-50/14.json" plus its images). Existing
// files with different content are left alone unless --force is given.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { initAdmin, parseArgs, type CatalogDoc, type PackEntry } from "./firebaseAdmin.ts";
import { imagePaths } from "./puzzleFiles.ts";

function writeIfChanged(path: string, data: Buffer, force: boolean, skipped: string[]): void {
  if (existsSync(path)) {
    if (readFileSync(path).equals(data)) return;
    if (!force) {
      skipped.push(path);
      return;
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

async function main(): Promise<void> {
  const { flags, dir } = parseArgs(process.argv.slice(2));
  const force = flags.has("--force");
  const { db, bucket } = initAdmin();

  const catalog = (await db.doc("catalog/index").get()).data() as CatalogDoc | undefined;
  if (catalog?.schema !== 2) throw new Error("No published catalog (schema 2) found.");

  const skipped: string[] = [];
  let count = 0;
  for (const packId of Object.keys(catalog.packs)) {
    const pack = (await db.doc(`puzzlePacks/${packId}`).get()).data() as { puzzles?: Record<string, PackEntry> } | undefined;
    for (const entry of Object.values(pack?.puzzles ?? {})) {
      const jsonPath = join(dir, entry.file);
      if (relative(dir, jsonPath).startsWith("..")) throw new Error(`Refusing to write outside ${dir}: ${entry.file}`);
      writeIfChanged(jsonPath, Buffer.from(entry.json, "utf8"), force, skipped);
      const local = imagePaths(jsonPath, JSON.parse(entry.json));
      for (const kind of ["solution", "source"] as const) {
        const remote = entry.images[kind];
        const target = local[kind];
        if (!remote || !target) continue;
        const [bytes] = await bucket.file(remote).download();
        writeIfChanged(target, bytes, force, skipped);
      }
      count++;
    }
  }
  console.log(`Downloaded ${count} puzzles into ${dir}.`);
  if (skipped.length) {
    console.log(`Left ${skipped.length} locally changed file(s) alone (use --force to overwrite):\n  ${skipped.join("\n  ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
