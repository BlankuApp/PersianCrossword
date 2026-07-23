import confetti from "canvas-confetti";
import {
  RotateCcw,
  ArrowRight,
  HelpCircle,
  Eye,
  EyeOff,
  SpellCheck2,
  X,
  Newspaper,
  Gauge,
  Hash,
  Image,
  ChevronDown,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  cellKey,
  compilePuzzle,
  createState,
  splitPersianGraphemes,
  validatePuzzleJson,
  CrosswordValidationError,
  type Coord,
  type CrosswordPuzzle,
  type Direction,
  type Slot,
  type SlotId,
  type CrosswordJson,
} from "../../src/index";
import {
  getActiveSlot,
  handleCellSelection,
  isTouchDevice,
  moveByArrow,
  nextCoordInSlot,
  selectSlot,
  slotCellKeys,
  type Selection,
} from "../crosswordUi";
import {
  loadProgress,
  saveProgress,
  normalizeGridDirection,
  loadCheckMode,
  saveCheckMode,
  loadSeenTutorial,
  saveSeenTutorial,
} from "../progress";
import { saveCloudProgress } from "../cloudProgress";
import { useAuth } from "../AuthContext";
import { navigate } from "../router";
import { BoardWithLabels } from "../components/BoardWithLabels";
import { CrosswordBoard } from "../components/CrosswordBoard";
import { ActiveClue, CluePanel } from "../components/CluePanel";
import { HelpTutorial } from "../components/HelpTutorial";

interface SolverPageProps {
  readonly id: string;
  readonly json: CrosswordJson;
  readonly solutionImageUrl?: string | undefined;
  readonly sourceImageUrl?: string | undefined;
  readonly filePath?: string | undefined;
}

export function SolverPage({ id, json, solutionImageUrl, sourceImageUrl, filePath }: SolverPageProps) {
  const { user } = useAuth();
  const normalizedJson = useMemo(() => normalizeGridDirection(json), [json]);
  const isDebugMode = import.meta.env.DEV && json.version === 3 && !!filePath;
  const isTouch = useMemo(() => isTouchDevice(), []);

  // Debug-only: mutable copy of the source grid (unreversed, matches disk format).
  const [debugEditGrid, setDebugEditGrid] = useState<string[][]>(() =>
    json.version === 3 ? json.grid.map((row) => [...row]) : [],
  );
  useEffect(() => {
    if (json.version === 3) setDebugEditGrid(json.grid.map((row) => [...row]));
  }, [json]);
  const [isSaving, setIsSaving] = useState(false);
  const [clueOverrides, setClueOverrides] = useState<Record<SlotId, string>>({});

  const [puzzle, compileError] = useMemo((): [CrosswordPuzzle | null, Error | null] => {
    try {
      return [compilePuzzle(normalizedJson), null];
    } catch (e) {
      return [null, e instanceof Error ? e : new Error(String(e))];
    }
  }, [normalizedJson]);

  // Debug-only: recompile from the editable grid (reversed rows) with stub clues so the
  // board renders even when clues don't match the grid, and updates when blocks change.
  const debugPuzzle = useMemo((): CrosswordPuzzle | null => {
    if (!isDebugMode || normalizedJson.version !== 3) return null;
    const debugGrid = debugEditGrid.map((row) => [...row].reverse());
    const debugJson = { ...normalizedJson, grid: debugGrid };
    const { derivedSlots } = validatePuzzleJson(debugJson);
    if (!derivedSlots.length) return null;
    const h: Record<string, string[]> = {};
    const v: Record<string, string[]> = {};
    for (const slot of derivedSlots) {
      const key = String(slot.groupNum);
      if (slot.direction === "across") { (h[key] ??= []).push("?"); }
      else { (v[key] ??= []).push("?"); }
    }
    try {
      return compilePuzzle({ ...debugJson, clues: { horizontal: h, vertical: v } });
    } catch {
      return null;
    }
  }, [isDebugMode, debugEditGrid, normalizedJson]);

  // In debug mode always use the puzzle compiled from the live edit grid.
  const activePuzzle = isDebugMode ? debugPuzzle : puzzle;
  const [savedState, setSavedState] = useState(() => loadProgress(id));
  const [selection, setSelection] = useState<Selection | undefined>(() => {
    try {
      const firstSlot = compilePuzzle(normalizeGridDirection(json)).slots[0];
      return firstSlot ? selectSlot(firstSlot) : undefined;
    } catch {
      return undefined;
    }
  });
  const [clueTab, setClueTab] = useState<Direction>("across");
  const [showHelp, setShowHelp] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [checkMode, setCheckMode] = useState(loadCheckMode);
  const [sourceCollapsed, setSourceCollapsed] = useState(true);
  const [confirmAction, setConfirmAction] = useState<"reset" | "save" | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const solutionBoardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function focusInput(): void {
    const el = inputRef.current;
    if (el) {
      el.value = "";
      el.focus();
    } else {
      boardRef.current?.focus();
    }
  }

  const crosswordState = useMemo(() => {
    if (!puzzle) return null;
    try {
      return createState(puzzle, savedState);
    } catch {
      return null;
    }
  }, [puzzle, savedState]);

  const solutionState = useMemo(() => {
    const puz = isDebugMode ? debugPuzzle : puzzle;
    if (!puz || normalizedJson.version !== 3) return null;
    const cells: Record<string, string> = {};
    if (isDebugMode) {
      // debugEditGrid is source-format (LTR for v3); reverse each row to get normalized cols.
      // Skip space placeholders (open cell with no letter yet).
      debugEditGrid.forEach((row, r) => {
        [...row].reverse().forEach((letter, c) => {
          if (letter && letter.trim()) cells[cellKey({ row: r, col: c })] = letter;
        });
      });
    } else {
      normalizedJson.grid.forEach((row, r) => {
        row.forEach((letter, c) => {
          if (letter) cells[cellKey({ row: r, col: c })] = letter;
        });
      });
    }
    return createState(puz, { cells });
  }, [puzzle, debugPuzzle, normalizedJson, isDebugMode, debugEditGrid]);
  const activeSlot = puzzle ? getActiveSlot(puzzle, selection) : undefined;
  const activeKeys = slotCellKeys(activeSlot);
  const cellSlots = puzzle && selection ? puzzle.getSlotsForCell(selection.coord) : {};
  function withClueOverride(slot: Slot | undefined): Slot | undefined {
    return slot && clueOverrides[slot.id] ? { ...slot, clue: clueOverrides[slot.id]! } : slot;
  }
  const acrossSlotForDisplay = withClueOverride(cellSlots.across);
  const downSlotForDisplay = withClueOverride(cellSlots.down);

  useEffect(() => {
    const restored = loadProgress(id);
    setSavedState(restored);
    const firstSlot = puzzle?.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
    setClueTab("across");
    setShowSolution(false);
    setClueOverrides({});
  }, [id, puzzle]);

  useEffect(() => {
    saveCheckMode(checkMode);
  }, [checkMode]);

  // Close the solution overlay with the Escape key.
  useEffect(() => {
    if (!showSolution) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setShowSolution(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSolution]);

  function closeSolution(): void {
    setShowSolution(false);
  }

  function closeHelp(): void {
    setShowHelp(false);
    saveSeenTutorial();
  }

  // Auto-open the tutorial the first time a puzzle actually renders.
  useEffect(() => {
    if (!puzzle || compileError) return;
    if (loadSeenTutorial()) return;
    if (showSolution) return; // never stack over another modal
    setShowHelp(true);
    // Only re-check when the rendered puzzle changes, not on solution toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, compileError]);

  useEffect(() => {
    saveProgress(id, savedState);
    if (!user) return;
    const timer = setTimeout(() => {
      void saveCloudProgress(user.uid, id, savedState);
    }, 1000);
    return () => clearTimeout(timer);
  }, [id, savedState, user]);

  const isPuzzleSolved = useMemo(() => {
    if (!puzzle || !crosswordState) return false;
    return puzzle.slots.every((slot) => crosswordState.checkSlot(slot.id) === "correct");
  }, [puzzle, crosswordState]);

  const prevSolvedRef = useRef(false);
  useEffect(() => {
    if (isPuzzleSolved && !prevSolvedRef.current) {
      void confetti({
        particleCount: 180,
        spread: 90,
        origin: { y: 0.6 },
        colors: ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
      });
    }
    prevSolvedRef.current = isPuzzleSolved;
  }, [isPuzzleSolved]);

  function commitState(nextState: ReturnType<typeof createState>): void {
    setSavedState(nextState.toJSON());
  }

  function selectCell(coord: Coord): void {
    if (!puzzle) return;

    setSelection((current) => {
      const next = handleCellSelection(puzzle, coord, current);
      if (next) setClueTab(next.direction);
      return next;
    });
    if (!isTouch) focusInput();
  }

  function selectClue(slot: Slot): void {
    setSelection(selectSlot(slot));
    setClueTab(slot.direction);
    if (!isTouch) focusInput();
  }

  function toggleDirection(): void {
    if (!puzzle || !selection) return;
    const slots = puzzle.getSlotsForCell(selection.coord);
    if (!slots.across || !slots.down) return;
    setSelection({ ...selection, direction: selection.direction === "across" ? "down" : "across" });
    if (!isTouch) focusInput();
  }

  function commitGrapheme(grapheme: string): void {
    if (!puzzle || !selection) return;
    const graphemes = splitPersianGraphemes(grapheme);
    if (graphemes.length !== 1) return;
    const nextGrapheme = graphemes[0];
    if (!nextGrapheme) return;
    updateCell(selection.coord, nextGrapheme);
    const active = getActiveSlot(puzzle, selection);
    if (active) {
      const next = nextCoordInSlot(active, selection.coord, 1);
      setSelection({ ...selection, coord: next });
    }
  }

  function handleInputBeforeInput(event: React.FormEvent<HTMLInputElement>): void {
    const native = event.nativeEvent as InputEvent;
    const data = native.data;
    if (!data) return;
    event.preventDefault();
    if (inputRef.current) inputRef.current.value = "";
    commitGrapheme(data);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
    // Fallback for IMEs that don't fire beforeinput with data.
    const value = event.target.value;
    event.target.value = "";
    if (!value) return;
    commitGrapheme(value);
  }

  function updateCell(coord: Coord, value: string | null, clearCoord?: Coord): void {
    if (!puzzle) return;
    const nextState = createState(puzzle, savedState);
    nextState.setCell(coord, value);
    if (clearCoord) nextState.setCell(clearCoord, null);
    commitState(nextState);
  }

  function backspaceCell(): void {
    if (!puzzle || !selection) return;
    const currentValue = crosswordState?.getCell(selection.coord);
    if (currentValue) {
      updateCell(selection.coord, null);
      if (!isTouch) focusInput();
      return;
    }
    const active = getActiveSlot(puzzle, selection);
    if (active) {
      const previous = nextCoordInSlot(active, selection.coord, -1);
      updateCell(previous, null);
      setSelection({ ...selection, coord: previous });
    }
    if (!isTouch) focusInput();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (!puzzle || !selection) return;

    const active = getActiveSlot(puzzle, selection);

    if (event.key === "Backspace") {
      event.preventDefault();
      backspaceCell();
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
      toggleDirection();
      return;
    }

    const graphemes = splitPersianGraphemes(event.key);
    if (graphemes.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;

    event.preventDefault();
    updateCell(selection.coord, graphemes[0]!);

    if (active) {
      const next = nextCoordInSlot(active, selection.coord, 1);
      setSelection({ ...selection, coord: next });
    }
  }

  function resetProgress(): void {
    const empty = { cells: {} };
    setSavedState(empty);
    saveProgress(id, empty);
    const firstSlot = puzzle?.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
  }

  async function handleDebugSave(): Promise<void> {
    if (!filePath || !puzzle || !crosswordState) return;
    setIsSaving(true);
    try {
      // Bake the currently solved letters into the grid (disk format: LTR rows, "" for block).
      const solvedGrid = Array.from({ length: puzzle.size.rows }, (_, row) =>
        Array.from({ length: puzzle.size.cols }, (_, col) =>
          puzzle.isBlock({ row, col }) ? "" : crosswordState.getCell({ row, col }) || " ",
        ).reverse(),
      );
      const res = await fetch("/dev/save-puzzle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, json: { ...json, grid: solvedGrid } }),
      });
      if (!res.ok) console.error("[debug] save failed", res.status, await res.text());
    } catch (e) {
      console.error("[debug] save failed", e);
    } finally {
      setIsSaving(false);
      setConfirmAction(null);
    }
  }

  function withUpdatedClue(source: CrosswordJson, slot: Slot, newClue: string): CrosswordJson {
    const key = slot.direction === "across" ? "horizontal" : "vertical";
    const groupKey = String(slot.groupNum);
    const group = [...(source.clues[key][groupKey] ?? [])];
    while (group.length < slot.wordIndexInGroup) group.push("");
    group[slot.wordIndexInGroup - 1] = newClue;
    return { ...source, clues: { ...source.clues, [key]: { ...source.clues[key], [groupKey]: group } } };
  }

  async function handleSaveClue(slot: Slot, newClue: string): Promise<void> {
    if (!filePath) return;
    const res = await fetch("/dev/save-puzzle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, json: withUpdatedClue(json, slot, newClue) }),
    });
    if (!res.ok) {
      console.error("[debug] clue save failed", res.status, await res.text());
      throw new Error(`ذخیره با خطا مواجه شد (${res.status})`);
    }
    setClueOverrides((prev) => ({ ...prev, [slot.id]: newClue }));
  }

  const title = json.meta?.title ?? id;
  const newspaper = json.meta?.newspaper;
  const difficulty = json.meta?.difficulty;
  const puzzleIdentifier = json.meta?.id ?? id;
  const puzzleMetaItems: Array<{
    key: string;
    label: string;
    value: string;
    icon: ReactNode;
  }> = [];

  if (newspaper) {
    puzzleMetaItems.push({
      key: "newspaper",
      label: "روزنامه",
      value: newspaper,
      icon: <Newspaper size={14} aria-hidden="true" />,
    });
  }

  if (difficulty) {
    puzzleMetaItems.push({
      key: "difficulty",
      label: "درجه",
      value: difficulty,
      icon: <Gauge size={14} aria-hidden="true" />,
    });
  }

  // if (puzzleIdentifier) {
  //   puzzleMetaItems.push({
  //     key: "id",
  //     label: "شناسه",
  //     value: puzzleIdentifier,
  //     icon: <Hash size={14} aria-hidden="true" />,
  //   });
  // }

  return (
    <main className="app-shell" dir="rtl">
      <header className="app-header">
        <div className="app-header-meta">
          <h1>{title}</h1>
          {puzzleMetaItems.length ? (
            <div className="puzzle-meta" aria-label="اطلاعات جدول">
              {puzzleMetaItems.map((item) => (
                <span key={item.key} className="puzzle-meta-item">
                  <span className="puzzle-meta-icon">{item.icon}</span>
                  <span className="puzzle-meta-label">{item.label}</span>
                  <span className="puzzle-meta-value">{item.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn-home"
            onClick={() => navigate("#/")}
            title="بازگشت به فهرست جدول‌ها"
            aria-label="بازگشت به فهرست جدول‌ها"
          >
            <ArrowRight size={18} aria-hidden="true" />
            <span>بازگشت</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction("reset")}
            title="پاک کردن پاسخ‌ها"
            aria-label="پاک کردن پاسخ‌ها"
          >
            <RotateCcw size={18} aria-hidden="true" />
            <span>پاک کردن</span>
          </button>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            title="راهنمای استفاده"
            aria-label="راهنمای استفاده"
            aria-haspopup="dialog"
          >
            <HelpCircle size={18} aria-hidden="true" />
            <span>راهنما</span>
          </button>
          {solutionState ? (
            <button
              type="button"
              onClick={() => setCheckMode((v) => !v)}
              title="بررسی پاسخ‌ها"
              aria-label="بررسی پاسخ‌ها"
              aria-pressed={checkMode}
            >
              <SpellCheck2 size={18} aria-hidden="true" />
              <span>بررسی پاسخ‌ها</span>
            </button>
          ) : null}
          {(solutionImageUrl || solutionState) ? (
            <button
              type="button"
              onClick={() => setShowSolution((v) => !v)}
              title="نمایش پاسخ جدول"
              aria-label={showSolution ? "پنهان کردن پاسخ" : "نمایش پاسخ"}
              aria-expanded={showSolution}
            >
              {showSolution ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
              <span>{showSolution ? "پنهان کردن پاسخ" : "نمایش پاسخ"}</span>
            </button>
          ) : null}
          {isDebugMode ? (
            <button
              type="button"
              onClick={() => setConfirmAction("save")}
              disabled={isSaving}
              title="ذخیره جدول (دیباگ)"
              aria-label="ذخیره جدول"
            >
              {isSaving ? "در حال ذخیره..." : "ذخیره"}
            </button>
          ) : null}
        </div>
      </header>

      {confirmAction ? (
        <div
          className="solution-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="تایید عملیات"
          onClick={() => setConfirmAction(null)}
        >
          <div className="solution-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{confirmAction === "reset" ? "پاک کردن پاسخ‌ها" : "ذخیره جدول"}</h2>
            <p>
              {confirmAction === "reset"
                ? "همه پاسخ‌های واردشده پاک می‌شوند و قابل بازگشت نیست. ادامه می‌دهید؟"
                : "جدول با وضعیت فعلی روی دیسک ذخیره می‌شود. ادامه می‌دهید؟"}
            </p>
            <div className="solution-modal-actions">
              <button type="button" onClick={() => setConfirmAction(null)}>
                انصراف
              </button>
              <button
                type="button"
                className="confirm-modal-primary"
                disabled={confirmAction === "save" && isSaving}
                onClick={() => {
                  if (confirmAction === "reset") {
                    resetProgress();
                    setConfirmAction(null);
                  } else {
                    void handleDebugSave();
                  }
                }}
              >
                {confirmAction === "save" && isSaving ? "در حال ذخیره..." : "تایید"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showHelp ? <HelpTutorial onClose={closeHelp} /> : null}

      {showSolution && (solutionImageUrl || solutionState) ? (
        <div
          className="solution-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="پاسخ جدول"
          onClick={closeSolution}
        >
          <div className="solution-modal" onClick={(e) => e.stopPropagation()}>
            <div className="solution-modal-header">
              <h2>پاسخ جدول</h2>
              <div className="solution-modal-actions">
                <button
                  type="button"
                  className="solution-close-button"
                  onClick={closeSolution}
                  title="بستن"
                  aria-label="بستن"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
            {solutionState ? (
              <div className="solution-board">
                <CrosswordBoard
                  boardRef={solutionBoardRef}
                  puzzle={activePuzzle!}
                  state={solutionState}
                  selection={undefined}
                  activeKeys={new Set()}
                  onCellClick={() => {}}
                  onKeyDown={() => {}}
                />
              </div>
            ) : (
              <div className="solution-image">
                <img src={solutionImageUrl} alt="تصویر پاسخ جدول" />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {compileError ? (
        <section className="puzzle-error-panel" role="alert" aria-label="خطا در بارگذاری جدول">
          <h2>خطا در بارگذاری جدول</h2>
          <p>این جدول به دلیل مشکل در فایل داده قابل نمایش نیست.</p>
          {compileError instanceof CrosswordValidationError ? (
            <ul className="puzzle-error-list">
              {compileError.issues.map((issue, i) => (
                <li key={i}>
                  <code className="puzzle-error-path">{issue.path}</code>
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="puzzle-error-message">{compileError.message}</p>
          )}
        </section>
      ) : (
        <>
          <section className="solver-layout">
            <div className="board-column">
              <div className="board-panel">
                <BoardWithLabels puzzle={puzzle!}>
                  <CrosswordBoard
                    boardRef={boardRef}
                    inputRef={inputRef}
                    puzzle={puzzle!}
                    state={crosswordState!}
                    selection={selection}
                    activeKeys={activeKeys}
                    onCellClick={selectCell}
                    onKeyDown={handleKeyDown}
                    onInputBeforeInput={handleInputBeforeInput}
                    onInputChange={handleInputChange}
                    checkMode={checkMode}
                    solutionState={solutionState}
                  />
                </BoardWithLabels>
              </div>
            </div>

            <div className="clue-sidebar">
              <ActiveClue
                slots={{ across: acrossSlotForDisplay, down: downSlotForDisplay }}
                activeDirection={selection?.direction}
                showTray={normalizedJson.version === 3}
                getCellValue={(c) => crosswordState?.getCell(c)}
                onCellChange={updateCell}
                onBackspace={backspaceCell}
                isDebugMode={isDebugMode}
                onSaveClue={handleSaveClue}
              />
              <CluePanel
                acrossSlots={puzzle!.acrossSlots}
                downSlots={puzzle!.downSlots}
                activeSlot={activeSlot}
                clueTab={clueTab}
                onTabChange={setClueTab}
                onClueClick={selectClue}
              />
            </div>
          </section>

          {sourceImageUrl && (
            <div className="source-panel-container">
              <button
                type="button"
                className="source-panel-toggle"
                onClick={() => setSourceCollapsed((v) => !v)}
                aria-expanded={!sourceCollapsed}
              >
                <Image size={16} aria-hidden="true" />
                <span>منبع جدول</span>
                <ChevronDown
                  size={14}
                  className={sourceCollapsed ? "chevron-collapsed" : ""}
                  aria-hidden="true"
                />
              </button>
              {!sourceCollapsed && (
                <div className="source-panel-body">
                  <img src={sourceImageUrl} alt="تصویر منبع جدول" />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
