// Admin SDK access for the puzzle scripts. Cloud layout: shared/cloudPuzzles.ts.
//
// Credentials: GOOGLE_APPLICATION_CREDENTIALS=<service-account.json>, or the emulator variables
// (FIRESTORE_EMULATOR_HOST, FIREBASE_STORAGE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST).
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { resolve } from "node:path";

export function initAdmin() {
  const app = initializeApp({
    projectId: "persiancrossword",
    storageBucket: "persiancrossword.firebasestorage.app",
    ...(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST ? {} : { credential: applicationDefault() }),
  });
  return { db: getFirestore(app), bucket: getStorage(app).bucket(), auth: getAuth(app) };
}

// Minimal flag parsing: `--name` booleans and `--dir <path>`.
export function parseArgs(argv: readonly string[]): { flags: Set<string>; dir: string } {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const dirIndex = argv.indexOf("--dir");
  const dir = dirIndex >= 0 && argv[dirIndex + 1] ? argv[dirIndex + 1]! : "puzzles";
  return { flags, dir: resolve(process.cwd(), dir) };
}

export const listIds = (ids: readonly string[]): string =>
  ids.length > 20 ? `${ids.slice(0, 20).join(", ")}, … (+${ids.length - 20} more)` : ids.join(", ");
