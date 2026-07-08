import { describe, expect, it } from "vitest";
import { compilePuzzle, CrosswordValidationError, validatePuzzleJson } from "../src/index.js";
import { basicPuzzleV3 } from "./fixtures.js";

describe("puzzle validation", () => {
  it("accepts a valid puzzle", () => {
    const result = validatePuzzleJson(basicPuzzleV3);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.derivedSlots).toHaveLength(6);
  });

  it("requires version 3", () => {
    const result = validatePuzzleJson({
      grid: [["ا", "ب"]],
      clues: { horizontal: { "1": ["clue"] }, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("unsupported_version");
  });

  it("rejects grid cells that are not strings", () => {
    const result = validatePuzzleJson({
      version: 3,
      grid: [["ا", 0]],
      clues: { horizontal: { "1": ["clue"] }, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("invalid_grid_cell");
  });

  it("derives slot answers from the grid", () => {
    const puzzle = compilePuzzle(basicPuzzleV3);
    const across = puzzle.acrossSlots.find((s) => s.groupNum === 1);

    expect(across?.answer).toBe("سلام");
  });

  it("rejects a non-rectangular grid", () => {
    const result = validatePuzzleJson({
      version: 3,
      grid: [
        ["ا", "ب", "ج"],
        ["د", "ه"],
      ],
      clues: { horizontal: {}, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("invalid_grid");
  });

  it("reports clue array length mismatches", () => {
    const result = validatePuzzleJson({
      version: 3,
      grid: [["ا", "ب"]],
      clues: {
        horizontal: { "1": ["one", "two"] },
        vertical: {},
      },
    });

    expect(result.issues.map((i) => i.code)).toContain("clue_length_mismatch");
  });

  it("reports missing clue groups", () => {
    const result = validatePuzzleJson({
      version: 3,
      grid: [["ا", "ب"]],
      clues: { horizontal: {}, vertical: {} },
    });

    expect(result.issues.map((i) => i.code)).toContain("missing_clue_group");
  });

  it("reports clue groups that don't exist in the grid", () => {
    const result = validatePuzzleJson({
      version: 3,
      grid: [["ا", "ب"]],
      clues: {
        horizontal: { "1": ["clue"], "5": ["extra"] },
        vertical: {},
      },
    });

    expect(result.issues.map((i) => i.code)).toContain("orphaned_clue_group");
  });

  it("throws a validation error when compiling invalid JSON", () => {
    expect(() =>
      compilePuzzle({
        version: 3,
        grid: [["ا", "ب"]],
        clues: { horizontal: {}, vertical: {} },
      } as never),
    ).toThrow(CrosswordValidationError);
  });
});
