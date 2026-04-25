import type { CrosswordJson } from "../src/index.js";

export const basicPuzzle: CrosswordJson = {
  version: 1,
  size: { rows: 3, cols: 4 },
  blocks: [{ row: 1, col: 2 }],
  clues: {
    "1A": "ردیف بالا",
    "1D": "ستون راست",
    "2D": "ستون دوم از چپ",
    "3D": "ستون چپ",
    "4A": "ردیف میانی",
    "5A": "ردیف پایین",
  },
  answers: {
    "1A": "سلام",
    "1D": "سرد",
    "2D": null,
    "3D": "مرد",
    "4A": "پا",
    "5A": "دریا",
  },
};
