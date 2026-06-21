import {
  collection,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { SavedCrosswordState } from "../src/index";
import { loadProgress, saveProgress, computeProgress } from "./progress";
import { getPuzzleById } from "./puzzleLibrary";

const STORAGE_PREFIX = "persian-crossword:";

export async function saveCloudProgress(
  uid: string,
  puzzleId: string,
  state: SavedCrosswordState,
): Promise<void> {
  await setDoc(doc(db, "users", uid, "puzzles", puzzleId), { cells: state.cells });
}

export async function loadAllCloudProgress(uid: string): Promise<Record<string, SavedCrosswordState>> {
  const snap = await getDocs(collection(db, "users", uid, "puzzles"));
  const result: Record<string, SavedCrosswordState> = {};
  snap.forEach((d) => {
    result[d.id] = { cells: (d.data().cells ?? {}) as Record<string, string> };
  });
  return result;
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
  const localKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      localKeys.push(key.slice(STORAGE_PREFIX.length));
    }
  }

  const uploads: Promise<void>[] = [];

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
        uploads.push(saveCloudProgress(uid, puzzleId, localState));
      } else {
        // Cloud is more complete: pull it down to local so both sides match.
        saveProgress(puzzleId, cloudState);
      }
    } else {
      // Local-only: upload to cloud
      uploads.push(saveCloudProgress(uid, puzzleId, loadProgress(puzzleId)));
    }
  }

  // Also download cloud puzzles not in local (other devices' progress)
  for (const puzzleId of Object.keys(cloudData)) {
    if (!localKeys.includes(puzzleId)) {
      saveProgress(puzzleId, cloudData[puzzleId]);
    }
  }

  await Promise.all(uploads);
}
