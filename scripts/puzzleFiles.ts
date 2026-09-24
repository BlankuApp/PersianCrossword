// Reads the puzzle files under puzzles/ and fingerprints each one. Shared by the Vite build
// (the app's built-in hashes) and scripts/uploadPuzzles.ts, so both sides agree on when a
// puzzle changed. Runs in Node only; keep it free of TS-only runtime syntax (`node` strips types).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

export interface PuzzleImageFile {
  readonly kind: "solution" | "source";
  readonly name: string;
  readonly absPath: string;
  readonly hash: string;
}

export interface PuzzleFile {
  readonly id: string;
  // Relative to the repo root, forward slashes: "puzzles/1-50/14.json".
  readonly relPath: string;
  readonly jsonText: string;
  readonly images: readonly PuzzleImageFile[];
  readonly hash: string;
}

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listJsonFiles(path);
    return name.toLowerCase().endsWith(".json") ? [path] : [];
  });
}

function imageFile(kind: PuzzleImageFile["kind"], absPath: string): PuzzleImageFile | undefined {
  try {
    return { kind, name: basename(absPath), absPath, hash: sha256(readFileSync(absPath)).slice(0, 16) };
  } catch {
    return undefined;
  }
}

// The fingerprint covers the parsed JSON (formatting-only edits don't count) and the images'
// contents, so replacing a picture also counts as a change.
export function puzzleHash(json: unknown, images: readonly Pick<PuzzleImageFile, "kind" | "name" | "hash">[]): string {
  const imagePart = images.map((i) => `${i.kind}:${i.name}:${i.hash}`).join("|");
  return sha256(`${JSON.stringify(json)}\n${imagePart}`).slice(0, 16);
}

export function readPuzzleFiles(rootDir: string): PuzzleFile[] {
  return listJsonFiles(join(rootDir, "puzzles"))
    .sort()
    .map((absPath) => {
      const jsonText = readFileSync(absPath, "utf8");
      const json = JSON.parse(jsonText) as { meta?: { id?: unknown; sourceFile?: unknown } };
      const slug = basename(absPath, extname(absPath));
      const folder = dirname(absPath);
      // Same image lookup as app/puzzleLibrary.ts: {slug}.png beside the JSON, plus meta.sourceFile.
      const sourceFile = typeof json.meta?.sourceFile === "string" ? json.meta.sourceFile : undefined;
      const images = [
        imageFile("solution", join(folder, `${slug}.png`)),
        sourceFile ? imageFile("source", join(folder, sourceFile)) : undefined,
      ].filter((i): i is PuzzleImageFile => i !== undefined);
      return {
        id: String(json.meta?.id ?? slug),
        relPath: relative(rootDir, absPath).split("\\").join("/"),
        jsonText,
        images,
        hash: puzzleHash(json, images),
      };
    });
}
