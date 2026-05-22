import {
  collection,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { SavedCrosswordState } from "../src/index";
import { loadProgress, saveProgress } from "./progress";

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

  for (const puzzleId of localKeys) {
    if (puzzleId in cloudData) {
      // Cloud wins: overwrite local
      saveProgress(puzzleId, cloudData[puzzleId]);
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
