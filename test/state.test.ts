import { describe, expect, it } from "vitest";
import { compilePuzzle, createState } from "../src/index.js";
import { basicPuzzle } from "./fixtures.js";

describe("crossword state", () => {
  it("stores filled cells and serializes progress", () => {
    const puzzle = compilePuzzle(basicPuzzle);
    const state = createState(puzzle);

    state.setCell({ row: 0, col: 3 }, "س");
    state.setCell({ row: 0, col: 2 }, "ل");

    expect(state.getCell({ row: 0, col: 3 })).toBe("س");
    expect(state.toJSON()).toEqual({
      cells: {
        "0,2": "ل",
        "0,3": "س",
      },
    });
  });

  it("returns selection info with across and down clues", () => {
    const puzzle = compilePuzzle(basicPuzzle);
    const state = createState(puzzle);

    const selection = state.getSelectionInfo({ row: 0, col: 3 });

    expect(selection.inBounds).toBe(true);
    expect(selection.isBlock).toBe(false);
    expect(selection.clues.across).toMatchObject({
      slotId: "R1-1",
      clue: "ردیف بالا",
      direction: "across",
    });
    expect(selection.clues.down).toMatchObject({
      slotId: "C1-1",
      clue: "ستون راست",
      direction: "down",
    });
  });

  it("returns controlled selection info for black and out-of-bounds cells", () => {
    const puzzle = compilePuzzle(basicPuzzle);
    const state = createState(puzzle);

    expect(state.getSelectionInfo({ row: 1, col: 2 })).toMatchObject({
      inBounds: true,
      isBlock: true,
      slots: {},
    });
    expect(state.getSelectionInfo({ row: 9, col: 9 })).toMatchObject({
      inBounds: false,
      isBlock: false,
      slots: {},
    });
  });

  it("checks known answers with Persian normalization", () => {
    const puzzle = compilePuzzle({
      version: 2,
      grid: [[0, 0]],
      clues: { horizontal: { "1": ["یک"] }, vertical: {} },
      answers: { horizontal: { "1": ["یک"] }, vertical: {} },
    });
    const state = createState(puzzle);

    expect(state.checkSlot("R1-1")).toBe("incomplete");

    state.setCell({ row: 0, col: 1 }, "ي");
    state.setCell({ row: 0, col: 0 }, "ك");

    expect(state.checkSlot("R1-1")).toBe("correct");

    state.setCell({ row: 0, col: 0 }, "ن");

    expect(state.checkSlot("R1-1")).toBe("incorrect");
  });

  it("returns unknownAnswer when the answer is missing or null", () => {
    const puzzle = compilePuzzle(basicPuzzle);
    const state = createState(puzzle);

    expect(state.checkSlot("C3-1")).toBe("unknownAnswer");
  });

  it("rejects writes to black, out-of-bounds, or multi-character cells", () => {
    const puzzle = compilePuzzle(basicPuzzle);
    const state = createState(puzzle);

    expect(() => state.setCell({ row: 1, col: 2 }, "ا")).toThrow(RangeError);
    expect(() => state.setCell({ row: 9, col: 9 }, "ا")).toThrow(RangeError);
    expect(() => state.setCell({ row: 0, col: 0 }, "اب")).toThrow(RangeError);
  });
});
