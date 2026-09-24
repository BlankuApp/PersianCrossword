# CLAUDE.md

## Commands

```bash
npm run dev          # Vite dev server → http://127.0.0.1:5173
npm run build        # Build lib (dist/) + app (app-dist/)
npm run test         # Vitest unit tests
npm run typecheck    # Type-check both tsconfig.json and tsconfig.app.json
npm run puzzles:upload -- --dry-run   # Publish new/changed puzzles to Firebase (see "Cloud puzzles")
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
puzzles/      Puzzle JSON files, grouped in batches (1-50, 51-100, 101-150, …)
scripts/      Node scripts (run with plain `node`, which strips TS types): puzzle fingerprints + uploader
dist/         TS library build output (tsc)
app-dist/     Vite app build output → deployed to GitHub Pages
```

Two separate tsconfigs: `tsconfig.json` builds the library (`dist/`), `tsconfig.app.json`
is for the React app. Both are checked by `npm run typecheck`.

Both tsconfigs set `exactOptionalPropertyTypes: true`: an optional prop/field typed `foo?: T`
rejects an explicitly-passed `undefined` value — write `foo?: T | undefined` when the value
(not just the key) can be `undefined`.

## Puzzle Format

Puzzles are `CrosswordJson` (version 3) JSON files under `puzzles/`.
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
`puzzles/*`, everything else denied) and `storage.rules` (public read of `puzzles/**`):
`npx firebase-tools deploy --only firestore:rules,storage`. `VITE_FUNCTIONS_EMULATOR=1` also points Firestore
and Storage at the local emulators (ports 8080, 9199).

## Cloud puzzles

The app ships every puzzle under `puzzles/` (built-in copy) and also downloads new and changed
ones from Firebase, so installed Android apps get puzzles without an app update.
- `scripts/uploadPuzzles.ts` publishes: `catalog/index` `{ schema: 1, puzzles: { [id]: hash }, removed: [id] }`,
  `puzzles/{id}` `{ schema: 1, hash, json: "<text>", images }` (text because Firestore rejects nested
  arrays), images in Storage at `puzzles/{id}/{imageHash}.{ext}`. Only changed puzzles are written;
  `--prune` marks ids no longer on disk as removed. Needs `GOOGLE_APPLICATION_CREDENTIALS` (service
  account) or `FIRESTORE_EMULATOR_HOST` + `FIREBASE_STORAGE_EMULATOR_HOST`.
- The hash (`scripts/puzzleFiles.ts`) covers the parsed JSON and image bytes; Vite exposes the
  built-in ones as `virtual:puzzle-hashes`, so app and uploader agree on what changed.
- `app/puzzleSync.ts` reads `catalog/index` (one read per check: startup, back online, foreground
  after 30 min) and fetches only puzzles whose hash matches neither the built-in copy nor an earlier
  download. Downloads live in IndexedDB (`app/puzzleStore.ts`); `app/puzzleCatalog.ts` merges them
  over the built-in list (`usePuzzleLibrary()`). Downloaded puzzles have no `filePath` (no debug mode).
- `npm run dev` skips the cloud check so debug edits to local files aren't masked; set
  `VITE_PUZZLE_SYNC=1` (with `VITE_FUNCTIONS_EMULATOR=1` for the emulators) to test it.
- The deploy workflow runs the uploader before building when the `FIREBASE_SERVICE_ACCOUNT` secret is set.

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
