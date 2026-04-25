import { describe, expect, it } from "vitest";
import { compilePuzzle, CrosswordValidationError, validatePuzzleJson } from "../src/index.js";
import { basicPuzzle } from "./fixtures.js";

describe("puzzle validation", () => {
  it("accepts a valid puzzle", () => {
    const result = validatePuzzleJson(basicPuzzle);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.derivedSlots).toHaveLength(6);
  });

  it("rejects invalid grid size", () => {
    const result = validatePuzzleJson({
      version: 1,
      size: { rows: 0, cols: 4 },
      blocks: [],
      clues: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("invalid_size");
  });

  it("rejects duplicate and out-of-bounds blocks", () => {
    const result = validatePuzzleJson({
      version: 1,
      size: { rows: 2, cols: 2 },
      blocks: [
        { row: 0, col: 1 },
        { row: 0, col: 1 },
        { row: 5, col: 0 },
      ],
      clues: {},
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["duplicate_block", "block_out_of_bounds"]),
    );
  });

  it("reports missing and orphaned clues", () => {
    const result = validatePuzzleJson({
      version: 1,
      size: { rows: 1, cols: 2 },
      blocks: [],
      clues: { "99A": "extra" },
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing_clue", "orphaned_slot_data"]),
    );
  });

  it("reports answer length mismatches after Persian normalization", () => {
    const result = validatePuzzleJson({
      version: 1,
      size: { rows: 1, cols: 2 },
      blocks: [],
      clues: { "1A": "two letters" },
      answers: { "1A": "سلام" },
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      "answer_length_mismatch",
    );
  });

  it("throws a validation error when compiling invalid JSON", () => {
    expect(() =>
      compilePuzzle({
        version: 1,
        size: { rows: 1, cols: 2 },
        blocks: [],
        clues: {},
      }),
    ).toThrow(CrosswordValidationError);
  });
});
