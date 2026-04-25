import { cellKey, type Coord, type CrosswordPuzzle, type Direction, type Slot } from "../src/index";

export interface Selection {
  readonly coord: Coord;
  readonly direction: Direction;
}

export function chooseInitialDirection(
  puzzle: CrosswordPuzzle,
  coord: Coord,
): Direction | undefined {
  const slots = puzzle.getSlotsForCell(coord);
  return slots.across ? "across" : slots.down ? "down" : undefined;
}

export function getActiveSlot(
  puzzle: CrosswordPuzzle,
  selection: Selection | undefined,
): Slot | undefined {
  if (!selection) {
    return undefined;
  }

  const slots = puzzle.getSlotsForCell(selection.coord);
  return selection.direction === "across" ? slots.across : slots.down;
}

export function selectSlot(slot: Slot): Selection {
  return {
    coord: slot.start,
    direction: slot.direction,
  };
}

export function handleCellSelection(
  puzzle: CrosswordPuzzle,
  coord: Coord,
  current: Selection | undefined,
): Selection | undefined {
  if (!puzzle.isInBounds(coord) || puzzle.isBlock(coord)) {
    return current;
  }

  const slots = puzzle.getSlotsForCell(coord);

  if (current && sameCoord(current.coord, coord) && slots.across && slots.down) {
    return {
      coord,
      direction: current.direction === "across" ? "down" : "across",
    };
  }

  return {
    coord,
    direction: chooseInitialDirection(puzzle, coord) ?? "across",
  };
}

export function nextCoordInSlot(
  slot: Slot,
  coord: Coord,
  offset: 1 | -1,
): Coord {
  const index = slot.cells.findIndex((cell) => sameCoord(cell, coord));
  if (index === -1) {
    return coord;
  }

  const nextIndex = Math.min(Math.max(index + offset, 0), slot.cells.length - 1);
  return slot.cells[nextIndex] ?? coord;
}

export function moveByArrow(
  puzzle: CrosswordPuzzle,
  coord: Coord,
  key: string,
): Coord {
  const delta =
    key === "ArrowRight"
      ? { row: 0, col: 1 }
      : key === "ArrowLeft"
        ? { row: 0, col: -1 }
        : key === "ArrowUp"
          ? { row: -1, col: 0 }
          : key === "ArrowDown"
            ? { row: 1, col: 0 }
            : { row: 0, col: 0 };

  const next = { row: coord.row + delta.row, col: coord.col + delta.col };
  return puzzle.isInBounds(next) && !puzzle.isBlock(next) ? next : coord;
}

export function slotCellKeys(slot: Slot | undefined): ReadonlySet<string> {
  return new Set(slot?.cells.map((coord) => cellKey(coord)) ?? []);
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}
