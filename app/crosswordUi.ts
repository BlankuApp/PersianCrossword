import {
  cellKey,
  splitPersianGraphemes,
  type Coord,
  type CrosswordPuzzle,
  type Direction,
  type Slot,
} from "../src/index";

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

export function isTouchDevice(): boolean {
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) return true;
  if (typeof window !== "undefined" && "ontouchstart" in window) return true;
  return false;
}

export interface TrayTile {
  readonly id: string;
  readonly letter: string;
}

const TRAY_DECOY_COUNT = 3;
const PERSIAN_LETTERS = [
  "ا", "ب", "پ", "ت", "ث", "ج", "چ", "ح", "خ", "د", "ذ", "ر", "ز", "ژ", "س", "ش",
  "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ک", "گ", "ل", "م", "ن", "و", "ه", "ی",
] as const;

/** Unique letters needed to fill `slot` plus a fixed number of unique random decoys, shuffled together. */
export function buildLetterTray(slot: Slot): readonly TrayTile[] {
  const realLetters = slot.answer ? splitPersianGraphemes(slot.answer) : [];
  const uniqueRealLetters = Array.from(new Set(realLetters));
  const rng = mulberry32(hashStringToSeed(slot.id));
  const tiles: TrayTile[] = uniqueRealLetters.map((letter, i) => ({
    id: `${slot.id}:real:${i}`,
    letter,
  }));
  const usedLetters = new Set(uniqueRealLetters);
  const decoyPool = shuffle(PERSIAN_LETTERS.filter((letter) => !usedLetters.has(letter)), rng);
  const decoyCount = Math.min(TRAY_DECOY_COUNT, decoyPool.length);
  for (let i = 0; i < decoyCount; i += 1) {
    tiles.push({ id: `${slot.id}:decoy:${i}`, letter: decoyPool[i]! });
  }
  return shuffle(tiles, rng);
}

function hashStringToSeed(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (Math.imul(h, 31) + value.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// Deterministic, dependency-free PRNG seeded by slot.id so a clue's tray order is stable
// within a session without needing to persist it.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
