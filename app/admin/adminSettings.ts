import type { MetaTextFields } from "../components/puzzleMeta";
import { toAsciiDigits, toPersianDigits } from "../persianNumbers";
import { DEFAULT_PHOTO_MODEL, REASONING_EFFORTS, type ReasoningEffort } from "./openRouterPhoto";
import type { PuzzleVariant } from "../../functions/src/photoFormat";

// Separate from the puzzle-progress prefix so these browser preferences never sync to Firebase.
export const ADMIN_SETTINGS_KEY = "persian-crossword-admin-settings";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function readAdminSettings(): Record<string, unknown> {
  try { return object(JSON.parse(window.localStorage.getItem(ADMIN_SETTINGS_KEY) ?? "{}")); }
  catch { return {}; }
}

export function saveAdminSettings(settings: Record<string, unknown>): boolean {
  try {
    window.localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify({ ...readAdminSettings(), ...settings }));
    return true;
  } catch { return false; }
}

export function loadPhotoSettings() {
  const photo = object(readAdminSettings().photo), meta = object(photo.meta);
  const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
  const size = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 60 ? value : 15;
  return {
    model: text(photo.model, DEFAULT_PHOTO_MODEL),
    reasoningEffort: (REASONING_EFFORTS.some(([value]) => value === photo.reasoningEffort) ? photo.reasoningEffort : "high") as ReasoningEffort,
    rows: size(photo.rows), cols: size(photo.cols),
    variant: (photo.variant === "special" ? "special" : "normal") as PuzzleVariant,
    puzzleNumber: /^[0-9۰-۹٠-٩]{0,8}$/.test(text(photo.puzzleNumber)) ? toPersianDigits(text(photo.puzzleNumber)) : "",
    id: toAsciiDigits(text(photo.id)),
    meta: { title: text(meta.title), newspaper: text(meta.newspaper), difficulty: text(meta.difficulty, photo.variant === "special" ? "ویژه" : "عادی"), author: text(meta.author) } satisfies MetaTextFields,
  };
}

export type CropMode = "draw" | "pan" | "adjust";
export function loadCropSettings(multiple: boolean): { zoom: number; mode: CropMode } {
  const crop = object(readAdminSettings()[multiple ? "clueCrop" : "gridCrop"]);
  return {
    zoom: typeof crop.zoom === "number" && Number.isInteger(crop.zoom) && crop.zoom >= 25 && crop.zoom <= 400 ? crop.zoom : 100,
    mode: crop.mode === "pan" || crop.mode === "adjust" ? crop.mode : "draw",
  };
}
