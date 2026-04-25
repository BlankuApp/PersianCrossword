import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cellKey,
  compilePuzzle,
  createState,
  splitPersianGraphemes,
  type Coord,
  type Direction,
  type SavedCrosswordState,
  type Slot,
} from "../src/index";
import {
  getActiveSlot,
  handleCellSelection,
  moveByArrow,
  nextCoordInSlot,
  sameCoord,
  selectSlot,
  slotCellKeys,
  type Selection,
} from "./crosswordUi";
import { samplePuzzles } from "./samplePuzzles";

const STORAGE_PREFIX = "persian-crossword:";

export function App() {
  const [sampleId, setSampleId] = useState(samplePuzzles[0]!.id);
  const sample = samplePuzzles.find((item) => item.id === sampleId) ?? samplePuzzles[0]!;
  const puzzle = useMemo(() => compilePuzzle(sample.json), [sample]);
  const [savedState, setSavedState] = useState<SavedCrosswordState>(() =>
    loadProgress(sample.id),
  );
  const [selection, setSelection] = useState<Selection | undefined>(() => {
    const firstSlot = compilePuzzle(sample.json).slots[0];
    return firstSlot ? selectSlot(firstSlot) : undefined;
  });
  const [clueTab, setClueTab] = useState<Direction>("across");
  const boardRef = useRef<HTMLDivElement>(null);

  const crosswordState = useMemo(
    () => createState(puzzle, savedState),
    [puzzle, savedState],
  );
  const activeSlot = getActiveSlot(puzzle, selection);
  const activeKeys = slotCellKeys(activeSlot);
  const crossingSlot = selection
    ? selection.direction === "across"
      ? puzzle.getSlotsForCell(selection.coord).down
      : puzzle.getSlotsForCell(selection.coord).across
    : undefined;
  const crossingKeys = slotCellKeys(crossingSlot);

  useEffect(() => {
    const restored = loadProgress(sample.id);
    setSavedState(restored);
    const firstSlot = puzzle.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
    setClueTab("across");
  }, [sample.id, puzzle]);

  useEffect(() => {
    saveProgress(sample.id, savedState);
  }, [sample.id, savedState]);

  function commitState(nextState: SavedCrosswordState): void {
    setSavedState(nextState);
  }

  function selectCell(coord: Coord): void {
    setSelection((current) => {
      const next = handleCellSelection(puzzle, coord, current);
      setClueTab(next.direction);
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
    commitState(nextState.toJSON());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!selection) {
      return;
    }

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

    const graphemes = splitPersianGraphemes(event.key);
    if (graphemes.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    event.preventDefault();
    updateCell(selection.coord, event.key);

    if (active) {
      const next = nextCoordInSlot(active, selection.coord, 1);
      setSelection({ ...selection, coord: next });
    }
  }

  function resetProgress(): void {
    const empty = { cells: {} };
    commitState(empty);
    saveProgress(sample.id, empty);
    const firstSlot = puzzle.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
  }

  return (
    <main className="app-shell" dir="rtl">
      <header className="app-header">
        <div>
          <h1>جدول کلمات فارسی</h1>
          <p>{String(sample.json.meta?.description ?? "نمونه حل جدول")}</p>
        </div>
        <div className="toolbar">
          <label>
            <span>جدول</span>
            <select
              aria-label="انتخاب جدول"
              value={sampleId}
              onChange={(event) => setSampleId(event.target.value)}
            >
              {samplePuzzles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={resetProgress} title="پاک کردن پاسخ‌ها">
            <RotateCcw size={18} aria-hidden="true" />
            <span>پاک کردن</span>
          </button>
        </div>
      </header>

      <section className="solver-layout">
        <div className="board-panel">
          <BoardWithLabels puzzle={puzzle}>
            <CrosswordBoard
              boardRef={boardRef}
              puzzle={puzzle}
              state={crosswordState}
              selection={selection}
              activeKeys={activeKeys}
              crossingKeys={crossingKeys}
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

interface BoardProps {
  readonly boardRef: React.RefObject<HTMLDivElement | null>;
  readonly puzzle: ReturnType<typeof compilePuzzle>;
  readonly state: ReturnType<typeof createState>;
  readonly selection: Selection | undefined;
  readonly activeKeys: ReadonlySet<string>;
  readonly crossingKeys: ReadonlySet<string>;
  readonly onCellClick: (coord: Coord) => void;
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

function CrosswordBoard({
  boardRef,
  puzzle,
  state,
  selection,
  activeKeys,
  crossingKeys,
  onCellClick,
  onKeyDown,
}: BoardProps) {
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
                crossingKeys.has(key) ? "cell-crossing-word" : "",
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

function ActiveClue({ slot }: { readonly slot: Slot | undefined }) {
  return (
    <section className="active-clue" aria-label="پرسش فعال" aria-live="polite">
      {slot ? (
        <>
          <div className="clue-kicker">
            {slot.direction === "across" ? "ردیف" : "ستون"} {slot.groupNum}، کلمه {slot.wordIndexInGroup}
            <span>{slot.length} حرف</span>
          </div>
          <p>{slot.clue}</p>
        </>
      ) : (
        <p>یک خانه سفید را انتخاب کنید.</p>
      )}
    </section>
  );
}

function BoardWithLabels({
  puzzle,
  children,
}: {
  readonly puzzle: ReturnType<typeof compilePuzzle>;
  readonly children: React.ReactNode;
}) {
  const { rows, cols } = puzzle.size;
  return (
    <div className="board-with-labels">
      <div className="board-top-row">
        <div className="corner-spacer" />
        <div
          className="col-numbers"
          style={{ "--grid-cols": cols } as React.CSSProperties}
        >
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className="col-number">
              {c + 1}
            </span>
          ))}
        </div>
      </div>
      <div className="board-bottom-row">
        <div className="row-numbers">
          {Array.from({ length: rows }, (_, r) => (
            <span key={r} className="row-number">
              {r + 1}
            </span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

interface CluePanelProps {
  readonly acrossSlots: readonly Slot[];
  readonly downSlots: readonly Slot[];
  readonly activeSlot: Slot | undefined;
  readonly clueTab: Direction;
  readonly onTabChange: (direction: Direction) => void;
  readonly onClueClick: (slot: Slot) => void;
}

function CluePanel({
  acrossSlots,
  downSlots,
  activeSlot,
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
          ردیف‌ها
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={clueTab === "down"}
          onClick={() => onTabChange("down")}
        >
          ستون‌ها
        </button>
      </div>

      <div className="clue-lists">
        <GroupedClueList
          title="ردیف‌ها"
          slots={acrossSlots}
          activeSlot={activeSlot}
          visibleOnSmall={clueTab === "across"}
          onClueClick={onClueClick}
        />
        <GroupedClueList
          title="ستون‌ها"
          slots={downSlots}
          activeSlot={activeSlot}
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
  activeSlot,
  visibleOnSmall,
  onClueClick,
}: {
  readonly title: string;
  readonly slots: readonly Slot[];
  readonly activeSlot: Slot | undefined;
  readonly visibleOnSmall: boolean;
  readonly onClueClick: (slot: Slot) => void;
}) {
  const groups = groupSlotsByGroupNum(slots);
  return (
    <section className={`clue-list ${visibleOnSmall ? "clue-list-visible" : ""}`}>
      <h2>{title}</h2>
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
                    className={`clue-item-btn${activeSlot?.id === slot.id ? " clue-selected" : ""}`}
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

function loadProgress(sampleId: string): SavedCrosswordState {
  if (typeof window === "undefined") {
    return { cells: {} };
  }

  const raw = window.localStorage.getItem(STORAGE_PREFIX + sampleId);
  if (!raw) {
    return { cells: {} };
  }

  try {
    return JSON.parse(raw) as SavedCrosswordState;
  } catch {
    return { cells: {} };
  }
}

function saveProgress(sampleId: string, state: SavedCrosswordState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_PREFIX + sampleId, JSON.stringify(state));
}
