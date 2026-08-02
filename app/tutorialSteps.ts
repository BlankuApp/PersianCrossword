// Pure data + advance logic for the animated راهنما tutorial.
// The demo grid is a 4×4 layout (RTL, col 0 = rightmost): across مرز fills
// row 0's open cells and down مادر fills col 1, crossing at "0-1".

// Cell ids are "{row}-{col}" in the RTL coord system (col 0 = rightmost).
export type DemoCellId = `${number}-${number}`;
export type DemoDirection = "across" | "down";

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

// Fixed trays keep the animation stable. Each contains the answer's unique
// letters plus decoys, just like the real clue trays.
export const DEMO_TRAYS: Readonly<Record<DemoDirection, readonly string[]>> = {
  across: ["ز", "ب", "م", "س", "ر"],
  down: ["ر", "ب", "م", "س", "ا", "د"],
};

export type HandTarget =
  | { readonly kind: "cell"; readonly cell: DemoCellId }
  | { readonly kind: "tray"; readonly direction: DemoDirection; readonly index: number }
  | { readonly kind: "word-cell"; readonly direction: DemoDirection; readonly index: number }
  | { readonly kind: "backspace"; readonly direction: DemoDirection }
  | { readonly kind: "clue"; readonly direction: DemoDirection }
  | { readonly kind: "rest" };

export interface DemoDrag {
  readonly letter: string;
  readonly direction: DemoDirection;
}

// Every frame is an absolute snapshot of the whole visual state, so jumping
// to any step via a dot is just {stepIndex, frameIndex: 0} — nothing accumulates.
export interface DemoFrame {
  readonly holdMs: number;
  readonly hand: HandTarget;
  readonly tap: boolean;
  readonly showHighlights: boolean;
  readonly showClues: boolean;
  readonly selected: DemoCellId | null;
  readonly letters: Partial<Record<DemoCellId, string>>;
  readonly highlightClues?: boolean;
  readonly drag?: DemoDrag;
  readonly dropTarget?: {
    readonly direction: DemoDirection;
    readonly index: number;
  };
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

function cell(cellId: DemoCellId): HandTarget {
  return { kind: "cell", cell: cellId };
}

function clue(direction: DemoDirection): HandTarget {
  return { kind: "clue", direction };
}

function tray(direction: DemoDirection, index: number): HandTarget {
  return { kind: "tray", direction, index };
}

function wordCell(direction: DemoDirection, index: number): HandTarget {
  return { kind: "word-cell", direction, index };
}

function backspace(direction: DemoDirection): HandTarget {
  return { kind: "backspace", direction };
}

const NO_LETTERS: Partial<Record<DemoCellId, string>> = {};
const M: Partial<Record<DemoCellId, string>> = { "0-1": "م" };
const MA: Partial<Record<DemoCellId, string>> = { "0-1": "م", "1-1": "ا" };

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "select",
    message: "روی یک خانهٔ سفید بزنید تا کلمه‌های افقی و عمودی آن مشخص شوند.",
    frames: [
      {
        holdMs: 650,
        hand: REST,
        tap: false,
        showHighlights: false,
        showClues: false,
        selected: null,
        letters: NO_LETTERS,
      },
      {
        holdMs: 500,
        hand: CROSS,
        tap: false,
        showHighlights: false,
        showClues: false,
        selected: null,
        letters: NO_LETTERS,
      },
      {
        holdMs: 400,
        hand: CROSS,
        tap: true,
        showHighlights: false,
        showClues: false,
        selected: null,
        letters: NO_LETTERS,
      },
      {
        holdMs: 1800,
        hand: CROSS,
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
      },
    ],
  },
  {
    id: "clues",
    message: "پرسش‌های افقی و عمودی این خانه هم‌زمان نمایش داده می‌شوند.",
    frames: [
      {
        holdMs: 600,
        hand: clue("across"),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
      },
      {
        holdMs: 700,
        hand: clue("down"),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
        highlightClues: true,
      },
      {
        holdMs: 1700,
        hand: REST,
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
        highlightClues: true,
      },
    ],
  },
  {
    id: "place",
    message: "هر حرف را بکشید و در خانهٔ درستِ پاسخ رها کنید.",
    frames: [
      {
        holdMs: 450,
        hand: REST,
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
      },
      {
        holdMs: 450,
        hand: tray("across", 2),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
      },
      {
        holdMs: 300,
        hand: tray("across", 2),
        tap: true,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
        drag: { letter: "م", direction: "across" },
      },
      {
        holdMs: 750,
        hand: wordCell("across", 0),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
        drag: { letter: "م", direction: "across" },
        dropTarget: { direction: "across", index: 0 },
      },
      {
        holdMs: 650,
        hand: wordCell("across", 0),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: M,
      },
      {
        holdMs: 450,
        hand: tray("down", 4),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: M,
      },
      {
        holdMs: 300,
        hand: tray("down", 4),
        tap: true,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: M,
        drag: { letter: "ا", direction: "down" },
      },
      {
        holdMs: 750,
        hand: wordCell("down", 1),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: M,
        drag: { letter: "ا", direction: "down" },
        dropTarget: { direction: "down", index: 1 },
      },
      {
        holdMs: 1700,
        hand: wordCell("down", 1),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: "1-1",
        letters: MA,
      },
    ],
  },
  {
    id: "clear",
    message: "برای پاک کردن حرف، خانهٔ پُر را انتخاب کنید و دکمهٔ پاک کردن را بزنید.",
    frames: [
      {
        holdMs: 500,
        hand: cell("1-1"),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: "1-1",
        letters: MA,
      },
      {
        holdMs: 350,
        hand: cell("1-1"),
        tap: true,
        showHighlights: true,
        showClues: true,
        selected: "1-1",
        letters: MA,
      },
      {
        holdMs: 500,
        hand: backspace("down"),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: "1-1",
        letters: MA,
      },
      {
        holdMs: 350,
        hand: backspace("down"),
        tap: true,
        showHighlights: true,
        showClues: true,
        selected: "1-1",
        letters: MA,
      },
      {
        holdMs: 650,
        hand: cell(CROSSING_CELL),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: M,
      },
      {
        holdMs: 350,
        hand: cell(CROSSING_CELL),
        tap: true,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: M,
      },
      {
        holdMs: 500,
        hand: backspace("across"),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: M,
      },
      {
        holdMs: 350,
        hand: backspace("across"),
        tap: true,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: M,
      },
      {
        holdMs: 600,
        hand: backspace("across"),
        tap: false,
        showHighlights: true,
        showClues: true,
        selected: CROSSING_CELL,
        letters: NO_LETTERS,
      },
      {
        holdMs: 1700,
        hand: REST,
        tap: false,
        showHighlights: false,
        showClues: false,
        selected: null,
        letters: NO_LETTERS,
      },
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
