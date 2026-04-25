# App Format Reference (v2)

## JSON Shape

The app accepts crossword JSON shaped like this:

```json
{
  "version": 2,
  "meta": {
    "title": "نمونه",
    "language": "fa",
    "direction": "rtl"
  },
  "grid": [
    [0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 0, 1, 0, 0, 0, 0]
  ],
  "clues": {
    "horizontal": {
      "1": ["نمونه افقی 1، 2 حرف", "نمونه افقی 3، 4 حرف", "نمونه افقی 6، 2 حرف"],
      "2": ["نمونه افقی 8، 4 حرف", "نمونه افقی 10، 5 حرف"]
    },
    "vertical": {
      "1": ["نمونه عمودی 1، 4 حرف"],
      "3": ["نمونه عمودی 9، 8 حرف"]
    }
  },
  "answers": {
    "horizontal": {
      "1": ["بس", "تمکا", "مک"]
    },
    "vertical": {
      "1": ["بسنل"]
    }
  }
}
```

## Required fields
- `version` — must be the integer `2`. v1 files are rejected by the loader.
- `grid` — a non-empty rectangular array of rows; each row is an array of integers where `0` is an open cell and `1` is a black square. The number of rows and columns are derived from this.
- `clues` — object with `horizontal` and `vertical` sub-objects (either may be empty).

## Optional fields
- `answers` — same shape as `clues`, with values that are strings or `null`.
- `meta` — free-form object; not validated.

## Clue grouping rules

For raw newspaper or OCR input, the working import rule is:

- Split each numbered clue line on hyphens to get the intended clue count for that row or column.
- Use that clue count as the transcription source of truth.
- Then make sure the final `grid` produces the same number of slots after ignoring every open run of length 1.
- A single isolated `0` cell never creates a clue entry.

### `clues.horizontal`
- Key: 1-based row number (`"1"` = top row).
- Value: array of clue strings for the across slots in that row.
- **Order is right-to-left** — index 0 is the rightmost across word in the row, then leftward.
- Only include rows that contain at least one across slot (length ≥ 2).

### `clues.vertical`
- Key: column number **counted from the right** (`"1"` = rightmost column).
- Value: array of clue strings for the down slots in that column.
- **Order is top-to-bottom** — index 0 is the topmost down word in the column, then downward.
- Only include columns that contain at least one down slot.

## Slot derivation (internal)

The validator derives slots from `grid`; the file format never names them. The internal slot IDs (used in error messages) are:

- Across: `R{row+1}-{i}`, `i = 1` for the rightmost across slot in that row.
- Down: `C{cols-col}-{i}`, `i = 1` for the topmost down slot in that column.

A "slot" is any contiguous run of open cells of length 2 or more. Length-1 runs are ignored.

## Validation rules
- `version` must equal `2`.
- `grid` must be non-empty, rectangular, and contain only `0` or `1`.
- For every group with derived slots, `clues.horizontal[N]` (or `clues.vertical[N]`) must exist and have **exactly** the same number of entries as derived slots in that group.
- Clue strings must be non-empty.
- A clue group key that points to a row/column with no slots is rejected.
- `answers` (if present) follows the same group keys; entries may be `null` or strings; non-null answer length must match the slot length after Persian normalization (Arabic Yeh → Persian Yeh, Arabic Kaf → Persian Kaf, strip diacritics/tatweel, count graphemes).

## Persian text handling

When comparing answer length to slot length, the validator normalizes text:
- Convert Arabic Yeh to Persian Yeh.
- Convert Arabic Kaf to Persian Kaf.
- Remove diacritics and tatweel.
- Count graphemes, not raw UTF-16 code units.
