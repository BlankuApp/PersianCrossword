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
}

// Vite eager glob – at build time every *.json under /puzzles/ is bundled.
const modules = import.meta.glob<CrosswordJson>("../puzzles/*.json", {
  eager: true,
  import: "default",
});

// Eager glob for solution images, returned as bundled URLs.
const imageModules = import.meta.glob<string>("../puzzles/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const _imagesBySlug: Record<string, string> = {};
for (const [path, url] of Object.entries(imageModules)) {
  const filename = path.split("/").pop() ?? path;
  const slug = filename.replace(/\.png$/i, "");
  _imagesBySlug[slug] = url;
}

function slugFromPath(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.json$/i, "");
}

function deriveSummary(path: string, json: CrosswordJson): PuzzleSummary {
  const slug = slugFromPath(path);
  const meta = json.meta ?? {};

  const id = meta.id ?? slug;
  const title = meta.title ?? slug;
  const newspaper = meta.newspaper ?? "";
  const difficulty = meta.difficulty;
  const author = meta.author ?? "";
  const publishedAt = meta.publishedAt ?? "";

  const rows = meta.size?.rows ?? json.grid.length;
  const cols = meta.size?.cols ?? (json.grid[0]?.length ?? 0);

  const solutionImageUrl = _imagesBySlug[slug];

  if (!meta.id) {
    console.warn(
      `[puzzleLibrary] Puzzle "${slug}" has no meta.id — using filename slug. ` +
        "Progress will break if the file is renamed. Add meta.id to fix this.",
    );
  }

  return { id, title, newspaper, difficulty, author, publishedAt, rows, cols, json, solutionImageUrl };
}

const _all: PuzzleSummary[] = Object.entries(modules).map(([path, json]) =>
  deriveSummary(path, json as CrosswordJson),
);

export function listPuzzles(): readonly PuzzleSummary[] {
  return _all;
}

export function getPuzzleById(id: string): PuzzleSummary | undefined {
  return _all.find((p) => p.id === id);
}
