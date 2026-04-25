import { compilePuzzle, createState } from "../src/index";
import type { CrosswordJson, SavedCrosswordState } from "../src/index";

const STORAGE_PREFIX = "persian-crossword:";

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

export interface ProgressInfo {
  readonly filled: number;
  readonly total: number;
  readonly percent: number;
  readonly completed: boolean;
}

export function computeProgress(json: CrosswordJson, saved: SavedCrosswordState): ProgressInfo {
  const puzzle = compilePuzzle(json);
  const state = createState(puzzle, saved);

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
