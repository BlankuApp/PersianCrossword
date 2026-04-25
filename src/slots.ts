import { cellKey, cloneCoord, isInBounds } from "./grid.js";
import type { CellKey, Coord, DerivedSlot, Direction, GridSize } from "./types.js";

interface SlotStart {
  readonly direction: Direction;
  readonly start: Coord;
  readonly cells: readonly Coord[];
}

const MIN_SLOT_LENGTH = 2;

export function deriveSlots(
  size: GridSize,
  blocks: ReadonlySet<CellKey>,
): DerivedSlot[] {
  const startsByCell = new Map<CellKey, SlotStart[]>();

  for (const start of deriveAcrossStarts(size, blocks)) {
    addStart(startsByCell, start);
  }

  for (const start of deriveDownStarts(size, blocks)) {
    addStart(startsByCell, start);
  }

  const slots: DerivedSlot[] = [];
  let clueNumber = 1;

  for (let row = 0; row < size.rows; row += 1) {
    for (let col = size.cols - 1; col >= 0; col -= 1) {
      const starts = startsByCell.get(cellKey({ row, col }));
      if (!starts) {
        continue;
      }

      for (const start of orderStarts(starts)) {
        const suffix = start.direction === "across" ? "A" : "D";
        slots.push({
          id: `${clueNumber}${suffix}`,
          clueNumber,
          direction: start.direction,
          start: cloneCoord(start.start),
          cells: start.cells.map(cloneCoord),
          length: start.cells.length,
        });
      }

      clueNumber += 1;
    }
  }

  return slots;
}

function addStart(map: Map<CellKey, SlotStart[]>, start: SlotStart): void {
  const key = cellKey(start.start);
  const existing = map.get(key);

  if (existing) {
    existing.push(start);
    return;
  }

  map.set(key, [start]);
}

function orderStarts(starts: readonly SlotStart[]): SlotStart[] {
  return [...starts].sort((a, b) => {
    if (a.direction === b.direction) {
      return 0;
    }

    return a.direction === "across" ? -1 : 1;
  });
}

function deriveAcrossStarts(
  size: GridSize,
  blocks: ReadonlySet<CellKey>,
): SlotStart[] {
  const starts: SlotStart[] = [];

  for (let row = 0; row < size.rows; row += 1) {
    let col = size.cols - 1;

    while (col >= 0) {
      const coord = { row, col };
      if (isBlocked(size, blocks, coord)) {
        col -= 1;
        continue;
      }

      const cells: Coord[] = [];
      while (col >= 0 && !isBlocked(size, blocks, { row, col })) {
        cells.push({ row, col });
        col -= 1;
      }

      if (cells.length >= MIN_SLOT_LENGTH) {
        starts.push({
          direction: "across",
          start: cells[0]!,
          cells,
        });
      }
    }
  }

  return starts;
}

function deriveDownStarts(
  size: GridSize,
  blocks: ReadonlySet<CellKey>,
): SlotStart[] {
  const starts: SlotStart[] = [];

  for (let col = size.cols - 1; col >= 0; col -= 1) {
    let row = 0;

    while (row < size.rows) {
      const coord = { row, col };
      if (isBlocked(size, blocks, coord)) {
        row += 1;
        continue;
      }

      const cells: Coord[] = [];
      while (row < size.rows && !isBlocked(size, blocks, { row, col })) {
        cells.push({ row, col });
        row += 1;
      }

      if (cells.length >= MIN_SLOT_LENGTH) {
        starts.push({
          direction: "down",
          start: cells[0]!,
          cells,
        });
      }
    }
  }

  return starts;
}

function isBlocked(
  size: GridSize,
  blocks: ReadonlySet<CellKey>,
  coord: Coord,
): boolean {
  return !isInBounds(size, coord) || blocks.has(cellKey(coord));
}
