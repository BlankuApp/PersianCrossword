import { compilePuzzle, createState } from "../src/index";
import type { CrosswordJson, SavedCrosswordState } from "../src/index";

const STORAGE_PREFIX = "persian-crossword:";

// v3 grid rows are LTR (index 0 = leftmost), v2 are RTL (index 0 = rightmost).
// Reverse v3 rows so col=0 stays rightmost throughout the coord system.
export function normalizeGridDirection(json: CrosswordJson): CrosswordJson {
  if (json.version !== 3) return json;
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
const CHECK_MODE_KEY = "persian-crossword-check-mode";

export function loadCheckMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CHECK_MODE_KEY) === "true";
}

export function saveCheckMode(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHECK_MODE_KEY, String(value));
}

export interface ProgressInfo {
  readonly filled: number;
  readonly total: number;
  readonly percent: number;
  readonly completed: boolean;
}

export function computeProgress(json: CrosswordJson, saved: SavedCrosswordState): ProgressInfo {
  let puzzle;
  try {
    puzzle = compilePuzzle(normalizeGridDirection(json));
  } catch {
    return { filled: 0, total: 0, percent: 0, completed: false };
  }

  let state;
  try {
    state = createState(puzzle, saved);
  } catch {
    return { filled: 0, total: 0, percent: 0, completed: false };
  }

  let filled = 0;
  let total = 0;
  let allCorrect = true;
  const hasAnswers = puzzle.slots.some((s) => s.answer !== null);

  for (let row = 0; row < puzzle.size.rows; row++) {
    for (let col = 0; col < puzzle.size.cols; col++) {
      const coord = { row, col };
      if (puzzle.isBlock(coord)) continue;
      total++;
      const value = state.getCell(coord);
      if (value) {
        filled++;
      } else {
        allCorrect = false;
      }
    }
  }

  const percent = total === 0 ? 0 : Math.round((filled / total) * 100);
  const completed = filled === total && (!hasAnswers || allCorrect);

  return { filled, total, percent, completed };
}
