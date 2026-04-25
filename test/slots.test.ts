import { describe, expect, it } from "vitest";
import { compilePuzzle } from "../src/index.js";
import { basicPuzzle } from "./fixtures.js";

describe("slot derivation and numbering", () => {
  it("derives across slots right-to-left and down slots top-to-bottom", () => {
    const puzzle = compilePuzzle(basicPuzzle);

    expect(puzzle.slots.map((slot) => slot.id)).toEqual([
      "1A",
      "1D",
      "2D",
      "3D",
      "4A",
      "5A",
    ]);

    expect(puzzle.getCellsForSlot("1A")).toEqual([
      { row: 0, col: 3 },
      { row: 0, col: 2 },
      { row: 0, col: 1 },
      { row: 0, col: 0 },
    ]);

    expect(puzzle.getCellsForSlot("1D")).toEqual([
      { row: 0, col: 3 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);

    expect(puzzle.getCellsForSlot("5A")).toEqual([
      { row: 2, col: 3 },
      { row: 2, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 0 },
    ]);
  });

  it("ignores single-cell runs", () => {
    const puzzle = compilePuzzle({
      version: 1,
      size: { rows: 1, cols: 3 },
      blocks: [
        { row: 0, col: 0 },
        { row: 0, col: 2 },
      ],
      clues: {},
    });

    expect(puzzle.slots).toEqual([]);
  });

  it("returns the across and down slots for a white cell", () => {
    const puzzle = compilePuzzle(basicPuzzle);
    const slots = puzzle.getSlotsForCell({ row: 0, col: 3 });

    expect(slots.across?.id).toBe("1A");
    expect(slots.down?.id).toBe("1D");
  });

  it("returns no slots for black and out-of-bounds cells", () => {
    const puzzle = compilePuzzle(basicPuzzle);

    expect(puzzle.getSlotsForCell({ row: 1, col: 2 })).toEqual({});
    expect(puzzle.getSlotsForCell({ row: 10, col: 10 })).toEqual({});
  });
});
