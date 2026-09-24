import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import builtinHashesByPath from "virtual:puzzle-hashes";
import { getPuzzleById } from "../app/puzzleLibrary";
import { puzzleHash, readPuzzleFiles } from "../scripts/puzzleFiles";

describe("puzzle fingerprints", () => {
  const files = readPuzzleFiles(resolve(import.meta.dirname, ".."));

  it("match between the app build and the upload script", () => {
    expect(Object.keys(builtinHashesByPath)).toHaveLength(files.length);
    for (const file of files) {
      expect(builtinHashesByPath[file.relPath]).toBe(file.hash);
      expect(getPuzzleById(file.id)?.hash).toBe(file.hash);
    }
  });

  it("finds each puzzle's solution and source images", () => {
    const withSource = files.find((f) => f.images.some((i) => i.kind === "source"));
    expect(withSource).toBeDefined();
  });

  it("ignore formatting but not content or image changes", () => {
    const json = { meta: { id: "1" }, grid: [["ا"]] };
    const image = { kind: "source" as const, name: "1.webp", hash: "aaaa" };
    const base = puzzleHash(json, [image]);
    expect(puzzleHash(JSON.parse(JSON.stringify(json, null, 4)), [image])).toBe(base);
    expect(puzzleHash({ ...json, grid: [["ب"]] }, [image])).not.toBe(base);
    expect(puzzleHash(json, [{ ...image, hash: "bbbb" }])).not.toBe(base);
  });
});
