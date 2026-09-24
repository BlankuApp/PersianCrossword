import { useSyncExternalStore } from "react";
import builtinHashesByPath from "virtual:puzzle-hashes";
import { validatePuzzleJson } from "../src/index";
import type { CrosswordJson } from "../src/index";
import { composeCatalog, EMPTY_STORED_CATALOG, type DownloadedPuzzle, type StoredCatalog } from "./puzzleCatalog";

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
  // Content hash; changes whenever the puzzle or its images change.
  readonly hash: string;
  // Source file for built-in puzzles (enables debug editing); undefined for downloaded ones.
  readonly filePath: string | undefined;
  readonly solutionImageUrl: string | undefined;
  readonly sourceImageUrl: string | undefined;
  readonly error?: string | undefined;
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

interface SummarySource {
  readonly slug: string;
  readonly hash: string;
  readonly filePath: string | undefined;
  readonly solutionImageUrl: string | undefined;
  readonly sourceImageUrl: string | undefined;
}

function deriveSummary(json: CrosswordJson, source: SummarySource): PuzzleSummary {
  const { slug } = source;
  const meta = json.meta ?? {};

  const id = String(meta.id ?? slug);
  const title = meta.title ?? slug;
  const newspaper = meta.newspaper ?? "";
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

  const validation = validatePuzzleJson(json);
  const error = validation.valid
    ? undefined
    : validation.issues.map((i) => i.message).join("\n");

  return { id, title, newspaper, difficulty, author, publishedAt, rows, cols, json, ...source, error };
}

function brokenSummary(json: CrosswordJson, source: SummarySource, e: unknown): PuzzleSummary {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[puzzleLibrary] Failed to load puzzle "${source.slug}":`, e);
  return {
    id: source.slug,
    title: source.slug,
    newspaper: "",
    difficulty: undefined,
    author: "",
    publishedAt: "",
    rows: 0,
    cols: 0,
    json,
    ...source,
    error: message,
  };
}

function builtinSummary(path: string, json: CrosswordJson): PuzzleSummary {
  const slug = slugFromPath(path);
  // Resolve solution and source image URLs from the path
  const puzzleFolder = path.substring(0, path.lastIndexOf("/"));
  // Source image: referenced by meta.sourceFile filename (optional)
  const sourceFile = json.meta?.sourceFile;
  const source: SummarySource = {
    slug,
    hash: builtinHashesByPath[path.replace(/^\.\.\//, "")] ?? "",
    filePath: path,
    solutionImageUrl: _imagesByPath[`${puzzleFolder}/${slug}.png`],
    sourceImageUrl: sourceFile ? _imagesByPath[`${puzzleFolder}/${sourceFile}`] : undefined,
  };
  try {
    return deriveSummary(json, source);
  } catch (e) {
    return brokenSummary(json, source, e);
  }
}

function downloadedSummary(id: string, download: DownloadedPuzzle): PuzzleSummary {
  const source: SummarySource = {
    slug: id,
    hash: download.hash,
    filePath: undefined,
    solutionImageUrl: download.solutionImageUrl,
    sourceImageUrl: download.sourceImageUrl,
  };
  try {
    return deriveSummary(download.json, source);
  } catch (e) {
    return brokenSummary(download.json, source, e);
  }
}

const _builtin: PuzzleSummary[] = Object.entries(modules).map(([path, json]) =>
  builtinSummary(path, json as CrosswordJson),
);

// Built-in id → hash, for comparing against the cloud catalog.
export const builtinHashes: Readonly<Record<string, string>> = Object.fromEntries(
  _builtin.map((p) => [p.id, p.hash]),
);

interface LibrarySnapshot {
  readonly puzzles: readonly PuzzleSummary[];
  // False until the downloaded puzzles were read from the device and the first online check
  // finished (or gave up); an id missing before then may still turn up.
  readonly ready: boolean;
}

let _stored: StoredCatalog = EMPTY_STORED_CATALOG;
let _snapshot: LibrarySnapshot = { puzzles: _builtin, ready: false };
let _byId = new Map(_builtin.map((p) => [p.id, p]));
const _listeners = new Set<() => void>();

// Parsing a download is the costly part; reuse summaries whose hash didn't change.
const _downloadedCache = new Map<string, PuzzleSummary>();

function summaryForDownload(id: string, download: DownloadedPuzzle): PuzzleSummary {
  const cached = _downloadedCache.get(id);
  if (cached?.hash === download.hash) return cached;
  const summary = downloadedSummary(id, download);
  _downloadedCache.set(id, summary);
  return summary;
}

export function listPuzzles(): readonly PuzzleSummary[] {
  return _snapshot.puzzles;
}

export function getPuzzleById(id: string): PuzzleSummary | undefined {
  return _byId.get(id);
}

export function getStoredCatalog(): StoredCatalog {
  return _stored;
}

// Replaces the device's downloaded puzzles (after loading them or a sync) and refreshes
// every open list.
export function setStoredCatalog(stored: StoredCatalog): void {
  _stored = stored;
  const puzzles = composeCatalog(_builtin, stored).map(({ id, builtin, downloaded }) =>
    downloaded ? summaryForDownload(id, downloaded) : builtin!,
  );
  _snapshot = { puzzles, ready: _snapshot.ready };
  _byId = new Map(puzzles.map((p) => [p.id, p]));
  notify();
}

export function markPuzzleLibraryReady(): void {
  if (_snapshot.ready) return;
  _snapshot = { ..._snapshot, ready: true };
  notify();
}

function notify(): void {
  for (const listener of _listeners) listener();
}

function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function usePuzzleLibrary(): LibrarySnapshot {
  return useSyncExternalStore(subscribe, () => _snapshot);
}
