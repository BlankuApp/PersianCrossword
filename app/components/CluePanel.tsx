import { Delete, Pencil, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { normalizePersianText, type Coord, type Direction, type Slot, type SlotsForCell } from "../../src/index";
import { buildLetterTray } from "../crosswordUi";
import { LetterGlyph } from "./LetterGlyph";

interface ActiveClueProps {
  readonly slots: { readonly across?: Slot | undefined; readonly down?: Slot | undefined };
  readonly activeDirection?: Direction | undefined;
  readonly showTray?: boolean;
  readonly getCellValue?: (coord: Coord) => string | undefined;
  readonly onCellChange?: (coord: Coord, value: string | null, clearCoord?: Coord) => void;
  readonly onBackspace?: () => void;
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
  readonly onBackspace?: (() => void) | undefined;
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

export function ActiveClue({
  slots,
  activeDirection,
  showTray,
  getCellValue,
  onCellChange,
  onBackspace,
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
          onBackspace={onBackspace}
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
          onBackspace={onBackspace}
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
  onBackspace,
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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draftClue, setDraftClue] = useState("");
  const [isSavingClue, setIsSavingClue] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  function startTileDrag(event: React.PointerEvent, letter: string, sourceCoord?: Coord): void {
    event.preventDefault();

    function hoveredCell(ev: PointerEvent): HTMLElement | null {
      return (ev.target as Element | null)?.closest<HTMLElement>("[data-coord]") ??
        (document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-coord]") ?? null);
    }

    function onMove(ev: PointerEvent): void {
      const cell = hoveredCell(ev);
      setDrag({ letter, sourceCoord, x: ev.clientX, y: ev.clientY, hoverKey: cell?.dataset.coord ?? null });
    }

    function onEnd(ev: PointerEvent): void {
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
    setDrag({ letter, sourceCoord, x: event.clientX, y: event.clientY, hoverKey: null });
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

  return (
    <div
      className={`active-clue-block${isActive ? ` active-clue-block-active active-clue-block-active-${slot.direction}` : ""}`}
    >
      <div className="active-clue-head">
        <p>
          {slot.clue}{" "}
          <button
            type="button"
            onClick={handleGoogleSearch}
            className="clue-search-link"
            title="جستجو در گوگل"
            aria-label="جستجو در گوگل برای این پرسش"
          >
            🔍 جستجو در گوگل
          </button>
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
            onClick={onBackspace}
            className="clue-backspace-btn"
            title="پاک کردن حرف"
            aria-label="پاک کردن حرف و بازگشت به خانه قبلی"
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
        <div className="word-cells-row" role="list" aria-label="خانه‌های کلمه انتخاب شده" data-no-back-gesture>
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
                  drag?.hoverKey === key ? "word-cell-drop-hover" : "",
                  correctness[i] === "correct" ? "word-cell-correct" : "",
                  correctness[i] === "incorrect" ? "word-cell-incorrect" : "",
                ].join(" ")}
                data-coord={key}
                onPointerDown={value ? (e) => startTileDrag(e, value, coord) : undefined}
                style={value ? { touchAction: "none" } : undefined}
              >
                <LetterGlyph letter={value} />
              </div>
            );
          })}
        </div>
      ) : null}
      {showTray && trayTiles.length > 0 ? (
        <div className="letter-tray" role="list" aria-label="کاشی‌های حرف" data-no-back-gesture>
          {trayTiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              role="listitem"
              className="tray-tile"
              onPointerDown={(e) => startTileDrag(e, tile.letter)}
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

interface CluePanelProps {
  readonly acrossSlots: readonly Slot[];
  readonly downSlots: readonly Slot[];
  readonly activeSlots: SlotsForCell;
  readonly clueTab: Direction;
  readonly onTabChange: (direction: Direction) => void;
  readonly onClueClick: (slot: Slot) => void;
}

export function CluePanel({
  acrossSlots,
  downSlots,
  activeSlots,
  clueTab,
  onTabChange,
  onClueClick,
}: CluePanelProps) {
  return (
    <aside className="clue-panel">
      <div className="clue-tabs" role="tablist" aria-label="نوع پرسش">
        <button
          type="button"
          role="tab"
          aria-selected={clueTab === "across"}
          onClick={() => onTabChange("across")}
        >
          افقی
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={clueTab === "down"}
          onClick={() => onTabChange("down")}
        >
          عمودی
        </button>
      </div>

      <div className="clue-lists">
        <GroupedClueList
          title="افقی"
          slots={acrossSlots}
          activeSlotId={activeSlots.across?.id}
          direction="across"
          visibleOnSmall={clueTab === "across"}
          onClueClick={onClueClick}
        />
        <GroupedClueList
          title="عمودی"
          slots={downSlots}
          activeSlotId={activeSlots.down?.id}
          direction="down"
          visibleOnSmall={clueTab === "down"}
          onClueClick={onClueClick}
        />
      </div>
    </aside>
  );
}

function groupSlotsByGroupNum(slots: readonly Slot[]): [number, Slot[]][] {
  const map = new Map<number, Slot[]>();
  for (const slot of slots) {
    const group = map.get(slot.groupNum);
    if (group) {
      group.push(slot);
    } else {
      map.set(slot.groupNum, [slot]);
    }
  }
  return Array.from(map.entries()).sort(([a], [b]) => a - b);
}

function GroupedClueList({
  title,
  slots,
  activeSlotId,
  direction,
  visibleOnSmall,
  onClueClick,
}: {
  readonly title: string;
  readonly slots: readonly Slot[];
  readonly activeSlotId: string | undefined;
  readonly direction: Direction;
  readonly visibleOnSmall: boolean;
  readonly onClueClick: (slot: Slot) => void;
}) {
  const groups = groupSlotsByGroupNum(slots);
  return (
    <section className={`clue-list ${visibleOnSmall ? "clue-list-visible" : ""}`} aria-label={title}>
      <ol>
        {groups.map(([groupNum, groupSlots]) => (
          <li key={groupNum} className="clue-group">
            <span className="clue-group-number">{groupNum}</span>
            <span className="clue-group-words">
              {groupSlots.map((slot, i) => (
                <span key={slot.id} className="clue-word-entry">
                  {i > 0 && <span className="clue-sep"> — </span>}
                  <button
                    type="button"
                    className={`clue-item-btn${activeSlotId === slot.id ? ` clue-selected-${direction}` : ""}`}
                    onClick={() => onClueClick(slot)}
                  >
                    {slot.clue}
                  </button>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
