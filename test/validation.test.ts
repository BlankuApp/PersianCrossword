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

  it("rejects v1 puzzles with an actionable message", () => {
    const result = validatePuzzleJson({
      version: 1,
      size: { rows: 1, cols: 2 },
      blocks: [],
      clues: {},
    });

    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("unsupported_version");
    expect(result.issues[0]?.message).toMatch(/migrate-v1-to-v2/);
  });

  it("requires version 2", () => {
    const result = validatePuzzleJson({
      grid: [[0, 0]],
      clues: { horizontal: { "1": ["clue"] }, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("unsupported_version");
  });

  it("rejects a non-rectangular grid", () => {
    const result = validatePuzzleJson({
      version: 2,
      grid: [
        [0, 0, 0],
        [0, 0],
      ],
      clues: { horizontal: {}, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("invalid_grid");
  });

  it("rejects non-0/1 grid cells", () => {
    const result = validatePuzzleJson({
      version: 2,
      grid: [[0, 2]],
      clues: { horizontal: {}, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("invalid_grid_cell");
  });

  it("reports clue array length mismatches", () => {
    const result = validatePuzzleJson({
      version: 2,
      grid: [[0, 0]],
      clues: {
        horizontal: { "1": ["one", "two"] },
        vertical: {},
      },
    });

    expect(result.issues.map((i) => i.code)).toContain("clue_length_mismatch");
  });

  it("reports missing clue groups", () => {
    const result = validatePuzzleJson({
      version: 2,
      grid: [[0, 0]],
      clues: { horizontal: {}, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("missing_clue_group");
  });

  it("reports clue groups that don't exist in the grid", () => {
    const result = validatePuzzleJson({
      version: 2,
      grid: [[0, 0]],
      clues: {
        horizontal: { "1": ["clue"], "5": ["extra"] },
        vertical: {},
      },
    });

    expect(result.issues.map((i) => i.code)).toContain("orphaned_clue_group");
  });

  it("reports answer length mismatches after Persian normalization", () => {
    const result = validatePuzzleJson({
      version: 2,
      grid: [[0, 0]],
      clues: { horizontal: { "1": ["two letters"] }, vertical: {} },
      answers: { horizontal: { "1": ["سلام"] }, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("answer_length_mismatch");
  });

  it("throws a validation error when compiling invalid JSON", () => {
    expect(() =>
      compilePuzzle({
        version: 2,
        grid: [[0, 0]],
        clues: { horizontal: {}, vertical: {} },
      } as never),
    ).toThrow(CrosswordValidationError);
  });
});
