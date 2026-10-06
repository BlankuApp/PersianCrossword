// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { setDoc } from "firebase/firestore";
import { entryImageRefs, puzzleHash, type CatalogDoc, type PackDoc } from "../shared/cloudPuzzles";
import { basicPuzzleV3 } from "./fixtures";
import { createDraft, publishDraft, renameDraft, saveDraftMeta, savePublishedPuzzle, unpublishPuzzle, type Draft } from "../app/admin/adminApi";
import { loadMirror, loadProgress, saveProgress } from "../app/progress";

// The core fixture uses LTR board coordinates; Firebase stores repository-format RTL rows.
const storedPuzzle = { ...basicPuzzleV3, grid: basicPuzzleV3.grid.map((row) => [...row].reverse()) };

type Data = Record<string, unknown>;
const fake = vi.hoisted(() => ({ store: new Map<string, Data>(), transactions: 0, failCommit: false }));
vi.mock("../app/firebase", () => ({ db: {}, firebaseApp: {}, usingEmulators: false, storageFileUrl: (path: string) => path }));
vi.mock("firebase/storage", () => ({ getStorage: () => ({}), connectStorageEmulator: vi.fn(), getMetadata: vi.fn(), ref: vi.fn(), uploadBytes: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), deleteDoc: vi.fn(), onSnapshot: vi.fn(), setDoc: vi.fn(),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  runTransaction: async (_db: unknown, action: (tx: unknown) => Promise<void>) => {
    fake.transactions++;
    const writes: Array<[string, Data | null]> = [];
    await action({
      get: async ({ path }: { path: string }) => {
        if (writes.length) throw new Error("Firestore reads must precede writes");
        return { exists: () => fake.store.has(path), data: () => structuredClone(fake.store.get(path)) };
      },
      set: ({ path }: { path: string }, data: Data) => writes.push([path, structuredClone(data)]),
      delete: ({ path }: { path: string }) => writes.push([path, null]),
    });
    if (fake.failCommit) throw new Error("offline");
    for (const [path, data] of writes) { if (data === null) fake.store.delete(path); else fake.store.set(path, data); }
  },
}));

const images = { solution: { path: "puzzles/old/hash-old.png", name: "old.png", hash: "solution-hash" },
  source: { path: "puzzles/old/hash-source.webp", name: "source.webp", hash: "source-hash" } };
const original = { schema: 1, file: "admin/old.json", createdAt: 10, updatedAt: 20, images,
  json: JSON.stringify({ ...storedPuzzle, meta: { id: "old", title: "آخرین اصلاح", sourceFile: "source.webp" } }) };

const draft = (): Draft => ({ id: "old", json: JSON.parse(original.json), jsonText: original.json,
  file: original.file, images, updatedAt: original.updatedAt, solutionImageUrl: undefined, sourceImageUrl: undefined });
const published = (id: string) => {
  const catalog = fake.store.get("catalog/index") as unknown as CatalogDoc;
  const packId = Object.keys(catalog.packs).find((key) => id in catalog.packs[key]!.puzzles)!;
  return (fake.store.get(`puzzlePacks/${packId}`) as unknown as PackDoc).puzzles[id]!;
};

type DraftData = { json: string; file: string; images: Record<string, { path: string; name: string; hash: string }>; createdAt: number; updatedAt: number };
const stored = (id: string) => fake.store.get(`drafts/${id}`) as unknown as DraftData;
const publishedElsewhere = () => {
  fake.store.set("catalog/index", { schema: 2, packs: { pack: { hash: "h", puzzles: { live: "h" } } } });
  fake.store.set("puzzlePacks/pack", { schema: 2, hash: "h", puzzles: { live: { file: "live.json", json: "{}", images: {} } } });
};

beforeEach(() => {
  vi.mocked(setDoc).mockClear();
  localStorage.clear(); fake.store.clear(); fake.store.set("drafts/old", structuredClone(original)); fake.transactions = 0; fake.failCommit = false;
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("renaming a draft", () => {
  it.each(["foo$&bar", "foo$`bar", "foo$'bar", "foo$$bar", "foo$1bar"])("keeps replacement tokens literal when renaming to %s", async (id) => {
    const current = draft();
    await renameDraft(current, current.json, id);
    expect(stored(id).file).toBe(`admin/${id}.json`);
    expect(JSON.parse(stored(id).json).meta.id).toBe(id);
    expect(stored(id).images.solution!.name).toBe(`${id}.png`);
    expect(fake.store.has("drafts/old")).toBe(false);
  });

  it("moves the draft with the edited metadata in one transaction, keeps images and createdAt, copies saved letters", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    saveProgress("old", { cells: { "0,0": "س" } });
    const current = draft();
    await renameDraft(current, { ...current.json, meta: { ...current.json.meta, title: "عنوان جدید", author: "طراح" } }, "  ۸۰۵۰  ");
    expect(fake.store.has("drafts/old")).toBe(false);
    expect(stored("8050")).toMatchObject({ file: "admin/8050.json", createdAt: 10, updatedAt: 100, images: { source: images.source, solution: { ...images.solution, name: "8050.png" } } });
    expect(JSON.parse(stored("8050").json).meta).toMatchObject({ id: "8050", title: "عنوان جدید", author: "طراح", sourceFile: "source.webp" });
    expect(fake.store.has("catalog/index")).toBe(false);
    expect(fake.transactions).toBe(1);
    expect(loadProgress("8050")).toEqual(loadProgress("old"));
    expect(loadMirror().entries["8050"]).toMatchObject({ dirty: true, v: 0 });
  });

  it("rejects invalid, equal, used and published ids without touching anything", async () => {
    const current = draft();
    for (const id of ["", "bad/path", "bad.name", "bad\\name", "x".repeat(121), ...Object.getOwnPropertyNames(Object.prototype)]) await expect(renameDraft(current, current.json, id)).rejects.toThrow(/شناسه/);
    await expect(renameDraft(current, current.json, "old")).rejects.toThrow(/شناسه/);
    expect(fake.transactions).toBe(0);
    fake.store.set("drafts/taken", { marker: "keep this" });
    await expect(renameDraft(current, current.json, "taken")).rejects.toThrow(/قبلاً استفاده/);
    expect(fake.store.get("drafts/taken")).toEqual({ marker: "keep this" });
    publishedElsewhere();
    await expect(renameDraft(current, current.json, "live")).rejects.toThrow(/منتشر شده/);
    await expect(renameDraft({ ...current, id: "missing" }, current.json, "new")).rejects.toThrow(/دیگر وجود ندارد/);
    expect(fake.store.get("drafts/old")).toEqual(original);
    expect(fake.store.has("drafts/new")).toBe(false);
  });

  it("keeps the draft when the commit fails or another admin changed its content", async () => {
    const current = draft();
    saveProgress("old", { cells: { "0,0": "س" } });
    fake.failCommit = true;
    await expect(renameDraft(current, current.json, "new")).rejects.toThrow("offline");
    expect(fake.store.get("drafts/old")).toEqual(original);
    expect(fake.store.has("drafts/new")).toBe(false);
    expect(loadProgress("new").cells).toEqual({});
    fake.failCommit = false;
    const latest = { ...original, json: JSON.stringify({ ...current.json, meta: { title: "اصلاح تازه" } }) };
    fake.store.set("drafts/old", latest);
    await expect(renameDraft(current, current.json, "new")).rejects.toThrow(/محتوای پیش‌نویس تغییر کرده/);
    expect(fake.store.get("drafts/old")).toEqual(latest);
    expect(fake.store.has("drafts/new")).toBe(false);
  });

  it("refuses a puzzle that fails validation", async () => {
    const current = draft();
    await expect(renameDraft(current, { ...current.json, grid: [] }, "new")).rejects.toThrow();
    expect(fake.transactions).toBe(0);
  });
});

describe("saving draft metadata", () => {
  it("saves in place when the id is unchanged and renames when it changed", async () => {
    const current = draft();
    await saveDraftMeta(current, current.json, "old");
    expect(setDoc).toHaveBeenCalledOnce();
    expect(fake.transactions).toBe(0);
    await saveDraftMeta(current, current.json, "renamed");
    expect(fake.transactions).toBe(1);
    expect(fake.store.has("drafts/renamed")).toBe(true);
    expect(fake.store.has("drafts/old")).toBe(false);
  });
});

describe("saving a published puzzle", () => {
  it("refuses a json whose meta.id differs from the puzzle id and accepts a numeric one that matches", async () => {
    await expect(savePublishedPuzzle("old", { ...storedPuzzle, meta: { id: "other" } })).rejects.toThrow(/شناسه/);
    expect(fake.transactions).toBe(0);
    fake.store.set("catalog/index", { schema: 2, packs: { pack: { hash: "h", puzzles: { "65": "h" } } } });
    fake.store.set("puzzlePacks/pack", { schema: 2, hash: "h", puzzles: { "65": { file: "65.json", json: "{}", hash: "h", images: {} } } });
    await savePublishedPuzzle("65", { ...storedPuzzle, meta: { id: 65 as unknown as string } });
    expect(JSON.parse(published("65").json).meta.id).toBe(65);
  });
});

describe("publishing", () => {
  it("rejects prototype keys at API boundaries without transactions, uploads or losing the source draft", async () => {
    for (const id of Object.getOwnPropertyNames(Object.prototype)) {
      const current = draft();
      await expect(renameDraft(current, current.json, id)).rejects.toThrow(/شناسه/);
      await expect(publishDraft({ ...current, id })).rejects.toThrow(/شناسه/);
      await expect(createDraft({ id, jsonText: current.jsonText, file: current.file, title: "", images: [{ kind: "solution", name: "solution.png", file: { name: "solution.png", bytes: new Uint8Array([1]) } }] })).rejects.toThrow(/شناسه/);
      await expect(savePublishedPuzzle(id, current.json)).rejects.toThrow(/شناسه/);
      await expect(unpublishPuzzle(id)).rejects.toThrow(/شناسه/);
    }
    expect(fake.transactions).toBe(0);
    expect(fake.store.get("drafts/old")).toEqual(original);
    expect(fake.store.has("catalog/index")).toBe(false);
  });

  it("publishes under the draft's id with the given metadata, stamps publishedAt and keeps images", async () => {
    const current = draft();
    await publishDraft(current, { ...current.json, meta: { ...current.json.meta, title: "عنوان جدید" } });
    const entry = published("old"), json = JSON.parse(entry.json);
    expect(entry).toMatchObject({ file: original.file, images: { solution: images.solution.path, source: images.source.path } });
    expect(json.meta).toMatchObject({ id: "old", title: "عنوان جدید", sourceFile: "source.webp", publishedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(entry.hash).toBe(await puzzleHash(json, entryImageRefs(entry, json)));
    expect(fake.store.has("drafts/old")).toBe(false);
    expect(fake.transactions).toBe(1);
  });

  it("refuses an id that is already published or a draft that vanished, leaving the draft", async () => {
    const current = draft();
    publishedElsewhere();
    await expect(publishDraft({ ...current, id: "live" })).rejects.toThrow(/منتشر شده/);
    await expect(publishDraft({ ...current, id: "missing" })).rejects.toThrow(/دیگر وجود ندارد/);
    expect(fake.store.get("drafts/old")).toEqual(original);
  });

  it("keeps the draft when the commit fails or another admin updated its content", async () => {
    const current = draft();
    fake.failCommit = true;
    await expect(publishDraft(current)).rejects.toThrow("offline");
    expect(fake.store.get("drafts/old")).toEqual(original);
    fake.failCommit = false;
    const latest = { ...original, json: JSON.stringify({ ...current.json, meta: { title: "اصلاح تازه" } }) };
    fake.store.set("drafts/old", latest);
    await expect(publishDraft(current)).rejects.toThrow(/محتوای پیش‌نویس تغییر کرده/);
    expect(fake.store.get("drafts/old")).toEqual(latest);
    expect(fake.store.has("catalog/index")).toBe(false);
  });
});
