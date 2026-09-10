import { useState } from "react";
import {
  cellKey,
  compilePuzzle,
  createState,
  normalizePersianText,
  type Coord,
  type CrosswordState,
} from "../../src/index";
import { sameCoord, slotCellKeys, type Selection } from "../crosswordUi";
import { LetterGlyph } from "./LetterGlyph";

// DiceBear styles that render as a filled square — one is picked at random per mount,
// so every visit to a puzzle dresses its block cells differently.
const BLOCK_STYLES = ["blobs", "initial-face", "loops", "shapes", "line-face", "thumbs", "planets"];

interface CrosswordBoardProps {
  readonly boardRef: React.RefObject<HTMLDivElement | null>;
  readonly inputRef?: React.RefObject<HTMLInputElement | null>;
  readonly puzzle: ReturnType<typeof compilePuzzle>;
  readonly state: ReturnType<typeof createState>;
  readonly selection: Selection | undefined;
  readonly acrossKeys: ReadonlySet<string>;
  readonly downKeys: ReadonlySet<string>;
  readonly onCellClick: (coord: Coord) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  readonly onInputBeforeInput?: (event: React.FormEvent<HTMLInputElement>) => void;
  readonly onInputChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly clickableBlocks?: boolean;
  readonly showCluesOnHover?: boolean;
  readonly checkMode?: boolean;
  readonly solutionState?: CrosswordState | null;
}

export function CrosswordBoard({
  boardRef,
  inputRef,
  puzzle,
  state,
  selection,
  acrossKeys,
  downKeys,
  onCellClick,
  onKeyDown,
  onInputBeforeInput,
  onInputChange,
  clickableBlocks,
  showCluesOnHover,
  checkMode,
  solutionState,
}: CrosswordBoardProps) {
  const [blockStyle] = useState(
    () => BLOCK_STYLES[Math.floor(Math.random() * BLOCK_STYLES.length)],
  );

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
          const slots = showCluesOnHover && !isBlock ? puzzle.getSlotsForCell(coord) : {};
          const tooltipId = `cell-clues-${row}-${col}`;
          const correctness =
            checkMode && solutionState && !isBlock && value
              ? normalizePersianText(value) === normalizePersianText(solutionState.getCell(coord) ?? "")
                ? "correct"
                : "incorrect"
              : undefined;

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              data-cell-key={key}
              className={[
                "cell",
                isBlock ? "cell-block" : "cell-open",
                acrossKeys.has(key) ? "cell-active-word" : "",
                downKeys.has(key) ? "cell-down-word" : "",
                isSelected ? "cell-selected" : "",
                correctness === "correct" ? "cell-correct" : "",
                correctness === "incorrect" ? "cell-incorrect" : "",
              ].join(" ")}
              aria-label={`ردیف ${row + 1} ستون ${col + 1}`}
              aria-describedby={slots.across || slots.down ? tooltipId : undefined}
              disabled={isBlock && !clickableBlocks}
              onClick={() => onCellClick(coord)}
            >
              {isBlock ? (
                <img
                  className="cell-block-icon"
                  src={`https://api.dicebear.com/10.x/${blockStyle}/svg?seed=${row}-${col}&animationVariant=slow`}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <>
                  <LetterGlyph letter={value} />
                  {slots.across || slots.down ? (
                    <span
                      id={tooltipId}
                      role="tooltip"
                      dir="rtl"
                      className={`cell-clue-tooltip ${
                        col < puzzle.size.cols / 2 ? "cell-clue-tooltip-left" : "cell-clue-tooltip-right"
                      }`}
                    >
                      {slots.across ? (
                        <span>
                          <strong className="cell-clue-across">
                            {slots.across.groupNum.toLocaleString("fa-IR")} افقی
                          </strong>{" "}
                          {slots.across.clue}
                        </span>
                      ) : null}
                      {slots.down ? (
                        <span>
                          <strong className="cell-clue-down">
                            {slots.down.groupNum.toLocaleString("fa-IR")} عمودی
                          </strong>{" "}
                          {slots.down.clue}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </>
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
