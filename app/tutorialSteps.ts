// Pure data + advance logic for the animated راهنما tutorial.
// The demo grid is a 4×4 layout (RTL, col 0 = rightmost): across مرز fills
// row 0's open cells and down مادر fills col 1, crossing at "0-1" — the
// FIRST cell of مادر — so selecting the down word never has to jump the
// active cell before typing starts; it's already sitting on م.

// Cell ids are "{row}-{col}" in the RTL coord system (col 0 = rightmost).
export type DemoCellId = `${number}-${number}`;

export const DEMO_ROWS = 4;
export const DEMO_COLS = 4;

// true = block. Indexed [row][col] with col 0 = rightmost.
export const DEMO_BLOCKS: readonly (readonly boolean[])[] = [
  [true, false, false, false],
  [false, false, false, false],
  [false, false, true, true],
  [true, false, false, false],
];

export const ACROSS_CELLS: readonly DemoCellId[] = ["0-1", "0-2", "0-3"]; // م ر ز
export const DOWN_CELLS: readonly DemoCellId[] = ["0-1", "1-1", "2-1", "3-1"]; // م ا د ر
export const CROSSING_CELL: DemoCellId = "0-1";

export const ACROSS_CLUE = "سرحد";
export const DOWN_CLUE = "والده";

// 4 real letters of مادر + 2 decoys, fixed order (indices: ر=0, م=2, ا=4, د=5).
export const DEMO_TRAY: readonly string[] = ["ر", "ب", "م", "س", "ا", "د"];

export type HandTarget =
  | { readonly kind: "cell"; readonly cell: DemoCellId }
  | { readonly kind: "tray"; readonly index: number }
  | { readonly kind: "backspace" }
  | { readonly kind: "clue" }
  | { readonly kind: "rest" };

// Every frame is an absolute snapshot of the whole visual state, so jumping
// to any step via a dot is just {stepIndex, frameIndex: 0} — nothing accumulates.
export interface DemoFrame {
  readonly holdMs: number;
  readonly hand: HandTarget;
  readonly tap: boolean;
  readonly activeWord: "across" | "down" | null;
  readonly selected: DemoCellId | null;
  readonly letters: Partial<Record<DemoCellId, string>>;
  readonly clueHighlight?: boolean;
}

export interface TutorialStep {
  readonly id: string;
  readonly message: string;
  readonly frames: readonly DemoFrame[];
}

export interface PlaybackPos {
  readonly stepIndex: number;
  readonly frameIndex: number;
}

const REST: HandTarget = { kind: "rest" };
const CROSS: HandTarget = { kind: "cell", cell: CROSSING_CELL };
const CLUE: HandTarget = { kind: "clue" };
const BACKSPACE: HandTarget = { kind: "backspace" };

function tray(index: number): HandTarget {
  return { kind: "tray", index };
}

const NO_LETTERS: Partial<Record<DemoCellId, string>> = {};
const M: Partial<Record<DemoCellId, string>> = { "0-1": "م" };
const MA: Partial<Record<DemoCellId, string>> = { "0-1": "م", "1-1": "ا" };
const MAD: Partial<Record<DemoCellId, string>> = { "0-1": "م", "1-1": "ا", "2-1": "د" };
const MADR: Partial<Record<DemoCellId, string>> = { "0-1": "م", "1-1": "ا", "2-1": "د", "3-1": "ر" };

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "select",
    message: "برای انتخاب کلمه، روی یک خانه بزنید.",
    frames: [
      { holdMs: 700, hand: REST, tap: false, activeWord: null, selected: null, letters: NO_LETTERS },
      { holdMs: 500, hand: CROSS, tap: false, activeWord: null, selected: null, letters: NO_LETTERS },
      { holdMs: 450, hand: CROSS, tap: true, activeWord: null, selected: null, letters: NO_LETTERS },
      { holdMs: 1600, hand: CROSS, tap: false, activeWord: "across", selected: CROSSING_CELL, letters: NO_LETTERS },
    ],
  },
  {
    id: "toggle-direction",
    message: "با زدن دوباره روی همان خانه، جهت بین افقی و عمودی عوض می‌شود.",
    frames: [
      { holdMs: 600, hand: CROSS, tap: false, activeWord: "across", selected: CROSSING_CELL, letters: NO_LETTERS },
      { holdMs: 450, hand: CROSS, tap: true, activeWord: "across", selected: CROSSING_CELL, letters: NO_LETTERS },
      { holdMs: 1900, hand: CROSS, tap: false, activeWord: "down", selected: CROSSING_CELL, letters: NO_LETTERS },
    ],
  },
  {
    id: "clue",
    message: "پرسشِ کلمهٔ انتخاب‌شده اینجا نمایش داده می‌شود.",
    frames: [
      { holdMs: 500, hand: CLUE, tap: false, activeWord: "down", selected: CROSSING_CELL, letters: NO_LETTERS },
      {
        holdMs: 2400,
        hand: CLUE,
        tap: false,
        activeWord: "down",
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
        clueHighlight: true,
      },
    ],
  },
  {
    id: "fill",
    message: "با زدن روی حرف‌ها، خانه‌های کلمه یکی‌یکی پر می‌شوند.",
    frames: [
      { holdMs: 600, hand: REST, tap: false, activeWord: "down", selected: "0-1", letters: NO_LETTERS },
      // م
      { holdMs: 450, hand: tray(2), tap: false, activeWord: "down", selected: "0-1", letters: NO_LETTERS },
      { holdMs: 400, hand: tray(2), tap: true, activeWord: "down", selected: "0-1", letters: NO_LETTERS },
      { holdMs: 700, hand: tray(2), tap: false, activeWord: "down", selected: "1-1", letters: M },
      // ا
      { holdMs: 450, hand: tray(4), tap: false, activeWord: "down", selected: "1-1", letters: M },
      { holdMs: 400, hand: tray(4), tap: true, activeWord: "down", selected: "1-1", letters: M },
      { holdMs: 700, hand: tray(4), tap: false, activeWord: "down", selected: "2-1", letters: MA },
      // د
      { holdMs: 450, hand: tray(5), tap: false, activeWord: "down", selected: "2-1", letters: MA },
      { holdMs: 400, hand: tray(5), tap: true, activeWord: "down", selected: "2-1", letters: MA },
      { holdMs: 700, hand: tray(5), tap: false, activeWord: "down", selected: "3-1", letters: MAD },
      // ر
      { holdMs: 450, hand: tray(0), tap: false, activeWord: "down", selected: "3-1", letters: MAD },
      { holdMs: 400, hand: tray(0), tap: true, activeWord: "down", selected: "3-1", letters: MAD },
      { holdMs: 1500, hand: tray(0), tap: false, activeWord: "down", selected: "3-1", letters: MADR },
    ],
  },
  {
    id: "clear",
    message: "برای پاک کردن حرف، دکمهٔ پاک کردن را بزنید.",
    frames: [
      { holdMs: 500, hand: BACKSPACE, tap: false, activeWord: "down", selected: "3-1", letters: MADR },
      { holdMs: 400, hand: BACKSPACE, tap: true, activeWord: "down", selected: "3-1", letters: MADR },
      { holdMs: 600, hand: BACKSPACE, tap: false, activeWord: "down", selected: "2-1", letters: MAD },
      { holdMs: 400, hand: BACKSPACE, tap: true, activeWord: "down", selected: "2-1", letters: MAD },
      { holdMs: 600, hand: BACKSPACE, tap: false, activeWord: "down", selected: "1-1", letters: MA },
      { holdMs: 400, hand: BACKSPACE, tap: true, activeWord: "down", selected: "1-1", letters: MA },
      { holdMs: 600, hand: BACKSPACE, tap: false, activeWord: "down", selected: "0-1", letters: M },
      { holdMs: 400, hand: BACKSPACE, tap: true, activeWord: "down", selected: "0-1", letters: M },
      { holdMs: 600, hand: BACKSPACE, tap: false, activeWord: "down", selected: "0-1", letters: NO_LETTERS },
      { holdMs: 2200, hand: REST, tap: false, activeWord: null, selected: null, letters: NO_LETTERS },
    ],
  },
];

/**
 * Advance one frame. End of a step moves to the next step's first frame;
 * the end of the last step wraps back to {0, 0} so playback loops.
 */
export function nextPosition(steps: readonly TutorialStep[], pos: PlaybackPos): PlaybackPos {
  const step = steps[pos.stepIndex];
  if (!step) return { stepIndex: 0, frameIndex: 0 };
  if (pos.frameIndex + 1 < step.frames.length) {
    return { stepIndex: pos.stepIndex, frameIndex: pos.frameIndex + 1 };
  }
  const nextStep = pos.stepIndex + 1 < steps.length ? pos.stepIndex + 1 : 0;
  return { stepIndex: nextStep, frameIndex: 0 };
}
