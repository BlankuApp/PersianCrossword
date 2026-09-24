import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIST_QUERY,
  filterAndSortPuzzles,
  listQueryToParams,
  pageItems,
  parseListQuery,
} from "../app/puzzleListQuery";
import type { PuzzleSummary } from "../app/puzzleLibrary";
import type { ProgressInfo } from "../app/progress";

function puzzle(id: string, title: string, difficulty: string, newspaper = "ایران"): PuzzleSummary {
  return { id, title, difficulty, newspaper } as PuzzleSummary;
}

const puzzles = [
  puzzle("9", "جدول ۸۰۳۵", "عادی"),
  puzzle("10", "جدول ۸۰۳۶", "ویژه"),
  puzzle("11", "جدول ۸۰۳۶", "عادی", "جام جم"),
];
const progress: Record<string, ProgressInfo> = {
  "9": { status: "progress", percent: 10 },
  "11": { status: "done", percent: 100 },
};
const ids = (query: Partial<typeof DEFAULT_LIST_QUERY>) =>
  filterAndSortPuzzles(puzzles, progress, { ...DEFAULT_LIST_QUERY, ...query }).map((p) => p.id);

describe("puzzle list query", () => {
  it("round-trips through the URL and keeps defaults out of it", () => {
    expect(listQueryToParams(DEFAULT_LIST_QUERY).toString()).toBe("");
    const query = { ...DEFAULT_LIST_QUERY, page: 3, level: "special", paper: "جام جم", q: "۸۰" } as const;
    expect(parseListQuery(`#/?${listQueryToParams(query)}`)).toEqual(query);
    expect(parseListQuery("#/?page=abc&sort=bogus&status=x")).toEqual(DEFAULT_LIST_QUERY);
  });

  it("filters and sorts", () => {
    expect(ids({})).toEqual(["11", "10", "9"]); // numeric id, newest first
    expect(ids({ sort: "old" })).toEqual(["9", "10", "11"]);
    expect(ids({ sort: "progress" })).toEqual(["11", "9", "10"]);
    expect(ids({ q: "8036" })).toEqual(["11", "10"]); // ASCII digits match Persian titles
    expect(ids({ q: "۸۰۳۵" })).toEqual(["9"]);
    expect(ids({ level: "special" })).toEqual(["10"]);
    expect(ids({ level: "normal" })).toEqual(["11", "9"]);
    expect(ids({ status: "new" })).toEqual(["10"]);
    expect(ids({ status: "progress" })).toEqual(["9"]);
    expect(ids({ status: "done" })).toEqual(["11"]);
    expect(ids({ paper: "جام جم" })).toEqual(["11"]);
  });

  it("collapses page buttons around the current page", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(1, 11)).toEqual([1, 2, null, 11]);
    expect(pageItems(4, 11)).toEqual([1, 2, 3, 4, 5, null, 11]);
    expect(pageItems(6, 11)).toEqual([1, null, 5, 6, 7, null, 11]);
    expect(pageItems(11, 11)).toEqual([1, null, 10, 11]);
  });
});
