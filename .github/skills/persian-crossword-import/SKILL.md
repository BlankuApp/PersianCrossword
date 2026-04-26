---
name: persian-crossword-import
description: 'Convert a raw Persian crossword from an image, scan, screenshot, PDF, table, or clue list into this app''s crossword JSON format (v2). Use for transcribing the 0/1 grid matrix and grouping Persian clues by Horizontal/Vertical → row/column number.'
argument-hint: 'Source crossword image or raw grid/clue data to convert into app JSON'
---

# Persian Crossword Import

## When to Use
- Import a Persian crossword from a screenshot, photo, scan, PDF, spreadsheet, or loose text.
- Transcribe the grid as a 0/1 matrix.
- Convert OCR clue text (typically Horizontal/Vertical sections, typically hyphen-separated within each numbered line) into the app's grouped clue arrays.
- Produce a final `.json` puzzle file (v2) compatible with this repository.

## Output
- Return one JSON file using the v2 format by default.
- If the user explicitly asks for multiple crosswords, multiple clue sets, or multiple variants that share one grid, create one JSON file per requested output and reuse the shared grid where appropriate.
- Required top-level fields: `version` (= `2`), `grid`, and `clues`.
- Always include a full `meta` block for repository imports, even when some metadata values are unknown and must be empty strings; `answers` remains optional.
- If grid cells or clue entries are uncertain, make a best-effort guess when the ambiguity is localized and there is a single most plausible reconstruction from slot counts, clue order, and nearby OCR context.
- If you make any such guess, say so explicitly in the final response and identify which rows/columns or clue lines were reconstructed.
- Stop and ask before writing the final file only when multiple materially different reconstructions remain plausible.
- If asked to save into this repo, create a new puzzle file instead of overwriting an existing one unless the user explicitly requests a replacement.

## Procedure

### 1. Transcribe the grid
- Count rows and columns.
- Build a JSON array of rows; each row is an inner array of integers.
- `0` = open (white) cell. `1` = black square.
- Ignore clue numbers, circles, or other decorations printed inside cells.

Example (15×15):

```json
"grid": [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
  ...
]
```

### 2. Identify the slots
A slot is any contiguous run of open cells of length 2 or more.
- **Horizontal (across) slots**: read each row right-to-left. Each run becomes one slot. The rightmost across slot in a row is index 0 in that row's clue array.
- **Vertical (down) slots**: read each column top-to-bottom. The topmost down slot in a column is index 0 in that column's clue array.
- Never count a length-1 open run as a clue slot.

You do not need to write slot IDs in the file — the loader derives them. But for cross-checking, the internal IDs are `R{row+1}-{i}` and `C{cols-col}-{i}` (so column `1` in `clues.vertical` is the **rightmost** column).

### 3. Parse OCR clue text
Persian newspaper clue lists are typically printed as:

```
افقی (Horizontal)
1. clue word 1 - clue word 2
2. clue word 1
...
عمودی (Vertical)
1. clue word 1 - clue word 2 - clue word 3
2. clue word 1
```

Map this directly into the file:
- The number `N` before a horizontal line becomes the key `"N"` under `clues.horizontal`.
- Split that line on `-` (also `–` and `—`); the resulting strings become the array value, **already in right-to-left order** (Persian newspapers list the clues for a row in reading order, which is right-to-left).
- Do the same for vertical clues under `clues.vertical`, where `N` is the column number counted **from the right**.
- Trim whitespace from each split clue. Preserve the Persian text exactly, including any `، N حرف` length hint.
- Treat the hyphen-separated clue text as the authoritative count for that row or column in the source material.
- If a row like `0 1 0 0 0 0 0 1 0 0 0 0 1 0 0` appears, it has **2** across clues, not 4, because the isolated single `0` cells are not slots and the clue line determines how many entries should exist.
- If OCR or pasted text contains an explicit stray token inside a clue line such as `N` or `R`, preserve it only when it is actually present in the source text and needed to satisfy the clue count. Do not silently normalize, translate, or invent a replacement.
- If a clue boundary is ambiguous because numbering collapsed into the previous clue (for example `R۱۱)`), use the slot-count check to determine whether the preceding line needs one more entry.
- If a specific row or column still has a clue-count mismatch after you re-check the grid, use `vscode_askQuestions` to ask the user about that exact line instead of guessing. State the section and number, the expected count from the grid, the current count from the text, then show the current clue text and ask the user to insert the missing hyphen or otherwise correct the text.
- Use one targeted question per mismatched line. Format it like: `In vertical 5 there were expected to be 3 clues but the current text yields 2. Current text: "...". Please add the hyphen in the proper place or fix the text.`
- If the text is still somewhat unclear after that check but one reconstruction is plainly more likely than the others, use that best-effort reconstruction and record that it was guessed.
- Ask before writing the final file only when the clue text still supports multiple materially different reconstructions.

### 4. Validate by counting
Before saving, use the clue text and the grid together:
- First, count clue entries from the source text by splitting each numbered line on hyphens.
- Then count geometric slots in the grid, ignoring every run of length 1.
- If the counts differ, treat the clue text as the source of truth for how many clues belong to that row or column, then re-check the grid transcription for missed or extra black squares, OCR mistakes, or incorrect row/column alignment.
- If a mismatch still remains for a specific horizontal row or vertical column after that re-check, stop and use `vscode_askQuestions` to ask the user a targeted question for that exact line. Include the section (`horizontal` or `vertical`), the key number, the expected clue count from the grid, the current clue count from the text, and the current text for that line so the user can place the missing hyphen or correct the OCR.
- Ask a separate question for each mismatched line rather than bundling them into one vague request.
- Only finish when the final grid and the clue arrays agree, because the loader will reject mismatches with a `clue_length_mismatch` or `missing_clue_group` error.

### 5. Optional: add answers
If you have a solution grid or answer list, mirror the `clues` shape under `answers`. Use `null` for unknown entries. Each non-null answer must match the slot length after Persian normalization (the loader handles Yeh/Kaf variants and diacritics).

```json
"answers": {
  "horizontal": {
    "1": ["بس", "تمکا", "مک"],
    "2": [null, "لبسنل"]
  },
  "vertical": {
    "1": ["بسنل"]
  }
}
```

### 6. Build the JSON
- Start from [JSON template](./assets/puzzle-template.json).
- Set `"version": 2`.
- Fill `grid` and `clues`.
- Prefer a full `meta` block for repo imports:

```json
"meta": {
  "id": "3",
  "title": "جدول ۷۲۱۷",
  "newspaper": "جام جم",
  "difficulty": "ویژه",
  "author": "بیژن گورانی",
  "publishedAt": "2026-04-26",
  "size": { "rows": 15, "cols": 15 },
  "language": "fa",
  "direction": "rtl"
}
```

- Metadata guidance for this repository:
- Always write the `meta` object with all of these keys present: `id`, `title`, `newspaper`, `difficulty`, `author`, `publishedAt`, `size`, `language`, `direction`.
- If a text metadata field is unknown, write an empty string instead of omitting the field.
  - `id`: use a stable unique ID. For files under `puzzles/`, default to the filename slug or next available numeric filename such as `2`, `3`, `4`.
  - `title`: use the published puzzle title/number for example `جدول ۷۲۱۷`.
  - `newspaper`: use the newspaper or publication name such as `جام جم` or `جوان`.
  - `difficulty`: include it when the source or user provides one; for example `عادی` or `ویژه`. Otherwise, leave it empty instead of guessing.
  - `author`: include the constructor/designer line such as `بیژن گورانی` when available.
  - `publishedAt`: include the provided or requested date; otherwise leave it empty instead of guessing.
  - `size`: always populate from the grid dimensions.
  - `language`: use `fa`.
  - `direction`: use `rtl`.
- When writing into `puzzles/`, do not overwrite an existing numbered file unless the user explicitly asks for that file to be replaced. Create the next requested or available filename instead.
- Save the result as a `.json` file.

### 7. Final check
- Grid is rectangular and contains only `0`/`1`.
- Every row with at least one across run of length ≥ 2 has a key in `clues.horizontal` with the right number of entries.
- Every column with at least one down run of length ≥ 2 has a key (counted from the right) in `clues.vertical` with the right number of entries.
- All clue strings are non-empty.
- `meta` is present and includes all required metadata keys, with empty strings for unknown text values.
- `meta.size` matches the actual grid dimensions.
- If the file is saved into this repository, the filename/`meta.id` combination is new or was explicitly requested.
- After writing the file, run the repository validator (`validatePuzzleJson`) on the exact file or files you just wrote and only finish if each reports `valid: true`.
- Report validation results per file.
- If a validation result contradicts the derived slot counts or mentions fields that are not present in the JSON you wrote, rerun a direct local validation before concluding that the import failed.

## Decision Rules
- If image quality makes a square or clue line mildly ambiguous, make the most defensible localized guess from the surrounding evidence instead of stopping immediately.
- Ask for confirmation only when the ambiguity is too large to support a single defensible reconstruction.
- If the source's hyphen-separated clue text disagrees with the geometric count of slots in a row/column, re-check the grid transcription first. If that specific line still disagrees after the re-check, ask the user to fix that exact row or column text instead of silently reconstructing it.
- One-cell runs are not slots — never include a clue for them.
- The vertical group key is column-from-right, matching Persian newspaper convention. Double-check the rightmost column gets key `"1"`.
- Preserve explicit raw source tokens only when the source actually contains them.
- Do not fabricate arbitrary filler text, but do allow short best-effort reconstructions when OCR damage is obvious and the intended clue boundary or token is still reasonably inferable.
- For repo updates, default to additive file creation (`2.json`, `3.json`, etc.) rather than replacing `1.json` or any existing puzzle file.

## References
- [App format reference](./references/app-format.md) — full schema and validation rules.
- [JSON template](./assets/puzzle-template.json) — starting structure.
