import { buildBlockSet } from "./grid.js";
import { deriveSlots } from "./slots.js";
import { countPersianGraphemes } from "./text.js";
import type {
  Coord,
  DerivedSlot,
  Direction,
  GridSize,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

export class CrosswordValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(formatValidationMessage(issues));
    this.name = "CrosswordValidationError";
    this.issues = issues;
  }
}

interface GridReadResult {
  readonly size: GridSize;
  readonly blocks: readonly Coord[];
}

export function validatePuzzleJson(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [
        {
          code: "invalid_puzzle",
          message: "Puzzle JSON must be an object.",
          path: "",
        },
      ],
      derivedSlots: [],
    };
  }

  if (input.version === 1) {
    return {
      valid: false,
      issues: [
        {
          code: "unsupported_version",
          message:
            "Puzzle JSON version 1 is no longer supported. Run `node tools/migrate-v1-to-v2.mjs <files>` to upgrade.",
          path: "version",
        },
      ],
      derivedSlots: [],
    };
  }

  if (input.version !== 2) {
    issues.push({
      code: "unsupported_version",
      message: 'Puzzle JSON must declare "version": 2.',
      path: "version",
    });
  }

  const gridResult = readGrid(input.grid, issues);

  let derivedSlots: DerivedSlot[] = [];
  if (gridResult) {
    derivedSlots = deriveSlots(gridResult.size, buildBlockSet(gridResult.blocks));
  }

  validateClues(input.clues, derivedSlots, issues, gridResult !== undefined);
  validateAnswers(input.answers, derivedSlots, issues);

  return {
    valid: issues.length === 0,
    issues,
    derivedSlots,
  };
}

function readGrid(value: unknown, issues: ValidationIssue[]): GridReadResult | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({
      code: "invalid_grid",
      message: "Puzzle grid must be a non-empty array of rows.",
      path: "grid",
    });
    return undefined;
  }

  const rows = value.length;
  let cols: number | undefined;
  const blocks: Coord[] = [];
  let hasError = false;

  for (let row = 0; row < rows; row += 1) {
    const rowValue = value[row];
    const rowPath = `grid[${row}]`;

    if (!Array.isArray(rowValue)) {
      issues.push({
        code: "invalid_grid_row",
        message: "Each grid row must be an array of 0/1 integers.",
        path: rowPath,
      });
      hasError = true;
      continue;
    }

    if (cols === undefined) {
      cols = rowValue.length;
      if (cols === 0) {
        issues.push({
          code: "invalid_grid",
          message: "Puzzle grid rows must have at least one cell.",
          path: rowPath,
        });
        hasError = true;
        continue;
      }
    } else if (rowValue.length !== cols) {
      issues.push({
        code: "invalid_grid",
        message: `Grid row ${row} has ${rowValue.length} cells, expected ${cols}.`,
        path: rowPath,
      });
      hasError = true;
      continue;
    }

    for (let col = 0; col < rowValue.length; col += 1) {
      const cell = rowValue[col];
      if (cell === 1) {
        blocks.push({ row, col });
      } else if (cell !== 0) {
        issues.push({
          code: "invalid_grid_cell",
          message: "Grid cells must be 0 (open) or 1 (black).",
          path: `${rowPath}[${col}]`,
        });
        hasError = true;
      }
    }
  }

  if (hasError || cols === undefined) {
    return undefined;
  }

  return { size: { rows, cols }, blocks };
}

interface DirectionGroups {
  readonly direction: Direction;
  readonly key: "horizontal" | "vertical";
  /** group number → slots ordered by `wordIndexInGroup` (1, 2, ...). */
  readonly groups: ReadonlyMap<number, readonly DerivedSlot[]>;
}

function buildDirectionGroups(
  derivedSlots: readonly DerivedSlot[],
): readonly [DirectionGroups, DirectionGroups] {
  const horizontal = new Map<number, DerivedSlot[]>();
  const vertical = new Map<number, DerivedSlot[]>();

  const sorted = [...derivedSlots].sort(
    (a, b) => a.wordIndexInGroup - b.wordIndexInGroup,
  );

  for (const slot of sorted) {
    const target = slot.direction === "across" ? horizontal : vertical;
    const list = target.get(slot.groupNum) ?? [];
    list.push(slot);
    target.set(slot.groupNum, list);
  }

  return [
    { direction: "across", key: "horizontal", groups: horizontal },
    { direction: "down", key: "vertical", groups: vertical },
  ];
}

function validateClues(
  value: unknown,
  derivedSlots: readonly DerivedSlot[],
  issues: ValidationIssue[],
  haveGrid: boolean,
): void {
  if (!isRecord(value)) {
    issues.push({
      code: "invalid_clues",
      message:
        "Puzzle clues must be an object with `horizontal` and `vertical` group maps.",
      path: "clues",
    });
    return;
  }

  for (const dir of ["horizontal", "vertical"] as const) {
    const dirValue = value[dir];
    if (dirValue !== undefined && !isRecord(dirValue)) {
      issues.push({
        code: "invalid_clue_group",
        message: `clues.${dir} must be an object mapping group numbers to clue arrays.`,
        path: `clues.${dir}`,
      });
    }
  }

  if (!haveGrid) {
    return;
  }

  const directions = buildDirectionGroups(derivedSlots);

  for (const { key, groups } of directions) {
    const dirValue = value[key];
    const provided = isRecord(dirValue) ? dirValue : {};

    for (const [groupNum, slots] of groups) {
      const path = `clues.${key}.${groupNum}`;
      const arr = provided[String(groupNum)];

      if (arr === undefined) {
        issues.push({
          code: "missing_clue_group",
          message: `Missing clues for ${key} group ${groupNum} (expected ${slots.length} clue${slots.length === 1 ? "" : "s"}).`,
          path,
        });
        continue;
      }

      if (!Array.isArray(arr)) {
        issues.push({
          code: "invalid_clue_group",
          message: `${path} must be an array of clue strings.`,
          path,
        });
        continue;
      }

      if (arr.length !== slots.length) {
        issues.push({
          code: "clue_length_mismatch",
          message: `${path} has ${arr.length} entries, expected ${slots.length}.`,
          path,
        });
      }

      const limit = Math.min(arr.length, slots.length);
      for (let i = 0; i < limit; i += 1) {
        const entry = arr[i];
        if (typeof entry !== "string" || entry.length === 0) {
          issues.push({
            code: "invalid_clue",
            message: "Clue values must be non-empty strings.",
            path: `${path}[${i}]`,
            slotId: slots[i]!.id,
          });
        }
      }
    }

    for (const groupKey of Object.keys(provided)) {
      const groupNum = Number.parseInt(groupKey, 10);
      if (!Number.isInteger(groupNum) || groupNum <= 0 || String(groupNum) !== groupKey) {
        issues.push({
          code: "invalid_group_key",
          message: `Group keys must be positive integers, got "${groupKey}".`,
          path: `clues.${key}.${groupKey}`,
        });
        continue;
      }
      if (!groups.has(groupNum)) {
        issues.push({
          code: "orphaned_clue_group",
          message: `${key} group ${groupNum} has no slots in the derived grid.`,
          path: `clues.${key}.${groupKey}`,
        });
      }
    }
  }
}

function validateAnswers(
  value: unknown,
  derivedSlots: readonly DerivedSlot[],
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    issues.push({
      code: "invalid_answers",
      message:
        "Puzzle answers must be an object with optional `horizontal` and `vertical` group maps.",
      path: "answers",
    });
    return;
  }

  const directions = buildDirectionGroups(derivedSlots);

  for (const { key, groups } of directions) {
    const dirValue = value[key];
    if (dirValue === undefined) {
      continue;
    }
    if (!isRecord(dirValue)) {
      issues.push({
        code: "invalid_answer_group",
        message: `answers.${key} must be an object mapping group numbers to answer arrays.`,
        path: `answers.${key}`,
      });
      continue;
    }

    for (const [groupKey, arr] of Object.entries(dirValue)) {
      const groupNum = Number.parseInt(groupKey, 10);
      const path = `answers.${key}.${groupKey}`;

      if (!Number.isInteger(groupNum) || groupNum <= 0 || String(groupNum) !== groupKey) {
        issues.push({
          code: "invalid_group_key",
          message: `Group keys must be positive integers, got "${groupKey}".`,
          path,
        });
        continue;
      }

      const slots = groups.get(groupNum);
      if (!slots) {
        issues.push({
          code: "orphaned_answer_group",
          message: `${key} group ${groupNum} has no slots in the derived grid.`,
          path,
        });
        continue;
      }

      if (!Array.isArray(arr)) {
        issues.push({
          code: "invalid_answer_group",
          message: `${path} must be an array of answer strings or nulls.`,
          path,
        });
        continue;
      }

      if (arr.length > slots.length) {
        issues.push({
          code: "answer_length_mismatch",
          message: `${path} has ${arr.length} entries, expected at most ${slots.length}.`,
          path,
        });
      }

      const limit = Math.min(arr.length, slots.length);
      for (let i = 0; i < limit; i += 1) {
        const entry = arr[i];
        if (entry === null) {
          continue;
        }
        if (typeof entry !== "string") {
          issues.push({
            code: "invalid_answer",
            message: "Answer values must be strings or null.",
            path: `${path}[${i}]`,
            slotId: slots[i]!.id,
          });
          continue;
        }
        const length = countPersianGraphemes(entry);
        if (length !== slots[i]!.length) {
          issues.push({
            code: "answer_length_mismatch",
            message: `Answer for slot ${slots[i]!.id} has ${length} characters, but the slot has length ${slots[i]!.length}.`,
            path: `${path}[${i}]`,
            slotId: slots[i]!.id,
          });
        }
      }
    }
  }
}

function formatValidationMessage(issues: readonly ValidationIssue[]): string {
  if (issues.length === 0) {
    return "Crossword puzzle validation failed.";
  }

  const first = issues[0]!;
  const suffix = issues.length === 1 ? "" : ` and ${issues.length - 1} more issue(s)`;
  return `Crossword puzzle validation failed: ${first.message}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
