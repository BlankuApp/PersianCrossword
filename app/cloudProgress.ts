import { collection, doc, getDoc, getDocs, runTransaction } from "firebase/firestore";
import { db, logAnalyticsEvent } from "./firebase";
import {
  clearLocalProgress,
  computeProgress,
  countUnsent,
  loadMirror,
  loadProgress,
  localProgressIds,
  progressEntry,
  saveMirror,
  saveProgress,
  SYNC_KEY,
  type ProgressEntry,
  type ProgressInfo,
} from "./progress";
import { getPuzzleById } from "./puzzleLibrary";

// Cloud layout:
//   users/{uid}/meta/scoreboard  { schema: 1, puzzles: { [id]: CloudEntry } } — read once per sync
//   users/{uid}/progress/{id}    { cells, v } — downloaded only when its version changed
// Every upload bumps v in both docs inside one transaction, so a device knows exactly which
// puzzles changed elsewhere without downloading them.
type CloudEntry = Omit<ProgressEntry, "dirty">;
type Cells = Record<string, string>;

// Keeps each transaction well under Firestore's 500-writes-per-commit limit.
const CHUNK = 450;

const scoreboardRef = (uid: string) => doc(db, "users", uid, "meta", "scoreboard");
const progressRef = (uid: string, id: string) => doc(db, "users", uid, "progress", id);

function describe(id: string, cells: Cells): ProgressInfo {
  const puzzle = getPuzzleById(id);
  if (puzzle) return computeProgress(puzzle.json, { cells });
  return { status: Object.keys(cells).length ? "progress" : "new", percent: 0 };
}

// The same puzzle changed on two devices: keep every letter; where both typed the same
// square, the more recently played copy wins. A newer reset (no letters) wins outright.
export function mergeCells(local: Cells, localAt: number, cloud: Cells, cloudAt: number): Cells {
  const [older, newer] = localAt >= cloudAt ? [cloud, local] : [local, cloud];
  return Object.keys(newer).length ? { ...older, ...newer } : {};
}

function report(stage: string, error: unknown): never {
  const code = String((error as { code?: unknown } | null)?.code ?? "unknown");
  // "unavailable" is just being offline; the status line already covers it.
  if (code !== "unavailable") logAnalyticsEvent("sync_error", { stage, code });
  throw error;
}

export function isOfflineError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "unavailable" || !navigator.onLine;
}

// Downloads the puzzles whose cloud version is newer than this device's. Returns true when
// local letters changed.
async function pull(uid: string, board: Readonly<Record<string, CloudEntry>>): Promise<boolean> {
  const known = loadMirror().entries;
  const stale = Object.entries(board).filter(([id, cloud]) => cloud.v > (known[id]?.v ?? 0));
  if (!stale.length) return false;

  const snaps = await Promise.all(stale.map(([id]) => getDoc(progressRef(uid, id))));
  // Re-read: the player may have typed while the downloads were running.
  const mirror = loadMirror();
  const entries = { ...mirror.entries };
  stale.forEach(([id, cloud], i) => {
    const cells = (snaps[i]!.data()?.cells ?? {}) as Cells;
    const local = entries[id];
    if ((local?.v ?? 0) >= cloud.v) return; // a concurrent pull or push already caught up
    if (!local?.dirty) {
      saveProgress(id, { cells });
      entries[id] = { ...cloud, dirty: false };
      return;
    }
    const merged = mergeCells(loadProgress(id).cells, local.playedAt, cells, cloud.playedAt);
    saveProgress(id, { cells: merged });
    const playedAt = Math.max(local.playedAt, cloud.playedAt);
    entries[id] = progressEntry(describe(id, merged), cloud.v, true, playedAt, local.solvedAt ?? cloud.solvedAt);
  });
  saveMirror({ ...mirror, entries });
  return true;
}

// One-time move from the old layout (users/{uid}/puzzles/{id} = { cells }, no versions).
// Old letters are folded into local progress and uploaded by the push that follows.
async function importOldProgress(uid: string): Promise<boolean> {
  const old = await getDocs(collection(db, "users", uid, "puzzles"));
  const mirror = loadMirror();
  const entries = { ...mirror.entries };
  let changed = false;
  for (const snap of old.docs) {
    const cells = (snap.data().cells ?? {}) as Cells;
    // The old app saved an empty doc for every puzzle merely opened.
    if (!Object.keys(cells).length) continue;
    const local = entries[snap.id];
    const merged = local ? mergeCells(loadProgress(snap.id).cells, local.playedAt, cells, 0) : cells;
    saveProgress(snap.id, { cells: merged });
    entries[snap.id] = progressEntry(describe(snap.id, merged), 0, true, local?.playedAt ?? 0, local?.solvedAt);
    changed = true;
  }
  if (changed) saveMirror({ ...mirror, entries });
  return changed;
}

async function pushOnce(uid: string): Promise<boolean> {
  const ids = Object.entries(loadMirror().entries)
    .filter(([, entry]) => entry.dirty)
    .map(([id]) => id);
  let changed = false;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { sent, newer } = await runTransaction(db, async (tx) => {
      const snap = await tx.get(scoreboardRef(uid));
      const board: Record<string, CloudEntry> = { ...(snap.data()?.puzzles ?? {}) };
      // Letters and entries are read together, synchronously, so they match each other.
      const local = loadMirror().entries;
      const sent: Record<string, ProgressEntry> = {};
      const newer: Record<string, CloudEntry> = {};
      for (const id of chunk) {
        const entry = local[id];
        if (!entry?.dirty) continue;
        const cloud = board[id];
        if (cloud && cloud.v > entry.v) {
          newer[id] = cloud; // another device got there first: merge, then push next round
          continue;
        }
        const v = (cloud?.v ?? 0) + 1;
        const { dirty: _dirty, ...rest } = entry;
        board[id] = { ...rest, v };
        tx.set(progressRef(uid, id), { cells: loadProgress(id).cells, v });
        sent[id] = { ...entry, v };
      }
      // ponytail: rewrites the whole scoreboard (~80 bytes/puzzle); switch to per-field
      // updates if it ever nears Firestore's 1 MiB doc limit (~10k puzzles).
      if (Object.keys(sent).length) tx.set(scoreboardRef(uid), { schema: 1, puzzles: board });
      return { sent, newer };
    });

    const mirror = loadMirror();
    const entries = { ...mirror.entries };
    for (const [id, pushed] of Object.entries(sent)) {
      const now = entries[id];
      // Typed again during the upload? Stay dirty so the newer letters go up next.
      if (now) entries[id] = { ...now, v: pushed.v, dirty: now.playedAt !== pushed.playedAt };
    }
    saveMirror({ ...mirror, entries });
    if (Object.keys(newer).length) changed = (await pull(uid, newer)) || changed;
  }
  return changed;
}

async function pushRounds(uid: string): Promise<boolean> {
  let changed = false;
  try {
    // Repeats (a few times at most) for letters typed or merged during the previous round.
    for (let round = 0; round < 3 && countUnsent() > 0; round++) {
      changed = (await pushOnce(uid)) || changed;
    }
  } catch (error) {
    report("push", error);
  }
  return changed;
}

let pushing: Promise<boolean> | null = null;

// Uploads every puzzle changed on this device; concurrent callers share one run.
// Returns true when local letters changed (a clash was merged).
export function pushDirty(uid: string): Promise<boolean> {
  pushing ??= pushRounds(uid).finally(() => {
    pushing = null;
  });
  return pushing;
}

// Launch, sign-in, back in focus, back online: one scoreboard read, then only what changed.
// Returns true when local letters changed.
export async function syncProgress(uid: string): Promise<boolean> {
  let changed: boolean;
  try {
    const snap = await getDoc(scoreboardRef(uid));
    changed = snap.exists()
      ? await pull(uid, (snap.data().puzzles ?? {}) as Record<string, CloudEntry>)
      : await importOldProgress(uid);
  } catch (error) {
    return report("pull", error);
  }
  return (await pushDirty(uid)) || changed;
}

// Called before syncing a freshly signed-in user, so the mirror belongs to them.
export function claimDevice(uid: string, anonymous: boolean): void {
  const mirror = loadMirror();
  if (mirror.owner === uid) return;
  if (mirror.owner && !mirror.ownerAnonymous) {
    // Another real account's leftovers (normally cleared at sign-out) are never merged in.
    clearLocalProgress();
    saveMirror({ owner: uid, ownerAnonymous: anonymous, entries: {} });
    return;
  }
  // Signed-out or guest progress comes along into this account; as far as the account
  // knows it has never been uploaded, so it merges with the cloud like any clash.
  // Empty (reset) entries are dropped rather than allowed to wipe the account's copy.
  const entries: Record<string, ProgressEntry> = {};
  for (const [id, entry] of Object.entries(mirror.entries)) {
    if (entry.status !== "new") entries[id] = { ...entry, v: 0, dirty: true };
  }
  saveMirror({ owner: uid, ownerAnonymous: anonymous, entries });
}

// First launch of this version: build the mirror from letters already on the device.
// The old "recently opened" list seeds the play order of "continue solving".
export function upgradeLocalProgress(): void {
  if (window.localStorage.getItem(SYNC_KEY) !== null) return;
  let recent: unknown = [];
  try {
    recent = JSON.parse(window.localStorage.getItem("persian-crossword-recent") ?? "[]");
  } catch {
    // ignore a corrupt list
  }
  const order = Array.isArray(recent) ? recent : [];
  const now = Date.now();
  const entries: Record<string, ProgressEntry> = {};
  for (const id of localProgressIds()) {
    const { cells } = loadProgress(id);
    if (!Object.keys(cells).length) continue;
    const rank = order.indexOf(id);
    entries[id] = progressEntry(describe(id, cells), 0, true, rank === -1 ? 0 : now - rank);
  }
  saveMirror({ owner: null, ownerAnonymous: false, entries });
  window.localStorage.removeItem("persian-crossword-recent");
}
