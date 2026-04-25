import { cellKey, parseCellKey } from "./grid.js";
import { normalizePersianText, splitPersianGraphemes } from "./text.js";
import type {
  CellKey,
  ClueSelection,
  Coord,
  CrosswordPuzzle,
  CrosswordState,
  SavedCrosswordState,
  SelectionInfo,
  Slot,
  SlotCheckResult,
  SlotId,
} from "./types.js";

export function createState(
  puzzle: CrosswordPuzzle,
  savedState?: SavedCrosswordState,
): CrosswordState {
  return new MutableCrosswordState(puzzle, savedState);
}

class MutableCrosswordState implements CrosswordState {
  readonly puzzle: CrosswordPuzzle;

  private readonly cells = new Map<CellKey, string>();

  constructor(puzzle: CrosswordPuzzle, savedState?: SavedCrosswordState) {
    this.puzzle = puzzle;

    if (!savedState) {
      return;
    }

    for (const [key, value] of Object.entries(savedState.cells)) {
      const coord = parseCellKey(key);
      if (!coord) {
        throw new RangeError(`Invalid saved cell key: ${key}`);
      }

      this.setCell(coord, value);
    }
  }

  getCell(coord: Coord): string | undefined {
    return this.cells.get(cellKey(coord));
  }

  setCell(coord: Coord, value: string | null | undefined): void {
    ensureWritableWhiteCell(this.puzzle, coord);

    const key = cellKey(coord);
    if (value === null || value === undefined || value === "") {
      this.cells.delete(key);
      return;
    }

    if (splitPersianGraphemes(value).length !== 1) {
      throw new RangeError("Cell value must contain exactly one Persian grapheme.");
    }

    this.cells.set(key, value);
  }

  clearCell(coord: Coord): void {
    this.setCell(coord, null);
  }

  getSelectionInfo(coord: Coord): SelectionInfo {
    const inBounds = this.puzzle.isInBounds(coord);
    const isBlock = inBounds ? this.puzzle.isBlock(coord) : false;
    const slots = inBounds && !isBlock ? this.puzzle.getSlotsForCell(coord) : {};
    const value = inBounds && !isBlock ? this.getCell(coord) : undefined;
    const clues: {
      across?: ClueSelection;
      down?: ClueSelection;
    } = {};

    if (slots.across) {
      clues.across = toClueSelection(slots.across);
    }

    if (slots.down) {
      clues.down = toClueSelection(slots.down);
    }

    const selection: SelectionInfo = {
      coord,
      inBounds,
      isBlock,
      slots,
      clues,
    };

    if (value !== undefined) {
      return {
        ...selection,
        value,
      };
    }

    return selection;
  }

  checkSlot(slotId: SlotId): SlotCheckResult {
    const slot = this.puzzle.getSlot(slotId);
    if (!slot) {
      throw new RangeError(`Unknown slot ID: ${slotId}`);
    }

    if (slot.normalizedAnswer === null) {
      return "unknownAnswer";
    }

    const values: string[] = [];
    for (const coord of slot.cells) {
      const value = this.getCell(coord);
      if (!value) {
        return "incomplete";
      }
      values.push(value);
    }

    return normalizePersianText(values.join("")) === slot.normalizedAnswer
      ? "correct"
      : "incorrect";
  }

  toJSON(): SavedCrosswordState {
    const cells: Record<CellKey, string> = {};

    for (let row = 0; row < this.puzzle.size.rows; row += 1) {
      for (let col = 0; col < this.puzzle.size.cols; col += 1) {
        const key = cellKey({ row, col });
        const value = this.cells.get(key);
        if (value !== undefined) {
          cells[key] = value;
        }
      }
    }

    return { cells };
  }
}

function ensureWritableWhiteCell(puzzle: CrosswordPuzzle, coord: Coord): void {
  if (!puzzle.isInBounds(coord)) {
    throw new RangeError(`Cell is outside the puzzle grid: ${coord.row},${coord.col}`);
  }

  if (puzzle.isBlock(coord)) {
    throw new RangeError(`Cannot write to a black square: ${coord.row},${coord.col}`);
  }
}

function toClueSelection(slot: Slot): ClueSelection {
  return {
    slotId: slot.id,
    groupNum: slot.groupNum,
    wordIndexInGroup: slot.wordIndexInGroup,
    clue: slot.clue,
    length: slot.length,
    direction: slot.direction,
  };
}
