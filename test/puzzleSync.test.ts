import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal Firestore: documents by path; "in" queries return the matching ids.
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

import sample10 from "../samples/sample-10x10-garden.json";
import { getPuzzleById, listPuzzles } from "../app/puzzleLibrary";
import { readStoredCatalog } from "../app/puzzleStore";
import { syncPuzzleCatalog } from "../app/puzzleSync";

type Entry = { hash: string; file: string; json: string; images: Record<string, string> };

const puzzle = (id: string, title = `جدول ${id}`, images: Record<string, string> = {}): Entry => ({
  hash: `${id}:${title}`,
  file: `x/${id}.json`,
  json: JSON.stringify({ ...sample10, meta: { ...sample10.meta, id, title } }),
  images,
});

// Publishes packs the way scripts/uploadPuzzles.ts does; the pack hash is just its contents here.
function publish(packs: Record<string, Entry[]>, { skipPackDocs = [] as string[] } = {}): void {
  const catalog: Record<string, { hash: string; puzzles: Record<string, string> }> = {};
  for (const [packId, entries] of Object.entries(packs)) {
    const hash = entries.map((e) => e.hash).join("|");
    catalog[packId] = { hash, puzzles: Object.fromEntries(entries.map((e) => [JSON.parse(e.json).meta.id, e.hash])) };
    if (skipPackDocs.includes(packId)) continue;
    const docPuzzles = Object.fromEntries(entries.map((e) => [JSON.parse(e.json).meta.id, e]));
    cloud.docs.set(`puzzlePacks/${packId}`, { schema: 2, hash, puzzles: docPuzzles });
  }
  cloud.docs.set("catalog/index", { schema: 2, packs: catalog, updatedAt: 1 });
}

const ids = () => listPuzzles().map((p) => p.id).sort();

beforeEach(() => {
  cloud.queried.length = 0;
});

// One sequence: the device state carries over between steps, as on a real phone.
describe("syncPuzzleCatalog", () => {
  it("fails without a published catalog, leaving the library empty", async () => {
    await expect(syncPuzzleCatalog()).rejects.toMatchObject({ code: "no-catalog" });
    expect(listPuzzles()).toEqual([]);
  });

  it("downloads every pack on a new device and keeps them on the device", async () => {
    publish({ p001: [puzzle("1"), puzzle("2", "دو", { source: "puzzles/2/abc.webp" })], p002: [puzzle("3")] });
    expect(await syncPuzzleCatalog()).toBe(true);
    expect(cloud.queried.flat().sort()).toEqual(["p001", "p002"]);
    expect(ids()).toEqual(["1", "2", "3"]);
    expect(getPuzzleById("2")?.sourceImageUrl).toBe("https://storage.test/puzzles/2/abc.webp");

    const stored = await readStoredCatalog();
    expect(Object.keys(stored.packs).sort()).toEqual(["p001", "p002"]);
  });

  it("reads only the catalog when nothing changed", async () => {
    expect(await syncPuzzleCatalog()).toBe(false);
    expect(cloud.queried).toEqual([]);
  });

  it("re-downloads only the pack holding an edited or new puzzle", async () => {
    publish({ p001: [puzzle("1"), puzzle("2", "دو", { source: "puzzles/2/abc.webp" })], p002: [puzzle("3", "اصلاح‌شده"), puzzle("4")] });
    await syncPuzzleCatalog();
    expect(cloud.queried).toEqual([["p002"]]);
    expect(getPuzzleById("3")?.title).toBe("اصلاح‌شده");
    expect(ids()).toEqual(["1", "2", "3", "4"]);
  });

  it("keeps the old pack while its new version isn't readable yet, then catches up", async () => {
    publish({ p001: [puzzle("1", "تازه"), puzzle("2")], p002: [puzzle("3", "اصلاح‌شده"), puzzle("4")] }, { skipPackDocs: ["p001"] });
    // The p001 document still holds the previous version: the device keeps its old copy.
    await syncPuzzleCatalog();
    expect(getPuzzleById("1")?.title).toBe("جدول 1");
    expect(ids()).toEqual(["1", "2", "3", "4"]);

    publish({ p001: [puzzle("1", "تازه"), puzzle("2")], p002: [puzzle("3", "اصلاح‌شده"), puzzle("4")] });
    await syncPuzzleCatalog();
    expect(getPuzzleById("1")?.title).toBe("تازه");
  });

  it("drops unpublished packs", async () => {
    publish({ p002: [puzzle("3", "اصلاح‌شده"), puzzle("4")] });
    await syncPuzzleCatalog();
    expect(ids()).toEqual(["3", "4"]);
  });
});
