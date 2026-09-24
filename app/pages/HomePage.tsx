import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  Flame,
  HelpCircle,
  Layers,
  LayoutList,
  Newspaper,
  PencilLine,
  Search,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import { listPuzzles, type PuzzleSummary } from "../puzzleLibrary";
import { loadProgress, loadRecentIds, computeProgress, type ProgressInfo } from "../progress";
import { navigate, setHomeQuery } from "../router";
import { useAuth } from "../AuthContext";
import { AuthButton } from "../components/AuthButton";
import { WHATS_NEW, loadWhatsNewSeen, markWhatsNewSeen } from "../whatsNew";
import {
  DEFAULT_LIST_QUERY,
  compareIds,
  filterAndSortPuzzles,
  isSpecialDifficulty,
  listQueryToParams,
  pageItems,
  parseListQuery,
  puzzleStatus,
  type LevelFilter,
  type ListQuery,
  type SortKey,
  type StatusFilter,
} from "../puzzleListQuery";

const ITEMS_PER_PAGE = 25;

const fa = (n: number) => n.toLocaleString("fa-IR");

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function WhatsNewButton() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(loadWhatsNewSeen);
  // Marker from before this opening, so new entries stay highlighted while the dialog is open.
  const [seenBeforeOpen, setSeenBeforeOpen] = useState(seen);
  const unseen = WHATS_NEW.filter((e) => e.date > seen).length;
  const unseenLabel = unseen > 9 ? "۹+" : unseen.toLocaleString("fa-IR");

  function openDialog(): void {
    setSeenBeforeOpen(seen);
    setSeen(markWhatsNewSeen());
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className={`auth-btn whats-new-btn${unseen ? " has-unseen" : ""}`}
        onClick={openDialog}
        aria-label={unseen ? `چه خبر؟ — ${unseenLabel} خبر تازه` : undefined}
      >
        <HelpCircle size={16} strokeWidth={2.2} aria-hidden="true" />
        چه خبر؟
        {unseen > 0 && (
          <span className="whats-new-badge" aria-hidden="true">
            {unseenLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="auth-modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="auth-modal whats-new-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="auth-modal-close"
              onClick={() => setOpen(false)}
              aria-label="بستن"
            >
              ✕
            </button>
            <h2 id="whats-new-title">چه خبر؟</h2>

            <div className="whats-new-list" tabIndex={0}>
              {WHATS_NEW.map((entry) => {
                const isNew = entry.date > seenBeforeOpen;
                return (
                  <div
                    key={`${entry.date}-${entry.title}`}
                    className={`auth-sync-info whats-new-entry${isNew ? " whats-new-entry-new" : ""}`}
                  >
                    <p className="whats-new-entry-title">
                      {formatDate(entry.date)} — {entry.title}
                      {isNew && <span className="whats-new-tag">تازه</span>}
                    </p>
                    <p className="whats-new-entry-body">{entry.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.57.1.78-.25.78-.55v-2.14c-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.72-1.53-2.55-.29-5.24-1.27-5.24-5.67 0-1.25.45-2.27 1.18-3.07-.12-.29-.5-1.45.11-3.02 0 0 .96-.31 3.15 1.17A10.93 10.93 0 0 1 12 6.04c.97 0 1.95.13 2.86.38 2.18-1.48 3.14-1.17 3.14-1.17.62 1.57.24 2.73.12 3.02.74.8 1.18 1.82 1.18 3.07 0 4.41-2.7 5.38-5.27 5.67.41.36.77 1.06.77 2.14v3.17c0 .3.2.66.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: string | undefined }) {
  const label = difficulty?.trim();

  if (!label) return <span>—</span>;

  const isSpecial = isSpecialDifficulty(label);
  const Icon = isSpecial ? Flame : Sprout;

  return (
    <span
      className={`difficulty-badge ${isSpecial ? "difficulty-badge-special" : "difficulty-badge-normal"}`}
      title={`سطح ${label}`}
    >
      <Icon className="difficulty-badge-icon" size={16} strokeWidth={2.2} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    // Spans, not divs: it also renders inside the continue-card <button>.
    <span className="progress-bar-wrap" title={`${fa(percent)}٪`}>
      <span className="progress-bar-track">
        <span className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="progress-pct">{fa(percent)}٪</span>
    </span>
  );
}

function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string, LucideIcon])[];
  onChange: (value: T) => void;
}) {
  // A single highlight "pill" slides under the active chip instead of each chip painting its own.
  const groupRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const measure = () => {
      const active = group.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (active) setPill({ x: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={groupRef} className="chip-group" role="group" aria-label={label}>
      {pill && (
        <span
          className="chip-pill"
          aria-hidden="true"
          style={{ width: pill.width, transform: `translateX(${pill.x}px)` }}
        />
      )}
      {options.map(([optionValue, optionLabel, Icon]) => (
        <button
          key={optionValue}
          type="button"
          className="chip"
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
        >
          <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
          {optionLabel}
        </button>
      ))}
    </div>
  );
}

const LEVEL_OPTIONS = [
  ["", "همهٔ سطح‌ها", Layers],
  ["normal", "عادی", Sprout],
  ["special", "ویژه", Flame],
] as const satisfies readonly (readonly [LevelFilter, string, LucideIcon])[];

const STATUS_OPTIONS = [
  ["", "همه", LayoutList],
  ["new", "شروع نشده", Circle],
  ["progress", "در حال حل", PencilLine],
  ["done", "تکمیل شده", CircleCheck],
] as const satisfies readonly (readonly [StatusFilter, string, LucideIcon])[];

const SORT_OPTIONS = [
  ["new", "جدیدترین"],
  ["old", "قدیمی‌ترین"],
  ["progress", "بیشترین پیشرفت"],
] as const satisfies readonly (readonly [SortKey, string])[];

function openPuzzle(id: string): void {
  navigate(`#/puzzle/${id}`);
}

export function HomePage() {
  const puzzles = useMemo(() => listPuzzles(), []);
  const { syncVersion } = useAuth();
  const [query, setQuery] = useState<ListQuery>(() => parseListQuery(window.location.hash));
  const [progressMap, setProgressMap] = useState<Record<string, ProgressInfo>>({});
  const listTopRef = useRef<HTMLDivElement>(null);

  // Reload progress whenever puzzles change or cloud sync completes
  useEffect(() => {
    const map: Record<string, ProgressInfo> = {};
    for (const p of puzzles) {
      const saved = loadProgress(p.id);
      map[p.id] = computeProgress(p.json, saved);
    }
    setProgressMap(map);
  }, [puzzles, syncVersion]);

  useEffect(() => {
    setHomeQuery(listQueryToParams(query));
  }, [query]);

  const newspapers = useMemo(
    () => [...new Set(puzzles.map((p) => p.newspaper).filter(Boolean))],
    [puzzles],
  );

  const filtered = useMemo(
    () => filterAndSortPuzzles(puzzles, progressMap, query),
    [puzzles, progressMap, query],
  );

  // Unfinished puzzles, most recently opened first.
  const continueList = useMemo(() => {
    const recent = loadRecentIds();
    const rank = (id: string) => {
      const index = recent.indexOf(id);
      return index === -1 ? Infinity : index;
    };
    return puzzles
      .filter((p) => !p.error && puzzleStatus(progressMap[p.id]) === "progress")
      .sort((a, b) => rank(a.id) - rank(b.id) || compareIds(b, a))
      .slice(0, 3);
  }, [puzzles, progressMap]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const page = Math.min(query.page, pageCount);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const hasFilters = Boolean(query.q || query.level || query.status || query.paper);

  // Any filter change starts again from page 1.
  function updateFilters(patch: Partial<ListQuery>): void {
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
  }

  function goToPage(target: number): void {
    setQuery((q) => ({ ...q, page: target }));
    listTopRef.current?.scrollIntoView({ block: "start" });
  }

  return (
    <main className="app-shell home-shell" dir="rtl">
      <header className="home-header">
        <div>
          <h1>جدول کلمات فارسی</h1>
        </div>
        <div className="home-header-actions">
          <WhatsNewButton />
          <AuthButton />
        </div>
      </header>

      {continueList.length > 0 && (
        <section className="continue-strip" aria-labelledby="continue-title">
          <h2 id="continue-title">ادامهٔ حل</h2>
          <div className="continue-list">
            {continueList.map((puzzle) => (
              <button
                key={puzzle.id}
                type="button"
                className="continue-card"
                onClick={() => openPuzzle(puzzle.id)}
              >
                <span className="continue-card-head">
                  <span className="puzzle-title">{puzzle.title}</span>
                  <DifficultyBadge difficulty={puzzle.difficulty} />
                </span>
                <ProgressBar percent={progressMap[puzzle.id]?.percent ?? 0} />
              </button>
            ))}
          </div>
        </section>
      )}

      {puzzles.length === 0 ? (
        <div className="empty-state">
          <p>هیچ جدولی یافت نشد.</p>
          <p className="empty-hint">
            فایل‌های JSON جدول را در پوشه{" "}
            <code>puzzles/</code>{" "}
            یا زیرپوشه‌های آن قرار دهید.
          </p>
        </div>
      ) : (
        <>
          <div className="list-controls" ref={listTopRef}>
            <div className="list-filters">
              <ChipGroup
                label="سطح"
                value={query.level}
                options={LEVEL_OPTIONS}
                onChange={(level) => updateFilters({ level })}
              />
              <ChipGroup
                label="وضعیت"
                value={query.status}
                options={STATUS_OPTIONS}
                onChange={(status) => updateFilters({ status })}
              />
              {newspapers.length > 1 && (
                <label className="list-select">
                  <Newspaper size={15} strokeWidth={2.2} aria-hidden="true" />
                  <select
                    aria-label="روزنامه"
                    value={query.paper}
                    onChange={(e) => updateFilters({ paper: e.target.value })}
                  >
                    <option value="">همهٔ روزنامه‌ها</option>
                    {newspapers.map((paper) => (
                      <option key={paper} value={paper}>
                        {paper}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {/* Collapsed to an icon until focused or filled (pure CSS, see .list-search). */}
              <label className="list-search" title="جستجو">
                <Search size={18} strokeWidth={2.2} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="شماره یا عنوان جدول"
                  aria-label="جستجوی جدول"
                  value={query.q}
                  onChange={(e) => updateFilters({ q: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") e.currentTarget.blur();
                  }}
                />
              </label>
            </div>
          </div>

          <div className="list-summary">
            <span aria-live="polite">
              {fa(filtered.length)} جدول
              {pageCount > 1 && ` · صفحهٔ ${fa(page)} از ${fa(pageCount)}`}
            </span>
            {hasFilters && (
              <button
                type="button"
                className="list-clear"
                onClick={() => setQuery({ ...DEFAULT_LIST_QUERY, sort: query.sort })}
              >
                پاک کردن فیلترها
              </button>
            )}
            <label className="list-select list-sort">
              <ArrowUpDown size={15} strokeWidth={2.2} aria-hidden="true" />
              <select
                aria-label="مرتب‌سازی"
                value={query.sort}
                onChange={(e) => updateFilters({ sort: e.target.value as SortKey })}
              >
                {SORT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <p>جدولی با این مشخصات پیدا نشد.</p>
            </div>
          ) : (
            <div className="puzzle-table-wrapper">
              <table className="puzzle-table" aria-label="فهرست جدول‌ها">
                <thead>
                  <tr>
                    <th className="th-id">شناسه</th>
                    <th>عنوان</th>
                    <th>سطح</th>
                    <th>روزنامه</th>
                    <th className="th-date">تاریخ</th>
                    <th>پیشرفت</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((puzzle) => (
                    <PuzzleRow
                      key={puzzle.id}
                      puzzle={puzzle}
                      progress={progressMap[puzzle.id]}
                      onClick={() => openPuzzle(puzzle.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pageCount > 1 && (
            <nav className="pagination" aria-label="صفحه‌بندی جدول‌ها">
              <button
                type="button"
                className="pagination-button"
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                aria-label="صفحهٔ قبل"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              {pageItems(page, pageCount).map((item, index) =>
                item === null ? (
                  <span key={`gap-${index}`} className="pagination-gap" aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`pagination-button${item === page ? " is-active" : ""}`}
                    onClick={() => goToPage(item)}
                    aria-label={`صفحهٔ ${fa(item)}`}
                    aria-current={item === page ? "page" : undefined}
                  >
                    {fa(item)}
                  </button>
                ),
              )}
              <button
                type="button"
                className="pagination-button"
                onClick={() => goToPage(page + 1)}
                disabled={page === pageCount}
                aria-label="صفحهٔ بعد"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
            </nav>
          )}
        </>
      )}

      <footer className="home-footer">
        <a href="https://blankuapp.github.io/PersianCrossword/privacy.html" target="_blank" rel="noopener">سیاست حریم خصوصی</a>
        <a
          className="home-repo-link"
          href="https://github.com/BlankuApp/PersianCrossword"
          target="_blank"
          rel="noreferrer"
          aria-label="مشاهده مخزن گیت‌هاب پروژه"
        >
          <GitHubIcon width={22} height={22} />
        </a>
      </footer>
    </main>
  );
}

function PuzzleRow({
  puzzle,
  progress,
  onClick,
}: {
  puzzle: PuzzleSummary;
  progress: ProgressInfo | undefined;
  onClick: () => void;
}) {
  const pct = progress?.percent ?? 0;
  const done = progress?.completed ?? false;
  const hasError = Boolean(puzzle.error);

  return (
    <tr
      className={`puzzle-row${done ? " puzzle-row-done" : ""}${hasError ? " puzzle-row-error" : ""}`}
      onClick={onClick}
      tabIndex={0}
      role="button"
      aria-label={`باز کردن جدول ${puzzle.title} با شناسه ${puzzle.id}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <td className="td-id">{puzzle.id}</td>
      <td className="td-title">
        <span className="puzzle-title">{puzzle.title}</span>
      </td>
      <td className="td-difficulty">
        <DifficultyBadge difficulty={puzzle.difficulty} />
      </td>
      <td className="td-newspaper">{puzzle.newspaper || "—"}</td>
      <td className="td-date">{formatDate(puzzle.publishedAt)}</td>
      <td className="td-progress">
        {hasError ? (
          <span className="badge badge-error" title={puzzle.error}>خطا در داده</span>
        ) : done ? (
          <span className="badge badge-done">تکمیل شد</span>
        ) : pct > 0 ? (
          <ProgressBar percent={pct} />
        ) : (
          <span className="progress-empty">شروع نشده</span>
        )}
      </td>
    </tr>
  );
}
