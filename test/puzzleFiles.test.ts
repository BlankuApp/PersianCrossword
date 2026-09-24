import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { puzzleHash, readPuzzleFiles } from "../scripts/puzzleFiles";

const folder = resolve(import.meta.dirname, "puzzle-folder");

describe("readPuzzleFiles", () => {
  const files = readPuzzleFiles(folder);

  it("reads every puzzle with its id, path and images", () => {
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

  it("returns nothing for a missing folder", () => {
    expect(readPuzzleFiles(resolve(folder, "missing"))).toEqual([]);
  });
});

describe("puzzleHash", () => {
  it("ignores formatting but not content or image changes", () => {
    const json = { meta: { id: "1" }, grid: [["ا"]] };
    const image = { kind: "source" as const, name: "1.webp", hash: "aaaa" };
    const base = puzzleHash(json, [image]);
    expect(puzzleHash(JSON.parse(JSON.stringify(json, null, 4)), [image])).toBe(base);
    expect(puzzleHash({ ...json, grid: [["ب"]] }, [image])).not.toBe(base);
    expect(puzzleHash(json, [{ ...image, hash: "bbbb" }])).not.toBe(base);
  });
});
