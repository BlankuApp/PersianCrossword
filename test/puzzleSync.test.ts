import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal Firestore: documents by path; "in" queries on puzzles/ return the matching ids.
const cloud = vi.hoisted(() => ({ docs: new Map<string, unknown>(), queried: [] as string[][] }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  collection: (_db: unknown, name: string) => name,
  documentId: () => "__id__",
  where: (_field: string, _op: string, ids: string[]) => ids,
  query: (name: string, ids: string[]) => ({ name, ids }),
  getDoc: async (path: string) => ({ exists: () => cloud.docs.has(path), data: () => cloud.docs.get(path) }),
  getDocs: async ({ name, ids }: { name: string; ids: string[] }) => {
    cloud.queried.push(ids);
    const docs = ids
      .filter((id) => cloud.docs.has(`${name}/${id}`))
      .map((id) => ({ id, data: () => cloud.docs.get(`${name}/${id}`) }));
    return { docs };
  },
}));
vi.mock("../app/firebase", () => ({
  db: {},
  logAnalyticsEvent: () => {},
  storageFileUrl: (path: string) => `https://storage.test/${path}`,
}));

import { builtinHashes, getPuzzleById, listPuzzles, setStoredCatalog } from "../app/puzzleLibrary";
import { EMPTY_STORED_CATALOG } from "../app/puzzleCatalog";
import { readStoredCatalog, writeStoredCatalog } from "../app/puzzleStore";
import { syncPuzzleCatalog } from "../app/puzzleSync";

const builtinCount = Object.keys(builtinHashes).length;
const existing = getPuzzleById("14")!;

function publish(id: string, hash: string, json: unknown, images: Record<string, string> = {}): void {
  cloud.docs.set(`puzzles/${id}`, { schema: 1, hash, json: JSON.stringify(json), images });
}

function setCatalog(puzzles: Record<string, string>, removed: string[] = []): void {
  cloud.docs.set("catalog/index", { schema: 1, puzzles: { ...builtinHashes, ...puzzles }, removed });
}

const newPuzzleJson = (id: string) => ({ ...existing.json, meta: { ...existing.json.meta, id, title: `جدول ${id}` } });

beforeEach(async () => {
  cloud.docs.clear();
  cloud.queried.length = 0;
  await writeStoredCatalog(EMPTY_STORED_CATALOG);
  setStoredCatalog(EMPTY_STORED_CATALOG);
});

describe("syncPuzzleCatalog", () => {
  it("keeps the built-in puzzles when nothing was published yet", async () => {
    expect(await syncPuzzleCatalog()).toBe(false);
    expect(listPuzzles()).toHaveLength(builtinCount);
  });

  it("reads only the catalog when every published puzzle is built in", async () => {
    setCatalog({});
    await syncPuzzleCatalog();
    expect(cloud.queried).toEqual([]);
    expect(listPuzzles()).toHaveLength(builtinCount);
  });

  it("downloads new and changed puzzles, stores them, and lists them", async () => {
    const fixed = { ...existing.json, meta: { ...existing.json.meta, title: "اصلاح‌شده" } };
    publish("9001", "n1", newPuzzleJson("9001"), { solution: "puzzles/9001/abc.png" });
    publish("14", "fix1", fixed);
    setCatalog({ "9001": "n1", "14": "fix1" });

    expect(await syncPuzzleCatalog()).toBe(true);
    expect(cloud.queried.flat().sort()).toEqual(["14", "9001"]);
    expect(listPuzzles()).toHaveLength(builtinCount + 1);
    expect(getPuzzleById("9001")?.solutionImageUrl).toBe("https://storage.test/puzzles/9001/abc.png");
    expect(getPuzzleById("9001")?.filePath).toBeUndefined();
    expect(getPuzzleById("14")?.title).toBe("اصلاح‌شده");

    // Survives a restart: the device copy holds the same puzzles.
    const stored = await readStoredCatalog();
    expect(Object.keys(stored.downloaded).sort()).toEqual(["14", "9001"]);

    // Nothing new: the next check downloads nothing.
    cloud.queried.length = 0;
    expect(await syncPuzzleCatalog()).toBe(false);
    expect(cloud.queried).toEqual([]);
  });

  it("skips a document that doesn't hold the catalog's version yet, and retries later", async () => {
    publish("9002", "old", newPuzzleJson("9002"));
    setCatalog({ "9002": "new" });
    await syncPuzzleCatalog();
    expect(getPuzzleById("9002")).toBeUndefined();

    publish("9002", "new", newPuzzleJson("9002"));
    await syncPuzzleCatalog();
    expect(getPuzzleById("9002")).toBeDefined();
  });

  it("hides unpublished puzzles, built-in or downloaded", async () => {
    publish("9003", "n1", newPuzzleJson("9003"));
    setCatalog({ "9003": "n1" });
    await syncPuzzleCatalog();
    expect(getPuzzleById("9003")).toBeDefined();

    const { "14": _gone, ...rest } = builtinHashes;
    cloud.docs.set("catalog/index", { schema: 1, puzzles: rest, removed: ["14", "9003"] });
    await syncPuzzleCatalog();
    expect(getPuzzleById("14")).toBeUndefined();
    expect(getPuzzleById("9003")).toBeUndefined();
    expect(listPuzzles()).toHaveLength(builtinCount - 1);
  });
});
