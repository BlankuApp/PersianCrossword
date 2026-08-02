import { Delete, Pointer, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ACROSS_CELLS,
  ACROSS_CLUE,
  DEMO_BLOCKS,
  DEMO_TRAYS,
  DOWN_CELLS,
  DOWN_CLUE,
  TUTORIAL_STEPS,
  nextPosition,
  type DemoCellId,
  type DemoDirection,
  type HandTarget,
  type PlaybackPos,
} from "../tutorialSteps";
import { LetterGlyph } from "./LetterGlyph";

const DIRECTIONS: readonly DemoDirection[] = ["across", "down"];
const WORD_CELLS: Readonly<Record<DemoDirection, readonly DemoCellId[]>> = {
  across: ACROSS_CELLS,
  down: DOWN_CELLS,
};
const CLUES: Readonly<Record<DemoDirection, string>> = {
  across: ACROSS_CLUE,
  down: DOWN_CLUE,
};
const DIRECTION_LABELS: Readonly<Record<DemoDirection, string>> = {
  across: "افقی",
  down: "عمودی",
};

function handTargetKey(target: HandTarget): string {
  switch (target.kind) {
    case "cell":
      return `cell:${target.cell}`;
    case "tray":
      return `tray:${target.direction}:${target.index}`;
    case "word-cell":
      return `word-cell:${target.direction}:${target.index}`;
    case "backspace":
      return `backspace:${target.direction}`;
    case "clue":
      return `clue:${target.direction}`;
    default:
      return target.kind;
  }
}

interface HelpTutorialProps {
  readonly onClose: () => void;
}

export function HelpTutorial({ onClose }: HelpTutorialProps) {
  const [pos, setPos] = useState<PlaybackPos>({ stepIndex: 0, frameIndex: 0 });
  const [handPos, setHandPos] = useState<{ x: number; y: number } | null>(null);

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const step = TUTORIAL_STEPS[pos.stepIndex] ?? TUTORIAL_STEPS[0]!;
  const frame = reducedMotion ? step.frames[step.frames.length - 1]! : step.frames[pos.frameIndex]!;

  const stageRef = useRef<HTMLDivElement>(null);
  const targetsRef = useRef<Record<string, HTMLElement | null>>({});
  const gridRef = useRef<HTMLDivElement>(null);

  function setTarget(key: string): (el: HTMLElement | null) => void {
    return (el) => {
      targetsRef.current[key] = el;
    };
  }

  // Playback engine: one timer per frame.
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setTimeout(() => {
      setPos((p) => nextPosition(TUTORIAL_STEPS, p));
    }, frame.holdMs);
    return () => clearTimeout(timer);
  }, [pos, reducedMotion, frame.holdMs]);

  // Close with the Escape key (same pattern as the solution modal).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Position the hand over the current target, relative to the stage.
  const targetKey = handTargetKey(frame.hand);
  useLayoutEffect(() => {
    function measure(): void {
      const stage = stageRef.current;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      if (targetKey === "rest") {
        const gridRect = gridRef.current?.getBoundingClientRect();
        setHandPos({
          x: stageRect.width / 2,
          y: gridRect ? gridRect.bottom - stageRect.top + 18 : stageRect.height / 2,
        });
        return;
      }
      const el = targetsRef.current[targetKey];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setHandPos({
        x: rect.left + rect.width / 2 - stageRect.left,
        y: rect.top + rect.height / 2 - stageRect.top,
      });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [targetKey]);

  return (
    <div
      className="solution-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="راهنمای استفاده"
      onClick={onClose}
    >
      <div className="solution-modal tutorial-modal" onClick={(e) => e.stopPropagation()}>
        <div className="solution-modal-header">
          <h2>راهنمای استفاده</h2>
          <div className="solution-modal-actions">
            <button
              type="button"
              className="solution-close-button"
              onClick={onClose}
              title="بستن"
              aria-label="بستن"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <p className="tutorial-message" aria-live="polite">
          {step.message}
        </p>

        <div className="tutorial-stage" ref={stageRef} aria-hidden="true" dir="rtl">
          <div className="tutorial-grid" ref={gridRef}>
            {DEMO_BLOCKS.flatMap((row, rowIndex) =>
              // DOM order is right→left within each row (the stage is dir="rtl"),
              // matching the RTL coord system where col 0 is the rightmost cell.
              row.map((isBlock, colIndex) => {
                const cellId: DemoCellId = `${rowIndex}-${colIndex}`;
                if (isBlock) {
                  return <div key={cellId} className="cell cell-block" />;
                }
                const classes = ["cell", "cell-open"];
                if (frame.showHighlights && ACROSS_CELLS.includes(cellId)) {
                  classes.push("cell-active-word");
                }
                if (frame.showHighlights && DOWN_CELLS.includes(cellId)) {
                  classes.push("cell-down-word");
                }
                if (frame.selected === cellId) classes.push("cell-selected");
                return (
                  <div key={cellId} ref={setTarget(`cell:${cellId}`)} className={classes.join(" ")}>
                    <LetterGlyph letter={frame.letters[cellId]} />
                  </div>
                );
              }),
            )}
          </div>

          <div className={`tutorial-clues${frame.showClues ? " tutorial-clues-visible" : ""}`}>
            {DIRECTIONS.map((direction) => (
              <div
                key={direction}
                ref={setTarget(`clue:${direction}`)}
                className={[
                  "tutorial-clue",
                  `tutorial-clue-${direction}`,
                  frame.highlightClues ? "tutorial-clue-highlight" : "",
                ].join(" ")}
              >
                <div className="tutorial-clue-head">
                  <span className="tutorial-clue-copy">
                    <span className="tutorial-direction-label">{DIRECTION_LABELS[direction]}</span>
                    <span className="tutorial-clue-text">{CLUES[direction]}</span>
                  </span>
                  <span
                    className="clue-backspace-btn tutorial-backspace"
                    ref={setTarget(`backspace:${direction}`)}
                  >
                    <Delete size={20} aria-hidden="true" />
                  </span>
                </div>

                <div className="word-cells-row tutorial-word-row">
                  {WORD_CELLS[direction].map((cellId, index) => {
                    const isDropTarget =
                      frame.dropTarget?.direction === direction && frame.dropTarget.index === index;
                    return (
                      <div
                        key={cellId}
                        ref={setTarget(`word-cell:${direction}:${index}`)}
                        className={`word-cell${frame.letters[cellId] ? " word-cell-filled" : ""}${
                          isDropTarget ? " word-cell-drop-hover" : ""
                        }`}
                      >
                        <LetterGlyph letter={frame.letters[cellId]} />
                      </div>
                    );
                  })}
                </div>

                <div className="letter-tray tutorial-tray">
                  {DEMO_TRAYS[direction].map((letter, index) => (
                    <div
                      key={`${letter}-${index}`}
                      className="tray-tile"
                      ref={setTarget(`tray:${direction}:${index}`)}
                    >
                      <LetterGlyph letter={letter} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {!reducedMotion && frame.drag && handPos ? (
            <div
              className={`tutorial-drag-ghost tutorial-drag-ghost-${frame.drag.direction}`}
              style={{ transform: `translate(${handPos.x - 19}px, ${handPos.y - 19}px)` }}
            >
              <LetterGlyph letter={frame.drag.letter} />
            </div>
          ) : null}

          {!reducedMotion && handPos ? (
            <div
              className="tutorial-hand"
              style={{ transform: `translate(${handPos.x + 4}px, ${handPos.y + 3}px)` }}
            >
              <span
                key={`${pos.stepIndex}-${pos.frameIndex}`}
                className={`tutorial-hand-inner${frame.tap ? " tutorial-hand-tap" : ""}${
                  frame.drag ? " tutorial-hand-dragging" : ""
                }`}
              >
                <Pointer size={32} aria-hidden="true" />
              </span>
            </div>
          ) : null}
        </div>

        <div className="tutorial-dots">
          {TUTORIAL_STEPS.map((tutorialStep, i) => (
            <button
              key={tutorialStep.id}
              type="button"
              className="tutorial-dot"
              aria-label={`مرحله ${i + 1}`}
              aria-current={i === pos.stepIndex}
              onClick={() => setPos({ stepIndex: i, frameIndex: 0 })}
            />
          ))}
        </div>

        <button type="button" className="tutorial-done-btn" onClick={onClose}>
          فهمیدم
        </button>
      </div>
    </div>
  );
}
