import { validatePuzzleJson } from "../src/index";
import type { CrosswordJson } from "../src/index";

export interface PuzzleSummary {
  readonly id: string;
  readonly title: string;
  readonly newspaper: string;
  readonly difficulty: string | undefined;
  readonly author: string;
  readonly publishedAt: string;
  readonly rows: number;
  readonly cols: number;
  readonly json: CrosswordJson;
  readonly solutionImageUrl: string | undefined;
  readonly sourceImageUrl: string | undefined;
  readonly error?: string;
}

// Vite eager glob – at build time every puzzle JSON under /puzzles/ is bundled.
const modules = import.meta.glob<CrosswordJson>("../puzzles/**/*.json", {
  eager: true,
  import: "default",
});

// Eager glob for all images (solution PNGs and source images), returned as bundled URLs.
const imageModules = import.meta.glob<string>(
  "../puzzles/**/*.{png,jpg,jpeg,webp}",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);

// Map from full path (e.g., "../puzzles/51-100/91.png") to URL
const _imagesByPath: Record<string, string> = {};
for (const [path, url] of Object.entries(imageModules)) {
  _imagesByPath[path] = url;
}

function slugFromPath(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.json$/i, "");
}

function deriveSummary(path: string, json: CrosswordJson): PuzzleSummary {
  const slug = slugFromPath(path);
  const meta = json.meta ?? {};

  const id = String(meta.id ?? slug);
  const title = meta.title ?? slug;
  const newspaper = meta.newspaper ?? "";
  const difficulty = meta.difficulty;
  const author = meta.author ?? "";
  const publishedAt = meta.publishedAt ?? "";

  const rows = meta.size?.rows ?? json.grid.length;
  const cols = meta.size?.cols ?? (json.grid[0]?.length ?? 0);

  // Resolve solution and source image URLs from the path
  const puzzleFolder = path.substring(0, path.lastIndexOf("/"));
  const solutionImageUrl = _imagesByPath[`${puzzleFolder}/${slug}.png`];

  // Source image: referenced by meta.sourceFile filename (optional)
  const sourceFile = meta.sourceFile;
  const sourceImageUrl = sourceFile
    ? _imagesByPath[`${puzzleFolder}/${sourceFile}`]
    : undefined;

  if (!meta.id) {
    console.warn(
      `[puzzleLibrary] Puzzle "${slug}" has no meta.id — using filename slug. ` +
        "Progress will break if the file is renamed. Add meta.id to fix this.",
    );
  }

  const validation = validatePuzzleJson(json);
  const error = validation.valid
    ? undefined
    : validation.issues.map((i) => i.message).join("\n");

  return { id, title, newspaper, difficulty, author, publishedAt, rows, cols, json, solutionImageUrl, sourceImageUrl, error };
}

const _all: PuzzleSummary[] = Object.entries(modules).map(([path, json]) => {
  try {
    return deriveSummary(path, json as CrosswordJson);
  } catch (e) {
    const slug = slugFromPath(path);
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[puzzleLibrary] Failed to load puzzle "${slug}":`, e);
    return {
      id: slug,
      title: slug,
      newspaper: "",
      difficulty: undefined,
      author: "",
      publishedAt: "",
      rows: 0,
      cols: 0,
      json: json as CrosswordJson,
      solutionImageUrl: undefined,
      sourceImageUrl: undefined,
      error: message,
    };
  }
});

export function listPuzzles(): readonly PuzzleSummary[] {
  return _all;
}

export function getPuzzleById(id: string): PuzzleSummary | undefined {
  return _all.find((p) => p.id === id);
}
