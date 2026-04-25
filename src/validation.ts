import { buildBlockSet, cellKey, isInBounds } from "./grid.js";
import { deriveSlots } from "./slots.js";
import { countPersianGraphemes } from "./text.js";
import type {
  Coord,
  CrosswordJson,
  DerivedSlot,
  GridSize,
  SlotId,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

const SLOT_ID_PATTERN = /^[1-9]\d*[AD]$/;

export class CrosswordValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(formatValidationMessage(issues));
    this.name = "CrosswordValidationError";
    this.issues = issues;
  }
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

  if ("version" in input && input.version !== 1) {
    issues.push({
      code: "unsupported_version",
      message: "Only crossword JSON version 1 is supported.",
      path: "version",
    });
  }

  const size = readSize(input.size, issues);
  const blocks = readBlocks(input.blocks, size, issues);
  const clues = readStringRecord(input.clues, "clues", issues);
  const answers = readAnswerRecord(input.answers, issues);

  const canDerive =
    size !== undefined &&
    blocks !== undefined &&
    !issues.some((issue) =>
      [
        "invalid_size",
        "invalid_block",
        "duplicate_block",
        "block_out_of_bounds",
      ].includes(issue.code),
    );

  let derivedSlots: DerivedSlot[] = [];

  if (canDerive) {
    derivedSlots = deriveSlots(size, buildBlockSet(blocks));
    validateClues(clues, derivedSlots, issues);
    validateAnswers(answers, derivedSlots, issues);
  }

  return {
    valid: issues.length === 0,
    issues,
    derivedSlots,
  };
}

function readSize(value: unknown, issues: ValidationIssue[]): GridSize | undefined {
  if (!isRecord(value)) {
    issues.push({
      code: "invalid_size",
      message: "Puzzle size must be an object with positive integer rows and cols.",
      path: "size",
    });
    return undefined;
  }

  const rows = value.rows;
  const cols = value.cols;

  if (
    typeof rows !== "number" ||
    typeof cols !== "number" ||
    !Number.isInteger(rows) ||
    !Number.isInteger(cols) ||
    rows <= 0 ||
    cols <= 0
  ) {
    issues.push({
      code: "invalid_size",
      message: "Puzzle size rows and cols must be positive integers.",
      path: "size",
    });
    return undefined;
  }

  return { rows, cols };
}

function readBlocks(
  value: unknown,
  size: GridSize | undefined,
  issues: ValidationIssue[],
): Coord[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: "invalid_blocks",
      message: "Puzzle blocks must be an array of coordinates.",
      path: "blocks",
    });
    return undefined;
  }

  const blocks: Coord[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const path = `blocks[${index}]`;

    if (!isRecord(entry)) {
      issues.push({
        code: "invalid_block",
        message: "Block must be an object with integer row and col.",
        path,
      });
      return;
    }

    const row = entry.row;
    const col = entry.col;

    if (
      typeof row !== "number" ||
      typeof col !== "number" ||
      !Number.isInteger(row) ||
      !Number.isInteger(col)
    ) {
      issues.push({
        code: "invalid_block",
        message: "Block row and col must be integers.",
        path,
      });
      return;
    }

    const coord = { row, col };
    const key = cellKey(coord);

    if (seen.has(key)) {
      issues.push({
        code: "duplicate_block",
        message: "Duplicate black square coordinate.",
        path,
        coord,
      });
      return;
    }

    seen.add(key);

    if (size && !isInBounds(size, coord)) {
      issues.push({
        code: "block_out_of_bounds",
        message: "Black square coordinate is outside the puzzle grid.",
        path,
        coord,
      });
      return;
    }

    blocks.push(coord);
  });

  return blocks;
}

function readStringRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) {
    issues.push({
      code: "invalid_clues",
      message: "Puzzle clues must be an object mapping slot IDs to clue text.",
      path,
    });
    return undefined;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      issues.push({
        code: "invalid_clue",
        message: "Clue values must be strings.",
        path: `${path}.${key}`,
        slotId: key,
      });
    }
  }

  return value as Readonly<Record<string, string>>;
}

function readAnswerRecord(
  value: unknown,
  issues: ValidationIssue[],
): Readonly<Record<string, string | null>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    issues.push({
      code: "invalid_answers",
      message: "Puzzle answers must be an object mapping slot IDs to strings or null.",
      path: "answers",
    });
    return undefined;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (entry !== null && typeof entry !== "string") {
      issues.push({
        code: "invalid_answer",
        message: "Answer values must be strings or null.",
        path: `answers.${key}`,
        slotId: key,
      });
    }
  }

  return value as Readonly<Record<string, string | null>>;
}

function validateClues(
  clues: Readonly<Record<string, string>> | undefined,
  derivedSlots: readonly DerivedSlot[],
  issues: ValidationIssue[],
): void {
  if (!clues) {
    return;
  }

  const slotIds = new Set(derivedSlots.map((slot) => slot.id));

  for (const slot of derivedSlots) {
    if (!(slot.id in clues)) {
      issues.push({
        code: "missing_clue",
        message: `Missing clue for slot ${slot.id}.`,
        path: `clues.${slot.id}`,
        slotId: slot.id,
      });
    }
  }

  for (const key of Object.keys(clues)) {
    validateKnownSlotKey(key, slotIds, "clues", issues);
  }
}

function validateAnswers(
  answers: Readonly<Record<string, string | null>> | undefined,
  derivedSlots: readonly DerivedSlot[],
  issues: ValidationIssue[],
): void {
  if (!answers) {
    return;
  }

  const slotById = new Map<SlotId, DerivedSlot>(
    derivedSlots.map((slot) => [slot.id, slot]),
  );
  const slotIds = new Set(slotById.keys());

  for (const [key, answer] of Object.entries(answers)) {
    validateKnownSlotKey(key, slotIds, "answers", issues);

    const slot = slotById.get(key);
    if (!slot || answer === null) {
      continue;
    }

    const length = countPersianGraphemes(answer);
    if (length !== slot.length) {
      issues.push({
        code: "answer_length_mismatch",
        message: `Answer for slot ${key} has ${length} characters, but the slot has length ${slot.length}.`,
        path: `answers.${key}`,
        slotId: key,
      });
    }
  }
}

function validateKnownSlotKey(
  key: string,
  slotIds: ReadonlySet<string>,
  path: "clues" | "answers",
  issues: ValidationIssue[],
): void {
  if (!SLOT_ID_PATTERN.test(key)) {
    issues.push({
      code: "invalid_slot_id",
      message: `Slot ID ${key} must look like 1A or 1D.`,
      path: `${path}.${key}`,
      slotId: key,
    });
    return;
  }

  if (!slotIds.has(key)) {
    issues.push({
      code: "orphaned_slot_data",
      message: `Slot ${key} does not exist in the derived grid.`,
      path: `${path}.${key}`,
      slotId: key,
    });
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
