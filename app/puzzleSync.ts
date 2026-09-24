import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
import type { CrosswordJson } from "../src/index";
import { db, logAnalyticsEvent, storageFileUrl } from "./firebase";
import { parseRemoteCatalog, planSync, type DownloadedPuzzle, type StoredCatalog } from "./puzzleCatalog";
import { builtinHashes, getStoredCatalog, markPuzzleLibraryReady, setStoredCatalog } from "./puzzleLibrary";
import { readStoredCatalog, writeStoredCatalog } from "./puzzleStore";

// Cloud layout (written by scripts/uploadPuzzles.ts):
//   catalog/index  { schema: 1, puzzles: { [id]: hash }, removed: [id] } — one read per check
//   puzzles/{id}   { schema: 1, hash, json: "<CrosswordJson text>", images: { solution?, source? } }
// A check reads the catalog, then downloads only the puzzles whose hash matches neither the
// app's built-in copy nor an earlier download.

// Firestore allows at most 30 values in an "in" filter.
const IN_LIMIT = 30;
// Re-check at most this often when the app comes back to the foreground.
const RECHECK_MS = 30 * 60 * 1000;
// How long a link to an unknown puzzle waits for the first check before going home.
const FIRST_CHECK_WAIT_MS = 8000;

interface PuzzleDoc {
  readonly schema?: unknown;
  readonly hash?: unknown;
  readonly json?: unknown;
  readonly images?: { readonly solution?: unknown; readonly source?: unknown };
}

const imageUrl = (path: unknown): string | undefined =>
  typeof path === "string" && path ? storageFileUrl(path) : undefined;

// Undefined when the document doesn't hold the expected version (e.g. read mid-upload); the
// next check tries again.
export function toDownloadedPuzzle(data: PuzzleDoc, expectedHash: string): DownloadedPuzzle | undefined {
  if (data.schema !== 1 || data.hash !== expectedHash || typeof data.json !== "string") return undefined;
  let json: CrosswordJson;
  try {
    json = JSON.parse(data.json) as CrosswordJson;
  } catch {
    return undefined;
  }
  if (typeof json !== "object" || json === null || !Array.isArray(json.grid)) return undefined;
  return {
    hash: expectedHash,
    json,
    solutionImageUrl: imageUrl(data.images?.solution),
    sourceImageUrl: imageUrl(data.images?.source),
  };
}

async function fetchPuzzles(ids: readonly string[], hashes: Readonly<Record<string, string>>): Promise<Record<string, DownloadedPuzzle>> {
  const result: Record<string, DownloadedPuzzle> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_LIMIT) chunks.push(ids.slice(i, i + IN_LIMIT));
  const snaps = await Promise.all(
    chunks.map((chunk) => getDocs(query(collection(db, "puzzles"), where(documentId(), "in", chunk)))),
  );
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const puzzle = toDownloadedPuzzle(d.data() as PuzzleDoc, hashes[d.id] ?? "");
      if (puzzle) result[d.id] = puzzle;
    }
  }
  return result;
}

const versions = (stored: StoredCatalog): string =>
  JSON.stringify([stored.catalog, Object.entries(stored.downloaded).map(([id, p]) => [id, p.hash]).sort()]);

function sameCatalog(a: StoredCatalog, b: StoredCatalog): boolean {
  return versions(a) === versions(b);
}

// Returns true when the device's puzzles changed.
export async function syncPuzzleCatalog(): Promise<boolean> {
  const snap = await getDoc(doc(db, "catalog", "index"));
  // Nothing published yet: the built-in puzzles are all there is.
  if (!snap.exists()) return false;
  const remote = parseRemoteCatalog(snap.data());
  if (!remote) return false;

  const before = getStoredCatalog();
  const { fetch, keep } = planSync(builtinHashes, before.downloaded, remote);
  const fetched = fetch.length ? await fetchPuzzles(fetch, remote.puzzles) : {};
  const next: StoredCatalog = { catalog: remote, downloaded: { ...keep, ...fetched } };

  if (sameCatalog(before, next)) return false;
  // Another tab may have synced meanwhile; the newest write wins, and both hold the same catalog.
  await writeStoredCatalog(next);
  setStoredCatalog(next);
  return true;
}

let _running: Promise<void> | null = null;
let _lastCheck = 0;

function check(): Promise<void> {
  _running ??= syncPuzzleCatalog()
    .then(() => {
      _lastCheck = Date.now();
    })
    .catch((error: unknown) => {
      const code = String((error as { code?: unknown } | null)?.code ?? "unknown");
      // "unavailable" is just being offline; the built-in and downloaded puzzles still work.
      if (code !== "unavailable") {
        console.warn("[puzzleSync] check failed", error);
        logAnalyticsEvent("puzzle_sync_error", { code });
      }
    })
    .finally(() => {
      _running = null;
    });
  return _running;
}

// Loads this device's downloaded puzzles, then checks for new ones now, whenever the device
// comes back online, and when the app returns to the foreground after a while.
export async function startPuzzleSync(): Promise<void> {
  setStoredCatalog(await readStoredCatalog());
  // The dev server edits puzzle files in place (debug mode); cloud copies would mask the edits.
  if (import.meta.env.DEV && !import.meta.env.VITE_PUZZLE_SYNC) {
    markPuzzleLibraryReady();
    return;
  }
  window.addEventListener("online", () => void check());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - _lastCheck > RECHECK_MS) void check();
  });
  await Promise.race([check(), new Promise((resolve) => setTimeout(resolve, FIRST_CHECK_WAIT_MS))]);
  markPuzzleLibraryReady();
}
