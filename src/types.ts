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

export interface CrosswordJson {
  readonly version?: 1;
  readonly size: GridSize;
  readonly blocks: readonly Coord[];
  readonly clues: Readonly<Record<SlotId, string>>;
  readonly answers?: Readonly<Record<SlotId, string | null>>;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface DerivedSlot {
  readonly id: SlotId;
  readonly clueNumber: number;
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
  readonly clueNumber: number;
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
