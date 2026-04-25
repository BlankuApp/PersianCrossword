---
name: persian-crossword-import
description: 'Convert a raw Persian crossword from an image, scan, screenshot, PDF, table, or clue list into this app''s crossword JSON format (v2). Use for transcribing the 0/1 grid matrix and grouping Persian clues by Horizontal/Vertical → row/column number.'
argument-hint: 'Source crossword image or raw grid/clue data to convert into app JSON'
---

# Persian Crossword Import

## When to Use
- Import a Persian crossword from a screenshot, photo, scan, PDF, spreadsheet, or loose text.
- Transcribe the grid as a 0/1 matrix.
- Convert OCR clue text (typically Horizontal/Vertical sections, hyphen-separated within each numbered line) into the app's grouped clue arrays.
- Produce a final `.json` puzzle file (v2) compatible with this repository.

## Output
- Return one JSON file using the v2 format.
- Required top-level fields: `version` (= `2`), `grid`, and `clues`.
- Optional top-level fields: `answers` and `meta`.
- If grid cells or clue entries are uncertain, stop and ask before writing the final file.

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

### 4. Validate by counting
Before saving, use the clue text and the grid together:
- First, count clue entries from the source text by splitting each numbered line on hyphens.
- Then count geometric slots in the grid, ignoring every run of length 1.
- If the counts differ, treat the clue text as the source of truth for how many clues belong to that row or column, then re-check the grid transcription for missed or extra black squares, OCR mistakes, or incorrect row/column alignment.
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
- Optionally add `meta` (e.g. `"language": "fa"`, `"direction": "rtl"`, `"title"`).
- Save the result as a `.json` file.

### 7. Final check
- Grid is rectangular and contains only `0`/`1`.
- Every row with at least one across run of length ≥ 2 has a key in `clues.horizontal` with the right number of entries.
- Every column with at least one down run of length ≥ 2 has a key (counted from the right) in `clues.vertical` with the right number of entries.
- All clue strings are non-empty.

## Decision Rules
- If image quality makes a square or clue line ambiguous, ask for confirmation instead of guessing.
- If the source's hyphen-separated clue text disagrees with the geometric count of slots in a row/column, trust the clue text as the intended count and re-check the grid transcription before asking the user.
- One-cell runs are not slots — never include a clue for them.
- The vertical group key is column-from-right, matching Persian newspaper convention. Double-check the rightmost column gets key `"1"`.

## References
- [App format reference](./references/app-format.md) — full schema and validation rules.
- [JSON template](./assets/puzzle-template.json) — starting structure.
