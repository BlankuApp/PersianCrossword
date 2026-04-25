import type { CrosswordJson } from "../src/index";

export interface PuzzleSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly difficulty: "easy" | "medium" | "hard" | undefined;
  readonly author: string;
  readonly publishedAt: string;
  readonly rows: number;
  readonly cols: number;
  readonly json: CrosswordJson;
}

// Vite eager glob – at build time every *.json under /puzzles/ is bundled.
const modules = import.meta.glob<CrosswordJson>("../puzzles/*.json", {
  eager: true,
  import: "default",
});

function slugFromPath(path: string): string {
  const filename = path.split("/").pop() ?? path;
  return filename.replace(/\.json$/i, "");
}

function deriveSummary(path: string, json: CrosswordJson): PuzzleSummary {
  const slug = slugFromPath(path);
  const meta = json.meta ?? {};

  const id = meta.id ?? slug;
  const title = meta.title ?? slug;
  const description = meta.description ?? "";
  const difficulty = meta.difficulty;
  const author = meta.author ?? "";
  const publishedAt = meta.publishedAt ?? "";

  const rows = meta.size?.rows ?? json.grid.length;
  const cols = meta.size?.cols ?? (json.grid[0]?.length ?? 0);

  if (!meta.id) {
    console.warn(
      `[puzzleLibrary] Puzzle "${slug}" has no meta.id — using filename slug. ` +
        "Progress will break if the file is renamed. Add meta.id to fix this.",
    );
  }

  return { id, title, description, difficulty, author, publishedAt, rows, cols, json };
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
