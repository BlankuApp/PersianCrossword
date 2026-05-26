import {
  RotateCcw,
  ArrowRight,
  HelpCircle,
  Eye,
  EyeOff,
  X,
  Newspaper,
  Gauge,
  Hash,
  Image,
  ChevronDown,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  cellKey,
  compilePuzzle,
  createState,
  splitPersianGraphemes,
  CrosswordValidationError,
  type Coord,
  type CrosswordPuzzle,
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
import { saveCloudProgress } from "../cloudProgress";
import { useAuth } from "../AuthContext";
import { navigate } from "../router";
import {
  chooseOverlayCorner,
  getOverlayViewportStyle,
  unionRects,
  type OverlayCorner,
  type ViewportFrame,
} from "../clueOverlay";
import { BoardWithLabels } from "../components/BoardWithLabels";
import { CrosswordBoard } from "../components/CrosswordBoard";
import { ActiveClue, CluePanel } from "../components/CluePanel";

interface SolverPageProps {
  readonly id: string;
  readonly json: CrosswordJson;
  readonly solutionImageUrl?: string | undefined;
  readonly sourceImageUrl?: string | undefined;
}

export function SolverPage({ id, json, solutionImageUrl, sourceImageUrl }: SolverPageProps) {
  const { user } = useAuth();
  const CLUE_OVERLAY_HIDE_MS = 3000;
  const CLUE_OVERLAY_MARGIN = 12;
  const CLUE_OVERLAY_GAP = 16;
  const CLUE_OVERLAY_MOBILE_QUERY = "(max-width: 860px)";
  const [puzzle, compileError] = useMemo((): [CrosswordPuzzle | null, Error | null] => {
    try {
      return [compilePuzzle(json), null];
    } catch (e) {
      return [null, e instanceof Error ? e : new Error(String(e))];
    }
  }, [json]);
  const [savedState, setSavedState] = useState(() => loadProgress(id));
  const [selection, setSelection] = useState<Selection | undefined>(() => {
    try {
      const firstSlot = compilePuzzle(json).slots[0];
      return firstSlot ? selectSlot(firstSlot) : undefined;
    } catch {
      return undefined;
    }
  });
  const [clueTab, setClueTab] = useState<Direction>("across");
  const [showHelp, setShowHelp] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [sourceCollapsed, setSourceCollapsed] = useState(true);
  const [showMobileClueOverlay, setShowMobileClueOverlay] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia(CLUE_OVERLAY_MOBILE_QUERY).matches
      : false,
  );
  const [showClueOverlay, setShowClueOverlay] = useState(false);
  const [clueOverlayCorner, setClueOverlayCorner] = useState<OverlayCorner>("top-right");
  const [clueOverlayStyle, setClueOverlayStyle] = useState<CSSProperties>(() =>
    getOverlayViewportStyle(
      "top-right",
      CLUE_OVERLAY_MARGIN,
      { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight },
      0,
    ),
  );

  const boardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clueOverlayRef = useRef<HTMLDivElement>(null);
  const clueOverlayTimerRef = useRef<number | undefined>(undefined);

  function focusInput(): void {
    const el = inputRef.current;
    if (el) {
      el.value = "";
      el.focus();
    } else {
      boardRef.current?.focus();
    }
  }

  const crosswordState = useMemo(
    () => (puzzle ? createState(puzzle, savedState) : null),
    [puzzle, savedState],
  );
  const activeSlot = puzzle ? getActiveSlot(puzzle, selection) : undefined;
  const activeKeys = slotCellKeys(activeSlot);
  const selectionSignature = selection
    ? `${selection.coord.row}:${selection.coord.col}:${selection.direction}`
    : "none";

  useEffect(() => {
    const restored = loadProgress(id);
    setSavedState(restored);
    const firstSlot = puzzle?.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
    setClueTab("across");
    setShowSolution(false);
  }, [id, puzzle]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setShowMobileClueOverlay(false);
      return;
    }

    const mediaQuery = window.matchMedia(CLUE_OVERLAY_MOBILE_QUERY);
    const handleChange = (event: MediaQueryListEvent | MediaQueryList): void => {
      setShowMobileClueOverlay(event.matches);
    };

    handleChange(mediaQuery);
    mediaQuery.addEventListener?.("change", handleChange);

    return () => {
      mediaQuery.removeEventListener?.("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (clueOverlayTimerRef.current !== undefined) {
      window.clearTimeout(clueOverlayTimerRef.current);
      clueOverlayTimerRef.current = undefined;
    }

    if (!showMobileClueOverlay || !activeSlot) {
      setShowClueOverlay(false);
      return;
    }

    setShowClueOverlay(true);
    clueOverlayTimerRef.current = window.setTimeout(() => {
      setShowClueOverlay(false);
      clueOverlayTimerRef.current = undefined;
    }, CLUE_OVERLAY_HIDE_MS);

    return () => {
      if (clueOverlayTimerRef.current !== undefined) {
        window.clearTimeout(clueOverlayTimerRef.current);
        clueOverlayTimerRef.current = undefined;
      }
    };
  }, [activeSlot, id, selectionSignature, showMobileClueOverlay]);

  useLayoutEffect(() => {
    if (!showMobileClueOverlay || !showClueOverlay || !activeSlot) {
      return;
    }

    const getViewportFrame = (): ViewportFrame => {
      const viewport = window.visualViewport;
      if (!viewport) {
        return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      }

      return {
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        width: viewport.width,
        height: viewport.height,
      };
    };

    const updateClueOverlayPlacement = (): void => {
      const boardEl = boardRef.current;
      const overlayEl = clueOverlayRef.current;
      if (!boardEl || !overlayEl) {
        return;
      }

      const slotRects = activeSlot.cells
        .map((coord) => {
          const cell = boardEl.querySelector<HTMLElement>(`[data-cell-key="${cellKey(coord)}"]`);
          return cell?.getBoundingClientRect();
        })
        .filter((rect): rect is DOMRect => rect !== undefined);
      const slotRect = unionRects(slotRects);
      if (!slotRect) {
        return;
      }

      const viewportFrame = getViewportFrame();
      const overlayRect = overlayEl.getBoundingClientRect();
      const nextCorner = chooseOverlayCorner({
        slotRect,
        overlaySize: { width: overlayRect.width, height: overlayRect.height },
        viewport: { width: viewportFrame.width, height: viewportFrame.height },
        margin: CLUE_OVERLAY_MARGIN,
        gap: CLUE_OVERLAY_GAP,
      });
      setClueOverlayCorner(nextCorner);
      setClueOverlayStyle(
        getOverlayViewportStyle(
          nextCorner,
          CLUE_OVERLAY_MARGIN,
          viewportFrame,
          overlayRect.width,
        ),
      );
    };

    updateClueOverlayPlacement();
    window.addEventListener("resize", updateClueOverlayPlacement);
    window.addEventListener("scroll", updateClueOverlayPlacement, true);
    window.visualViewport?.addEventListener("resize", updateClueOverlayPlacement);
    window.visualViewport?.addEventListener("scroll", updateClueOverlayPlacement);

    return () => {
      window.removeEventListener("resize", updateClueOverlayPlacement);
      window.removeEventListener("scroll", updateClueOverlayPlacement, true);
      window.visualViewport?.removeEventListener("resize", updateClueOverlayPlacement);
      window.visualViewport?.removeEventListener("scroll", updateClueOverlayPlacement);
    };
  }, [activeSlot, showClueOverlay, selectionSignature, showMobileClueOverlay]);

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

  useEffect(() => {
    saveProgress(id, savedState);
    if (user) {
      void saveCloudProgress(user.uid, id, savedState);
    }
  }, [id, savedState, user]);

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
    focusInput();
  }

  function selectClue(slot: Slot): void {
    setSelection(selectSlot(slot));
    setClueTab(slot.direction);
    focusInput();
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

  function updateCell(coord: Coord, value: string | null): void {
    if (!puzzle) return;
    const nextState = createState(puzzle, savedState);
    nextState.setCell(coord, value);
    commitState(nextState);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (!puzzle || !selection) return;

    const active = getActiveSlot(puzzle, selection);

    if (event.key === "Backspace") {
      event.preventDefault();
      const currentValue = crosswordState?.getCell(selection.coord);
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
    const firstSlot = puzzle?.slots[0];
    setSelection(firstSlot ? selectSlot(firstSlot) : undefined);
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

  if (puzzleIdentifier) {
    puzzleMetaItems.push({
      key: "id",
      label: "شناسه",
      value: puzzleIdentifier,
      icon: <Hash size={14} aria-hidden="true" />,
    });
  }

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
            onClick={resetProgress}
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
            aria-expanded={showHelp}
          >
            <HelpCircle size={18} aria-hidden="true" />
            <span>راهنما</span>
          </button>
          {solutionImageUrl ? (
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

      {showSolution && solutionImageUrl ? (
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
            <div className="solution-image">
              <img src={solutionImageUrl} alt="تصویر پاسخ جدول" />
            </div>
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
          {showMobileClueOverlay && showClueOverlay && activeSlot ? (
            <div
              ref={clueOverlayRef}
              className="active-clue-overlay"
              data-testid="active-clue-overlay"
              aria-live="polite"
              data-corner={clueOverlayCorner}
              style={clueOverlayStyle}
            >
              {activeSlot.clue}
            </div>
          ) : null}

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
                  />
                </BoardWithLabels>
              </div>
            </div>

            <div className="clue-sidebar">
              <ActiveClue slot={activeSlot} />
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
