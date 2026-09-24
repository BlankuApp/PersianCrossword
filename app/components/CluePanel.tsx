import { Delete, Pencil, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { normalizePersianText, type Coord, type Direction, type Slot } from "../../src/index";
import { buildLetterTray } from "../crosswordUi";
import { ClueAiButton } from "./ClueAiDialog";
import { SHAKE_FRAMES } from "./CrosswordBoard";
import { LetterGlyph } from "./LetterGlyph";

interface ActiveClueProps {
  readonly slots: { readonly across?: Slot | undefined; readonly down?: Slot | undefined };
  readonly activeDirection?: Direction | undefined;
  readonly showTray?: boolean;
  readonly getCellValue?: (coord: Coord) => string | undefined;
  readonly onCellChange?: (coord: Coord, value: string | null, clearCoord?: Coord) => void;
  readonly isDebugMode?: boolean;
  readonly onSaveClue?: (slot: Slot, newClue: string) => Promise<void>;
  readonly checkMode?: boolean;
  readonly getSolutionValue?: (coord: Coord) => string | undefined;
}
interface ClueBlockProps {
  readonly slot: Slot;
  readonly isActive: boolean;
  readonly showTray?: boolean | undefined;
  readonly getCellValue?: ((coord: Coord) => string | undefined) | undefined;
  readonly onCellChange?: ((coord: Coord, value: string | null, clearCoord?: Coord) => void) | undefined;
  readonly isDebugMode?: boolean | undefined;
  readonly onSaveClue?: ((slot: Slot, newClue: string) => Promise<void>) | undefined;
  readonly checkMode?: boolean | undefined;
  readonly getSolutionValue?: ((coord: Coord) => string | undefined) | undefined;
}

interface DragState {
  readonly letter: string;
  readonly sourceCoord?: Coord | undefined;
  readonly x: number;
  readonly y: number;
  readonly hoverKey: string | null;
}

function coordKey(coord: Coord): string {
  return `${coord.row},${coord.col}`;
}

// Pointer travel under this is a tap, not a drag.
const TAP_SLOP_PX = 6;

const POP_FRAMES: Keyframe[] = [
  { transform: "scale(1)" },
  { transform: "scale(1.18)" },
  { transform: "scale(1)" },
];

function play(el: Element | null | undefined, frames: Keyframe[], duration: number): void {
  // Optional calls: jsdom (tests) has neither matchMedia nor Element.animate.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  el?.animate?.(frames, { duration, easing: "ease-out" });
}

export function ActiveClue({
  slots,
  activeDirection,
  showTray,
  getCellValue,
  onCellChange,
  isDebugMode,
  onSaveClue,
  checkMode,
  getSolutionValue,
}: ActiveClueProps) {
  if (!slots.across && !slots.down) {
    return (
      <section className="active-clue" aria-label="پرسش فعال" aria-live="polite">
        <p>یک خانه سفید را انتخاب کنید.</p>
      </section>
    );
  }

  return (
    <section className="active-clue" aria-label="پرسش فعال" aria-live="polite">
      {slots.across ? (
        <ClueBlock
          slot={slots.across}
          isActive={activeDirection === "across"}
          showTray={showTray}
          getCellValue={getCellValue}
          onCellChange={onCellChange}
          isDebugMode={isDebugMode}
          onSaveClue={onSaveClue}
          checkMode={checkMode}
          getSolutionValue={getSolutionValue}
        />
      ) : null}
      {slots.down ? (
        <ClueBlock
          slot={slots.down}
          isActive={activeDirection === "down"}
          showTray={showTray}
          getCellValue={getCellValue}
          onCellChange={onCellChange}
          isDebugMode={isDebugMode}
          onSaveClue={onSaveClue}
          checkMode={checkMode}
          getSolutionValue={getSolutionValue}
        />
      ) : null}
    </section>
  );
}

function ClueBlock({
  slot,
  isActive,
  showTray,
  getCellValue,
  onCellChange,
  isDebugMode,
  onSaveClue,
  checkMode,
  getSolutionValue,
}: ClueBlockProps) {
  const trayTiles = useMemo(() => (showTray ? buildLetterTray(slot) : []), [slot.id, showTray]);
  const cellValues = useMemo(
    () => slot.cells.map((c) => getCellValue?.(c)),
    [slot, getCellValue],
  );
  const correctness = useMemo(
    () =>
      slot.cells.map((coord, i) => {
        const value = cellValues[i];
        if (!checkMode || !getSolutionValue || !value) return undefined;
        return normalizePersianText(value) === normalizePersianText(getSolutionValue(coord) ?? "")
          ? "correct"
          : "incorrect";
      }),
    [slot, cellValues, checkMode, getSolutionValue],
  );
  // Letters the AI may rely on: wrong ones (when the solution is known) are sent as unknown,
  // so "solved" means filled in correctly and the explained answer is never empty.
  const aiLetters = useMemo(() => {
    const solution = slot.cells.map((c) => getSolutionValue?.(c));
    const hasSolution = solution.every(Boolean);
    return cellValues.map((v, i) =>
      v && (!hasSolution || normalizePersianText(v) === normalizePersianText(solution[i]!)) ? v : undefined,
    );
  }, [slot, cellValues, getSolutionValue]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draftClue, setDraftClue] = useState("");
  const [isSavingClue, setIsSavingClue] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // A tapped tile lands in the first empty box at or after `from` (wrapping around), so boxes
  // already filled — by this word or a crossing one — are skipped. The grid selection never
  // moves: moving it would swap the crossing clue and shift the panel under the finger.
  const [targetFrom, setTargetFrom] = useState({ slotId: slot.id, index: 0 });
  const from = targetFrom.slotId === slot.id ? targetFrom.index : 0;
  const emptyIndexes = cellValues.flatMap((v, i) => (v ? [] : [i]));
  const targetIndex = emptyIndexes.find((i) => i >= from) ?? emptyIndexes[0];

  function placeTile(letter: string): void {
    if (targetIndex === undefined) {
      play(rowRef.current, SHAKE_FRAMES, 320);
      return;
    }
    const coord = slot.cells[targetIndex]!;
    onCellChange?.(coord, letter);
    setTargetFrom({ slotId: slot.id, index: targetIndex + 1 });
    play(rowRef.current?.children[targetIndex], POP_FRAMES, 220);
    play(document.querySelector(`[data-cell-key="${coordKey(coord)}"]`), POP_FRAMES, 220);
  }

  // Tapping a box aims the next tile at it, clearing it first if it holds a letter.
  function aimAt(index: number): void {
    if (cellValues[index]) onCellChange?.(slot.cells[index]!, null);
    setTargetFrom({ slotId: slot.id, index });
  }

  function clearLastLetter(): void {
    const last = cellValues.map(Boolean).lastIndexOf(true);
    if (last >= 0) aimAt(last);
  }

  function startTileDrag(event: React.PointerEvent, letter: string, onTap: () => void, sourceCoord?: Coord): void {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    function hoveredCell(ev: PointerEvent): HTMLElement | null {
      return (ev.target as Element | null)?.closest<HTMLElement>("[data-coord]") ??
        (document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-coord]") ?? null);
    }

    function onMove(ev: PointerEvent): void {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < TAP_SLOP_PX) return;
      moved = true;
      const cell = hoveredCell(ev);
      setDrag({ letter, sourceCoord, x: ev.clientX, y: ev.clientY, hoverKey: cell?.dataset.coord ?? null });
    }

    function onEnd(ev: PointerEvent): void {
      if (!moved) {
        cleanup();
        onTap();
        return;
      }
      const cell = hoveredCell(ev);
      const targetKey = cell?.dataset.coord ?? null;
      const sourceKey = sourceCoord ? coordKey(sourceCoord) : null;
      if (targetKey && targetKey !== sourceKey) {
        const [row, col] = targetKey.split(",").map(Number);
        onCellChange?.({ row: row!, col: col! }, letter, sourceCoord);
      } else if (!targetKey && sourceCoord) {
        onCellChange?.(sourceCoord, null);
      }
      cleanup();
    }

    function cleanup(): void {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", cleanup);
      setDrag(null);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", cleanup);
  }

  const handleGoogleSearch = () => {
    const searchQuery = `${slot.clue} در جدول`;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    window.open(googleUrl, "_blank");
  };

  function openEditModal(): void {
    setDraftClue(slot.clue);
    setSaveError(null);
    setIsEditOpen(true);
  }

  function closeEditModal(): void {
    setIsEditOpen(false);
  }

  async function handleSaveClick(): Promise<void> {
    if (!onSaveClue) return;
    setIsSavingClue(true);
    setSaveError(null);
    try {
      await onSaveClue(slot, draftClue);
      setIsEditOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSavingClue(false);
    }
  }

  useEffect(() => {
    if (!isEditOpen) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") closeEditModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEditOpen]);

  const isSolved = aiLetters.every(Boolean);

  return (
    <div
      className={`active-clue-block${isActive ? ` active-clue-block-active active-clue-block-active-${slot.direction}` : ""}`}
    >
      <div className="active-clue-head">
        <p>
          <span className="active-clue-label">
            {slot.groupNum.toLocaleString("fa-IR")} {slot.direction === "across" ? "افقی" : "عمودی"}
          </span>{" "}
          <span>{slot.clue}</span>{" "}
          {isSolved ? null : (
            <>
              <button
                type="button"
                onClick={handleGoogleSearch}
                className="clue-action-pill"
                title="جستجو در گوگل"
                aria-label="جستجو در گوگل برای این پرسش"
              >
                <Search size={14} aria-hidden="true" />
                جستجو در گوگل
              </button>{" "}
            </>
          )}
          <ClueAiButton
            clue={slot.clue}
            isSolved={isSolved}
            cellValues={aiLetters}
            answer={aiLetters.join("")}
            trayLetters={trayTiles.map((t) => t.letter)}
          />
        </p>
        <div className="active-clue-head-actions">
          {isDebugMode ? (
            <button
              type="button"
              onClick={openEditModal}
              className="clue-edit-btn"
              title="ویرایش متن پرسش (دیباگ)"
              aria-label="ویرایش متن پرسش"
            >
              <Pencil size={20} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={clearLastLetter}
            className="clue-backspace-btn"
            title="پاک کردن حرف"
            aria-label="پاک کردن آخرین حرف این پاسخ"
          >
            <Delete size={24} aria-hidden="true" />
          </button>
        </div>
      </div>
      {isDebugMode && isEditOpen ? (
        <div
          className="solution-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="ویرایش متن پرسش"
          onClick={closeEditModal}
        >
          <div className="solution-modal clue-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="solution-modal-header">
              <h2>ویرایش متن پرسش</h2>
              <div className="solution-modal-actions">
                <button
                  type="button"
                  className="solution-close-button"
                  onClick={closeEditModal}
                  title="بستن"
                  aria-label="بستن"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
            <textarea
              className="clue-edit-textarea"
              value={draftClue}
              onChange={(e) => setDraftClue(e.target.value)}
              rows={3}
              autoFocus
              dir="rtl"
            />
            {saveError ? <p className="clue-edit-error">{saveError}</p> : null}
            <div className="clue-edit-modal-footer">
              <button
                type="button"
                onClick={() => { void handleSaveClick(); }}
                disabled={isSavingClue}
              >
                {isSavingClue ? "در حال ذخیره..." : "ذخیره"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showTray && slot.cells.length > 0 ? (
        <div ref={rowRef} className="word-cells-row" role="list" aria-label="خانه‌های کلمه انتخاب شده" data-no-back-gesture>
          {slot.cells.map((coord, i) => {
            const key = coordKey(coord);
            const value = cellValues?.[i];
            return (
              <div
                key={key}
                role="listitem"
                className={[
                  "word-cell",
                  value ? "word-cell-filled" : "",
                  i === targetIndex ? "word-cell-target" : "",
                  drag?.hoverKey === key ? "word-cell-drop-hover" : "",
                  correctness[i] === "correct" ? "word-cell-correct" : "",
                  correctness[i] === "incorrect" ? "word-cell-incorrect" : "",
                ].join(" ")}
                data-coord={key}
                onPointerDown={value ? (e) => startTileDrag(e, value, () => aimAt(i), coord) : undefined}
                onClick={value ? undefined : () => aimAt(i)}
                style={value ? { touchAction: "none" } : undefined}
              >
                <LetterGlyph letter={value} />
              </div>
            );
          })}
        </div>
      ) : null}
      {showTray && trayTiles.length > 0 ? (
        <div className="letter-tray" role="group" aria-label="کاشی‌های حرف" data-no-back-gesture>
          {trayTiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              className="tray-tile"
              aria-label={`حرف ${tile.letter}`}
              onPointerDown={(e) => startTileDrag(e, tile.letter, () => placeTile(tile.letter))}
              // Pointer taps are handled on pointerup; this is Enter/Space (detail 0).
              onClick={(e) => { if (e.detail === 0) placeTile(tile.letter); }}
              style={{ touchAction: "none" }}
            >
              <LetterGlyph letter={tile.letter} />
            </button>
          ))}
        </div>
      ) : null}
      {drag ? (
        <div
          className="tile-ghost tray-tile"
          aria-hidden="true"
          style={{ left: drag.x, top: drag.y }}
        >
          <LetterGlyph letter={drag.letter} />
        </div>
      ) : null}
    </div>
  );
}
