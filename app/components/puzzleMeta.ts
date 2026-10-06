// Pure conversion between a puzzle's meta and the metadata form (no React, no Firebase), so the
// solver and the admin panel share one definition of what a metadata edit does.
import type { CrosswordJson } from "../../src/index";
import { isValidPuzzleId } from "../admin/importPlan";
import { toAsciiDigits } from "../persianNumbers";

export interface PuzzleMetaForm {
  readonly id: string;
  readonly title: string;
  readonly newspaper: string;
  readonly difficulty: string;
  readonly author: string;
  readonly sourceFile: string;
}
export type MetaTextFields = Pick<PuzzleMetaForm, "title" | "newspaper" | "difficulty" | "author">;

export const ID_INVALID = "شناسهٔ کوتاه و بدون نقطه، / یا نویسه‌های ویژهٔ نام فایل وارد کنید.";
export const ID_TAKEN = "این شناسه قبلاً استفاده شده است.";
const DIFFICULTIES = ["عادی", "ویژه"];

// meta isn't validated on import: a number (e.g. "author": 12) must still reach the form as text.
const text = (value: unknown): string => (value === undefined || value === null ? "" : String(value));

export function metaFormOf(json: CrosswordJson, id: string): PuzzleMetaForm {
  const meta = json.meta;
  return { id, title: text(meta?.title), newspaper: text(meta?.newspaper), difficulty: text(meta?.difficulty), author: text(meta?.author), sourceFile: text(meta?.sourceFile) };
}

export function applyMetaForm(json: CrosswordJson, form: PuzzleMetaForm, hasSourceImage: boolean): CrosswordJson {
  const meta: Record<string, unknown> = { ...json.meta };
  const setOrDrop = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) meta[key] = trimmed;
    else delete meta[key];
  };
  meta.id = form.id.trim();
  setOrDrop("title", form.title);
  setOrDrop("newspaper", form.newspaper);
  setOrDrop("difficulty", form.difficulty);
  setOrDrop("author", form.author);
  // The recorded name only; the stored image is content-addressed. Never blank it: that would orphan the image.
  if (hasSourceImage && form.sourceFile.trim()) meta.sourceFile = form.sourceFile.trim();
  meta.size = { rows: json.grid.length, cols: json.grid[0]?.length ?? 0 };
  return { ...json, meta } as CrosswordJson;
}

export function metaIdProblem(id: string, ownId: string, takenIds: ReadonlySet<string> = new Set()): string {
  const value = toAsciiDigits(id.trim());
  if (!isValidPuzzleId(value)) return ID_INVALID;
  return value !== toAsciiDigits(ownId) && takenIds.has(value) ? ID_TAKEN : "";
}

export function difficultyOptions(current: string): string[] {
  return [...(current === "" ? [""] : []), ...DIFFICULTIES, ...(current && !DIFFICULTIES.includes(current) ? [current] : [])];
}
