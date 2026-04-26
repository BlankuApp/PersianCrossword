import { useEffect, useMemo, useState } from "react";
import { listPuzzles, type PuzzleSummary } from "../puzzleLibrary";
import { loadProgress, computeProgress, type ProgressInfo } from "../progress";
import { navigate } from "../router";

type SortKey = "id" | "title" | "difficulty" | "author" | "newspaper" | "publishedAt" | "progress";
type SortDir = "asc" | "desc";

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

export function HomePage() {
  const puzzles = useMemo(() => listPuzzles(), []);
  const [sortKey, setSortKey] = useState<SortKey>("publishedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
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
  }

  const sorted = useMemo(() => {
    return [...puzzles].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = a.id.localeCompare(b.id, "fa");
          break;
        case "title":
          cmp = a.title.localeCompare(b.title, "fa");
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
        <h1>جدول کلمات فارسی</h1>
        <p>جدولی را انتخاب کنید و شروع به حل کنید.</p>
      </header>

      {puzzles.length === 0 ? (
        <div className="empty-state">
          <p>هیچ جدولی یافت نشد.</p>
          <p className="empty-hint">
            فایل‌های JSON جدول را در پوشه{" "}
            <code>puzzles/</code>{" "}
            قرار دهید.
          </p>
        </div>
      ) : (
        <div className="puzzle-table-wrapper">
          <table className="puzzle-table" aria-label="فهرست جدول‌ها">
            <thead>
              <tr>
                <SortHeader colKey="id">شناسه</SortHeader>
                <SortHeader colKey="title">عنوان</SortHeader>
                <SortHeader colKey="difficulty">سطح</SortHeader>
                <SortHeader colKey="author">نویسنده</SortHeader>
                <SortHeader colKey="newspaper">روزنامه</SortHeader>
                <SortHeader colKey="publishedAt">تاریخ</SortHeader>
                <SortHeader colKey="progress">پیشرفت</SortHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((puzzle) => {
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
      <td className="td-author">{puzzle.author || "—"}</td>
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
