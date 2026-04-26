export interface Coord {
  readonly row: number;
  readonly col: number;
}

export interface GridSize {
  readonly rows: number;
  readonly cols: number;
}

export type Direction = "across" | "down";
export type SlotId = string;
export type CellKey = `${number},${number}`;

/**
 * Grouped clues / answers keyed by direction, then by 1-based group number.
 *
 * For `horizontal`, the group number is the 1-based row index. The array is
 * ordered right-to-left (Persian RTL): index 0 is the rightmost across slot
 * in that row (matches internal slot ID `R{row}-1`).
 *
 * For `vertical`, the group number is the column number counted from the
 * right (`1` = rightmost column). The array is ordered top-to-bottom: index 0
 * is the topmost down slot in that column (matches internal `C{col}-1`).
 */
export interface CrosswordClues {
  readonly horizontal: Readonly<Record<string, readonly string[]>>;
  readonly vertical: Readonly<Record<string, readonly string[]>>;
}

export interface CrosswordAnswers {
  readonly horizontal?: Readonly<Record<string, readonly (string | null)[]>>;
  readonly vertical?: Readonly<Record<string, readonly (string | null)[]>>;
}

export interface CrosswordMeta {
  readonly id?: string;
  readonly title?: string;
  readonly newspaper?: string;
  readonly difficulty?: string;
  readonly author?: string;
  readonly publishedAt?: string;
  readonly size?: { readonly rows: number; readonly cols: number };
  readonly language?: string;
  readonly direction?: string;
}

export interface CrosswordJson {
  readonly version: 2;
  readonly grid: readonly (readonly number[])[];
  readonly clues: CrosswordClues;
  readonly answers?: CrosswordAnswers;
  readonly meta?: CrosswordMeta;
}

export interface DerivedSlot {
  readonly id: SlotId;
  readonly groupNum: number;
  readonly wordIndexInGroup: number;
  readonly direction: Direction;
  readonly start: Coord;
  readonly cells: readonly Coord[];
  readonly length: number;
}

export interface Slot extends DerivedSlot {
  readonly clue: string;
  readonly answer: string | null;
  readonly normalizedAnswer: string | null;
}

export interface SlotsForCell {
  readonly across?: Slot;
  readonly down?: Slot;
}

export interface ClueSelection {
  readonly slotId: SlotId;
  readonly groupNum: number;
  readonly wordIndexInGroup: number;
  readonly clue: string;
  readonly length: number;
  readonly direction: Direction;
}

export interface SelectionInfo {
  readonly coord: Coord;
  readonly inBounds: boolean;
  readonly isBlock: boolean;
  readonly value?: string;
  readonly slots: SlotsForCell;
  readonly clues: {
    readonly across?: ClueSelection;
    readonly down?: ClueSelection;
  };
}

export type SlotCheckResult =
  | "correct"
  | "incorrect"
  | "incomplete"
  | "unknownAnswer";

export interface SavedCrosswordState {
  readonly cells: Readonly<Record<CellKey, string>>;
}

export interface CrosswordPuzzle {
  readonly size: GridSize;
  readonly blocks: ReadonlySet<CellKey>;
  readonly slots: readonly Slot[];
  readonly acrossSlots: readonly Slot[];
  readonly downSlots: readonly Slot[];
  readonly source: CrosswordJson;

  isInBounds(coord: Coord): boolean;
  isBlock(coord: Coord): boolean;
  getSlot(slotId: SlotId): Slot | undefined;
  getCellsForSlot(slotId: SlotId): readonly Coord[];
  getSlotsForCell(coord: Coord): SlotsForCell;
}

export interface CrosswordState {
  readonly puzzle: CrosswordPuzzle;

  getCell(coord: Coord): string | undefined;
  setCell(coord: Coord, value: string | null | undefined): void;
  clearCell(coord: Coord): void;
  getSelectionInfo(coord: Coord): SelectionInfo;
  checkSlot(slotId: SlotId): SlotCheckResult;
  toJSON(): SavedCrosswordState;
}

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly coord?: Coord;
  readonly slotId?: SlotId;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly derivedSlots: readonly DerivedSlot[];
}
