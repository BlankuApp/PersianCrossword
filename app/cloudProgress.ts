import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { SavedCrosswordState } from "../src/index";
import { loadProgress, saveProgress, computeProgress, STORAGE_PREFIX } from "./progress";
import { getPuzzleById } from "./puzzleLibrary";

export async function saveCloudProgress(
  uid: string,
  puzzleId: string,
  state: SavedCrosswordState,
): Promise<void> {
  await setDoc(doc(db, "users", uid, "puzzles", puzzleId), { cells: state.cells });
}

export async function loadAllCloudProgress(uid: string): Promise<Record<string, SavedCrosswordState>> {
  const snap = await getDocs(collection(db, "users", uid, "puzzles"));
  return Object.fromEntries(
    snap.docs.map((d) => [d.id, { cells: (d.data().cells ?? {}) as Record<string, string> }]),
  );
}

// Falls back to 0 if the puzzle is missing from the bundled library
// (e.g. removed from /puzzles after progress was saved).
function percentComplete(puzzleId: string, state: SavedCrosswordState): number {
  const summary = getPuzzleById(puzzleId);
  if (!summary) return 0;
  return computeProgress(summary.json, state).percent;
}

export async function syncProgress(uid: string): Promise<void> {
  const cloudData = await loadAllCloudProgress(uid);

  // Collect all local puzzle IDs
  const localKeys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    .filter((k): k is string => !!k?.startsWith(STORAGE_PREFIX))
    .map((k) => k.slice(STORAGE_PREFIX.length));

  // Batched into one network round trip instead of one setDoc per puzzle —
  // with many locally-saved puzzles, individual writes added up to "many many" Firebase calls.
  const batch = writeBatch(db);
  let hasUploads = false;

  // Not atomic with SolverPage's own save-on-keystroke effect, which can call
  // saveCloudProgress for the puzzle currently open in the UI at any moment,
  // including mid-sync. Pre-existing race with no version field to resolve it;
  // out of scope here, this only fixes which side is treated as more complete.
  for (const puzzleId of localKeys) {
    if (puzzleId in cloudData) {
      const cloudState = cloudData[puzzleId]!;
      const localState = loadProgress(puzzleId);
      const localPercent = percentComplete(puzzleId, localState);
      const cloudPercent = percentComplete(puzzleId, cloudState);

      if (localPercent >= cloudPercent) {
        // Local is at least as complete: push it up to the cloud so both sides match.
        batch.set(doc(db, "users", uid, "puzzles", puzzleId), { cells: localState.cells });
        hasUploads = true;
      } else {
        // Cloud is more complete: pull it down to local so both sides match.
        saveProgress(puzzleId, cloudState);
      }
    } else {
      // Local-only: upload to cloud
      batch.set(doc(db, "users", uid, "puzzles", puzzleId), { cells: loadProgress(puzzleId).cells });
      hasUploads = true;
    }
  }

  // Also download cloud puzzles not in local (other devices' progress)
  for (const puzzleId of Object.keys(cloudData)) {
    if (!localKeys.includes(puzzleId)) {
      saveProgress(puzzleId, cloudData[puzzleId]);
    }
  }

  if (hasUploads) await batch.commit();
}
