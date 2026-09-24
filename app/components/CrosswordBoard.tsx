import { Avatar, Style } from "@dicebear/core";
import blobs from "@dicebear/styles/blobs.json";
import initialFace from "@dicebear/styles/initial-face.json";
import lineFace from "@dicebear/styles/line-face.json";
import loops from "@dicebear/styles/loops.json";
import planets from "@dicebear/styles/planets.json";
import shapes from "@dicebear/styles/shapes.json";
import thumbs from "@dicebear/styles/thumbs.json";
import { useEffect, useMemo, useRef, useState } from "react";
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
// so every visit to a puzzle dresses its block cells differently. Generated locally
// (no network), so blocks appear with the board and work offline.
const BLOCK_STYLES = [blobs, initialFace, loops, shapes, lineFace, thumbs, planets];

// Check-mode colors ripple out from the selected cell: each ring waits this much longer.
const RIPPLE_STEP_MS = 20;

export const SHAKE_FRAMES: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-3px)" },
  { transform: "translateX(3px)" },
  { transform: "translateX(-2px)" },
  { transform: "translateX(2px)" },
  { transform: "translateX(0)" },
];

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
    () => new Style(BLOCK_STYLES[Math.floor(Math.random() * BLOCK_STYLES.length)]!),
  );
  const blockIcons = useMemo(() => {
    const icons = new Map<string, string>();
    for (let row = 0; row < puzzle.size.rows; row++) {
      for (let col = 0; col < puzzle.size.cols; col++) {
        if (!puzzle.isBlock({ row, col })) continue;
        const avatar = new Avatar(blockStyle, { seed: `${row}-${col}`, animationVariant: "slow" });
        icons.set(cellKey({ row, col }), avatar.toDataUri());
      }
    }
    return icons;
  }, [blockStyle, puzzle]);

  // Rings of distance from the selected cell; drives the check-mode color ripple (CSS --ripple).
  function rippleRing(coord: Coord): number | undefined {
    if (!selection) return undefined;
    return Math.round(Math.hypot(coord.row - selection.coord.row, coord.col - selection.coord.col));
  }

  // Shake wrong letters: a cell that just received one, or — in step with the color
  // ripple — every wrong cell when check mode is switched on. Opening a puzzle with
  // check mode already on shakes nothing.
  const prevRef = useRef({ puzzle, state, checkMode });
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { puzzle, state, checkMode };
    const justEnabled = !prev.checkMode;
    if (!checkMode || !solutionState || prev.puzzle !== puzzle) return;
    if (!justEnabled && prev.state === state) return;
    // Optional calls: jsdom (tests) has neither matchMedia nor Element.animate.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (let row = 0; row < puzzle.size.rows; row++) {
      for (let col = 0; col < puzzle.size.cols; col++) {
        const coord = { row, col };
        const value = state.getCell(coord);
        if (!value || (!justEnabled && value === prev.state.getCell(coord))) continue;
        if (normalizePersianText(value) === normalizePersianText(solutionState.getCell(coord) ?? "")) continue;
        boardRef.current
          ?.querySelector(`[data-cell-key="${cellKey(coord)}"]`)
          ?.animate?.(SHAKE_FRAMES, {
            duration: 320,
            delay: justEnabled ? (rippleRing(coord) ?? 0) * RIPPLE_STEP_MS : 0,
            easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)",
          });
      }
    }
    // rippleRing reads the current selection; re-running on selection moves would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, state, checkMode, solutionState, boardRef]);

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
          const ring = isBlock ? undefined : rippleRing(coord);
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
              style={ring === undefined ? undefined : ({ "--ripple": ring } as React.CSSProperties)}
              onClick={() => onCellClick(coord)}
            >
              {isBlock ? (
                <img className="cell-block-icon" src={blockIcons.get(key)} alt="" />
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
