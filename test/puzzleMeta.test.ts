import { describe, expect, it } from "vitest";
import type { CrosswordJson } from "../src/index";
import { applyMetaForm, difficultyOptions, ID_INVALID, ID_TAKEN, metaFormOf, metaIdProblem } from "../app/components/puzzleMeta";
import { basicPuzzleV3 } from "./fixtures";

const withMeta = (meta: Record<string, unknown>): CrosswordJson => ({ ...basicPuzzleV3, meta: meta as CrosswordJson["meta"] });
const full = withMeta({
  id: "p1", title: "عنوان", newspaper: "ایران", difficulty: "عادی", author: "طراح",
  publishedAt: "2026-01-02", language: "fa", direction: "rtl", sourceFile: "src.png", size: { rows: 9, cols: 9 }, custom: "keep",
});
const form = (patch: Partial<ReturnType<typeof metaFormOf>> = {}) => ({ ...metaFormOf(full, "p1"), ...patch });

describe("applyMetaForm ids", () => {
  it("keeps a stored Persian-digit id untouched", () => {
    const stored = withMeta({ id: "۱۲", title: "عنوان" });
    expect(applyMetaForm(stored, metaFormOf(stored, "۱۲"), false).meta?.id).toBe("۱۲");
    expect(metaIdProblem("۱۲", "۱۲", new Set(["12"]))).toBe("");
  });
});

describe("metaFormOf", () => {
  it("reads strings, turns numbers into text and missing values into empty strings", () => {
    expect(metaFormOf(full, "p1")).toEqual({ id: "p1", title: "عنوان", newspaper: "ایران", difficulty: "عادی", author: "طراح", sourceFile: "src.png" });
    expect(metaFormOf(withMeta({ title: 7, author: 12 }), "x")).toEqual({ id: "x", title: "7", newspaper: "", difficulty: "", author: "12", sourceFile: "" });
    expect(metaFormOf(basicPuzzleV3, "x").title).toBe("");
  });
});

describe("applyMetaForm", () => {
  it("trims values, sets the trimmed id and derives size from the grid", () => {
    const next = applyMetaForm(full, form({ id: " 8050 ", title: "  تازه  " }), true);
    expect(next.meta).toMatchObject({ id: "8050", title: "تازه", size: { rows: 3, cols: 4 } });
  });
  it("keeps publishedAt, language, direction, unknown keys and the grid/clues", () => {
    const next = applyMetaForm(full, form({ title: "x" }), true);
    expect(next.meta).toMatchObject({ publishedAt: "2026-01-02", language: "fa", direction: "rtl", custom: "keep" });
    expect(next.grid).toBe(full.grid);
    expect(next.clues).toBe(full.clues);
  });
  it("drops empty optional fields instead of writing empty strings", () => {
    const meta = applyMetaForm(full, form({ newspaper: " ", author: "", difficulty: "" }), true).meta!;
    expect(meta).not.toHaveProperty("newspaper");
    expect(meta).not.toHaveProperty("author");
    expect(meta).not.toHaveProperty("difficulty");
  });
  it("changes sourceFile only when a source image exists and the new name is not empty", () => {
    expect(applyMetaForm(full, form({ sourceFile: "new.png" }), true).meta?.sourceFile).toBe("new.png");
    expect(applyMetaForm(full, form({ sourceFile: "new.png" }), false).meta?.sourceFile).toBe("src.png");
    expect(applyMetaForm(full, form({ sourceFile: "  " }), true).meta?.sourceFile).toBe("src.png");
  });
  it("repairs missing meta.id/size and is idempotent", () => {
    const once = applyMetaForm(basicPuzzleV3, { ...metaFormOf(basicPuzzleV3, "q"), title: "t" }, false);
    expect(once.meta).toMatchObject({ id: "q", title: "t", size: { rows: 3, cols: 4 } });
    expect(JSON.stringify(applyMetaForm(once, metaFormOf(once, "q"), false))).toBe(JSON.stringify(once));
  });
});

describe("metaIdProblem", () => {
  const taken = new Set(["a", "b"]);
  it("accepts a new valid id and the puzzle's own id", () => {
    expect(metaIdProblem("c", "a", taken)).toBe("");
    expect(metaIdProblem("a", "a", taken)).toBe("");
    expect(metaIdProblem("۸۰۵۰", "a", taken)).toBe("");
  });
  it("rejects invalid ids and ids used by another puzzle", () => {
    for (const id of ["", "bad/id", "bad.id", "  ", "constructor", "x".repeat(121)]) expect(metaIdProblem(id, "a", taken)).toBe(ID_INVALID);
    expect(metaIdProblem("b", "a", taken)).toBe(ID_TAKEN);
    expect(metaIdProblem("b", "a")).toBe("");
  });
});

describe("difficultyOptions", () => {
  it("offers the two levels, plus an unknown current value or an empty choice", () => {
    expect(difficultyOptions("عادی")).toEqual(["عادی", "ویژه"]);
    expect(difficultyOptions("ویژه")).toEqual(["عادی", "ویژه"]);
    expect(difficultyOptions("سخت")).toEqual(["عادی", "ویژه", "سخت"]);
    expect(difficultyOptions("")).toEqual(["", "عادی", "ویژه"]);
  });
});
