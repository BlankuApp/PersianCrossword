import type { CellKey, Coord, GridSize } from "./types.js";

export function cellKey(coord: Coord): CellKey {
  return `${coord.row},${coord.col}`;
}

export function parseCellKey(key: string): Coord | undefined {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) {
    return undefined;
  }

  return {
    row: Number(match[1]),
    col: Number(match[2]),
  };
}

export function isIntegerCoord(coord: Coord): boolean {
  return Number.isInteger(coord.row) && Number.isInteger(coord.col);
}

export function isInBounds(size: GridSize, coord: Coord): boolean {
  return (
    coord.row >= 0 &&
    coord.row < size.rows &&
    coord.col >= 0 &&
    coord.col < size.cols
  );
}

export function buildBlockSet(blocks: readonly Coord[]): Set<CellKey> {
  return new Set(blocks.map((coord) => cellKey(coord)));
}

export function cloneCoord(coord: Coord): Coord {
  return { row: coord.row, col: coord.col };
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}
