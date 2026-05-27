# CLAUDE.md

## Commands

```bash
npm run dev          # Vite dev server → http://127.0.0.1:5173
npm run build        # Build lib (dist/) + app (app-dist/)
npm run test         # Vitest unit tests
npm run typecheck    # Type-check both tsconfig.json and tsconfig.app.json
```

### Grid-importer tool (Python)

```bash
# Backend (FastAPI + OpenCV + LlamaCloud)
.venv\Scripts\activate            # activate virtualenv (root-level .venv)
cd tools/grid-importer/backend
uvicorn app:app --reload          # API at http://127.0.0.1:8000
pytest                             # Run backend tests

# Frontend (separate Vite app)
cd tools/grid-importer/frontend
npm install && npm run dev
```

## Architecture

```
src/          Core TS library (grid, puzzle, state, text, validation, types)
app/          React SPA (Vite): auth, routing, solver UI, puzzle library
test/         Vitest tests for the core library
tools/
  grid-importer/
    backend/  Python FastAPI — image → 0/1 grid matrix (OpenCV + LlamaCloud OCR)
    frontend/ Standalone React tool for importing puzzles from images
puzzles/      Puzzle JSON files, grouped in batches (1-50, 51-100, 101-150, …)
dist/         TS library build output (tsc)
app-dist/     Vite app build output → deployed to GitHub Pages
```

Two separate tsconfigs: `tsconfig.json` builds the library (`dist/`), `tsconfig.app.json`
is for the React app. Both are checked by `npm run typecheck`.

## Puzzle Format

Puzzles are `CrosswordJson` (version 2) JSON files under `puzzles/`.
- **Slot IDs**: `R{row}-{n}` for horizontal, `C{col}-{n}` for vertical.
- **Vertical column numbering**: 1-based *from the right* (RTL convention).
- Each puzzle folder can have a matching `{id}.png` (solution image) and an optional
  source image referenced via `meta.sourceFile`.
- `meta.id` must be set; if missing, the filename slug is used and progress breaks on rename.

## Firebase

Project: `persiancrossword` (Firebase console).
Progress is stored in Firestore at `users/{uid}/puzzles/{puzzleId}`.
Local fallback uses `localStorage` with key prefix `persian-crossword:`.

## Deploy

Merges to `main` auto-deploy to GitHub Pages via `.github/workflows/`.
Build output uploaded: `app-dist/`.
