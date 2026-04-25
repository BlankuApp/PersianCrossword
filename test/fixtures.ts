import type { CrosswordJson } from "../src/index.js";

// 3x4 grid with one black square at (1, 2):
//   row 0: open open open open
//   row 1: open open ████ open
//   row 2: open open open open
export const basicPuzzle: CrosswordJson = {
  version: 2,
  grid: [
    [0, 0, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 0],
  ],
  // horizontal: row → across clues, ordered RIGHT-to-LEFT.
  // vertical: column-from-right → down clues, ordered TOP-to-BOTTOM.
  clues: {
    horizontal: {
      "1": ["ردیف بالا"],
      "2": ["ردیف میانی"],
      "3": ["ردیف پایین"],
    },
    vertical: {
      "1": ["ستون راست"],
      "3": ["ستون دوم از چپ"],
      "4": ["ستون چپ"],
    },
  },
  answers: {
    horizontal: {
      "1": ["سلام"],
      "2": ["پا"],
      "3": ["دریا"],
    },
    vertical: {
      "1": ["سرد"],
      "3": [null],
      "4": ["مرد"],
    },
  },
};

