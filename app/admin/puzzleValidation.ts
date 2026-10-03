import { validatePuzzleJson, type CrosswordJson } from "../../src/index";
import { toPersianDigits } from "../persianNumbers";
import { normalizeGridDirection } from "../progress";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

// Repository rows run RTL; the core derives word positions in LTR board coordinates.
// Keep the stored JSON unchanged, and use the same conversion as the solver for validation.
export function validateStoredPuzzleJson(input: unknown) {
  const source = record(input), rows = source.grid;
  // Row arrays are enough to safely reverse; the core still checks every cell and field below.
  const normalized = Array.isArray(rows) && rows.every(Array.isArray) ? normalizeGridDirection(source as unknown as CrosswordJson) : null;
  const grid = normalized?.grid;
  const result = validatePuzzleJson(normalized ?? input);
  return { ...result, issues: result.issues.map((issue) => {
    if (issue.code !== "clue_length_mismatch" && issue.code !== "missing_clue_group") return issue;
    const match = /^clues\.(horizontal|vertical)\.(\d+)$/.exec(issue.path ?? "");
    if (!match || !grid) return issue;
    const direction = match[1]!, number = Number(match[2]);
    const slots = result.derivedSlots.filter((slot) => slot.direction === (direction === "horizontal" ? "across" : "down") && slot.groupNum === number);
    const group = record(record(source.clues)[direction])[String(number)];
    const count = Array.isArray(group) ? group.length : 0;
    const label = direction === "horizontal" ? `ردیف ${number}` : `ستون ${number} از راست`;
    const sections = slots.map((slot) => {
      const first = slot.cells[0]!, last = slot.cells.at(-1)!;
      const range = direction === "vertical" ? `ردیف‌های ${first.row + 1} تا ${last.row + 1}` : `ستون‌های ${grid[first.row]!.length - first.col} تا ${grid[last.row]!.length - last.col} از راست`;
      const letters = slot.cells.map(({ row, col }) => String(grid[row]![col] ?? "").trim()).join("");
      return `${range}: «${letters}»`;
    }).join("؛ ");
    const message = `${label}: ${count} پرسش وارد شده، اما شبکه ${slots.length} بخش پیوستهٔ حداقل دوخانه‌ای دارد (${sections}). محل خانه‌های سیاه و تعداد پرسش‌ها را با تصویر بررسی کنید؛ خانهٔ تک‌حرفی در این شمارش واژه محسوب نمی‌شود.`;
    return { ...issue, message: toPersianDigits(message) };
  }) };
}
