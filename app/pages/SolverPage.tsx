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
  EllipsisVertical,
  Save,
  Upload,
  Undo2,
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
  normalizeGridDirection,
  progressOf,
  recordEdit,
  loadCheckMode,
  saveCheckMode,
  loadSeenTutorial,
  saveSeenTutorial,
} from "../progress";
import { useAuth } from "../AuthContext";
import { goHome } from "../router";
import { useNoBackGesture } from "../gestureExclusion";
import { BoardWithLabels } from "../components/BoardWithLabels";
import { CrosswordBoard } from "../components/CrosswordBoard";
import { ActiveClue } from "../components/CluePanel";
import { HelpTutorial } from "../components/HelpTutorial";

// Admin editing (app/admin): where the editing tools save, plus the admin's toolbar actions.
export interface PuzzleEditor {
  // A draft saves privately; a published puzzle's fix goes straight to players.
  readonly kind: "draft" | "published";
  readonly save: (json: CrosswordJson) => Promise<void>;
  readonly publish?: ((json: CrosswordJson) => Promise<void>) | undefined;
  readonly unpublish?: (() => Promise<void>) | undefined;
}

type ConfirmAction = "reset" | "save" | "publish" | "unpublish";

const CONFIRM_TEXT: Record<ConfirmAction, { readonly title: string; readonly body: string }> = {
  reset: { title: "پاک کردن پاسخ‌ها", body: "همه پاسخ‌های واردشده پاک می‌شوند و قابل بازگشت نیست. ادامه می‌دهید؟" },
  save: { title: "ذخیره جدول", body: "حرف‌های واردشده به‌عنوان پاسخ جدول ذخیره می‌شوند. ادامه می‌دهید؟" },
  publish: { title: "انتشار جدول", body: "جدول برای همه بازیکنان منتشر می‌شود. ادامه می‌دهید؟" },
  unpublish: { title: "لغو انتشار", body: "جدول از فهرست بازیکنان برداشته و به پیش‌نویس‌ها منتقل می‌شود. ادامه می‌دهید؟" },
};

interface SolverPageProps {
  readonly id: string;
  readonly json: CrosswordJson;
  readonly solutionImageUrl?: string | undefined;
  readonly sourceImageUrl?: string | undefined;
  // Admins only: turns on the editing tools.
  readonly editor?: PuzzleEditor | undefined;
  readonly onBack?: (() => void) | undefined;
}

export function SolverPage({ id, json, solutionImageUrl, sourceImageUrl, editor, onBack = goHome }: SolverPageProps) {
  const { syncVersion, pushChanges } = useAuth();
  const normalizedJson = useMemo(() => normalizeGridDirection(json), [json]);
  const isDebugMode = !!editor && json.version === 3;
  // Latest saved JSON: a second edit must build on the first even before the new version of
  // the puzzle arrives back through its props.
  const editedJsonRef = useRef(json);
  useEffect(() => {
    editedJsonRef.current = json;
  }, [json]);
  const isTouch = useMemo(() => isTouchDevice(), []);
  useNoBackGesture();

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
  const [showHelp, setShowHelp] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [checkMode, setCheckMode] = useState(loadCheckMode);
  const [sourceCollapsed, setSourceCollapsed] = useState(true);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const solutionBoardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarMenuButtonRef = useRef<HTMLButtonElement>(null);

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
  const cellSlots = puzzle && selection ? puzzle.getSlotsForCell(selection.coord) : {};
  const acrossKeys = slotCellKeys(cellSlots.across);
  const downKeys = slotCellKeys(cellSlots.down);
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
    setShowSolution(false);
    setClueOverrides({});
  }, [id, puzzle]);

  // Cloud sync can update localStorage while this puzzle is open. Refresh only
  // the persisted grid data; keeping this component mounted preserves the
  // selected cell, active direction, focus, and other transient UI state.
  useEffect(() => {
    if (syncVersion === 0) return;
    setSavedState(loadProgress(id));
  }, [id, syncVersion]);

  useEffect(() => {
    saveCheckMode(checkMode);
  }, [checkMode]);

  useEffect(() => {
    if (!isToolbarMenuOpen) return;

    function closeOnOutsidePointer(event: PointerEvent): void {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setIsToolbarMenuOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setIsToolbarMenuOpen(false);
      toolbarMenuButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isToolbarMenuOpen]);

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

  // Letters are saved on the device at once; the cloud gets them after a quiet spell or
  // when leaving the puzzle (the app going to the background is handled in AuthContext).
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(pushTimerRef.current);
      pushChanges();
    },
    [pushChanges],
  );

  function saveEdit(nextState: ReturnType<typeof createState>): void {
    if (!puzzle) return;
    const saved = nextState.toJSON();
    setSavedState(saved);
    recordEdit(id, saved, progressOf(puzzle, nextState));
    clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(pushChanges, 30_000);
  }

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


  function selectCell(coord: Coord): void {
    if (!puzzle) return;

    setSelection((current) => {
      const next = handleCellSelection(puzzle, coord, current);
      return next;
    });
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
    saveEdit(nextState);
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
    if (puzzle) saveEdit(createState(puzzle));
    const firstSlot = puzzle?.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
  }

  // The letters entered on the board become the puzzle's answers (disk format: LTR rows, "" for block).
  function withSolvedGrid(source: CrosswordJson): CrosswordJson | null {
    if (!puzzle || !crosswordState) return null;
    const solvedGrid = Array.from({ length: puzzle.size.rows }, (_, row) =>
      Array.from({ length: puzzle.size.cols }, (_, col) =>
        puzzle.isBlock({ row, col }) ? "" : crosswordState.getCell({ row, col }) || " ",
      ).reverse(),
    );
    return { ...source, grid: solvedGrid };
  }

  async function saveJsonEdit(next: CrosswordJson): Promise<void> {
    if (!editor) return;
    await editor.save(next);
    editedJsonRef.current = next;
  }

  function openConfirm(action: ConfirmAction): void {
    setConfirmError(null);
    setConfirmAction(action);
  }

  async function runConfirmAction(action: ConfirmAction): Promise<void> {
    if (action === "reset") {
      resetProgress();
      setConfirmAction(null);
      return;
    }
    if (!editor) return;
    setIsSaving(true);
    setConfirmError(null);
    try {
      if (action === "save") {
        const next = withSolvedGrid(editedJsonRef.current);
        if (next) await saveJsonEdit(next);
      } else if (action === "publish") {
        await editor.publish?.(editedJsonRef.current);
      } else {
        await editor.unpublish?.();
      }
      setConfirmAction(null);
    } catch (e) {
      console.error(`[admin] ${action} failed`, e);
      setConfirmError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
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
    try {
      await saveJsonEdit(withUpdatedClue(editedJsonRef.current, slot, newClue));
    } catch (e) {
      console.error("[admin] clue save failed", e);
      throw new Error(`ذخیره با خطا مواجه شد: ${e instanceof Error ? e.message : String(e)}`);
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
        <button
          type="button"
          className="header-back"
          onClick={onBack}
          title="بازگشت به فهرست جدول‌ها"
          aria-label="بازگشت به فهرست جدول‌ها"
        >
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        <div className="app-header-meta">
          <h1>{title}</h1>
          {puzzleMetaItems.length ? (
            <div className="puzzle-meta" aria-label="اطلاعات جدول">
              {puzzleMetaItems.map((item) => (
                <span key={item.key} className={`puzzle-meta-item puzzle-meta-item-${item.key}`}>
                  <span className="puzzle-meta-icon">{item.icon}</span>
                  <span className="puzzle-meta-label">{item.label}</span>
                  <span className="puzzle-meta-value">{item.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="toolbar" ref={toolbarRef}>
          {solutionState ? (
            <button
              type="button"
              role="switch"
              className="check-switch"
              onClick={() => setCheckMode((v) => !v)}
              title="بررسی خودکار"
              aria-label="بررسی خودکار"
              aria-checked={checkMode}
            >
              <SpellCheck2 size={18} aria-hidden="true" />
              <span>بررسی خودکار</span>
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
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
          <button
            ref={toolbarMenuButtonRef}
            type="button"
            className="toolbar-menu-toggle"
            onClick={() => setIsToolbarMenuOpen((open) => !open)}
            title="گزینه‌های بیشتر"
            aria-label="گزینه‌های بیشتر"
            aria-expanded={isToolbarMenuOpen}
            aria-controls="solver-toolbar-menu"
          >
            <EllipsisVertical size={20} aria-hidden="true" />
          </button>
          <div
            id="solver-toolbar-menu"
            className={`toolbar-menu${isToolbarMenuOpen ? " toolbar-menu-open" : ""}`}
            aria-label="گزینه‌های جدول"
            onClick={() => setIsToolbarMenuOpen(false)}
          >
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
            <button
              type="button"
              className="toolbar-menu-danger"
              onClick={() => openConfirm("reset")}
              title="پاک کردن پاسخ‌ها"
              aria-label="پاک کردن پاسخ‌ها"
            >
              <RotateCcw size={18} aria-hidden="true" />
              <span>پاک کردن پاسخ‌ها</span>
            </button>
            {isDebugMode ? (
              <button
                type="button"
                onClick={() => openConfirm("save")}
                disabled={isSaving}
                title="ذخیره حرف‌ها به‌عنوان پاسخ جدول (مدیر)"
                aria-label="ذخیره جدول"
              >
                <Save size={18} aria-hidden="true" />
                <span>ذخیره پاسخ‌ها</span>
              </button>
            ) : null}
            {editor?.publish ? (
              <button type="button" onClick={() => openConfirm("publish")} disabled={isSaving}>
                <Upload size={18} aria-hidden="true" />
                <span>انتشار</span>
              </button>
            ) : null}
            {editor?.unpublish ? (
              <button type="button" className="toolbar-menu-danger" onClick={() => openConfirm("unpublish")} disabled={isSaving}>
                <Undo2 size={18} aria-hidden="true" />
                <span>لغو انتشار</span>
              </button>
            ) : null}
          </div>
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
            <h2>{CONFIRM_TEXT[confirmAction].title}</h2>
            <p>
              {confirmAction === "save" && editor?.kind === "published"
                ? "حرف‌های واردشده به‌عنوان پاسخ جدول ذخیره و برای همه بازیکنان منتشر می‌شوند. ادامه می‌دهید؟"
                : CONFIRM_TEXT[confirmAction].body}
            </p>
            {confirmError ? <p className="clue-edit-error confirm-modal-error">{confirmError}</p> : null}
            <div className="solution-modal-actions">
              <button type="button" onClick={() => setConfirmAction(null)}>
                انصراف
              </button>
              <button
                type="button"
                className="confirm-modal-primary"
                disabled={isSaving}
                onClick={() => void runConfirmAction(confirmAction)}
              >
                {isSaving ? "در حال انجام..." : "تایید"}
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
                  acrossKeys={new Set()}
                  downKeys={new Set()}
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
                    acrossKeys={acrossKeys}
                    downKeys={downKeys}
                    onCellClick={selectCell}
                    onKeyDown={handleKeyDown}
                    onInputBeforeInput={handleInputBeforeInput}
                    onInputChange={handleInputChange}
                    showCluesOnHover
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
                isDebugMode={isDebugMode}
                onSaveClue={handleSaveClue}
                checkMode={checkMode}
                getSolutionValue={(c) => solutionState?.getCell(c)}
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
