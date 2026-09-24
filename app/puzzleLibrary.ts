import { useSyncExternalStore } from "react";
import { validatePuzzleJson } from "../src/index";
import type { CrosswordJson } from "../src/index";
import { storedPuzzles, type StoredCatalog } from "./puzzleCatalog";

// Puzzles come from Firebase (app/puzzleSync.ts), kept on the device between visits. The app
// ships none. Unpublished drafts live apart, in the admin panel (app/admin).

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
  readonly solutionImageUrl: string | undefined;
  readonly sourceImageUrl: string | undefined;
  readonly error?: string | undefined;
}

export interface PuzzleSource {
  // Fallback id when meta.id is missing.
  readonly slug: string;
  readonly hash: string;
  readonly json: CrosswordJson;
  readonly solutionImageUrl?: string | undefined;
  readonly sourceImageUrl?: string | undefined;
}

// checking: a check for new puzzles is running (or hasn't run yet); offline/error: the last one failed.
export type PuzzleSyncState = "checking" | "ok" | "offline" | "error";

export interface LibrarySnapshot {
  readonly puzzles: readonly PuzzleSummary[];
  // False until the device's puzzles are loaded and the first check finished (or took too long
  // while there were already puzzles to show): an unknown id may still turn up before then.
  readonly ready: boolean;
  readonly sync: PuzzleSyncState;
}

function deriveSummary(source: PuzzleSource): PuzzleSummary {
  const { slug, json } = source;
  const common = {
    json,
    hash: source.hash,
    solutionImageUrl: source.solutionImageUrl,
    sourceImageUrl: source.sourceImageUrl,
  };
  try {
    const meta = json.meta ?? {};
    if (!meta.id) {
      console.warn(
        `[puzzleLibrary] Puzzle "${slug}" has no meta.id — using its file name. ` +
          "Progress will break if the file is renamed. Add meta.id to fix this.",
      );
    }
    const validation = validatePuzzleJson(json);
    return {
      id: String(meta.id ?? slug),
      title: meta.title ?? slug,
      newspaper: meta.newspaper ?? "",
      difficulty: meta.difficulty,
      author: meta.author ?? "",
      publishedAt: meta.publishedAt ?? "",
      rows: meta.size?.rows ?? json.grid.length,
      cols: meta.size?.cols ?? (json.grid[0]?.length ?? 0),
      ...common,
      error: validation.valid ? undefined : validation.issues.map((i) => i.message).join("\n"),
    };
  } catch (e) {
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
      ...common,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

let _snapshot: LibrarySnapshot = { puzzles: [], ready: false, sync: "checking" };
let _byId = new Map<string, PuzzleSummary>();
const _listeners = new Set<() => void>();

// Validating a puzzle is the costly part; reuse summaries whose content didn't change.
const _cache = new Map<string, PuzzleSummary>();

function summaryFor(source: PuzzleSource): PuzzleSummary {
  const key = `${source.slug}\n${source.hash}`;
  const cached = _cache.get(key);
  if (cached) return cached;
  const summary = deriveSummary(source);
  _cache.set(key, summary);
  return summary;
}

function update(patch: Partial<LibrarySnapshot>): void {
  _snapshot = { ..._snapshot, ...patch };
  for (const listener of _listeners) listener();
}

export function listPuzzles(): readonly PuzzleSummary[] {
  return _snapshot.puzzles;
}

export function getPuzzleById(id: string): PuzzleSummary | undefined {
  return _byId.get(id);
}

export function setPuzzleSources(sources: readonly PuzzleSource[]): void {
  const puzzles = sources.map(summaryFor);
  _byId = new Map(puzzles.map((p) => [p.id, p]));
  update({ puzzles });
}

// The device's downloaded puzzles, after loading them or a sync.
export function setStoredCatalog(stored: StoredCatalog): void {
  setPuzzleSources(storedPuzzles(stored).map(([id, p]) => ({ slug: id, ...p })));
}

export function setPuzzleSyncState(sync: PuzzleSyncState): void {
  if (sync !== _snapshot.sync) update({ sync });
}

export function markPuzzleLibraryReady(): void {
  if (!_snapshot.ready) update({ ready: true });
}

function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

export function usePuzzleLibrary(): LibrarySnapshot {
  return useSyncExternalStore(subscribe, () => _snapshot);
}
