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

// The demo's answers, for the check-mode colors.
export const DEMO_SOLUTION: Readonly<Partial<Record<DemoCellId, string>>> = {
  "0-1": "م",
  "0-2": "ر",
  "0-3": "ز",
  "1-1": "ا",
  "2-1": "د",
  "3-1": "ر",
};

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
  | { readonly kind: "backspace" | "search" | "ai" | "clue"; readonly direction: DemoDirection }
  | { readonly kind: "check-switch" }
  | { readonly kind: "rest" };

export interface DemoDrag {
  readonly letter: string;
  readonly direction: DemoDirection;
}

type DemoLetters = Readonly<Partial<Record<DemoCellId, string>>>;

// Every frame is an absolute snapshot of the whole visual state, so jumping
// to any step via a dot is just {stepIndex, frameIndex: 0} — nothing accumulates.
// Each answer row's target box (outlined) is derived: its first empty box, as in the app.
export interface DemoFrame {
  readonly holdMs: number;
  readonly hand: HandTarget;
  readonly tap: boolean;
  readonly showHighlights: boolean;
  readonly showClues: boolean;
  readonly selected: DemoCellId | null;
  readonly letters: DemoLetters;
  readonly highlightClues?: boolean;
  readonly checkOn?: boolean;
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
const CHECK_SWITCH: HandTarget = { kind: "check-switch" };

function tray(direction: DemoDirection, index: number): HandTarget {
  return { kind: "tray", direction, index };
}

function wordCell(direction: DemoDirection, index: number): HandTarget {
  return { kind: "word-cell", direction, index };
}

function onClue(kind: "backspace" | "search" | "ai" | "clue", direction: DemoDirection): HandTarget {
  return { kind, direction };
}

// A frame after the first step: crossing cell selected, both clues showing. The selection
// never moves while letters are placed — just like the real clue panel.
function frame(holdMs: number, hand: HandTarget, letters: DemoLetters, extra: Partial<DemoFrame> = {}): DemoFrame {
  return { holdMs, hand, tap: false, showHighlights: true, showClues: true, selected: CROSSING_CELL, letters, ...extra };
}

// Hover over a target, then press it. The press's effect shows in the frame after.
function press(hand: HandTarget, letters: DemoLetters, extra: Partial<DemoFrame> = {}): DemoFrame[] {
  return [frame(450, hand, letters, extra), frame(300, hand, letters, { ...extra, tap: true })];
}

const EMPTY: DemoLetters = {};
const M: DemoLetters = { "0-1": "م" };
const MR: DemoLetters = { ...M, "0-2": "ر" };
const ACROSS_DONE: DemoLetters = { ...MR, "0-3": "ز" };
const DRAGGED: DemoLetters = { ...ACROSS_DONE, "2-1": "د" };
const WRONG_SECOND: DemoLetters = { ...DRAGGED, "1-1": "س" };
const FIXED_SECOND: DemoLetters = { ...DRAGGED, "1-1": "ا" };
const WRONG_LAST: DemoLetters = { ...FIXED_SECOND, "3-1": "ب" };
const SOLVED: DemoLetters = { ...FIXED_SECOND, "3-1": "ر" };

const INTRO = { showHighlights: false, showClues: false, selected: null } as const;
const CHECK = { checkOn: true } as const;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: "select",
    message: "روی یک خانهٔ سفید بزنید تا کلمه‌های افقی و عمودی آن مشخص شوند.",
    frames: [
      frame(650, REST, EMPTY, INTRO),
      frame(500, CROSS, EMPTY, INTRO),
      frame(400, CROSS, EMPTY, { ...INTRO, tap: true }),
      frame(1800, CROSS, EMPTY),
    ],
  },
  {
    id: "clues",
    message: "پرسش‌های افقی و عمودی این خانه هم‌زمان نمایش داده می‌شوند.",
    frames: [
      frame(600, onClue("clue", "across"), EMPTY),
      frame(700, onClue("clue", "down"), EMPTY, { highlightClues: true }),
      frame(1700, REST, EMPTY, { highlightClues: true }),
    ],
  },
  {
    id: "tap",
    message: "روی حرف‌ها بزنید؛ هر حرف در خانهٔ خالیِ مشخص‌شده می‌نشیند و در جدول هم نوشته می‌شود.",
    frames: [
      frame(450, REST, EMPTY),
      ...press(tray("across", 2), EMPTY),
      ...press(tray("across", 4), M),
      ...press(tray("across", 0), MR),
      frame(1600, tray("across", 0), ACROSS_DONE),
    ],
  },
  {
    id: "drag",
    message: "یا حرف را بکشید و در هر خانه‌ای که می‌خواهید رها کنید.",
    frames: [
      frame(450, tray("down", 5), ACROSS_DONE),
      frame(300, tray("down", 5), ACROSS_DONE, { tap: true, drag: { letter: "د", direction: "down" } }),
      frame(750, wordCell("down", 2), ACROSS_DONE, {
        drag: { letter: "د", direction: "down" },
        dropTarget: { direction: "down", index: 2 },
      }),
      frame(1600, wordCell("down", 2), DRAGGED),
    ],
  },
  {
    id: "help",
    message: "گیر کردید؟ در گوگل جستجو کنید یا از هوشواره بپرسید. «بررسی خودکار» حرف‌های اشتباه را قرمز می‌کند.",
    frames: [
      ...press(tray("down", 3), DRAGGED),
      frame(1000, onClue("search", "down"), WRONG_SECOND),
      frame(1000, onClue("ai", "down"), WRONG_SECOND),
      ...press(CHECK_SWITCH, WRONG_SECOND),
      frame(1900, CHECK_SWITCH, WRONG_SECOND, CHECK),
    ],
  },
  {
    id: "fix",
    message: "برای پاک کردن، روی خانهٔ پُر بزنید. دکمهٔ ⌫ آخرین حرفِ همان پاسخ را پاک می‌کند.",
    frames: [
      ...press(wordCell("down", 1), WRONG_SECOND, CHECK),
      ...press(tray("down", 4), DRAGGED, CHECK),
      ...press(tray("down", 1), FIXED_SECOND, CHECK),
      ...press(onClue("backspace", "down"), WRONG_LAST, CHECK),
      ...press(tray("down", 0), FIXED_SECOND, CHECK),
      frame(1900, tray("down", 0), SOLVED, CHECK),
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
