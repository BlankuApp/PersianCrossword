import { cellKey, compilePuzzle, createState, type Coord } from "../../src/index";
import { sameCoord, slotCellKeys, type Selection } from "../crosswordUi";

const BLOCK_ICONS = [
  // 4-pointed star
  "M12 2L13.5 10.5L22 12L13.5 13.5L12 22L10.5 13.5L2 12L10.5 10.5Z",
  // 5-pointed star
  "M12 2l2.9 8.9H23l-7.5 5.4 2.9 8.9L12 19.8l-7.4 5.4 2.9-8.9L0 10.9h8.1Z",
  // Diamond
  "M12 3L21 12L12 21L3 12Z",
  // Plus / cross
  "M11 3h2v8h8v2h-8v8h-2v-8H3v-2h8Z",
  // Hexagon
  "M12 2l9 5v10l-9 5-9-5V7Z",
  // Circle with center dot
  "M12 2a10 10 0 100 20A10 10 0 0012 2zm0 8a2 2 0 110 4 2 2 0 010-4z",
  // 8-pointed star
  "M12 2l2 7.6L21.6 7l-5.6 5.6L22 14.8l-7.8-1-2.2 7.2-2.2-7.2-7.8 1 6-2.2L2 7l7.6 2.6Z",
  // Triangle up
  "M12 3L22 21H2Z",
];

interface CrosswordBoardProps {
  readonly boardRef: React.RefObject<HTMLDivElement | null>;
  readonly inputRef?: React.RefObject<HTMLInputElement | null>;
  readonly puzzle: ReturnType<typeof compilePuzzle>;
  readonly state: ReturnType<typeof createState>;
  readonly selection: Selection | undefined;
  readonly activeKeys: ReadonlySet<string>;
  readonly onCellClick: (coord: Coord) => void;
  readonly onCellPointerDown?: (coord: Coord, event: React.PointerEvent<HTMLButtonElement>) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  readonly onInputBeforeInput?: (event: React.FormEvent<HTMLInputElement>) => void;
  readonly onInputChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly clickableBlocks?: boolean;
}

export function CrosswordBoard({
  boardRef,
  inputRef,
  puzzle,
  state,
  selection,
  activeKeys,
  onCellClick,
  onCellPointerDown,
  onKeyDown,
  onInputBeforeInput,
  onInputChange,
  clickableBlocks,
}: CrosswordBoardProps) {
  return (
    <div
      ref={boardRef}
      className="crossword-board"
      style={
        {
          "--grid-cols": puzzle.size.cols,
          gridTemplateColumns: `repeat(${puzzle.size.cols}, minmax(0, 1fr))`,
        } as React.CSSProperties
      }
      tabIndex={0}
      role="grid"
      aria-label="جدول کلمات"
      onKeyDown={onKeyDown}
    >
      {inputRef ? (
        <input
          ref={inputRef}
          className="cell-input"
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
          aria-hidden="true"
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onBeforeInput={onInputBeforeInput}
          onChange={onInputChange}
        />
      ) : null}
      {Array.from({ length: puzzle.size.rows }).flatMap((_, row) =>
        Array.from({ length: puzzle.size.cols }).map((__, col) => {
          const coord = { row, col };
          const key = cellKey(coord);
          const isBlock = puzzle.isBlock(coord);
          const isSelected = selection ? sameCoord(selection.coord, coord) : false;
          const value = state.getCell(coord);

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              data-cell-key={key}
              className={[
                "cell",
                isBlock ? "cell-block" : "cell-open",
                activeKeys.has(key) ? "cell-active-word" : "",
                isSelected ? "cell-selected" : "",
              ].join(" ")}
              aria-label={`ردیف ${row + 1} ستون ${col + 1}`}
              disabled={isBlock && !clickableBlocks}
              onClick={() => onCellClick(coord)}
              onPointerDown={onCellPointerDown ? (e) => onCellPointerDown(coord, e) : undefined}
            >
              {isBlock ? (
                <svg className="cell-block-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d={BLOCK_ICONS[(row * puzzle.size.cols + col) % BLOCK_ICONS.length]} />
                </svg>
              ) : (
                <span className="cell-value">{value ?? ""}</span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}

// Re-export slotCellKeys so SolverPage doesn't need to import crosswordUi directly.
export { slotCellKeys };
