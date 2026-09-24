import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findInvalidPuzzles, readPuzzleFiles } from "../scripts/puzzleFiles";

const folder = resolve(import.meta.dirname, "puzzle-folder");

describe("readPuzzleFiles", () => {
  it("reads every puzzle with its id, path and images", async () => {
    const files = await readPuzzleFiles(folder);
    expect(files.map((f) => [f.id, f.relPath])).toEqual([
      ["1", "1-50/1.json"],
      ["no-id", "1-50/no-id.json"],
    ]);
    expect(files[0]!.images.map((i) => [i.kind, i.name])).toEqual([
      ["solution", "1.png"],
      ["source", "1-source.webp"],
    ]);
    expect(files[1]!.images).toEqual([]);
  });

  it("keeps the fingerprints already published (changing them would re-send every puzzle)", async () => {
    const files = await readPuzzleFiles(folder);
    expect(files.map((f) => f.hash)).toEqual(["6b14d66fd5e57cf9", "2ad9c5b18c919133"]);
  });

  it("returns nothing for a missing folder", async () => {
    expect(await readPuzzleFiles(resolve(folder, "missing"))).toEqual([]);
  });
});

describe("findInvalidPuzzles", () => {
  it("passes valid puzzles and names the broken ones", async () => {
    const [valid] = await readPuzzleFiles(folder);
    const broken = { relPath: "x/broken.json", jsonText: JSON.stringify({ version: 3, grid: [] }) };
    const notJson = { relPath: "x/not-json.json", jsonText: "{" };
    const problems = findInvalidPuzzles([valid!, broken, notJson]);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^x\/broken\.json: /);
    expect(problems[1]).toMatch(/^x\/not-json\.json: /);
  });
});
