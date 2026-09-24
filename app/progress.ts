import { compilePuzzle, createState } from "../src/index";
import type { CrosswordJson, CrosswordPuzzle, CrosswordState, SavedCrosswordState } from "../src/index";

export const STORAGE_PREFIX = "persian-crossword:";

// Grid rows are stored LTR (index 0 = leftmost); reverse so col=0 stays
// rightmost throughout the internal coord system.
export function normalizeGridDirection(json: CrosswordJson): CrosswordJson {
  return { ...json, grid: json.grid.map((row) => [...row].reverse()) };
}

export function loadProgress(id: string): SavedCrosswordState {
  if (typeof window === "undefined") return { cells: {} };
  const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
  if (!raw) return { cells: {} };
  try {
    return JSON.parse(raw) as SavedCrosswordState;
  } catch {
    return { cells: {} };
  }
}

export function saveProgress(id: string, state: SavedCrosswordState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(state));
}

// Note: deliberately not prefixed with STORAGE_PREFIX — cloudProgress.syncProgress()
// treats every "persian-crossword:*" key as a puzzle id to sync to Firestore.
// "-v2": the old key held "false" for every browser that ever opened a puzzle
// (SolverPage persists the value on mount), so the on-by-default change needs a fresh key.
const CHECK_MODE_KEY = "persian-crossword-check-mode-v2";

export function loadCheckMode(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(CHECK_MODE_KEY) !== "false";
}

export function saveCheckMode(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHECK_MODE_KEY, String(value));
}

// Dash, not the STORAGE_PREFIX colon — same reason as CHECK_MODE_KEY above.
const SEEN_TUTORIAL_KEY = "persian-crossword-seen-tutorial";

export function loadSeenTutorial(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SEEN_TUTORIAL_KEY) === "true";
}

export function saveSeenTutorial(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_TUTORIAL_KEY, "true");
}

// Dash, not the STORAGE_PREFIX colon — same reason as CHECK_MODE_KEY above.
const GEMINI_KEY_KEY = "persian-crossword-gemini-key";

export function loadGeminiKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(GEMINI_KEY_KEY) ?? "";
}

export function saveGeminiKey(value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GEMINI_KEY_KEY, value);
}

export type PuzzleStatus = "new" | "progress" | "done";

export interface ProgressInfo {
  readonly status: PuzzleStatus;
  readonly percent: number;
}

// "Done" means every letter is right; puzzles without answers only need every square filled.
export function progressOf(puzzle: CrosswordPuzzle, state: CrosswordState): ProgressInfo {
  let filled = 0;
  let total = 0;
  for (let row = 0; row < puzzle.size.rows; row++) {
    for (let col = 0; col < puzzle.size.cols; col++) {
      const coord = { row, col };
      if (puzzle.isBlock(coord)) continue;
      total++;
      if (state.getCell(coord)) filled++;
    }
  }
  if (filled === 0) return { status: "new", percent: 0 };
  const percent = Math.round((filled / total) * 100);
  const done =
    filled === total &&
    puzzle.slots.every((slot) => ["correct", "unknownAnswer"].includes(state.checkSlot(slot.id)));
  return { status: done ? "done" : "progress", percent };
}

export function computeProgress(json: CrosswordJson, saved: SavedCrosswordState): ProgressInfo {
  const hasLetters = Object.keys(saved.cells).length > 0;
  try {
    const puzzle = compilePuzzle(normalizeGridDirection(json));
    return progressOf(puzzle, createState(puzzle, saved));
  } catch {
    return { status: hasLetters ? "progress" : "new", percent: 0 };
  }
}

// Per-puzzle sync record on this device, mirrored from the cloud scoreboard
// (users/{uid}/meta/scoreboard). Letters themselves stay in the STORAGE_PREFIX keys.
export interface ProgressEntry extends ProgressInfo {
  readonly v: number; // cloud version these letters build on; 0 = never uploaded
  readonly dirty: boolean; // changed on this device since the last upload
  readonly playedAt: number; // ms of the last edit; orders "continue solving", newer wins a clash
  readonly solvedAt?: number | undefined;
}

export interface SyncMirror {
  readonly owner: string | null; // uid whose progress this is; null = signed-out player
  readonly ownerAnonymous: boolean;
  readonly entries: Readonly<Record<string, ProgressEntry>>;
}

// Dash, not the STORAGE_PREFIX colon — same reason as CHECK_MODE_KEY above.
export const SYNC_KEY = "persian-crossword-sync";
const EMPTY_MIRROR: SyncMirror = { owner: null, ownerAnonymous: false, entries: {} };

export function loadMirror(): SyncMirror {
  if (typeof window === "undefined") return EMPTY_MIRROR;
  try {
    const raw = JSON.parse(window.localStorage.getItem(SYNC_KEY) ?? "null") as (SyncMirror & { schema: number }) | null;
    return raw?.schema === 1 ? raw : EMPTY_MIRROR;
  } catch {
    return EMPTY_MIRROR;
  }
}

export function saveMirror(mirror: SyncMirror): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SYNC_KEY, JSON.stringify({ schema: 1, ...mirror }));
}

export function progressEntry(
  info: ProgressInfo,
  v: number,
  dirty: boolean,
  playedAt: number,
  solvedAt?: number | undefined,
): ProgressEntry {
  const solved = info.status === "done" ? (solvedAt ?? playedAt) : 0;
  return { ...info, v, dirty, playedAt, ...(solved ? { solvedAt: solved } : {}) };
}

// A letter typed (or a reset) on this device: save it now, upload later.
export function recordEdit(id: string, saved: SavedCrosswordState, info: ProgressInfo): void {
  saveProgress(id, saved);
  const mirror = loadMirror();
  const prev = mirror.entries[id];
  saveMirror({
    ...mirror,
    entries: { ...mirror.entries, [id]: progressEntry(info, prev?.v ?? 0, true, Date.now(), prev?.solvedAt) },
  });
}

export function countUnsent(): number {
  return Object.values(loadMirror().entries).filter((entry) => entry.dirty).length;
}

export function localProgressIds(): string[] {
  return Object.keys(window.localStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .map((key) => key.slice(STORAGE_PREFIX.length));
}

// Signing out of a real account: its letters must not show up for the next player on this device.
export function clearLocalProgress(): void {
  for (const id of localProgressIds()) window.localStorage.removeItem(STORAGE_PREFIX + id);
  window.localStorage.removeItem(SYNC_KEY);
}
