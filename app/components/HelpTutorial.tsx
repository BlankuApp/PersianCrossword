import { Delete, Pointer, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ACROSS_CELLS,
  ACROSS_CLUE,
  DEMO_BLOCKS,
  DEMO_TRAY,
  DOWN_CELLS,
  DOWN_CLUE,
  TUTORIAL_STEPS,
  nextPosition,
  type DemoCellId,
  type HandTarget,
  type PlaybackPos,
} from "../tutorialSteps";

function handTargetKey(target: HandTarget): string {
  switch (target.kind) {
    case "cell":
      return `cell:${target.cell}`;
    case "tray":
      return `tray:${target.index}`;
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
        const grid = gridRef.current;
        const gridRect = grid?.getBoundingClientRect();
        setHandPos({
          x: stageRect.width / 2,
          y: gridRect ? gridRect.bottom - stageRect.top + 24 : stageRect.height / 2,
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

  const activeCells: readonly DemoCellId[] =
    frame.activeWord === "across" ? ACROSS_CELLS : frame.activeWord === "down" ? DOWN_CELLS : [];
  const clueText =
    frame.activeWord === "down" ? DOWN_CLUE : frame.activeWord === "across" ? ACROSS_CLUE : "یک خانه سفید را انتخاب کنید.";

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
                if (activeCells.includes(cellId)) classes.push("cell-active-word");
                if (frame.selected === cellId) classes.push("cell-selected");
                const letter = frame.letters[cellId];
                return (
                  <div key={cellId} ref={setTarget(`cell:${cellId}`)} className={classes.join(" ")}>
                    {letter ? <span className="cell-value">{letter}</span> : null}
                  </div>
                );
              }),
            )}
          </div>

          <div className={`tutorial-clue${frame.clueHighlight ? " tutorial-clue-highlight" : ""}`}>
            <div className="tutorial-clue-head" ref={setTarget("clue")}>
              <span className="tutorial-clue-text">{clueText}</span>
              <span className="clue-backspace-btn tutorial-backspace" ref={setTarget("backspace")}>
                <Delete size={22} aria-hidden="true" />
              </span>
            </div>
            <div className="letter-tray tutorial-tray">
              {DEMO_TRAY.map((letter, index) => (
                <div key={index} className="tray-tile" ref={setTarget(`tray:${index}`)}>
                  <span className="cell-value">{letter}</span>
                </div>
              ))}
            </div>
          </div>

          {!reducedMotion && handPos ? (
            <div
              className="tutorial-hand"
              style={{ transform: `translate(${handPos.x - 8}px, ${handPos.y - 4}px)` }}
            >
              <span
                key={`${pos.stepIndex}-${pos.frameIndex}`}
                className={`tutorial-hand-inner${frame.tap ? " tutorial-hand-tap" : ""}`}
              >
                <Pointer size={34} aria-hidden="true" />
              </span>
            </div>
          ) : null}
        </div>

        <div className="tutorial-dots">
          {TUTORIAL_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="tutorial-dot"
              aria-label={`مرحله ${i + 1}`}
              aria-current={i === pos.stepIndex}
              onClick={() => setPos({ stepIndex: i, frameIndex: 0 })}
            />
          ))}
        </div>

        <details className="tutorial-keyboard-help">
          <summary>راهنمای صفحه‌کلید</summary>
          <ul>
            <li>
              با فشردن کلید <kbd>Space</kbd> جهت بین افقی و عمودی جابجا می‌شود.
            </li>
            <li>
              برای حرکت بین خانه‌ها از کلیدهای جهت‌نما
              (<kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> <kbd>←</kbd>) استفاده کنید.
            </li>
            <li>
              برای پاک کردن محتوای یک خانه، کلید <kbd>Backspace</kbd> را بزنید. اگر خانه خالی باشد،
              خانهٔ قبلی در همان کلمه پاک می‌شود.
            </li>
            <li>برای وارد کردن حرف، کافی است حرف فارسی را تایپ کنید.</li>
          </ul>
        </details>

        <button type="button" className="tutorial-done-btn" onClick={onClose}>
          فهمیدم
        </button>
      </div>
    </div>
  );
}
