import { describe, expect, it } from "vitest";
import {
  composeCatalog,
  parseRemoteCatalog,
  planSync,
  type DownloadedPuzzle,
  type StoredCatalog,
} from "../app/puzzleCatalog";
import type { CrosswordJson } from "../src/index";

const json = { version: 3, grid: [["ا"]], clues: { horizontal: {}, vertical: {} } } as unknown as CrosswordJson;
const download = (hash: string): DownloadedPuzzle => ({ hash, json });

describe("parseRemoteCatalog", () => {
  it("accepts a schema 1 catalog and defaults removed to empty", () => {
    expect(parseRemoteCatalog({ schema: 1, puzzles: { a: "h1" } })).toEqual({ puzzles: { a: "h1" }, removed: [] });
  });

  it("rejects unknown schemas and malformed data", () => {
    expect(parseRemoteCatalog({ schema: 2, puzzles: {} })).toBeNull();
    expect(parseRemoteCatalog({ schema: 1, puzzles: { a: 1 } })).toBeNull();
    expect(parseRemoteCatalog(undefined)).toBeNull();
  });
});

describe("planSync", () => {
  const builtin = { a: "a1", b: "b1" };

  it("downloads only puzzles the app neither ships nor already downloaded", () => {
    const remote = { puzzles: { a: "a1", b: "b2", c: "c1", d: "d1" }, removed: [] };
    const plan = planSync(builtin, { d: download("d1") }, remote);
    expect(plan.fetch).toEqual(["b", "c"]);
    expect(Object.keys(plan.keep)).toEqual(["d"]);
  });

  it("drops downloads that are outdated, removed, or now built in", () => {
    const remote = { puzzles: { a: "a1", c: "c2" }, removed: ["d"] };
    const plan = planSync(builtin, { a: download("a0"), c: download("c1"), d: download("d1") }, remote);
    expect(plan.fetch).toEqual(["c"]);
    expect(plan.keep).toEqual({});
  });
});

describe("composeCatalog", () => {
  const builtins = [
    { id: "a", hash: "a1" },
    { id: "b", hash: "b1" },
  ];

  it("shows the built-in puzzles when nothing was downloaded yet", () => {
    const list = composeCatalog(builtins, { catalog: null, downloaded: {} });
    expect(list.map((p) => [p.id, p.downloaded])).toEqual([["a", undefined], ["b", undefined]]);
  });

  it("swaps in downloaded versions, adds new puzzles and hides removed ones", () => {
    const stored: StoredCatalog = {
      catalog: { puzzles: { b: "b2", c: "c1" }, removed: ["a"] },
      downloaded: { b: download("b2"), c: download("c1") },
    };
    const list = composeCatalog(builtins, stored);
    expect(list.map((p) => [p.id, p.downloaded?.hash])).toEqual([["b", "b2"], ["c", "c1"]]);
  });

  it("keeps built-in puzzles the catalog doesn't know about yet", () => {
    const list = composeCatalog(builtins, { catalog: { puzzles: { a: "a1" }, removed: [] }, downloaded: {} });
    expect(list.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("prefers a built-in copy that already matches the catalog over an older download", () => {
    const stored: StoredCatalog = { catalog: { puzzles: { a: "a1" }, removed: [] }, downloaded: { a: download("a0") } };
    expect(composeCatalog(builtins, stored)[0]?.downloaded).toBeUndefined();
  });
});
