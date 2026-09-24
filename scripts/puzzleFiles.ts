// Reads a local puzzle folder (default: puzzles/, kept out of git) and fingerprints each
// puzzle. Used by the upload script and the dev server. Runs in Node only; keep it free of
// TS-only runtime syntax (`node` strips types).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

export interface PuzzleImageFile {
  readonly kind: "solution" | "source";
  readonly name: string;
  readonly absPath: string;
  readonly hash: string;
}

export interface PuzzleFile {
  readonly id: string;
  // Relative to the puzzle folder, forward slashes: "1-50/14.json".
  readonly relPath: string;
  readonly jsonText: string;
  readonly images: readonly PuzzleImageFile[];
  readonly hash: string;
}

export const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

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

// Where a puzzle's images sit next to its JSON: {slug}.png (solution) and meta.sourceFile.
export function imagePaths(jsonPath: string, json: unknown): { solution: string; source?: string | undefined } {
  const folder = dirname(jsonPath);
  const slug = basename(jsonPath, extname(jsonPath));
  const sourceFile = (json as { meta?: { sourceFile?: unknown } } | null)?.meta?.sourceFile;
  return {
    solution: join(folder, `${slug}.png`),
    source: typeof sourceFile === "string" && sourceFile ? join(folder, sourceFile) : undefined,
  };
}

// The fingerprint covers the parsed JSON (formatting-only edits don't count) and the images'
// contents, so replacing a picture also counts as a change.
export function puzzleHash(json: unknown, images: readonly Pick<PuzzleImageFile, "kind" | "name" | "hash">[]): string {
  const imagePart = images.map((i) => `${i.kind}:${i.name}:${i.hash}`).join("|");
  return sha256(`${JSON.stringify(json)}\n${imagePart}`).slice(0, 16);
}

export function readPuzzleFiles(puzzlesDir: string): PuzzleFile[] {
  if (!existsSync(puzzlesDir)) return [];
  return listJsonFiles(puzzlesDir)
    .sort()
    .map((absPath) => {
      const jsonText = readFileSync(absPath, "utf8");
      const json = JSON.parse(jsonText) as { meta?: { id?: unknown } };
      const paths = imagePaths(absPath, json);
      const images = [
        imageFile("solution", paths.solution),
        paths.source ? imageFile("source", paths.source) : undefined,
      ].filter((i): i is PuzzleImageFile => i !== undefined);
      return {
        id: String(json.meta?.id ?? basename(absPath, extname(absPath))),
        relPath: relative(puzzlesDir, absPath).split("\\").join("/"),
        jsonText,
        images,
        hash: puzzleHash(json, images),
      };
    });
}
