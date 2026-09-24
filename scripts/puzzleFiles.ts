// Reads a local puzzle folder (default: puzzles/, kept out of git) and fingerprints each
// puzzle the same way the admin panel does (shared/cloudPuzzles.ts). Runs with tsx.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { imageHash, puzzleHash, type ImageKind, type ImageRef } from "../shared/cloudPuzzles.ts";
import { validatePuzzleJson, type CrosswordJson } from "../src/index.ts";

export interface PuzzleImageFile extends ImageRef {
  readonly absPath: string;
}

export interface PuzzleFile {
  readonly id: string;
  // Relative to the puzzle folder, forward slashes: "1-50/14.json".
  readonly relPath: string;
  readonly jsonText: string;
  readonly images: readonly PuzzleImageFile[];
  readonly hash: string;
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listJsonFiles(path);
    return name.toLowerCase().endsWith(".json") ? [path] : [];
  });
}

async function imageFile(kind: ImageKind, absPath: string): Promise<PuzzleImageFile | undefined> {
  if (!existsSync(absPath)) return undefined;
  return { kind, name: basename(absPath), absPath, hash: await imageHash(readFileSync(absPath)) };
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

export async function readPuzzleFiles(puzzlesDir: string): Promise<PuzzleFile[]> {
  if (!existsSync(puzzlesDir)) return [];
  return Promise.all(
    listJsonFiles(puzzlesDir)
      .sort()
      .map(async (absPath) => {
        const jsonText = readFileSync(absPath, "utf8");
        const json = JSON.parse(jsonText) as { meta?: { id?: unknown } };
        const paths = imagePaths(absPath, json);
        const images = [
          await imageFile("solution", paths.solution),
          paths.source ? await imageFile("source", paths.source) : undefined,
        ].filter((i): i is PuzzleImageFile => i !== undefined);
        return {
          id: String(json.meta?.id ?? basename(absPath, extname(absPath))),
          relPath: relative(puzzlesDir, absPath).split("\\").join("/"),
          jsonText,
          images,
          hash: await puzzleHash(json, images),
        };
      }),
  );
}

// The same check the app runs on every puzzle; a puzzle failing it would show as a broken row.
export function findInvalidPuzzles(puzzles: readonly Pick<PuzzleFile, "relPath" | "jsonText">[]): string[] {
  return puzzles.flatMap((p) => {
    try {
      const result = validatePuzzleJson(JSON.parse(p.jsonText) as CrosswordJson);
      return result.valid ? [] : [`${p.relPath}: ${result.issues.map((i) => i.message).join("; ")}`];
    } catch (e) {
      return [`${p.relPath}: ${e instanceof Error ? e.message : String(e)}`];
    }
  });
}
