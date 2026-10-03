// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { entryImageRefs, type CatalogDoc, type PackDoc } from "../shared/cloudPuzzles";
import { basicPuzzleV3 } from "./fixtures";
import { createDraft, publishDraft, savePublishedPuzzle, unpublishPuzzle, type Draft } from "../app/admin/adminApi";
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

beforeEach(() => {
  localStorage.clear(); fake.store.clear(); fake.store.set("drafts/old", structuredClone(original)); fake.transactions = 0; fake.failCommit = false;
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("publishing with a new ID", () => {
  it.each(["foo$&bar", "foo$`bar", "foo$'bar", "foo$$bar", "foo$1bar"])("keeps replacement tokens literal when publishing as %s", async (id) => {
    await publishDraft(draft(), undefined, id);
    const entry = published(id), json = JSON.parse(entry.json);
    expect(entry.file).toBe(`admin/${id}.json`);
    expect(json.meta.id).toBe(id);
    expect(entryImageRefs(entry, json).find((image) => image.kind === "solution")?.name).toBe(`${id}.png`);
    expect(fake.store.has("drafts/old")).toBe(false);
  });

  it("rejects prototype keys at API boundaries without transactions, uploads or losing the source draft", async () => {
    for (const id of Object.getOwnPropertyNames(Object.prototype)) {
      const current = draft();
      await expect(publishDraft(current, undefined, id)).rejects.toThrow(/شناسه/);
      await expect(publishDraft({ ...current, id })).rejects.toThrow(/شناسه/);
      await expect(createDraft({ id, jsonText: current.jsonText, file: current.file, title: "", images: [{ kind: "solution", name: "solution.png", file: { name: "solution.png", bytes: new Uint8Array([1]) } }] })).rejects.toThrow(/شناسه/);
      await expect(savePublishedPuzzle(id, current.json)).rejects.toThrow(/شناسه/);
      await expect(unpublishPuzzle(id)).rejects.toThrow(/شناسه/);
    }
    expect(fake.transactions).toBe(0);
    expect(fake.store.get("drafts/old")).toEqual(original);
    expect(fake.store.has("catalog/index")).toBe(false);
  });

  it("publishes the ID and edited metadata atomically, preserves images and copies saved letters", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    saveProgress("old", { cells: { "0,0": "س" } });
    const current = draft();
    await publishDraft(current, { ...current.json, meta: { ...current.json.meta, title: "عنوان جدید", author: "طراح" } }, "  ۸۰۵۰  ");
    expect(fake.store.has("drafts/old")).toBe(false);
    expect(fake.store.has("drafts/8050")).toBe(false);
    const entry = published("8050");
    expect(entry).toMatchObject({ file: "admin/8050.json", images: { solution: images.solution.path, source: images.source.path } });
    expect(JSON.parse(entry.json)).toMatchObject({ ...storedPuzzle, meta: { id: "8050", title: "عنوان جدید", author: "طراح", sourceFile: "source.webp", publishedAt: expect.any(String) } });
    expect(fake.transactions).toBe(1);
    expect(loadProgress("8050")).toEqual(loadProgress("old"));
    expect(loadMirror().entries["8050"]).toMatchObject({ dirty: true, v: 0 });
  });

  it("rejects invalid, duplicate, published and missing IDs without changing the original", async () => {
    const current = draft();
    for (const id of ["", "bad/path", "bad.name", "bad\\name", "x".repeat(121)]) await expect(publishDraft(current, current.json, id)).rejects.toThrow(/شناسه/);
    expect(fake.transactions).toBe(0);
    fake.store.set("drafts/taken", { marker: "keep this" });
    await expect(publishDraft(current, current.json, "taken")).rejects.toThrow(/قبلاً استفاده/);
    expect(fake.store.get("drafts/taken")).toEqual({ marker: "keep this" });
    fake.store.set("catalog/index", { schema: 2, packs: { pack: { hash: "h", puzzles: { live: "h" } } } });
    fake.store.set("puzzlePacks/pack", { schema: 2, hash: "h", puzzles: { live: { file: "live.json", json: "{}", images: {} } } });
    await expect(publishDraft(current, current.json, "live")).rejects.toThrow(/منتشر شده/);
    await expect(publishDraft({ ...current, id: "missing" }, current.json, "new")).rejects.toThrow(/دیگر وجود ندارد/);
    expect(fake.store.get("drafts/old")).toEqual(original);
    expect(fake.store.has("drafts/new")).toBe(false);
  });

  it("keeps the draft and ID when commit fails or another admin updated its content", async () => {
    const current = draft();
    saveProgress("old", { cells: { "0,0": "س" } });
    fake.failCommit = true;
    await expect(publishDraft(current, current.json, "new")).rejects.toThrow("offline");
    expect(fake.store.get("drafts/old")).toEqual(original);
    expect(fake.store.has("drafts/new")).toBe(false);
    expect(loadProgress("new").cells).toEqual({});
    expect(fake.store.has("catalog/index")).toBe(false);
    fake.failCommit = false;
    const latest = { ...original, json: JSON.stringify({ ...current.json, meta: { title: "اصلاح تازه" } }) };
    fake.store.set("drafts/old", latest);
    await expect(publishDraft(current, current.json, "new")).rejects.toThrow(/محتوای پیش‌نویس تغییر کرده/);
    expect(fake.store.get("drafts/old")).toEqual(latest);
    expect(fake.store.has("catalog/index")).toBe(false);
  });

  it("also publishes with the existing ID for the solver's unchanged publish flow", async () => {
    await publishDraft(draft());
    const entry = published("old");
    expect(entry.file).toBe(original.file);
    expect(JSON.parse(entry.json).meta.id).toBe("old");
    expect(fake.store.has("drafts/old")).toBe(false);
  });
});
