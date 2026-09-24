import { describe, expect, it } from "vitest";
import {
  parseRemoteCatalog,
  planSync,
  sameStoredCatalog,
  storedPuzzles,
  type StoredCatalog,
  type StoredPack,
} from "../app/puzzleCatalog";
import type { CrosswordJson } from "../src/index";

const json = { version: 3, grid: [["ا"]], clues: { horizontal: {}, vertical: {} } } as unknown as CrosswordJson;
const storedPack = (hash: string, ids: string[]): StoredPack => ({
  hash,
  puzzles: Object.fromEntries(ids.map((id) => [id, { hash: `${id}-h`, json }])),
});

describe("parseRemoteCatalog", () => {
  it("reads pack hashes from a schema 2 catalog", () => {
    const data = { schema: 2, packs: { p001: { hash: "a", puzzles: { "1": "x" } } }, updatedAt: 1 };
    expect(parseRemoteCatalog(data)).toEqual({ packs: { p001: "a" } });
  });

  it("rejects other schemas and malformed data", () => {
    expect(parseRemoteCatalog({ schema: 1, puzzles: {} })).toBeNull();
    expect(parseRemoteCatalog({ schema: 2, packs: { p001: {} } })).toBeNull();
    expect(parseRemoteCatalog(undefined)).toBeNull();
  });
});

describe("planSync", () => {
  it("downloads everything on a new device", () => {
    const plan = planSync({ packs: {} }, { packs: { p001: "a", p002: "b" } });
    expect(plan.fetch).toEqual(["p001", "p002"]);
    expect(plan.keep).toEqual({});
  });

  it("downloads only changed packs and drops unpublished ones", () => {
    const stored: StoredCatalog = {
      packs: { p001: storedPack("a", ["1"]), p002: storedPack("b", ["2"]), p003: storedPack("c", ["3"]) },
    };
    const plan = planSync(stored, { packs: { p001: "a", p002: "b2" } });
    expect(plan.fetch).toEqual(["p002"]);
    expect(Object.keys(plan.keep)).toEqual(["p001"]);
  });
});

describe("stored catalog helpers", () => {
  it("lists every stored puzzle and compares catalogs by pack hash", () => {
    const a: StoredCatalog = { packs: { p001: storedPack("a", ["1", "2"]), p002: storedPack("b", ["3"]) } };
    expect(storedPuzzles(a).map(([id]) => id)).toEqual(["1", "2", "3"]);
    expect(sameStoredCatalog(a, { packs: { p002: a.packs.p002!, p001: a.packs.p001! } })).toBe(true);
    expect(sameStoredCatalog(a, { packs: { p001: a.packs.p001! } })).toBe(false);
  });
});
