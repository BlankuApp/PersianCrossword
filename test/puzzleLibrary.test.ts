import { describe, expect, it } from "vitest";
import { getPuzzleById, listPuzzles, setPuzzleSources, setStoredCatalog } from "../app/puzzleLibrary";
import sample10 from "../samples/sample-10x10-garden.json";
import type { CrosswordJson } from "../src/index";

const json = sample10 as CrosswordJson;
const { id: _id, ...metaWithoutId } = json.meta!;

describe("puzzle library", () => {
  it("lists downloaded puzzles by id with their images", () => {
    setStoredCatalog({
      packs: {
        p001: {
          hash: "pack",
          puzzles: { "7": { hash: "h7", json: { ...json, meta: { ...json.meta, id: "7" } }, sourceImageUrl: "https://img/7.webp" } },
        },
      },
    });
    expect(listPuzzles().map((p) => p.id)).toEqual(["7"]);
    const puzzle = getPuzzleById("7");
    expect(puzzle?.title).toBe(json.meta?.title);
    expect(puzzle?.sourceImageUrl).toBe("https://img/7.webp");
    expect(puzzle?.filePath).toBeUndefined();
    expect(puzzle?.error).toBeUndefined();
  });

  it("falls back to the slug without meta.id and keeps local file paths", () => {
    setPuzzleSources([{ slug: "no-id", hash: "h", json: { ...json, meta: metaWithoutId }, filePath: "../puzzles/a/no-id.json" }]);
    expect(getPuzzleById("no-id")?.filePath).toBe("../puzzles/a/no-id.json");
    expect(getPuzzleById("7")).toBeUndefined();
  });

  it("marks a puzzle it can't read instead of dropping it", () => {
    setPuzzleSources([{ slug: "broken", hash: "h", json: { version: 3 } as unknown as CrosswordJson }]);
    expect(getPuzzleById("broken")?.error).toBeTruthy();
  });
});
