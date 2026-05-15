import { describe, expect, it } from "vitest";
import { getPuzzleById, listPuzzles } from "../app/puzzleLibrary";

describe("puzzle library", () => {
  it("loads puzzles by id even when assets live in nested folders", () => {
    const puzzle1 = getPuzzleById("1");
    const puzzle68 = getPuzzleById("68");

    expect(puzzle1).toBeDefined();
    expect(puzzle68).toBeDefined();
    expect(listPuzzles().length).toBeGreaterThanOrEqual(68);
  });
});