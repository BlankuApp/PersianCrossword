import { cellKey, cloneCoord, isInBounds } from "./grid.js";
import { normalizePersianText } from "./text.js";
import type {
  CellKey,
  Coord,
  CrosswordJson,
  CrosswordPuzzle,
  Direction,
  Slot,
  SlotId,
  SlotsForCell,
} from "./types.js";
import { CrosswordValidationError, validatePuzzleJson } from "./validation.js";

export function compilePuzzle(input: CrosswordJson): CrosswordPuzzle {
  const validation = validatePuzzleJson(input);

  if (!validation.valid) {
    throw new CrosswordValidationError(validation.issues);
  }

  const blocks = new Set<CellKey>();
  for (let row = 0; row < input.grid.length; row += 1) {
    const rowValues = input.grid[row]!;
    for (let col = 0; col < rowValues.length; col += 1) {
      if (rowValues[col] === 1) {
        blocks.add(cellKey({ row, col }));
      }
    }
  }

  const slots = validation.derivedSlots.map<Slot>((slot) => {
    const clue = lookupGroupEntry(input.clues, slot.direction, slot.groupNum, slot.wordIndexInGroup);
    const rawAnswer = lookupGroupEntry(
      input.answers,
      slot.direction,
      slot.groupNum,
      slot.wordIndexInGroup,
    );
    const answer = typeof rawAnswer === "string" ? rawAnswer : null;

    return {
      ...slot,
      clue: clue as string,
      answer,
      normalizedAnswer: answer === null ? null : normalizePersianText(answer),
    };
  });

  return new CompiledCrosswordPuzzle(input, blocks, slots);
}

function lookupGroupEntry(
  source:
    | {
        readonly horizontal?: Readonly<Record<string, readonly (string | null)[]>>;
        readonly vertical?: Readonly<Record<string, readonly (string | null)[]>>;
      }
    | undefined,
  direction: Direction,
  groupNum: number,
  wordIndexInGroup: number,
): string | null | undefined {
  if (!source) {
    return undefined;
  }
  const group = direction === "across" ? source.horizontal : source.vertical;
  const arr = group?.[String(groupNum)];
  return arr ? arr[wordIndexInGroup - 1] : undefined;
}

class CompiledCrosswordPuzzle implements CrosswordPuzzle {
  readonly size;
  readonly blocks: ReadonlySet<CellKey>;
  readonly slots: readonly Slot[];
  readonly acrossSlots: readonly Slot[];
  readonly downSlots: readonly Slot[];
  readonly source: CrosswordJson;

  private readonly slotsById: ReadonlyMap<SlotId, Slot>;
  private readonly slotsByCell: ReadonlyMap<CellKey, SlotsForCell>;

  constructor(source: CrosswordJson, blocks: ReadonlySet<CellKey>, slots: readonly Slot[]) {
    this.source = source;
    this.size = {
      rows: source.grid.length,
      cols: source.grid[0]?.length ?? 0,
    };
    this.blocks = new Set(blocks);
    this.slots = slots.map(cloneSlot);
    this.acrossSlots = this.slots.filter((slot) => slot.direction === "across");
    this.downSlots = this.slots.filter((slot) => slot.direction === "down");
    this.slotsById = new Map(this.slots.map((slot) => [slot.id, slot]));
    this.slotsByCell = buildSlotsByCell(this.slots);
  }

  isInBounds(coord: Coord): boolean {
    return isInBounds(this.size, coord);
  }

  isBlock(coord: Coord): boolean {
    return this.blocks.has(cellKey(coord));
  }

  getSlot(slotId: SlotId): Slot | undefined {
    return this.slotsById.get(slotId);
  }

  getCellsForSlot(slotId: SlotId): readonly Coord[] {
    const slot = this.slotsById.get(slotId);

    if (!slot) {
      throw new RangeError(`Unknown slot ID: ${slotId}`);
    }

    return slot.cells.map(cloneCoord);
  }

  getSlotsForCell(coord: Coord): SlotsForCell {
    if (!this.isInBounds(coord) || this.isBlock(coord)) {
      return {};
    }

    return this.slotsByCell.get(cellKey(coord)) ?? {};
  }
}

function buildSlotsByCell(slots: readonly Slot[]): Map<CellKey, SlotsForCell> {
  const slotsByCell = new Map<CellKey, { across?: Slot; down?: Slot }>();

  for (const slot of slots) {
    for (const coord of slot.cells) {
      const key = cellKey(coord);
      const entry = slotsByCell.get(key) ?? {};

      if (slot.direction === "across") {
        entry.across = slot;
      } else {
        entry.down = slot;
      }

      slotsByCell.set(key, entry);
    }
  }

  return slotsByCell;
}

function cloneSlot(slot: Slot): Slot {
  return {
    ...slot,
    start: cloneCoord(slot.start),
    cells: slot.cells.map(cloneCoord),
  };
}
