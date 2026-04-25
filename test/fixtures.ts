import type { CrosswordJson } from "../src/index.js";

export const basicPuzzle: CrosswordJson = {
  version: 1,
  size: { rows: 3, cols: 4 },
  blocks: [{ row: 1, col: 2 }],
  clues: {
    "R1-1": "ردیف بالا",
    "R2-1": "ردیف میانی",
    "R3-1": "ردیف پایین",
    "C1-1": "ستون راست",
    "C3-1": "ستون دوم از چپ",
    "C4-1": "ستون چپ",
  },
  answers: {
    "R1-1": "سلام",
    "R2-1": "پا",
    "R3-1": "دریا",
    "C1-1": "سرد",
    "C3-1": null,
    "C4-1": "مرد",
  },
};
