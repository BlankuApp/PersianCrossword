// Admin SDK access for the puzzle scripts, plus the cloud layout they share with the app
// (app/puzzleSync.ts):
//
//   catalog/index      { schema: 2, packs: { [packId]: { hash, puzzles: { [id]: puzzleHash } } }, updatedAt }
//                      — the one document every app reads per check
//   puzzlePacks/{pack} { schema: 2, hash, puzzles: { [id]: PackEntry } }
//                      — up to PACK_SIZE puzzles; JSON is stored as text (Firestore can't hold nested arrays)
//   Storage puzzles/{id}/{imageHash}.{ext} — images; the name changes with the content
//
// Credentials: GOOGLE_APPLICATION_CREDENTIALS=<service-account.json>, or
// FIRESTORE_EMULATOR_HOST + FIREBASE_STORAGE_EMULATOR_HOST for the local emulators.
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { resolve } from "node:path";
import type { CatalogPack } from "./puzzlePacks.ts";

export interface PackEntry {
  readonly hash: string;
  // Path inside the puzzle folder ("1-50/14.json"), so a download restores the same layout.
  readonly file: string;
  readonly json: string;
  readonly images: { readonly solution?: string; readonly source?: string };
}

export interface CatalogDoc {
  readonly schema: 2;
  readonly packs: Record<string, CatalogPack>;
  readonly updatedAt: number;
}

export function initAdmin() {
  const app = initializeApp({
    projectId: "persiancrossword",
    storageBucket: "persiancrossword.firebasestorage.app",
    ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }),
  });
  return { db: getFirestore(app), bucket: getStorage(app).bucket() };
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
