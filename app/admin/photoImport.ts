import { normalizePersianText, type CrosswordJson } from "../../src/index";
import { validateStoredPuzzleJson } from "./puzzleValidation";

export interface CropBox { x: number; y: number; width: number; height: number }
export const MAX_CROP_BYTES = 5 * 1024 * 1024;

export function boxFromPoints(a: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number): CropBox {
  const x1 = Math.max(0, Math.min(width, Math.round(a.x))), y1 = Math.max(0, Math.min(height, Math.round(a.y)));
  const x2 = Math.max(0, Math.min(width, Math.round(b.x))), y2 = Math.max(0, Math.min(height, Math.round(b.y)));
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

// Keep the original pixels and aspect ratios; selection order is the output reading order.
export function stackLayout(boxes: readonly CropBox[]): { width: number; height: number; boxes: CropBox[] } {
  if (!boxes.length || boxes.some((b) => ![b.x, b.y, b.width, b.height].every(Number.isInteger) || b.x < 0 || b.y < 0 || b.width < 1 || b.height < 1)) throw new Error("کادر معتبر انتخاب کنید.");
  const width = Math.max(...boxes.map((b) => b.width));
  let height = 0;
  const placed = boxes.map((b, i) => {
    if (i) height += 8;
    const next = { x: width - b.width, y: height, width: b.width, height: b.height };
    height += b.height;
    return next;
  });
  if (width > 16000 || height > 16000 || width * height > 12_000_000) throw new Error("تصویر برش‌خورده خیلی بزرگ است؛ کادرها را کوچک‌تر کنید.");
  return { width, height, boxes: placed };
}

export function composeCrops(image: HTMLImageElement, boxes: readonly CropBox[]): string {
  const layout = stackLayout(boxes);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width; canvas.height = layout.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ساخت تصویر در این مرورگر ممکن نیست.");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  boxes.forEach((b, i) => {
    if (b.x + b.width > image.naturalWidth || b.y + b.height > image.naturalHeight) throw new Error("کادر خارج از تصویر است.");
    const p = layout.boxes[i]!;
    context.drawImage(image, b.x, b.y, b.width, b.height, p.x, p.y, p.width, p.height);
  });
  const data = canvas.toDataURL("image/png");
  if (!data.startsWith("data:image/png;base64,")) throw new Error("ساخت تصویر انجام نشد.");
  if ((data.length - data.indexOf(",") - 1) * 3 / 4 > MAX_CROP_BYTES) throw new Error("تصویر برش‌خورده باید کمتر از ۵ مگابایت باشد.");
  return data;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function extractedClues(value: unknown, rows: number, cols: number): CrosswordJson["clues"] {
  if (!record(value) || !record(value.clues)) throw new Error('پاسخ باید شامل شیء "clues" با دو بخش "horizontal" و "vertical" باشد.');
  const clues: Record<string, Record<string, string[]>> = { horizontal: {}, vertical: {} };
  const errors: string[] = [];
  for (const dir of ["horizontal", "vertical"] as const) {
    const groups = value.clues[dir], count = dir === "horizontal" ? rows : cols;
    const label = dir === "horizontal" ? "افقی" : "عمودی";
    if (!record(groups)) { errors.push(`بخش ${label} باید شیء شماره‌دار باشد، مانند "1": ["پرسش"]؛ آرایهٔ number/clues پذیرفته نیست.`); continue; }
    const expected = Array.from({ length: count }, (_, i) => String(i + 1));
    const missing = expected.filter((key) => !(key in groups)), extra = Object.keys(groups).filter((key) => !expected.includes(key));
    if (missing.length || extra.length) errors.push(`بخش ${label} باید دقیقاً ${count} گروه از شمارهٔ 1 تا ${count} داشته باشد؛ دریافت‌شده: ${Object.keys(groups).length}.${missing.length ? ` شماره‌های جاافتاده: ${missing.join("، ")}.` : ""}${extra.length ? ` شماره‌های نامعتبر: ${extra.join("، ")}.` : ""}`);
    for (const key of expected) {
      if (!(key in groups)) continue;
      const group = groups[key];
      if (!Array.isArray(group) || !group.length || group.some((c) => typeof c !== "string" || !normalizePersianText(c.trim()))) { errors.push(`clues.${dir}.${key} باید آرایهٔ متن‌های غیرخالی باشد.`); continue; }
      clues[dir]![key] = group.map((c: string) => normalizePersianText(c.trim()));
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return { horizontal: clues.horizontal!, vertical: clues.vertical! };
}

export function reviewClues(text: string, rows: number, cols: number) {
  const counts = { horizontal: 0, vertical: 0 };
  try {
    const value: unknown = JSON.parse(text);
    if (record(value) && record(value.clues)) {
      for (const dir of ["horizontal", "vertical"] as const) {
        if (record(value.clues[dir])) counts[dir] = Object.keys(value.clues[dir]).length;
      }
    }
    return { clues: extractedClues(value, rows, cols), counts, error: "" };
  } catch (e) {
    return { clues: null, counts, error: e instanceof SyntaxError ? "قالب JSON معتبر نیست؛ نشانه‌ها و گیومه‌ها را بررسی کنید." : e instanceof Error ? e.message : String(e) };
  }
}

export function extractedGrid(value: unknown, rows: number, cols: number): string[][] {
  const grid = record(value) ? value.grid : undefined;
  if (!Array.isArray(grid) || grid.length !== rows || grid.some((r) => !Array.isArray(r) || r.length !== cols)) throw new Error(`اندازهٔ جدول باید ${rows} ردیف و ${cols} ستون باشد.`);
  return grid.map((row: unknown[], r) => row.map((cell, c) => {
    if (typeof cell !== "string") throw new Error(`خانهٔ ${r + 1}، ${c + 1} باید متن باشد؛ خانهٔ خالی را "" بنویسید.`);
    const letter = normalizePersianText(cell.trim());
    if (letter !== "" && !/^[آاأإبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیءؤئۀة]$/.test(letter)) throw new Error(`خانهٔ ${r + 1}، ${c + 1} باید تنها یک حرف فارسی داشته باشد.`);
    return letter;
  }));
}

export function photoPuzzle(clueText: string, gridText: string, rows: number, cols: number): CrosswordJson {
  const json: CrosswordJson = { version: 3, clues: extractedClues(JSON.parse(clueText), rows, cols), grid: extractedGrid(JSON.parse(gridText), rows, cols) };
  const validation = validateStoredPuzzleJson(json);
  if (!validation.valid) throw new Error(validation.issues.map((i) => i.message).join("\n"));
  if (!json.grid.some((r) => r.some(Boolean))) throw new Error("جدول هیچ حرفی ندارد؛ تصویر پاسخ یا نتیجه را بررسی کنید.");
  return json;
}
