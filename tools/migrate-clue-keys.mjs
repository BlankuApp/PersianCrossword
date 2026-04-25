/**
 * One-time migration script: remaps JSON clue/answer keys from the old
 * sequential-number format (e.g. "1A", "3D") to the new row/column format
 * (e.g. "R1-1", "C3-2"). Run with: node tools/migrate-clue-keys.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const samplesDir = resolve(__dir, "../samples");

const MIN_SLOT_LENGTH = 2;

function cellKey(row, col) {
  return `${row},${col}`;
}

function isInBounds(size, coord) {
  return (
    coord.row >= 0 &&
    coord.row < size.rows &&
    coord.col >= 0 &&
    coord.col < size.cols
  );
}

function isBlocked(size, blockSet, coord) {
  return !isInBounds(size, coord) || blockSet.has(cellKey(coord.row, coord.col));
}

function buildBlockSet(blocks) {
  return new Set(blocks.map((b) => cellKey(b.row, b.col)));
}

function deriveAcrossStarts(size, blockSet) {
  const starts = [];
  for (let row = 0; row < size.rows; row++) {
    let col = size.cols - 1;
    while (col >= 0) {
      if (isBlocked(size, blockSet, { row, col })) {
        col--;
        continue;
      }
      const cells = [];
      while (col >= 0 && !isBlocked(size, blockSet, { row, col })) {
        cells.push({ row, col });
        col--;
      }
      if (cells.length >= MIN_SLOT_LENGTH) {
        starts.push({ direction: "across", start: cells[0], cells });
      }
    }
  }
  return starts;
}

function deriveDownStarts(size, blockSet) {
  const starts = [];
  for (let col = size.cols - 1; col >= 0; col--) {
    let row = 0;
    while (row < size.rows) {
      if (isBlocked(size, blockSet, { row, col })) {
        row++;
        continue;
      }
      const cells = [];
      while (row < size.rows && !isBlocked(size, blockSet, { row, col })) {
        cells.push({ row, col });
        row++;
      }
      if (cells.length >= MIN_SLOT_LENGTH) {
        starts.push({ direction: "down", start: cells[0], cells });
      }
    }
  }
  return starts;
}

/** Old sequential-number derivation (reproduces current slots.ts behaviour). */
function deriveOldSlots(size, blocks) {
  const blockSet = buildBlockSet(blocks);
  const acrossStarts = deriveAcrossStarts(size, blockSet);
  const downStarts = deriveDownStarts(size, blockSet);

  const startsByCell = new Map();
  for (const s of acrossStarts) {
    const k = cellKey(s.start.row, s.start.col);
    if (!startsByCell.has(k)) startsByCell.set(k, []);
    startsByCell.get(k).push(s);
  }
  for (const s of downStarts) {
    const k = cellKey(s.start.row, s.start.col);
    if (!startsByCell.has(k)) startsByCell.set(k, []);
    startsByCell.get(k).push(s);
  }

  const slots = [];
  let clueNum = 1;

  for (let row = 0; row < size.rows; row++) {
    for (let col = size.cols - 1; col >= 0; col--) {
      const entries = startsByCell.get(cellKey(row, col));
      if (!entries) continue;
      // across before down
      entries.sort((a, b) => {
        if (a.direction === b.direction) return 0;
        return a.direction === "across" ? -1 : 1;
      });
      for (const s of entries) {
        const suffix = s.direction === "across" ? "A" : "D";
        slots.push({ id: `${clueNum}${suffix}`, start: s.start, direction: s.direction });
      }
      clueNum++;
    }
  }
  return slots;
}

/** New row/column-based derivation (matches the updated slots.ts logic). */
function deriveNewSlots(size, blocks) {
  const blockSet = buildBlockSet(blocks);
  const acrossStarts = deriveAcrossStarts(size, blockSet);
  const downStarts = deriveDownStarts(size, blockSet);

  const slots = [];

  let currentRow = -1;
  let wordIndex = 0;
  for (const s of acrossStarts) {
    if (s.start.row !== currentRow) {
      currentRow = s.start.row;
      wordIndex = 1;
    } else {
      wordIndex++;
    }
    const groupNum = s.start.row + 1;
    slots.push({
      id: `R${groupNum}-${wordIndex}`,
      start: s.start,
      direction: "across",
    });
  }

  let currentCol = -1;
  wordIndex = 0;
  for (const s of downStarts) {
    if (s.start.col !== currentCol) {
      currentCol = s.start.col;
      wordIndex = 1;
    } else {
      wordIndex++;
    }
    const groupNum = size.cols - s.start.col;
    slots.push({
      id: `C${groupNum}-${wordIndex}`,
      start: s.start,
      direction: "down",
    });
  }

  return slots;
}

const files = [
  "sample-10x10-garden.json",
  "sample-11x11-city.json",
  "sample-12x12-weekend.json",
];

for (const file of files) {
  const path = resolve(samplesDir, file);
  const json = JSON.parse(readFileSync(path, "utf8"));

  const oldSlots = deriveOldSlots(json.size, json.blocks);
  const newSlots = deriveNewSlots(json.size, json.blocks);

  // Build coord+direction → oldId map
  const oldByCoordDir = new Map();
  for (const s of oldSlots) {
    oldByCoordDir.set(`${cellKey(s.start.row, s.start.col)}:${s.direction}`, s.id);
  }

  // Build oldId → newId map
  const oldToNew = new Map();
  for (const s of newSlots) {
    const oldId = oldByCoordDir.get(`${cellKey(s.start.row, s.start.col)}:${s.direction}`);
    if (oldId) oldToNew.set(oldId, s.id);
  }

  // Remap clues
  const newClues = {};
  for (const [oldId, clue] of Object.entries(json.clues)) {
    const newId = oldToNew.get(oldId);
    if (newId) {
      newClues[newId] = clue;
    } else {
      console.warn(`  [${file}] No mapping for clue key: ${oldId}`);
    }
  }

  // Remap answers
  let newAnswers;
  if (json.answers) {
    newAnswers = {};
    for (const [oldId, answer] of Object.entries(json.answers)) {
      const newId = oldToNew.get(oldId);
      if (newId) {
        newAnswers[newId] = answer;
      } else {
        console.warn(`  [${file}] No mapping for answer key: ${oldId}`);
      }
    }
  }

  const newJson = { ...json, clues: newClues };
  if (newAnswers !== undefined) newJson.answers = newAnswers;

  writeFileSync(path, JSON.stringify(newJson, null, 2) + "\n");
  console.log(
    `Migrated ${file}  (${oldSlots.length} old slots → ${newSlots.length} new slots)`,
  );
}
