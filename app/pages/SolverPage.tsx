import { RotateCcw, ArrowRight, HelpCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  compilePuzzle,
  createState,
  splitPersianGraphemes,
  type Coord,
  type Direction,
  type Slot,
} from "../../src/index";
import type { CrosswordJson } from "../../src/index";
import {
  getActiveSlot,
  handleCellSelection,
  moveByArrow,
  nextCoordInSlot,
  selectSlot,
  slotCellKeys,
  type Selection,
} from "../crosswordUi";
import { loadProgress, saveProgress } from "../progress";
import { navigate } from "../router";
import { BoardWithLabels } from "../components/BoardWithLabels";
import { CrosswordBoard } from "../components/CrosswordBoard";
import { ActiveClue, CluePanel } from "../components/CluePanel";

interface SolverPageProps {
  readonly id: string;
  readonly json: CrosswordJson;
}

export function SolverPage({ id, json }: SolverPageProps) {
  const puzzle = useMemo(() => compilePuzzle(json), [json]);
  const [savedState, setSavedState] = useState(() => loadProgress(id));
  const [selection, setSelection] = useState<Selection | undefined>(() => {
    const firstSlot = compilePuzzle(json).slots[0];
    return firstSlot ? selectSlot(firstSlot) : undefined;
  });
  const [clueTab, setClueTab] = useState<Direction>("across");
  const [showHelp, setShowHelp] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const crosswordState = useMemo(() => createState(puzzle, savedState), [puzzle, savedState]);
  const activeSlot = getActiveSlot(puzzle, selection);
  const activeKeys = slotCellKeys(activeSlot);

  useEffect(() => {
    const restored = loadProgress(id);
    setSavedState(restored);
    const firstSlot = puzzle.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
    setClueTab("across");
  }, [id, puzzle]);

  useEffect(() => {
    saveProgress(id, savedState);
  }, [id, savedState]);

  function commitState(nextState: ReturnType<typeof createState>): void {
    setSavedState(nextState.toJSON());
  }

  function selectCell(coord: Coord): void {
    setSelection((current) => {
      const next = handleCellSelection(puzzle, coord, current);
      if (next) setClueTab(next.direction);
      return next;
    });
    boardRef.current?.focus();
  }

  function selectClue(slot: Slot): void {
    setSelection(selectSlot(slot));
    setClueTab(slot.direction);
    boardRef.current?.focus();
  }

  function updateCell(coord: Coord, value: string | null): void {
    const nextState = createState(puzzle, savedState);
    nextState.setCell(coord, value);
    commitState(nextState);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!selection) return;

    const active = getActiveSlot(puzzle, selection);

    if (event.key === "Backspace") {
      event.preventDefault();
      const currentValue = crosswordState.getCell(selection.coord);
      if (currentValue) {
        updateCell(selection.coord, null);
        return;
      }
      if (active) {
        const previous = nextCoordInSlot(active, selection.coord, -1);
        updateCell(previous, null);
        setSelection({ ...selection, coord: previous });
      }
      return;
    }

    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const next = moveByArrow(puzzle, selection.coord, event.key);
      setSelection({ coord: next, direction: selection.direction });
      return;
    }

    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      const slots = puzzle.getSlotsForCell(selection.coord);
      if (slots.across && slots.down) {
        setSelection({
          ...selection,
          direction: selection.direction === "across" ? "down" : "across",
        });
      }
      return;
    }

    const graphemes = splitPersianGraphemes(event.key);
    if (graphemes.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;

    event.preventDefault();
    updateCell(selection.coord, event.key);

    if (active) {
      const next = nextCoordInSlot(active, selection.coord, 1);
      setSelection({ ...selection, coord: next });
    }
  }

  function resetProgress(): void {
    const empty = { cells: {} };
    setSavedState(empty);
    saveProgress(id, empty);
    const firstSlot = puzzle.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
  }

  const title = json.meta?.title ?? id;
  const newspaper = json.meta?.newspaper;

  return (
    <main className="app-shell" dir="rtl">
      <header className="app-header">
        <div>
          <h1>{title}</h1>
          {newspaper ? <p>{newspaper}</p> : null}
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn-home"
            onClick={() => navigate("#/")}
            title="بازگشت به فهرست جدول‌ها"
          >
            <ArrowRight size={18} aria-hidden="true" />
            <span>بازگشت</span>
          </button>
          <button type="button" onClick={resetProgress} title="پاک کردن پاسخ‌ها">
            <RotateCcw size={18} aria-hidden="true" />
            <span>پاک کردن</span>
          </button>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            title="راهنمای استفاده"
            aria-expanded={showHelp}
          >
            <HelpCircle size={18} aria-hidden="true" />
            <span>راهنما</span>
          </button>
        </div>
      </header>

      {showHelp ? (
        <section className="help-panel" aria-label="راهنمای استفاده">
          <h2>راهنمای استفاده</h2>
          <ul>
            <li>برای انتخاب یک خانه روی آن کلیک کنید.</li>
            <li>
              با کلیک دوباره روی همان خانه یا فشردن کلید <kbd>Space</kbd>،
              جهت بین افقی و عمودی جابجا می‌شود.
            </li>
            <li>
              برای حرکت بین خانه‌ها از کلیدهای جهت‌نما
              (<kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> <kbd>←</kbd>) استفاده کنید.
            </li>
            <li>
              برای پاک کردن محتوای یک خانه، کلید <kbd>Backspace</kbd> را بزنید.
              اگر خانه خالی باشد، خانهٔ قبلی در همان کلمه پاک می‌شود.
            </li>
            <li>برای وارد کردن حرف، کافی است حرف فارسی را تایپ کنید.</li>
            <li>
              با کلیک روی هر سرنخ در فهرست کنار جدول، خانهٔ مربوط به آن سرنخ
              فعال می‌شود.
            </li>
            <li>
              با دکمهٔ <strong>پاک کردن</strong> همهٔ پاسخ‌های ذخیره‌شده حذف می‌شوند.
            </li>
          </ul>
        </section>
      ) : null}

      <section className="solver-layout">
        <div className="board-panel">
          <BoardWithLabels puzzle={puzzle}>
            <CrosswordBoard
              boardRef={boardRef}
              puzzle={puzzle}
              state={crosswordState}
              selection={selection}
              activeKeys={activeKeys}
              onCellClick={selectCell}
              onKeyDown={handleKeyDown}
            />
          </BoardWithLabels>
          <ActiveClue slot={activeSlot} />
        </div>

        <CluePanel
          acrossSlots={puzzle.acrossSlots}
          downSlots={puzzle.downSlots}
          activeSlot={activeSlot}
          clueTab={clueTab}
          onTabChange={setClueTab}
          onClueClick={selectClue}
        />
      </section>
    </main>
  );
}
