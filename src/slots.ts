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
  const acrossStarts = deriveAcrossStarts(size, blocks);
  const downStarts = deriveDownStarts(size, blocks);

  const acrossSlots: DerivedSlot[] = [];
  let currentRow = -1;
  let wordIndex = 0;

  for (const start of acrossStarts) {
    if (start.start.row !== currentRow) {
      currentRow = start.start.row;
      wordIndex = 1;
    } else {
      wordIndex += 1;
    }
    const groupNum = start.start.row + 1;
    acrossSlots.push({
      id: `R${groupNum}-${wordIndex}`,
      groupNum,
      wordIndexInGroup: wordIndex,
      direction: "across",
      start: cloneCoord(start.start),
      cells: start.cells.map(cloneCoord),
      length: start.cells.length,
    });
  }

  const downSlots: DerivedSlot[] = [];
  let currentCol = -1;
  wordIndex = 0;

  for (const start of downStarts) {
    if (start.start.col !== currentCol) {
      currentCol = start.start.col;
      wordIndex = 1;
    } else {
      wordIndex += 1;
    }
    const groupNum = size.cols - start.start.col;
    downSlots.push({
      id: `C${groupNum}-${wordIndex}`,
      groupNum,
      wordIndexInGroup: wordIndex,
      direction: "down",
      start: cloneCoord(start.start),
      cells: start.cells.map(cloneCoord),
      length: start.cells.length,
    });
  }

  return [...acrossSlots, ...downSlots];
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
