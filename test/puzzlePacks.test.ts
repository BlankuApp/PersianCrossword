import { describe, expect, it } from "vitest";
import { PACK_SIZE, packHash, planPacks, type CatalogPack } from "../scripts/puzzlePacks";

const puzzles = (n: number, from = 1, hash = "h") =>
  Array.from({ length: n }, (_, i) => ({ id: String(from + i), hash }));

const pack = (entries: Record<string, string>): CatalogPack => ({ hash: packHash(entries), puzzles: entries });

describe("planPacks", () => {
  it("fills packs of PACK_SIZE in order on the first upload", () => {
    const plan = planPacks({}, puzzles(PACK_SIZE + 3), false);
    expect(Object.keys(plan.packs)).toEqual(["p001", "p002"]);
    expect(Object.keys(plan.packs.p001!.puzzles)).toHaveLength(PACK_SIZE);
    expect(Object.keys(plan.packs.p002!.puzzles)).toEqual(["51", "52", "53"]);
    expect(plan.dirty).toEqual(["p001", "p002"]);
  });

  it("rewrites nothing when nothing changed", () => {
    const first = planPacks({}, puzzles(60), false);
    const again = planPacks(first.packs, puzzles(60), false);
    expect(again.dirty).toEqual([]);
    expect(again.deleted).toEqual([]);
  });

  it("rewrites only the pack of an edited puzzle and keeps puzzles in their pack", () => {
    const first = planPacks({}, puzzles(60), false);
    const edited = puzzles(60).map((p) => (p.id === "3" ? { ...p, hash: "edited" } : p));
    const plan = planPacks(first.packs, edited, false);
    expect(plan.dirty).toEqual(["p001"]);
    expect(plan.packs.p001!.puzzles["3"]).toBe("edited");
  });

  it("adds new puzzles to the newest pack until it is full", () => {
    const current = { p001: pack(Object.fromEntries(puzzles(PACK_SIZE - 1).map((p) => [p.id, p.hash]))) };
    const plan = planPacks(current, puzzles(PACK_SIZE + 1), false);
    expect(Object.keys(plan.packs.p001!.puzzles)).toHaveLength(PACK_SIZE);
    expect(Object.keys(plan.packs.p002!.puzzles)).toEqual([String(PACK_SIZE + 1)]);
    expect(plan.dirty).toEqual(["p001", "p002"]);
  });

  it("keeps published puzzles missing locally unless pruning, and deletes emptied packs", () => {
    const current = { p001: pack({ a: "h" }), p002: pack({ b: "h", c: "h" }) };
    const local = [{ id: "c", hash: "h" }];
    expect(planPacks(current, local, false).dirty).toEqual([]);

    const pruned = planPacks(current, local, true);
    expect(pruned.deleted).toEqual(["p001"]);
    expect(pruned.dirty).toEqual(["p002"]);
    expect(Object.keys(pruned.packs)).toEqual(["p002"]);
    expect(pruned.packs.p002!.puzzles).toEqual({ c: "h" });
  });
});
