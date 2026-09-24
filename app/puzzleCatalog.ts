// What the app knows about the cloud puzzle catalog (written by scripts/uploadPuzzles.ts) and
// the puzzles it downloaded from it. Pure logic; app/puzzleSync.ts does the network and
// app/puzzleStore.ts the device storage.
import type { CrosswordJson } from "../src/index";

export interface RemoteCatalog {
  // id → content hash of the published version.
  readonly puzzles: Readonly<Record<string, string>>;
  // Unpublished ids: hidden even when the app was built with them.
  readonly removed: readonly string[];
}

export interface DownloadedPuzzle {
  readonly hash: string;
  readonly json: CrosswordJson;
  // Full image URLs.
  readonly solutionImageUrl?: string | undefined;
  readonly sourceImageUrl?: string | undefined;
}

export interface StoredCatalog {
  // The last catalog this device fetched; null until the first successful check.
  readonly catalog: RemoteCatalog | null;
  // Only puzzles that differ from (or are missing in) the app's built-in copy.
  readonly downloaded: Readonly<Record<string, DownloadedPuzzle>>;
}

export const EMPTY_STORED_CATALOG: StoredCatalog = { catalog: null, downloaded: {} };

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === "string");

// Validates catalog/index; anything unexpected (a newer schema, a broken write) is ignored.
export function parseRemoteCatalog(data: unknown): RemoteCatalog | null {
  const d = data as { schema?: unknown; puzzles?: unknown; removed?: unknown } | null | undefined;
  if (d?.schema !== 1 || !isStringRecord(d.puzzles)) return null;
  const removed = Array.isArray(d.removed) ? d.removed.filter((id): id is string => typeof id === "string") : [];
  return { puzzles: d.puzzles, removed };
}

export interface SyncPlan {
  // Ids whose published version this device doesn't have yet.
  readonly fetch: readonly string[];
  // Downloads still current; everything else is dropped.
  readonly keep: Readonly<Record<string, DownloadedPuzzle>>;
}

export function planSync(
  builtinHashes: Readonly<Record<string, string>>,
  downloaded: Readonly<Record<string, DownloadedPuzzle>>,
  remote: RemoteCatalog,
): SyncPlan {
  const fetch: string[] = [];
  const keep: Record<string, DownloadedPuzzle> = {};
  for (const [id, hash] of Object.entries(remote.puzzles)) {
    if (builtinHashes[id] === hash) continue; // the app already ships this exact version
    const have = downloaded[id];
    if (have?.hash === hash) keep[id] = have;
    else fetch.push(id);
  }
  return { fetch, keep };
}

export interface CatalogPuzzle<B> {
  readonly id: string;
  // Set when the device's download replaces (or adds to) the built-in puzzles.
  readonly downloaded?: DownloadedPuzzle | undefined;
  readonly builtin?: B | undefined;
}

// Built-in puzzles, minus unpublished ones, with downloaded versions swapped in. A built-in
// copy that already matches the catalog wins over an older download (after an app update).
export function composeCatalog<B extends { readonly id: string; readonly hash: string }>(
  builtins: readonly B[],
  stored: StoredCatalog,
): CatalogPuzzle<B>[] {
  const removed = new Set(stored.catalog?.removed ?? []);
  const published = stored.catalog?.puzzles ?? {};
  const result: CatalogPuzzle<B>[] = [];
  const seen = new Set<string>();
  for (const builtin of builtins) {
    seen.add(builtin.id);
    if (removed.has(builtin.id)) continue;
    const download = stored.downloaded[builtin.id];
    const useDownload = download && published[builtin.id] !== builtin.hash;
    result.push({ id: builtin.id, builtin, downloaded: useDownload ? download : undefined });
  }
  for (const [id, download] of Object.entries(stored.downloaded)) {
    if (!seen.has(id) && !removed.has(id)) result.push({ id, downloaded: download });
  }
  return result;
}
