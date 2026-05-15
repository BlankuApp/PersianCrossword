import { useEffect, useMemo, useState } from "react";
import { listPuzzles, type PuzzleSummary } from "../puzzleLibrary";
import { loadProgress, computeProgress, type ProgressInfo } from "../progress";
import { navigate } from "../router";

type SortKey = "id" | "title" | "difficulty" | "author" | "newspaper" | "publishedAt" | "progress";
type SortDir = "asc" | "desc";

const ITEMS_PER_PAGE = 25;

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

function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.57.1.78-.25.78-.55v-2.14c-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.72-1.53-2.55-.29-5.24-1.27-5.24-5.67 0-1.25.45-2.27 1.18-3.07-.12-.29-.5-1.45.11-3.02 0 0 .96-.31 3.15 1.17A10.93 10.93 0 0 1 12 6.04c.97 0 1.95.13 2.86.38 2.18-1.48 3.14-1.17 3.14-1.17.62 1.57.24 2.73.12 3.02.74.8 1.18 1.82 1.18 3.07 0 4.41-2.7 5.38-5.27 5.67.41.36.77 1.06.77 2.14v3.17c0 .3.2.66.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function HomePage() {
  const puzzles = useMemo(() => listPuzzles(), []);
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressInfo>>({});

  // Load progress for all puzzles once on mount
  useEffect(() => {
    const map: Record<string, ProgressInfo> = {};
    for (const p of puzzles) {
      const saved = loadProgress(p.id);
      map[p.id] = computeProgress(p.json, saved);
    }
    setProgressMap(map);
  }, [puzzles]);

  function handleSort(key: SortKey): void {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "publishedAt" ? "desc" : "asc");
    }
    setCurrentPage(1);
  }

  const sorted = useMemo(() => {
    return [...puzzles].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = a.id.localeCompare(b.id, "fa", { numeric: true });
          break;
        case "title":
          cmp = a.title.localeCompare(b.title, "fa", { numeric: true });
          break;
        case "difficulty":
          cmp = (a.difficulty ?? "").localeCompare(b.difficulty ?? "", "fa");
          break;
        case "author":
          cmp = a.author.localeCompare(b.author, "fa");
          break;
        case "newspaper":
          cmp = a.newspaper.localeCompare(b.newspaper, "fa");
          break;
        case "publishedAt":
          cmp = a.publishedAt.localeCompare(b.publishedAt);
          break;
        case "progress":
          cmp = (progressMap[a.id]?.percent ?? 0) - (progressMap[b.id]?.percent ?? 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [puzzles, sortKey, sortDir, progressMap]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sorted.slice(start, start + ITEMS_PER_PAGE);
  }, [sorted, currentPage]);

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  function SortHeader({
    colKey,
    children,
  }: {
    colKey: SortKey;
    children: React.ReactNode;
  }) {
    const active = sortKey === colKey;
    const indicator = active ? (sortDir === "asc" ? " ▲" : " ▼") : "";
    return (
      <th
        className={`th-sortable${active ? " th-active" : ""}`}
        onClick={() => handleSort(colKey)}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {children}
        {indicator && <span className="sort-indicator" aria-hidden="true">{indicator}</span>}
      </th>
    );
  }

  return (
    <main className="app-shell home-shell" dir="rtl">
      <header className="home-header">
        <div>
          <h1>جدول کلمات فارسی</h1>
        </div>
        <a
          className="home-repo-link"
          href="https://github.com/BlankuApp/PersianCrossword"
          target="_blank"
          rel="noreferrer"
          aria-label="مشاهده مخزن گیت‌هاب پروژه"
        >
          <GitHubIcon width={30} height={30} />
        </a>
      </header>

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
          <div className="puzzle-table-wrapper">
            <table className="puzzle-table" aria-label="فهرست جدول‌ها">
              <thead>
                <tr>
                  <SortHeader colKey="id">شناسه</SortHeader>
                  <SortHeader colKey="title">عنوان</SortHeader>
                  <SortHeader colKey="difficulty">سطح</SortHeader>
                  <SortHeader colKey="newspaper">روزنامه</SortHeader>
                  <SortHeader colKey="publishedAt">تاریخ</SortHeader>
                  <SortHeader colKey="progress">پیشرفت</SortHeader>
                </tr>
              </thead>
              <tbody>
                {paginated.map((puzzle) => {
                  const progress = progressMap[puzzle.id];
                  return (
                    <PuzzleRow
                      key={puzzle.id}
                      puzzle={puzzle}
                      progress={progress}
                      onClick={() => navigate(`#/puzzle/${puzzle.id}`)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <nav className="pagination" aria-label="صفحه‌بندی جدول‌ها">
              <button
                type="button"
                className="pagination-button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                قبلی
              </button>

              <div className="pagination-pages" aria-label={`صفحه ${currentPage} از ${pageCount}`}>
                {Array.from({ length: pageCount }, (_, index) => {
                  const page = index + 1;
                  return (
                    <button
                      key={page}
                      type="button"
                      className={`pagination-button pagination-page${page === currentPage ? " is-active" : ""}`}
                      onClick={() => setCurrentPage(page)}
                      aria-current={page === currentPage ? "page" : undefined}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="pagination-button"
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                disabled={currentPage === pageCount}
              >
                بعدی
              </button>
            </nav>
          )}
        </>
      )}
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

  return (
    <tr
      className={`puzzle-row${done ? " puzzle-row-done" : ""}`}
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
        {puzzle.difficulty?.trim() || "—"}
      </td>
      <td className="td-newspaper">{puzzle.newspaper || "—"}</td>
      <td className="td-date">{formatDate(puzzle.publishedAt)}</td>
      <td className="td-progress">
        {done ? (
          <span className="badge badge-done">تکمیل شد</span>
        ) : pct > 0 ? (
          <div className="progress-bar-wrap" title={`${pct}٪`}>
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            <span className="progress-pct">{pct}٪</span>
          </div>
        ) : (
          <span className="progress-empty">شروع نشده</span>
        )}
      </td>
    </tr>
  );
}
