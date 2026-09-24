import { describe, expect, it } from "vitest";
import {
  countMissingLetters,
  entryImageRefs,
  imageStoragePath,
  PACK_SIZE,
  packForNewPuzzle,
  packHash,
  planPacks,
  puzzleHash,
  type CatalogPack,
} from "../shared/cloudPuzzles";

const puzzles = (n: number, from = 1, hash = "h") => Array.from({ length: n }, (_, i) => ({ id: String(from + i), hash }));
const pack = async (entries: Record<string, string>): Promise<CatalogPack> => ({ hash: await packHash(entries), puzzles: entries });

describe("planPacks", () => {
  it("fills packs of PACK_SIZE in order on the first upload", async () => {
    const plan = await planPacks({}, puzzles(PACK_SIZE + 3));
    expect(Object.keys(plan.packs)).toEqual(["p001", "p002"]);
    expect(Object.keys(plan.packs.p001!.puzzles)).toHaveLength(PACK_SIZE);
    expect(Object.keys(plan.packs.p002!.puzzles)).toEqual(["51", "52", "53"]);
    expect(plan.dirty).toEqual(["p001", "p002"]);
  });

  it("rewrites nothing when nothing changed", async () => {
    const first = await planPacks({}, puzzles(60));
    const again = await planPacks(first.packs, puzzles(60));
    expect(again.dirty).toEqual([]);
    expect(again.deleted).toEqual([]);
  });

  it("rewrites only the pack of an edited puzzle and keeps puzzles in their pack", async () => {
    const first = await planPacks({}, puzzles(60));
    const plan = await planPacks(first.packs, [{ id: "3", hash: "edited" }]);
    expect(plan.dirty).toEqual(["p001"]);
    expect(plan.packs.p001!.puzzles["3"]).toBe("edited");
    expect(Object.keys(plan.packs.p002!.puzzles)).toHaveLength(10);
  });

  it("adds new puzzles to the newest pack until it is full", async () => {
    const current = { p001: await pack(Object.fromEntries(puzzles(PACK_SIZE - 1).map((p) => [p.id, p.hash]))) };
    const plan = await planPacks(current, puzzles(2, PACK_SIZE));
    expect(Object.keys(plan.packs.p001!.puzzles)).toHaveLength(PACK_SIZE);
    expect(Object.keys(plan.packs.p002!.puzzles)).toEqual([String(PACK_SIZE + 1)]);
    expect(plan.dirty).toEqual(["p001", "p002"]);
  });

  it("removes puzzles and deletes emptied packs", async () => {
    const current = { p001: await pack({ a: "h" }), p002: await pack({ b: "h", c: "h" }) };
    const plan = await planPacks(current, [], ["a", "b"]);
    expect(plan.deleted).toEqual(["p001"]);
    expect(plan.dirty).toEqual(["p002"]);
    expect(Object.keys(plan.packs)).toEqual(["p002"]);
    expect(plan.packs.p002!.puzzles).toEqual({ c: "h" });
  });
});

describe("packForNewPuzzle", () => {
  it("uses the newest pack while it has room", async () => {
    expect(packForNewPuzzle({})).toBe("p001");
    expect(packForNewPuzzle({ p001: { puzzles: { a: "h" } } })).toBe("p001");
    const full = Object.fromEntries(puzzles(PACK_SIZE).map((p) => [p.id, p.hash]));
    expect(packForNewPuzzle({ p001: { puzzles: full } })).toBe("p002");
  });
});

describe("puzzle fingerprints", () => {
  it("ignore formatting and image order, not content or image changes", async () => {
    const json = { meta: { id: "1" }, grid: [["ا"]] };
    const solution = { kind: "solution" as const, name: "1.png", hash: "aaaa" };
    const source = { kind: "source" as const, name: "1.webp", hash: "bbbb" };
    const base = await puzzleHash(json, [solution, source]);
    expect(await puzzleHash(JSON.parse(JSON.stringify(json, null, 4)), [source, solution])).toBe(base);
    expect(await puzzleHash({ ...json, grid: [["ب"]] }, [solution, source])).not.toBe(base);
    expect(await puzzleHash(json, [solution, { ...source, hash: "cccc" }])).not.toBe(base);
  });

  it("rebuild a published entry's images from their storage paths", () => {
    const entry = {
      file: "151-200/185_9057_normal.json",
      images: {
        solution: imageStoragePath("185", { name: "185_9057_normal.png", hash: "1111" }),
        source: imageStoragePath("185", { name: "9057.webp", hash: "2222" }),
      },
    };
    expect(entryImageRefs(entry, { meta: { sourceFile: "9057.webp" } })).toEqual([
      { kind: "solution", name: "185_9057_normal.png", hash: "1111" },
      { kind: "source", name: "9057.webp", hash: "2222" },
    ]);
  });
});

describe("countMissingLetters", () => {
  it("counts open cells without a letter, not blocks", () => {
    expect(countMissingLetters({ grid: [["ا", "", " "], [" ", "ب", ""]] })).toBe(2);
    expect(countMissingLetters({ grid: [["ا", ""]] })).toBe(0);
  });
});
