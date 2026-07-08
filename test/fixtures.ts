import type { CrosswordJsonV3 } from "../src/index.js";

// 3x4 grid with one black square at (1, 2):
//   row 0: open open open open
//   row 1: open open ████ open
//   row 2: open open open open
// horizontal: row → across clues, ordered RIGHT-to-LEFT.
// vertical: column-from-right → down clues, ordered TOP-to-BOTTOM.
// Solution letters embedded in grid: Row 0: سلام (RTL), Row 1: پر + block + ر, Row 2: دریا (RTL)
export const basicPuzzleV3: CrosswordJsonV3 = {
  version: 3,
  grid: [
    ["م", "ا", "ل", "س"],
    ["ر", "پ", "", "ر"],
    ["ا", "ی", "ر", "د"],
  ],
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
};

