import { normalizePersianText } from "../src/index";
import type { ProgressInfo } from "./progress";
import type { PuzzleSummary } from "./puzzleLibrary";

export type SortKey = "new" | "old" | "progress";
export type LevelFilter = "" | "normal" | "special";
export type StatusFilter = "" | "new" | "progress" | "done";

// Home list view state; lives in the URL hash (#/?page=2&level=special) so Back, refresh
// and shared links keep it.
export interface ListQuery {
  readonly page: number;
  readonly sort: SortKey;
  readonly q: string;
  readonly level: LevelFilter;
  readonly status: StatusFilter;
  readonly paper: string;
}

export const DEFAULT_LIST_QUERY: ListQuery = { page: 1, sort: "new", q: "", level: "", status: "", paper: "" };

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseListQuery(hash: string): ListQuery {
  const params = new URLSearchParams(hash.split("?")[1] ?? "");
  const page = Number.parseInt(params.get("page") ?? "", 10);
  return {
    page: page > 0 ? page : 1,
    sort: pick<SortKey>(params.get("sort"), ["new", "old", "progress"], "new"),
    q: params.get("q") ?? "",
    level: pick<LevelFilter>(params.get("level"), ["normal", "special"], ""),
    status: pick<StatusFilter>(params.get("status"), ["new", "progress", "done"], ""),
    paper: params.get("paper") ?? "",
  };
}

// Only non-default values go in the URL, so the unfiltered first page stays plain "#/".
export function listQueryToParams(query: ListQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_LIST_QUERY) as (keyof ListQuery)[]) {
    if (query[key] !== DEFAULT_LIST_QUERY[key]) params.set(key, String(query[key]));
  }
  return params;
}

export function isSpecialDifficulty(difficulty: string | undefined): boolean {
  const label = difficulty?.trim() ?? "";
  return label === "ویژه" || label.toLowerCase() === "special";
}

export function puzzleStatus(progress: ProgressInfo | undefined): Exclude<StatusFilter, ""> {
  if (progress?.completed) return "done";
  return (progress?.filled ?? 0) > 0 ? "progress" : "new";
}

// Fold Persian/Arabic-Indic digits to ASCII so typing "8036" or "۸۰۳۶" both find "جدول ۸۰۳۶".
function searchKey(value: string): string {
  return normalizePersianText(value)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .trim();
}

export function compareIds(a: PuzzleSummary, b: PuzzleSummary): number {
  return a.id.localeCompare(b.id, "fa", { numeric: true });
}

export function filterAndSortPuzzles(
  puzzles: readonly PuzzleSummary[],
  progressMap: Readonly<Record<string, ProgressInfo>>,
  query: ListQuery,
): PuzzleSummary[] {
  const needle = searchKey(query.q);
  const result = puzzles.filter((p) => {
    if (needle && !searchKey(`${p.id} ${p.title}`).includes(needle)) return false;
    if (query.level && isSpecialDifficulty(p.difficulty) !== (query.level === "special")) return false;
    if (query.status && puzzleStatus(progressMap[p.id]) !== query.status) return false;
    if (query.paper && p.newspaper !== query.paper) return false;
    return true;
  });
  const percent = (p: PuzzleSummary) => progressMap[p.id]?.percent ?? 0;
  return result.sort((a, b) => {
    if (query.sort === "old") return compareIds(a, b);
    if (query.sort === "progress") return percent(b) - percent(a) || compareIds(b, a);
    return compareIds(b, a);
  });
}

// Page buttons to show: first, last and the current page's neighbours; null marks a "…" gap.
export function pageItems(current: number, count: number): (number | null)[] {
  const items: (number | null)[] = [];
  let prev = 0;
  for (let page = 1; page <= count; page++) {
    if (page !== 1 && page !== count && Math.abs(page - current) > 1) continue;
    if (page - prev === 2) items.push(page - 1); // a lone hidden page is shorter than "…"
    else if (page - prev > 2) items.push(null);
    items.push(page);
    prev = page;
  }
  return items;
}
