# Unified puzzle metadata editor

Date: 2026-10-06 · Branch: `codex/admin-photo-import`

## Problem

Puzzle metadata (`id`, `title`, `newspaper`, `difficulty`, `author`, …) is edited in scattered places:

- The draft row's publish form (`app/admin/AdminPage.tsx`): id field plus `PublishMetaFields`.
- The solver's publish confirm modal (`app/pages/SolverPage.tsx`): `PublishMetaFields`, **no id**.
- The AI photo import form (`app/admin/PhotoImportSection.tsx`): its own id input plus `PublishMetaFields`.
- JSON import: metadata comes from the file, with no editing.

Consequences: metadata can only change at publish time, drafts and published puzzles can't be fixed in place, the id field is hand-rolled three ways, `difficulty` is free text that behaves like an enum (only "ویژه"/"special" counts as special), and `size`, `sourceFile` and `publishedAt` are invisible.

## Goals

- One shared metadata form, used everywhere metadata is edited.
- Metadata is its own saved step, independent of publishing, for drafts **and** published puzzles.
- Editable id on drafts, locked once published.
- `difficulty` becomes a two-value select.
- Advanced fields (`sourceFile`, `size`, `publishedAt`) visible in a collapsed section.

## Decisions

| Topic | Decision |
|---|---|
| Model | Metadata is a separate saved step. Draft save writes the draft; published save writes straight to players (like `savePublishedPuzzle` for clue fixes). Publishing only shows a read-only summary. |
| Entry points | "مشخصات" button in the draft row, the draft editor toolbar and the published editor toolbar. |
| `id` | Editable on drafts (saving a changed id renames the draft). Read-only once published (progress, catalog and pack entries key on it). To change a published id: unpublish, rename, republish. |
| `difficulty` | Select: عادی / ویژه. If the puzzle holds another value it appears as an extra marked option, so open+save never silently rewrites it. |
| `title`, `newspaper`, `author` | Free text with suggestions from published values (as today). `title` is required to save; empty fields are dropped, not written as `""`. |
| `size` | Read-only, derived from the actual grid; `meta.size` is set to match on save. |
| `publishedAt` | Read-only, automatic. Stamped with the publish day at publish (as before); saving metadata never changes it. Drafts show "will be set at publish" (or the date if the JSON already has one). |
| `sourceFile` | Editable text, only when a source image is attached (disabled with a note otherwise). Changes only the recorded name; stored image paths are content-addressed and unaffected. Replacing the image is out of scope. |
| JSON import | Unchanged; fix metadata afterwards in the dialog. |

Published-puzzle metadata edits are safe: `savePublishedPuzzle` already rewrites the pack entry and catalog in one transaction, recomputes the hash (`entryImageRefs` rebuilds the source image name from `meta.sourceFile`), and clients refetch only that pack. Progress records hold letters/status/percent keyed by id and never reference metadata.

## Design

### Pure module `app/components/puzzleMeta.ts`

Replaces `publishMetaOf` / `withPublishMeta` from `PublishMetaFields.tsx`.

- `PuzzleMetaForm`: `{ id, title, newspaper, difficulty, author, sourceFile }` (strings).
- `metaFormOf(json, id)`: form values; numbers in the JSON become text (meta is not validated on import).
- `applyMetaForm(json, form)`: trims values, sets `meta.id`, sets `meta.size` from the grid, drops empty optional fields, keeps `publishedAt`, `language`, `direction` and unknown keys, changes `sourceFile` only when a source image exists.
- `metaIdProblem(id, ownId, takenIds)`: Persian error string or `""`; uses `isValidPuzzleId` from `app/admin/importPlan.ts` (pure, small — no admin-bundle import in the solver). Own id is never "taken".
- `difficultyOptions(current)`: عادی, ویژه, plus `current` when it is neither.

### Components (`app/components/`)

- `PuzzleMetaEditor`: controlled form. Main section: id, title, newspaper, difficulty select, author. Collapsed `<details>` "پیشرفته": sourceFile, size, publishedAt. Props: `value`, `onChange`, `idLocked`, `takenIds`, `ownId`, `hasSourceImage`, `size`, `publishedAt`, `disabled`. Suggestions come from `usePuzzleLibrary()` as today. id input `dir="ltr"`, digits shown Persian via existing helpers.
- `PuzzleMetaDialog`: modal around the editor (reuses the solver modal styling). Tracks dirty state against `metaFormOf`. Save enabled only when changed, id valid and not taken, title non-empty. Save calls `onSave(json, newId)`; failure shows `role="alert"` text and keeps the dialog open; success closes. Cancel/Escape close at once when clean, otherwise ask to confirm discarding; backdrop click is ignored while dirty. Notes: draft = "private until published"; published = "applies immediately for all players" and the id is read-only with an explanation. Focus first field on open, return focus to the opener, `aria-modal`, scrolls on phones.
- `MetaSummary`: read-only title/id/difficulty/newspaper/author with an "ویرایش مشخصات" link.
- `PublishConfirmDialog` (draft row): `MetaSummary` + ready/problems status + publish/cancel. The solver's existing confirm modal uses `MetaSummary` in place of `PublishMetaFields`.

### `app/admin/adminApi.ts`

- **`renameDraft(draft, json, newId)`** (new). One transaction: old draft doc must still equal `draft.jsonText` (same stale-snapshot guard as publish); `newId` must not be a draft or published id (as `createDraft` checks). Writes a new draft doc with the new JSON, `file` rewritten to `…/{newId}.json`, solution image name `{newId}.png`; deletes the old doc. Image storage paths are unchanged (content-addressed). Afterwards copies local progress to the new id using the logic now at the end of `publishDraft`.
- **`publishDraft(draft, json)`** simplified: drops `nextId` and every `renamed` branch (publishing never changes the id). Still stamps `publishedAt` and `meta.id`.
- Draft metadata save: unchanged id → existing `saveDraft`; changed id → `renameDraft`; caller then navigates to `#/admin/draft/{newId}`.
- Published metadata save: existing `savePublishedPuzzle(id, json)` — no new API.

### Solver wiring

`PuzzleEditor` gains `saveMeta(json, newId)` and optional `takenIds`. `DraftPage` implements `saveMeta` with the save-or-rename logic and supplies `takenIds` (published + draft ids). `publishedEditor` (`app/App.tsx`) implements it with `savePublishedPuzzle` and needs no `takenIds`. After any metadata save the solver updates `editedJsonRef` so later clue/answer saves build on the new metadata instead of reverting it.

### Surfaces after the change

- **Draft row**: adds "مشخصات"; "انتشار" opens `PublishConfirmDialog`; the inline publish form and its hand-rolled id field are removed from `AdminPage.tsx`.
- **Draft editor / published editor toolbars**: add "مشخصات".
- **Photo import**: embeds `PuzzleMetaEditor` inline (id editable, `sourceFile` disabled showing `{id}-clues.png`, size from rows×cols). Its `localStorage` settings keep working (same form shape). Removes its own id input.
- **Existing data**: wrong `meta.size`, odd difficulty or missing `meta.id` are fixed on the first metadata save; no bulk migration.

## Out of scope

Replacing images; hand-editing `size` or `publishedAt`; editing a published puzzle's id; bulk metadata edits; changing how the home page lists or filters.

## Testing

- Unit tests for `puzzleMeta.ts`: size derivation, preserved keys, trimming, dropped empty fields, odd-difficulty option, `metaIdProblem` (invalid, taken, own id).
- Component tests (style of `test/app.test.tsx`): Save disabled until changed; taken/invalid id blocks save; id read-only for published; discard asks for confirmation; failed save shows the error and stays open; `MetaSummary` renders.
- `renameDraft` and the published save need the Firestore emulator; verify manually (rename a draft, reload, publish it, edit a published title and check a second device refetches that pack).
- `npm run typecheck` and `npm run test` must pass.
