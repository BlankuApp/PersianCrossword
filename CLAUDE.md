# CLAUDE.md

## Commands

```bash
npm run dev          # Vite dev server → http://127.0.0.1:5173
npm run build        # Build lib (dist/) + app (app-dist/)
npm run test         # Vitest unit tests
npm run typecheck    # Type-check both tsconfig.json and tsconfig.app.json
npm run puzzles:upload -- --dry-run   # Publish puzzles/ to Firebase (see "Puzzles in Firebase")
npm run puzzles:download              # Backup / fresh copy of every published puzzle into puzzles/
```

### Firebase Functions (AI proxy)

```bash
npm --prefix functions test                         # quota + Gemini client unit tests
npm --prefix functions run build                    # tsc → functions/lib
npx firebase-tools emulators:start --only functions,firestore   # needs functions/.secret.local (Java 21)
VITE_FUNCTIONS_EMULATOR=1 npm run dev               # app → local askAi emulator
npx firebase-tools functions:secrets:set GEMINI_KEY # owner's free-tier key (separate GCP project, no billing)
npx firebase-tools deploy --only functions          # manual deploy; requires Blaze plan
```

## Architecture

```
src/          Core TS library (grid, puzzle, state, text, validation, types)
app/          React SPA (Vite): auth, routing, solver UI, puzzle library
test/         Vitest tests for the core library
functions/    Firebase Functions: askAi — Gemini proxy with per-user daily quota (Firestore aiUsage/{uid})
puzzles/      Local working copy of the puzzles (gitignored; Firebase is the source): batches 1-50, 51-100, …
scripts/      Node scripts (run with plain `node`, which strips TS types): puzzle upload/download
dist/         TS library build output (tsc)
app-dist/     Vite app build output → deployed to GitHub Pages
```

Two separate tsconfigs: `tsconfig.json` builds the library (`dist/`), `tsconfig.app.json`
is for the React app. Both are checked by `npm run typecheck`.

Both tsconfigs set `exactOptionalPropertyTypes: true`: an optional prop/field typed `foo?: T`
rejects an explicitly-passed `undefined` value — write `foo?: T | undefined` when the value
(not just the key) can be `undefined`.

## Puzzle Format

Puzzles are `CrosswordJson` (version 3) JSON files, edited locally under `puzzles/` and published to Firebase.
- **Slot IDs**: `R{row}-{n}` for horizontal, `C{col}-{n}` for vertical.
- **Vertical column numbering**: 1-based *from the right* (RTL convention).
- Each puzzle folder can have a matching `{id}.png` (solution image) and an optional
  source image referenced via `meta.sourceFile`.
- `meta.id` must be set; if missing, the filename slug is used and progress breaks on rename.
- Never compare/count Persian text with raw JS strings — use `normalizePersianText` /
  `splitPersianGraphemes` (`src/text.ts`). They fold Arabic look-alike letters (ي→ی, ك→گ) and
  strip diacritics/tatweel; a cell always holds exactly one grapheme, not one JS char.

## Firebase

Project: `persiancrossword` (Firebase console).
Progress sync (`app/cloudProgress.ts`):
- `users/{uid}/meta/scoreboard` — `{ schema: 1, puzzles: { [id]: { v, status, percent, playedAt, solvedAt? } } }`,
  read once per sync; `users/{uid}/progress/{puzzleId}` — `{ cells, v }`, fetched only when its `v` changed.
  Uploads are transactions that bump `v` in both. Clashes merge letters (newer `playedAt` wins a square).
- Device: letters in `localStorage` `persian-crossword:{id}`; per-puzzle status/version/dirty flag in
  `persian-crossword-sync` (the "mirror", `app/progress.ts`). Edits mark the mirror dirty; the push happens later.
- `users/{uid}/puzzles/{id}` is the pre-scoreboard layout: imported once when no scoreboard exists, then
  left as a backup. Old app builds still write there only.

Security rules live in `firestore.rules` (owner-only `users/{uid}/**`, public read of `catalog/*` and
`puzzlePacks/*`, everything else denied) and `storage.rules` (public read of `puzzles/**`):
`npx firebase-tools deploy --only firestore:rules,storage`. `VITE_FUNCTIONS_EMULATOR=1` also points Firestore
and Storage at the local emulators (ports 8080, 9199).

## Puzzles in Firebase

Firebase is the only source of puzzles: the repo and the app bundle hold none. `puzzles/` (and
`raw_data/`, original scans) are local, gitignored working copies.
- `scripts/uploadPuzzles.ts` publishes the folder; layout in `scripts/firebaseAdmin.ts`: `catalog/index`
  lists packs `{ [packId]: { hash, puzzles: { [id]: hash } } }`; `puzzlePacks/{packId}` holds up to 50
  puzzles as JSON text (Firestore rejects nested arrays) with their file path; images live in Storage at
  `puzzles/{id}/{imageHash}.{ext}`. A puzzle keeps its pack for life (`scripts/puzzlePacks.ts`), so an
  edit rewrites one pack. Published puzzles missing locally stay unless `--prune`.
  Needs `GOOGLE_APPLICATION_CREDENTIALS` (service account) or `FIRESTORE_EMULATOR_HOST` +
  `FIREBASE_STORAGE_EMULATOR_HOST`. `scripts/downloadPuzzles.ts` restores the same layout.
- The puzzle hash (`scripts/puzzleFiles.ts`) covers the parsed JSON and image bytes.
- `app/puzzleSync.ts` reads `catalog/index` (one read per check: startup, back online, foreground after
  30 min) and fetches only packs whose hash changed (all ~6 on a new device). Packs live in IndexedDB
  (`app/puzzleStore.ts`); `usePuzzleLibrary()` exposes the list plus a `sync` state for the home page's
  loading/offline messages.
- `npm run dev` lists the local `puzzles/` folder instead (`/dev/local-puzzles` in `vite.config.ts`), so
  debug mode can edit and save files; set `VITE_PUZZLE_SYNC=1` (with `VITE_FUNCTIONS_EMULATOR=1` for the
  emulators) to use the Firebase path. Tests use `test/puzzle-folder/`.

## Deploy

Merges to `main` auto-deploy to GitHub Pages via `.github/workflows/`.
Build output uploaded: `app-dist/`.

## Android (Capacitor)

```bash
npm run build           # writes app-dist/, which capacitor.config.ts uses as webDir
npx cap sync android    # copy app-dist/ + plugin config into android/
```
Release builds are signed via `android/keystore.properties` (gitignored, not in repo — release
builds are unsigned without it locally). Output APKs are named
`persian-crossword-${version}-${buildType}.apk` (`android/app/build.gradle`).
