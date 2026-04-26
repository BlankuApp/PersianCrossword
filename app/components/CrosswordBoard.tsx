import { cellKey, compilePuzzle, createState, type Coord } from "../../src/index";
import { sameCoord, slotCellKeys, type Selection } from "../crosswordUi";

interface CrosswordBoardProps {
  readonly boardRef: React.RefObject<HTMLDivElement | null>;
  readonly puzzle: ReturnType<typeof compilePuzzle>;
  readonly state: ReturnType<typeof createState>;
  readonly selection: Selection | undefined;
  readonly activeKeys: ReadonlySet<string>;
  readonly onCellClick: (coord: Coord) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function CrosswordBoard({
  boardRef,
  puzzle,
  state,
  selection,
  activeKeys,
  onCellClick,
  onKeyDown,
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
              className={[
                "cell",
                isBlock ? "cell-block" : "cell-open",
                activeKeys.has(key) ? "cell-active-word" : "",
                isSelected ? "cell-selected" : "",
              ].join(" ")}
              aria-label={`ردیف ${row + 1} ستون ${col + 1}`}
              disabled={isBlock}
              onClick={() => onCellClick(coord)}
            >
              {!isBlock ? <span className="cell-value">{value ?? ""}</span> : null}
            </button>
          );
        }),
      )}
    </div>
  );
}

// Re-export slotCellKeys so SolverPage doesn't need to import crosswordUi directly.
export { slotCellKeys };
