import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
import type { CrosswordJson } from "../src/index";
import { db, logAnalyticsEvent, storageFileUrl } from "./firebase";
import {
  EMPTY_STORED_CATALOG,
  parseRemoteCatalog,
  planSync,
  sameStoredCatalog,
  type DownloadedPuzzle,
  type StoredCatalog,
  type StoredPack,
} from "./puzzleCatalog";
import {
  listPuzzles,
  markPuzzleLibraryReady,
  setPuzzleSources,
  setPuzzleSyncState,
  setStoredCatalog,
  type PuzzleSource,
} from "./puzzleLibrary";
import { readStoredCatalog, writeStoredCatalog } from "./puzzleStore";

// Cloud layout: scripts/firebaseAdmin.ts. A check reads catalog/index (one read), then
// downloads only the packs whose hash changed — all of them (a handful) on a new device.

// Firestore allows at most 30 values in an "in" filter.
const IN_LIMIT = 30;
// Re-check at most this often when the app comes back to the foreground.
const RECHECK_MS = 30 * 60 * 1000;
// With puzzles already on the device, a link to an unknown one waits this long for the first
// check before going home. With none, the app waits for the check to finish.
const FIRST_CHECK_WAIT_MS = 8000;

interface PackEntryDoc {
  readonly hash?: unknown;
  readonly json?: unknown;
  readonly images?: { readonly solution?: unknown; readonly source?: unknown };
}

const imageUrl = (path: unknown): string | undefined =>
  typeof path === "string" && path ? storageFileUrl(path) : undefined;

function toDownloadedPuzzle(entry: PackEntryDoc): DownloadedPuzzle | undefined {
  if (typeof entry.hash !== "string" || typeof entry.json !== "string") return undefined;
  let json: CrosswordJson;
  try {
    json = JSON.parse(entry.json) as CrosswordJson;
  } catch {
    return undefined;
  }
  if (typeof json !== "object" || json === null || !Array.isArray(json.grid)) return undefined;
  return {
    hash: entry.hash,
    json,
    solutionImageUrl: imageUrl(entry.images?.solution),
    sourceImageUrl: imageUrl(entry.images?.source),
  };
}

// Undefined when the document doesn't hold the catalog's version (e.g. read mid-upload); the
// next check tries again.
export function toStoredPack(data: unknown, expectedHash: string): StoredPack | undefined {
  const d = data as { schema?: unknown; hash?: unknown; puzzles?: unknown } | undefined;
  if (d?.schema !== 2 || d.hash !== expectedHash || typeof d.puzzles !== "object" || d.puzzles === null) return undefined;
  const puzzles: Record<string, DownloadedPuzzle> = {};
  for (const [id, entry] of Object.entries(d.puzzles as Record<string, PackEntryDoc>)) {
    const puzzle = toDownloadedPuzzle(entry);
    if (puzzle) puzzles[id] = puzzle;
    else console.warn(`[puzzleSync] skipping unreadable puzzle ${id}`);
  }
  return { hash: expectedHash, puzzles };
}

async function fetchPacks(ids: readonly string[], hashes: Readonly<Record<string, string>>): Promise<Record<string, StoredPack>> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_LIMIT) chunks.push(ids.slice(i, i + IN_LIMIT));
  const snaps = await Promise.all(
    chunks.map((chunk) => getDocs(query(collection(db, "puzzlePacks"), where(documentId(), "in", chunk)))),
  );
  const result: Record<string, StoredPack> = {};
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const pack = toStoredPack(d.data(), hashes[d.id] ?? "");
      if (pack) result[d.id] = pack;
    }
  }
  return result;
}

let _stored: StoredCatalog = EMPTY_STORED_CATALOG;

// Returns true when the device's puzzles changed.
export async function syncPuzzleCatalog(): Promise<boolean> {
  const snap = await getDoc(doc(db, "catalog", "index"));
  const remote = snap.exists() ? parseRemoteCatalog(snap.data()) : null;
  if (!remote) throw Object.assign(new Error("No puzzle catalog published"), { code: "no-catalog" });

  const { fetch, keep } = planSync(_stored, remote);
  const fetched = fetch.length ? await fetchPacks(fetch, remote.packs) : {};
  // A pack that couldn't be read in its new version (mid-upload) keeps its old copy until next time.
  const stale = Object.fromEntries(fetch.filter((id) => !fetched[id] && _stored.packs[id]).map((id) => [id, _stored.packs[id]!]));
  const next: StoredCatalog = { packs: { ...stale, ...keep, ...fetched } };
  if (sameStoredCatalog(_stored, next)) return false;
  // Another tab may sync at the same time; both write the same catalog, the last one wins.
  await writeStoredCatalog(next);
  _stored = next;
  setStoredCatalog(next);
  return true;
}

let _running: Promise<void> | null = null;
let _lastCheck = 0;

function check(): Promise<void> {
  _running ??= (async () => {
    setPuzzleSyncState("checking");
    try {
      await syncPuzzleCatalog();
      _lastCheck = Date.now();
      setPuzzleSyncState("ok");
    } catch (error) {
      const code = String((error as { code?: unknown } | null)?.code ?? "unknown");
      const offline = code === "unavailable" || !navigator.onLine;
      setPuzzleSyncState(offline ? "offline" : "error");
      if (!offline) {
        console.warn("[puzzleSync] check failed", error);
        logAnalyticsEvent("puzzle_sync_error", { code });
      }
    } finally {
      _running = null;
    }
  })();
  return _running;
}

// For the home page's "try again" button.
export function retryPuzzleSync(): void {
  void check();
}

interface LocalPuzzle {
  readonly slug: string;
  readonly hash: string;
  readonly filePath: string;
  readonly json: CrosswordJson;
  readonly solutionImageUrl?: string;
  readonly sourceImageUrl?: string;
}

// `npm run dev`: the local puzzles/ folder (served by vite.config.ts), editable in debug mode.
async function loadLocalPuzzles(): Promise<void> {
  try {
    const res = await fetch("/dev/local-puzzles");
    const list = (await res.json()) as LocalPuzzle[];
    setPuzzleSources(list satisfies readonly PuzzleSource[]);
    setPuzzleSyncState("ok");
  } catch (error) {
    console.error("[puzzleSync] could not load local puzzles", error);
    setPuzzleSyncState("error");
  }
  markPuzzleLibraryReady();
}

// Loads this device's puzzles, then checks for new ones now, whenever the device comes back
// online, and when the app returns to the foreground after a while.
export async function startPuzzleSync(): Promise<void> {
  // The dev server edits local files in place (debug mode); VITE_PUZZLE_SYNC=1 tests the cloud path.
  if (import.meta.env.DEV && !import.meta.env.VITE_PUZZLE_SYNC) {
    await loadLocalPuzzles();
    return;
  }
  _stored = await readStoredCatalog();
  setStoredCatalog(_stored);
  window.addEventListener("online", () => void check());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - _lastCheck > RECHECK_MS) void check();
  });
  const first = check();
  if (listPuzzles().length) {
    await Promise.race([first, new Promise((resolve) => setTimeout(resolve, FIRST_CHECK_WAIT_MS))]);
  } else {
    await first;
  }
  markPuzzleLibraryReady();
}
