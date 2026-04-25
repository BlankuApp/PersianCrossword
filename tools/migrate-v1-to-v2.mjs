/**
 * Migrate puzzle JSON files from v1 (size + blocks + flat clues keyed by
 * R1-1 / C1-1) to v2 (grid matrix + clues grouped by horizontal/vertical →
 * group number → ordered clue array).
 *
 * Usage:
 *   node tools/migrate-v1-to-v2.mjs samples/sample-10x10-garden.json
 *   node tools/migrate-v1-to-v2.mjs samples/*.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MIN_SLOT_LENGTH = 2;

function cellKey(row, col) {
  return `${row},${col}`;
}

function isBlocked(size, blockSet, row, col) {
  if (row < 0 || row >= size.rows || col < 0 || col >= size.cols) return true;
  return blockSet.has(cellKey(row, col));
}

function deriveSlots(size, blocks) {
  const blockSet = new Set(blocks.map((b) => cellKey(b.row, b.col)));
  const slots = [];

  // Across: rows top→bottom, cells right→left.
  for (let row = 0; row < size.rows; row += 1) {
    let wordIndex = 0;
    let col = size.cols - 1;
    while (col >= 0) {
      if (isBlocked(size, blockSet, row, col)) {
        col -= 1;
        continue;
      }
      const cells = [];
      while (col >= 0 && !isBlocked(size, blockSet, row, col)) {
        cells.push({ row, col });
        col -= 1;
      }
      if (cells.length >= MIN_SLOT_LENGTH) {
        wordIndex += 1;
        slots.push({
          id: `R${row + 1}-${wordIndex}`,
          direction: "across",
          groupNum: row + 1,
          wordIndexInGroup: wordIndex,
          length: cells.length,
        });
      }
    }
  }

  // Down: columns right→left, cells top→bottom.
  for (let col = size.cols - 1; col >= 0; col -= 1) {
    let wordIndex = 0;
    let row = 0;
    while (row < size.rows) {
      if (isBlocked(size, blockSet, row, col)) {
        row += 1;
        continue;
      }
      const cells = [];
      while (row < size.rows && !isBlocked(size, blockSet, row, col)) {
        cells.push({ row, col });
        row += 1;
      }
      if (cells.length >= MIN_SLOT_LENGTH) {
        wordIndex += 1;
        const groupNum = size.cols - col;
        slots.push({
          id: `C${groupNum}-${wordIndex}`,
          direction: "down",
          groupNum,
          wordIndexInGroup: wordIndex,
          length: cells.length,
        });
      }
    }
  }

  return slots;
}

function buildGrid(size, blocks) {
  const grid = [];
  for (let row = 0; row < size.rows; row += 1) {
    const rowArr = new Array(size.cols).fill(0);
    grid.push(rowArr);
  }
  for (const b of blocks) {
    grid[b.row][b.col] = 1;
  }
  return grid;
}

function migrate(v1) {
  if (v1.version !== undefined && v1.version !== 1) {
    throw new Error(`Expected version 1 (or unset), got ${v1.version}`);
  }
  if (!v1.size || !Array.isArray(v1.blocks)) {
    throw new Error("Missing size or blocks");
  }

  const slots = deriveSlots(v1.size, v1.blocks);

  const horizontalClues = {};
  const verticalClues = {};
  const horizontalAnswers = {};
  const verticalAnswers = {};
  const haveAnswers = v1.answers && typeof v1.answers === "object";

  // Initialize arrays sized to each group.
  for (const slot of slots) {
    const cluesBucket = slot.direction === "across" ? horizontalClues : verticalClues;
    if (!cluesBucket[slot.groupNum]) {
      cluesBucket[slot.groupNum] = [];
    }
    cluesBucket[slot.groupNum][slot.wordIndexInGroup - 1] =
      v1.clues?.[slot.id] ?? "";

    if (haveAnswers) {
      const ansBucket = slot.direction === "across" ? horizontalAnswers : verticalAnswers;
      if (!ansBucket[slot.groupNum]) {
        ansBucket[slot.groupNum] = [];
      }
      const value = v1.answers[slot.id];
      ansBucket[slot.groupNum][slot.wordIndexInGroup - 1] =
        value === undefined ? null : value;
    }
  }

  const v2 = {
    version: 2,
  };
  if (v1.meta) v2.meta = v1.meta;
  v2.grid = buildGrid(v1.size, v1.blocks);
  v2.clues = {
    horizontal: sortKeys(horizontalClues),
    vertical: sortKeys(verticalClues),
  };
  if (haveAnswers) {
    v2.answers = {
      horizontal: sortKeys(horizontalAnswers),
      vertical: sortKeys(verticalAnswers),
    };
  }

  return v2;
}

function sortKeys(obj) {
  const out = {};
  const keys = Object.keys(obj)
    .map((k) => Number.parseInt(k, 10))
    .sort((a, b) => a - b);
  for (const k of keys) {
    out[k] = obj[k];
  }
  return out;
}

/**
 * Pretty-print JSON like JSON.stringify(_, null, 2), but render the inner
 * arrays of `grid` (and any other array-of-numbers) on a single line so the
 * file stays scannable.
 */
function formatJson(value) {
  return stringify(value, 0);
}

function stringify(value, indent) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number" || t === "boolean") return String(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((v) => typeof v === "number")) {
      return "[" + value.join(", ") + "]";
    }
    const pad = " ".repeat((indent + 1) * 2);
    const close = " ".repeat(indent * 2);
    const items = value.map((v) => pad + stringify(v, indent + 1));
    return "[\n" + items.join(",\n") + "\n" + close + "]";
  }
  if (t === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const pad = " ".repeat((indent + 1) * 2);
    const close = " ".repeat(indent * 2);
    const items = entries.map(
      ([k, v]) => pad + JSON.stringify(k) + ": " + stringify(v, indent + 1),
    );
    return "{\n" + items.join(",\n") + "\n" + close + "}";
  }
  return "null";
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node tools/migrate-v1-to-v2.mjs <files...>");
  process.exit(1);
}

let failures = 0;
for (const arg of args) {
  const path = resolve(process.cwd(), arg);
  try {
    const raw = readFileSync(path, "utf8");
    const v1 = JSON.parse(raw);
    if (v1.version === 2) {
      console.log(`Skipping ${arg} (already v2)`);
      continue;
    }
    const v2 = migrate(v1);
    writeFileSync(path, formatJson(v2) + "\n");
    console.log(`Migrated ${arg}`);
  } catch (err) {
    failures += 1;
    console.error(`Failed: ${arg}: ${err.message}`);
  }
}

if (failures > 0) process.exit(1);
