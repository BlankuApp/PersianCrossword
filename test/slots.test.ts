import { describe, expect, it } from "vitest";
import { compilePuzzle } from "../src/index.js";
import { basicPuzzleV3 } from "./fixtures.js";

describe("slot derivation and numbering", () => {
  it("derives across slots right-to-left and down slots top-to-bottom", () => {
    const puzzle = compilePuzzle(basicPuzzleV3);

    expect(puzzle.slots.map((slot) => slot.id)).toEqual([
      "R1-1",
      "R2-1",
      "R3-1",
      "C1-1",
      "C3-1",
      "C4-1",
    ]);

    expect(puzzle.getCellsForSlot("R1-1")).toEqual([
      { row: 0, col: 3 },
      { row: 0, col: 2 },
      { row: 0, col: 1 },
      { row: 0, col: 0 },
    ]);

    expect(puzzle.getCellsForSlot("C1-1")).toEqual([
      { row: 0, col: 3 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);

    expect(puzzle.getCellsForSlot("R3-1")).toEqual([
      { row: 2, col: 3 },
      { row: 2, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 0 },
    ]);
  });

  it("ignores single-cell runs", () => {
    const puzzle = compilePuzzle({
      version: 3,
      grid: [["", "ا", ""]],
      clues: { horizontal: {}, vertical: {} },
    });

    expect(puzzle.slots).toEqual([]);
  });

  it("returns the across and down slots for a white cell", () => {
    const puzzle = compilePuzzle(basicPuzzleV3);
    const slots = puzzle.getSlotsForCell({ row: 0, col: 3 });

    expect(slots.across?.id).toBe("R1-1");
    expect(slots.down?.id).toBe("C1-1");
  });

  it("returns no slots for black and out-of-bounds cells", () => {
    const puzzle = compilePuzzle(basicPuzzleV3);

    expect(puzzle.getSlotsForCell({ row: 1, col: 2 })).toEqual({});
    expect(puzzle.getSlotsForCell({ row: 10, col: 10 })).toEqual({});
  });
});
