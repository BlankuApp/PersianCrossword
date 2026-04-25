import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compilePuzzle, type CrosswordJson } from "../src/index.js";

describe("sample crossword JSON files", () => {
  const samplesDir = join(process.cwd(), "samples");
  const sampleFiles = readdirSync(samplesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();

  it("keeps sample fixtures available", () => {
    expect(sampleFiles).toEqual([
      "sample-10x10-garden.json",
      "sample-11x11-city.json",
      "sample-12x12-weekend.json",
    ]);
  });

  it.each(sampleFiles)("compiles %s", (file) => {
    const raw = readFileSync(join(samplesDir, file), "utf8");
    const puzzle = compilePuzzle(JSON.parse(raw) as CrosswordJson);

    expect(puzzle.slots.length).toBeGreaterThan(0);
    expect(puzzle.acrossSlots.length).toBeGreaterThan(0);
    expect(puzzle.downSlots.length).toBeGreaterThan(0);
  });
});
