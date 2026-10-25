# CLAUDE.md

## Commands

```bash
npm run dev          # Vite dev server → http://127.0.0.1:5173
npm run build        # Build lib (dist/) + app (app-dist/)
npm run test         # Vitest unit tests
npm run typecheck    # Type-check both tsconfig.json and tsconfig.app.json
npm run puzzles:upload -- --dry-run   # Bulk-publish puzzles/ to Firebase (see "Puzzles in Firebase")
npm run puzzles:download              # Backup / fresh copy of every published puzzle into puzzles/
npm run admin:grant -- <email>        # Give an account the admin claim (--revoke to remove)
```

### Firebase Functions (AI proxy)

```bash
npm --prefix functions test                         # quota + Gemini client unit tests
npm --prefix functions run build                    # tsc → functions/lib
npx firebase-tools emulators:start --only functions,firestore,storage,auth   # needs functions/.secret.local (Java 21)
VITE_FUNCTIONS_EMULATOR=1 npm run dev               # app → local emulators (functions, Firestore, Storage, Auth)
npx firebase-tools functions:secrets:set GEMINI_KEY # owner's free-tier key (separate GCP project, no billing)
npx firebase-tools deploy --only functions          # manual deploy; requires Blaze plan
```

### Support reporting and App Check

Support callables use App Check and a server-side rate-limit secret. Configure production before deploying:

- Register the Firebase web app with App Check using a reCAPTCHA Enterprise score-based key for the production domains. Set `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` to that site's key in the web build environment.
- Register the Android app with Firebase App Check and Play Integrity. For local Android development, set `VITE_APP_CHECK_DEBUG_TOKEN=1` before building/syncing; the native plugin prints its generated debug token, which must be registered under the Android app's App Check debug tokens. For local web development, set `VITE_APP_CHECK_DEBUG_TOKEN` to a chosen web debug token and register that token under the web app. These opt-ins are development/emulator-only; never set them in a production build.
- Set the Functions secret with `npx firebase-tools functions:secrets:set SUPPORT_RATE_LIMIT_SALT`. Keep the value private and stable; do not commit it.
- `SUPPORT_ENFORCE_APP_CHECK` is a Functions boolean parameter whose default is `false`. Keep it false during rollout. Deploy callable functions and rules before releasing the matching client, then verify healthy verified-request metrics for both web and Android in Firebase App Check. Set the parameter to `true` for the enforcement deploy only after both platforms are healthy; monitor failed callable requests after enforcement.

For local use, put a development-only `SUPPORT_RATE_LIMIT_SALT` in `functions/.secret.local`, opt into the App Check debug provider, and run:

```bash
npx firebase-tools emulators:start --only functions,firestore,storage,auth
VITE_FUNCTIONS_EMULATOR=1 VITE_APP_CHECK_DEBUG_TOKEN=<registered-debug-token> npm run dev
```

Deploy support rules and functions, then build and sync the Android client when preparing a matching release:

```bash
npx firebase-tools deploy --only firestore:rules,storage,functions
npm run build
npx cap sync android
```

Keep the client and callable-functions release coordinated: the support client expects the current participant and tracked-thread response payload. The emulator rules suite is `npx firebase-tools emulators:exec --only firestore,storage,auth "npx vitest run test/supportRules.test.ts"`.

## Architecture

```
src/          Core TS library (grid, puzzle, state, text, validation, types)
app/          React SPA (Vite): auth, routing, solver UI, puzzle library; app/admin = admin panel (lazy-loaded)
shared/       Published-puzzle layout, hashing and packing — used by both app/ and scripts/ (Web Crypto)
test/         Vitest tests for the core library
functions/    Firebase Functions: askAi — Gemini proxy with per-user daily quota (Firestore aiUsage/{uid})
puzzles/      Local working copy of the puzzles (gitignored; Firebase is the source): batches 1-50, 51-100, …
scripts/      Node scripts (run with tsx): puzzle upload/download, admin grant
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

Security rules live in `firestore.rules` (owner-only `users/{uid}/**`; public read + admin write of `catalog/*`
and `puzzlePacks/*`; admin-only `drafts/*`; everything else denied) and `storage.rules` (public get, no list,
admin image uploads under `puzzles/**`). Admin = custom claim `admin: true` (`npm run admin:grant`). Deploy:
`npx firebase-tools deploy --only firestore:rules,storage`. `VITE_FUNCTIONS_EMULATOR=1` also points Firestore
, Storage and Auth at the local emulators (ports 8080, 9199, 9099).

## Puzzles in Firebase

Firebase is the only source of puzzles: the repo and the app bundle hold none. `puzzles/` (and
`raw_data/`, original scans) are local, gitignored working copies. Layout, hashing and packing live in
`shared/cloudPuzzles.ts`: `catalog/index` lists packs `{ [packId]: { hash, puzzles: { [id]: hash } } }`;
`puzzlePacks/{packId}` holds up to 50 puzzles as JSON text (Firestore rejects nested arrays) with their file
path; `drafts/{id}` holds unpublished puzzles; images live in Storage at `puzzles/{id}/{imageHash}.{ext}`
(drafts' too — unlisted until published). A puzzle keeps its pack for life, so an edit rewrites one pack.
The puzzle hash covers the parsed JSON and image bytes; app and scripts compute it identically (tested
against fixed values — changing it would make every published puzzle look changed).
- **Admin panel** (`app/admin`, `#/admin`, admins only): imports JSON + images as drafts
  (`importPlan.ts`), opens a draft in the solver with the editing tools (`#/admin/draft/{id}`), publishes it.
  On published puzzles admins get the same tools: saves go straight to players, "unpublish" moves the
  puzzle back to drafts. Publishing requires `validatePuzzleJson` to pass and every open cell to hold its
  answer (`countMissingLetters`). Pack + catalog (+ draft) writes happen in one transaction (`adminApi.ts`).
  The editing tools are `SolverPage`'s `editor` prop; there's no local-file debug mode any more.
  Metadata (id, title, newspaper, difficulty, author; advanced: sourceFile, size, publishedAt) is edited in one
  `PuzzleMetaDialog` (`app/components/`): drafts can change their id (`renameDraft`), published puzzles keep it;
  saves go through `PuzzleEditor.saveMeta`. Publishing only shows a summary.
- `scripts/uploadPuzzles.ts` bulk-publishes a folder after validating every puzzle. It adds new puzzles but
  skips published ones that differ (the admin panel may have fixed them) unless `--overwrite`; `--prune`
  unpublishes puzzles missing locally. Needs `GOOGLE_APPLICATION_CREDENTIALS` (service account) or the
  emulator variables. `scripts/downloadPuzzles.ts` restores the folder layout (drafts not included).
- `app/puzzleSync.ts` reads `catalog/index` (one read per check: startup, back online, foreground after
  30 min) and fetches only packs whose hash changed (all ~6 on a new device). A pack document whose hash
  disagrees with the catalog (mid-upload, or a run that stopped halfway) is still used and re-fetched on
  the next check. Packs live in IndexedDB (`app/puzzleStore.ts`); `usePuzzleLibrary()` exposes the list plus
  a `sync` state for the home page's loading/offline messages.
- `npm run dev` uses the same Firebase path as production; `VITE_FUNCTIONS_EMULATOR=1` points it at the
  emulators. Tests use `test/puzzle-folder/`.

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
