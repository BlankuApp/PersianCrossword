import { describe, expect, it } from "vitest";
import { validateStoredPuzzleJson } from "../app/admin/puzzleValidation";
import { photoPuzzle } from "../app/admin/photoImport";
import { planImport } from "../app/admin/importPlan";

// The reported 15×15 RTL grid. Numbered group sizes are exactly those in the supplied clues.
const grid = [
  ["ف","ا","س","ت","و","ن","ی","","ب","ا","ر","ف","ی","ک","س"],
  ["ی","ر","ت","ا","","س","و","س","ن","","ب","ل","ک","ا","ن"],
  ["ی","گ","ر","ن","گ","","ک","ر","ی","ه","","ک","ت","ر","ی"],
  ["ب","ا","ی","","ل","ف","","ن","ه","ر","و","","ن","ا","ن"],
  ["ا","ش","","ا","ی","ر","ا","د","","و","ز","ن","ه","",""],
  ["م","","د","ل","چ","س","ب","","ا","د","ی","ب","","ن","ا"],
  ["ت","ا","ف","ی","","خ","ا","ک","س","ت","ر","","و","ر","س"],
  ["خ","و","ا","س","ت","","ژ","ر","ف","","ی","ا","ق","و","ت"],
  ["ص","ر","ع","","ا","ر","و","ا","ر","ه","","ی","ا","و","ر"],
  ["ص","د","","م","د","و","ر","","ز","ن","ه","ا","ر","","ا"],
  ["","","ا","ر","ی","ن","","د","ه","د","ا","ر","","م","ل"],
  ["ت","ب","ر","","ب","ا","ن","گ","","و","ل","","ه","چ","ی"],
  ["ر","ا","ی","و","ک","","ک","ا","م","ل","","ی","ا","ل","ت"],
  ["ا","ن","ب","ر","ی","","ش","ه","و","د","","د","ی","م","ی"],
  ["ش","و","م","ا","خ","ت","ر","","ا","ج","ت","م","ا","ع","ی"],
];
const sizes = [2,3,3,4,3,3,3,3,3,3,3,4,3,3,2];
const groups = () => Object.fromEntries(sizes.map((size, i) => [String(i + 1), Array.from({length: size}, () => "پرسش")]));
const clues = { horizontal: groups(), vertical: { ...groups(),
  "5": ["دستبافته سنتی ایران", "ادب آموزی", "دانشمند آلمانی"],
  "10": ["پدر علم تاریخ", "سومین دین بزرگ جهان", "روغن فاسد شده"],
} };

describe("repository-format admin validation", () => {
  it("reports the actual printed columns and contiguous row ranges for the supplied input without changing it", () => {
    const json = { version: 3, grid, clues }, before = JSON.stringify(json);
    const result = validateStoredPuzzleJson(json);
    expect(result.issues.map((issue) => issue.path)).toEqual(["clues.vertical.5", "clues.vertical.10"]);
    expect(result.issues[0]!.message).toContain("ستون ۵ از راست: ۳ پرسش وارد شده، اما شبکه ۲");
    expect(result.issues[0]!.message).toContain("ردیف‌های ۳ تا ۶: «گلیچ»");
    expect(result.issues[0]!.message).toContain("ردیف‌های ۸ تا ۱۵: «تادیبکیخ»");
    expect(result.issues[1]!.message).toContain("ردیف‌های ۳ تا ۷: «هرودت»");
    expect(result.issues[1]!.message).toContain("ردیف‌های ۹ تا ۱۵: «هندولدج»");
    expect(() => photoPuzzle(JSON.stringify({clues}), JSON.stringify({grid}), 15, 15)).toThrow(/ستون ۵ از راست/);
    const plan = planImport([{ name: "reported.json", bytes: new TextEncoder().encode(JSON.stringify(json)) }], new Set());
    expect(plan.problems[0]).toContain(result.issues[0]!.message);
    expect(JSON.stringify(json)).toBe(before);
  });

  it("accepts unequal word counts in opposite columns using the same direction as the solver", () => {
    const json = { version: 3, grid: [["ا","ب","ج"],["ف","گ","ک"],["","د","ه"],["ل","م","ن"],["پ","ت","ث"]],
      clues: { horizontal: {"1":["یک"],"2":["دو"],"3":["سه"],"4":["چهار"],"5":["پنج"]}, vertical: {"1":["بالای راست","پایین راست"],"2":["وسط"],"3":["چپ"]} } };
    // The rightmost column has two words; the leftmost has one, so mirroring validation fails.
    expect(validateStoredPuzzleJson(json).valid).toBe(true);
    expect(planImport([{ name: "rtl.json", bytes: new TextEncoder().encode(JSON.stringify(json)) }], new Set()).problems).toEqual([]);
    expect(photoPuzzle(JSON.stringify({ clues: json.clues }), JSON.stringify({ grid: json.grid }), 5, 3).grid).toEqual(json.grid);
    for (const malformed of [null, {}, { version: 3, grid: [null] }, { version: 3, grid: [[null]] }]) {
      expect(validateStoredPuzzleJson(malformed).valid).toBe(false);
    }
  });
});
