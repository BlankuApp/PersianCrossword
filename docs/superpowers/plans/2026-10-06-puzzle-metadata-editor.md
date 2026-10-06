# Unified Puzzle Metadata Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared metadata form/dialog for id, title, newspaper, difficulty, author and advanced fields (sourceFile, size, publishedAt), used by the draft row, both solver editor toolbars and the photo import, with metadata saved as its own step for drafts and published puzzles.

**Architecture:** A pure module (`puzzleMeta.ts`) turns puzzle JSON into a form and back; a controlled `PuzzleMetaEditor` renders the fields; `PuzzleMetaDialog` wraps it with dirty/save/discard logic. `adminApi` gains `renameDraft` + `saveDraftMeta` (draft id changes) and a simplified `publishDraft`. `SolverPage` gets a "مشخصات" toolbar action through new optional `PuzzleEditor.saveMeta/takenIds`. New components live in `app/components/` so the solver bundle never imports admin code.

**Tech Stack:** React 18 + Vite (RTL Persian UI), TypeScript with `exactOptionalPropertyTypes`, Firebase Firestore transactions, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-06-puzzle-metadata-editor-design.md`

**Commits are deferred:** the user said "continue the task without commiting anything yet". No task below has a commit step; do not run `git commit` and do not configure a git identity. Leave all changes in the working tree.

## Global Constraints

- Persian UI strings exactly as written in this plan; labels `شناسهٔ جدول`, `عنوان`, `روزنامه`, `سطح`, `طراح` keep their current text (existing photo-import tests find them by label).
- `difficulty` options: `عادی`, `ویژه`; any other current value is added as an extra option (never silently rewritten); an empty current value gets a `تعیین نشده` option.
- `title` is required to save in the dialog (not in photo import, which keeps its `جدول {number}` fallback); empty optional fields are dropped from `meta`, never written as `""`.
- `id`: editable on drafts, read-only on published puzzles. A draft id change = rename (`renameDraft`); publishing never changes the id.
- `size` is read-only, derived from the grid; `publishedAt` is read-only and stamped only by `publishDraft` (publish day, local `YYYY-MM-DD`).
- `meta.language`, `meta.direction`, `meta.publishedAt` and unknown meta keys are preserved by every metadata save.
- Solver/components must not import `app/admin/adminApi` (lazy admin bundle). `app/admin/importPlan.ts#isValidPuzzleId` may be imported (pure).
- Both tsconfigs use `exactOptionalPropertyTypes`: optional props that may receive `undefined` are typed `?: T | undefined`.
- Persian text is never compared with raw string tricks here; digits typed into inputs are shown Persian (`toPersianDigits`), ids are stored ASCII (`toAsciiDigits`).
- Checks: `npm run typecheck` and `npm run test` must pass at the end of every task.

## Review Focus

1. **Metadata then clue/answer save in the solver** must not revert the metadata (stale `editedJsonRef`) → Task 5 test.
2. **Rename onto an id that is equal, a draft, or published** must never overwrite or delete anything → Task 2 tests.
3. **Rename while another admin changed the draft** (stale snapshot) is rejected and changes nothing → Task 2 tests.
4. **Odd existing data**: numeric `meta.title`/`author`, missing `meta.id`/`size`, wrong `size`, difficulty not in the list, emptied `sourceFile` while a source image exists → Task 1 tests.
5. **Failed or double-submitted save in the dialog**: error shown and edits kept, dialog stays open, Save disabled while saving, discard confirmation when dirty → Task 4 tests.

## File Structure

| File | Responsibility |
|---|---|
| `app/components/puzzleMeta.ts` (new) | Pure form⇄JSON conversion, id validation, difficulty options |
| `app/components/PuzzleMetaEditor.tsx` (new) | Controlled metadata fields (main + collapsed "پیشرفته") |
| `app/components/PuzzleMetaDialog.tsx` (new) | Modal: dirty/save/discard/error logic around the editor |
| `app/components/MetaSummary.tsx` (new) | Read-only metadata summary + "ویرایش مشخصات" |
| `app/admin/PublishConfirmDialog.tsx` (new) | Draft-row publish confirmation (summary + readiness) |
| `app/admin/adminApi.ts` | `renameDraft`, `saveDraftMeta`, simplified `publishDraft` |
| `app/pages/SolverPage.tsx` | `PuzzleEditor.saveMeta/takenIds`, toolbar "مشخصات", dialog, summary in publish confirm |
| `app/admin/DraftPage.tsx`, `app/App.tsx` | Implement `saveMeta` for drafts / published puzzles |
| `app/admin/AdminPage.tsx` | Draft row: "مشخصات" + `PublishConfirmDialog`; inline publish form removed |
| `app/admin/PhotoImportSection.tsx`, `adminSettings.ts` | Embed `PuzzleMetaEditor`; settings type |
| `app/components/PublishMetaFields.tsx` | Deleted at the end |
| `app/styles.css` | Small additions for the new components; dead publish-form rules removed |

---

### Task 1: Pure metadata module

**Files:**
- Create: `app/components/puzzleMeta.ts`
- Test: `test/puzzleMeta.test.ts`

**Interfaces:**
- Consumes: `isValidPuzzleId(id: string): boolean` from `app/admin/importPlan.ts`; `toAsciiDigits(value: string): string` from `app/persianNumbers.ts`; `CrosswordJson`, `CrosswordMeta` from `src/index`.
- Produces (later tasks rely on these exact names):
  - `interface PuzzleMetaForm { id: string; title: string; newspaper: string; difficulty: string; author: string; sourceFile: string }`
  - `type MetaTextFields = Pick<PuzzleMetaForm, "title" | "newspaper" | "difficulty" | "author">`
  - `const ID_INVALID: string`, `const ID_TAKEN: string`
  - `metaFormOf(json: CrosswordJson, id: string): PuzzleMetaForm`
  - `applyMetaForm(json: CrosswordJson, form: PuzzleMetaForm, hasSourceImage: boolean): CrosswordJson`
  - `metaIdProblem(id: string, ownId: string, takenIds?: ReadonlySet<string>): string`
  - `difficultyOptions(current: string): string[]`

- [ ] **Step 1: Write the failing tests** — create `test/puzzleMeta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CrosswordJson } from "../src/index";
import { applyMetaForm, difficultyOptions, ID_INVALID, ID_TAKEN, metaFormOf, metaIdProblem } from "../app/components/puzzleMeta";
import { basicPuzzleV3 } from "./fixtures";

const withMeta = (meta: Record<string, unknown>): CrosswordJson => ({ ...basicPuzzleV3, meta: meta as CrosswordJson["meta"] });
const full = withMeta({
  id: "p1", title: "عنوان", newspaper: "ایران", difficulty: "عادی", author: "طراح",
  publishedAt: "2026-01-02", language: "fa", direction: "rtl", sourceFile: "src.png", size: { rows: 9, cols: 9 }, custom: "keep",
});
const form = (patch: Partial<ReturnType<typeof metaFormOf>> = {}) => ({ ...metaFormOf(full, "p1"), ...patch });

describe("metaFormOf", () => {
  it("reads strings, turns numbers into text and missing values into empty strings", () => {
    expect(metaFormOf(full, "p1")).toEqual({ id: "p1", title: "عنوان", newspaper: "ایران", difficulty: "عادی", author: "طراح", sourceFile: "src.png" });
    expect(metaFormOf(withMeta({ title: 7, author: 12 }), "x")).toEqual({ id: "x", title: "7", newspaper: "", difficulty: "", author: "12", sourceFile: "" });
    expect(metaFormOf(basicPuzzleV3, "x").title).toBe("");
  });
});

describe("applyMetaForm", () => {
  it("trims values, sets id (ASCII digits) and derives size from the grid", () => {
    const next = applyMetaForm(full, form({ id: "۸۰۵۰", title: "  تازه  " }), true);
    expect(next.meta).toMatchObject({ id: "8050", title: "تازه", size: { rows: 3, cols: 4 } });
  });
  it("keeps publishedAt, language, direction, unknown keys and the grid/clues", () => {
    const next = applyMetaForm(full, form({ title: "x" }), true);
    expect(next.meta).toMatchObject({ publishedAt: "2026-01-02", language: "fa", direction: "rtl", custom: "keep" });
    expect(next.grid).toBe(full.grid);
    expect(next.clues).toBe(full.clues);
  });
  it("drops empty optional fields instead of writing empty strings", () => {
    const meta = applyMetaForm(full, form({ newspaper: " ", author: "", difficulty: "" }), true).meta!;
    expect(meta).not.toHaveProperty("newspaper");
    expect(meta).not.toHaveProperty("author");
    expect(meta).not.toHaveProperty("difficulty");
  });
  it("changes sourceFile only when a source image exists and the new name is not empty", () => {
    expect(applyMetaForm(full, form({ sourceFile: "new.png" }), true).meta?.sourceFile).toBe("new.png");
    expect(applyMetaForm(full, form({ sourceFile: "new.png" }), false).meta?.sourceFile).toBe("src.png");
    expect(applyMetaForm(full, form({ sourceFile: "  " }), true).meta?.sourceFile).toBe("src.png");
  });
  it("repairs missing meta.id/size and is idempotent", () => {
    const once = applyMetaForm(basicPuzzleV3, { ...metaFormOf(basicPuzzleV3, "q"), title: "t" }, false);
    expect(once.meta).toMatchObject({ id: "q", title: "t", size: { rows: 3, cols: 4 } });
    expect(JSON.stringify(applyMetaForm(once, metaFormOf(once, "q"), false))).toBe(JSON.stringify(once));
  });
});

describe("metaIdProblem", () => {
  const taken = new Set(["a", "b"]);
  it("accepts a new valid id and the puzzle's own id", () => {
    expect(metaIdProblem("c", "a", taken)).toBe("");
    expect(metaIdProblem("a", "a", taken)).toBe("");
    expect(metaIdProblem("۸۰۵۰", "a", taken)).toBe("");
  });
  it("rejects invalid ids and ids used by another puzzle", () => {
    for (const id of ["", "bad/id", "bad.id", "  ", "constructor", "x".repeat(121)]) expect(metaIdProblem(id, "a", taken)).toBe(ID_INVALID);
    expect(metaIdProblem("b", "a", taken)).toBe(ID_TAKEN);
    expect(metaIdProblem("b", "a")).toBe("");
  });
});

describe("difficultyOptions", () => {
  it("offers the two levels, plus an unknown current value or an empty choice", () => {
    expect(difficultyOptions("عادی")).toEqual(["عادی", "ویژه"]);
    expect(difficultyOptions("ویژه")).toEqual(["عادی", "ویژه"]);
    expect(difficultyOptions("سخت")).toEqual(["عادی", "ویژه", "سخت"]);
    expect(difficultyOptions("")).toEqual(["", "عادی", "ویژه"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/puzzleMeta.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `app/components/puzzleMeta.ts`:

```ts
// Pure conversion between a puzzle's meta and the metadata form (no React, no Firebase), so the
// solver and the admin panel share one definition of what a metadata edit does.
import type { CrosswordJson } from "../../src/index";
import { isValidPuzzleId } from "../admin/importPlan";
import { toAsciiDigits } from "../persianNumbers";

export interface PuzzleMetaForm {
  readonly id: string;
  readonly title: string;
  readonly newspaper: string;
  readonly difficulty: string;
  readonly author: string;
  readonly sourceFile: string;
}
export type MetaTextFields = Pick<PuzzleMetaForm, "title" | "newspaper" | "difficulty" | "author">;

export const ID_INVALID = "شناسهٔ کوتاه و بدون نقطه، / یا نویسه‌های ویژهٔ نام فایل وارد کنید.";
export const ID_TAKEN = "این شناسه قبلاً استفاده شده است.";
const DIFFICULTIES = ["عادی", "ویژه"];

// meta isn't validated on import: a number (e.g. "author": 12) must still reach the form as text.
const text = (value: unknown): string => (value === undefined || value === null ? "" : String(value));

export function metaFormOf(json: CrosswordJson, id: string): PuzzleMetaForm {
  const meta = json.meta;
  return { id, title: text(meta?.title), newspaper: text(meta?.newspaper), difficulty: text(meta?.difficulty), author: text(meta?.author), sourceFile: text(meta?.sourceFile) };
}

export function applyMetaForm(json: CrosswordJson, form: PuzzleMetaForm, hasSourceImage: boolean): CrosswordJson {
  const meta: Record<string, unknown> = { ...json.meta };
  const setOrDrop = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) meta[key] = trimmed;
    else delete meta[key];
  };
  meta.id = toAsciiDigits(form.id.trim());
  setOrDrop("title", form.title);
  setOrDrop("newspaper", form.newspaper);
  setOrDrop("difficulty", form.difficulty);
  setOrDrop("author", form.author);
  // The recorded name only; the stored image is content-addressed. Never blank it: that would orphan the image.
  if (hasSourceImage && form.sourceFile.trim()) meta.sourceFile = form.sourceFile.trim();
  meta.size = { rows: json.grid.length, cols: json.grid[0]?.length ?? 0 };
  return { ...json, meta: meta as CrosswordJson["meta"] };
}

export function metaIdProblem(id: string, ownId: string, takenIds: ReadonlySet<string> = new Set()): string {
  const value = toAsciiDigits(id.trim());
  if (!isValidPuzzleId(value)) return ID_INVALID;
  return value !== ownId && takenIds.has(value) ? ID_TAKEN : "";
}

export function difficultyOptions(current: string): string[] {
  return [...(current === "" ? [""] : []), ...DIFFICULTIES, ...(current && !DIFFICULTIES.includes(current) ? [current] : [])];
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/puzzleMeta.test.ts` → PASS; `npm run typecheck` → clean.

---

### Task 2: `adminApi` — `renameDraft`, `saveDraftMeta`, simplified `publishDraft`

**Files:**
- Modify: `app/admin/adminApi.ts` (imports; `publishDraft` lines ~174-213; add `renameDraft`, `saveDraftMeta`, `copyLocalProgress`)
- Modify: `test/adminApi.test.tsx` (replace `describe("publishing with a new ID")` entirely)

**Interfaces:**
- Consumes: `ID_INVALID` from `app/components/puzzleMeta.ts`; existing `commitPuzzle`, `saveDraft`, `draftRef`, `catalogRef`, `toJsonText`, `entryImageRefs`, `puzzleHash`, `packOf`.
- Produces:
  - `renameDraft(draft: Draft, json: CrosswordJson, newId: string): Promise<void>`
  - `saveDraftMeta(draft: Draft, json: CrosswordJson, newId: string): Promise<void>` (same id → `saveDraft`; different id → `renameDraft`)
  - `publishDraft(draft: Draft, json?: CrosswordJson): Promise<void>` (**signature change**: no `nextId`; publishing never renames)

- [ ] **Step 1: Write the failing tests** — in `test/adminApi.test.tsx`:

  1. Change the imports: `import { createDraft, publishDraft, renameDraft, saveDraftMeta, savePublishedPuzzle, unpublishPuzzle, type Draft } from "../app/admin/adminApi";`, `import { setDoc } from "firebase/firestore";`, and `import { entryImageRefs, puzzleHash, type CatalogDoc, type PackDoc } from "../shared/cloudPuzzles";`.
  2. In `beforeEach` add `vi.mocked(setDoc).mockClear();`.
  3. Add helper below `published`:

```ts
type DraftData = { json: string; file: string; images: Record<string, { path: string; name: string; hash: string }>; createdAt: number; updatedAt: number };
const stored = (id: string) => fake.store.get(`drafts/${id}`) as unknown as DraftData;
const publishedElsewhere = () => {
  fake.store.set("catalog/index", { schema: 2, packs: { pack: { hash: "h", puzzles: { live: "h" } } } });
  fake.store.set("puzzlePacks/pack", { schema: 2, hash: "h", puzzles: { live: { file: "live.json", json: "{}", images: {} } } });
};
```

  4. Replace the whole `describe("publishing with a new ID", …)` block with:

```ts
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/adminApi.test.tsx` → FAIL (`renameDraft`/`saveDraftMeta` not exported).

- [ ] **Step 3: Implement** in `app/admin/adminApi.ts`:

  1. Add `import { ID_INVALID } from "../components/puzzleMeta";` next to the other app imports.
  2. Replace the whole `publishDraft` function (and add the new functions right after `saveDraft`/`deleteDraft`) with:

```ts
// The old local letters stay for other devices still syncing the previous id.
function copyLocalProgress(fromId: string, toId: string, json: CrosswordJson): void {
  try {
    if (localProgressIds().includes(fromId)) {
      const saved = loadProgress(fromId);
      recordEdit(toId, saved, computeProgress(json, saved));
    }
  } catch (error) {
    console.warn("[admin] draft renamed; original local progress retained", error);
  }
}

// Gives a draft a new id. Only drafts: a published puzzle's id keys players' progress for life.
// The draft document moves; its images stay where they are (storage paths are content-addressed).
export async function renameDraft(draft: Draft, json: CrosswordJson, newId: string): Promise<void> {
  const id = toAsciiDigits(newId.trim());
  if (!isValidPuzzleId(id)) throw new Error(ID_INVALID);
  if (id === draft.id) throw new Error("شناسهٔ تازه با شناسهٔ فعلی یکی است.");
  const problems = validateStoredPuzzleJson(json).issues.map((i) => i.message);
  if (problems.length) throw new Error(problems.join("\n"));
  const next: CrosswordJson = { ...json, meta: { ...json.meta, id } };
  await runTransaction(db, async (tx) => {
    const original = await tx.get(draftRef(draft.id));
    const target = await tx.get(draftRef(id));
    const catalogSnap = await tx.get(catalogRef);
    if (!original.exists()) throw new Error("این پیش‌نویس دیگر وجود ندارد؛ فهرست را دوباره بررسی کنید.");
    const source = original.data() as DraftDoc;
    // A newer draft must be reviewed instead of moving a stale snapshot over another admin's edits.
    if (source.json !== draft.jsonText) throw new Error("محتوای پیش‌نویس تغییر کرده است؛ آن را دوباره بررسی و ذخیره کنید.");
    if (target.exists()) throw new Error(`شناسهٔ «${id}» قبلاً استفاده شده است.`);
    if (packOf((catalogSnap.data() as CatalogDoc | undefined)?.packs ?? {}, id)) throw new Error(`جدول دیگری با شناسهٔ «${id}» منتشر شده است.`);
    const moved: DraftDoc = {
      schema: 1,
      json: toJsonText(next),
      file: draft.file.replace(/[^/]+$/, () => `${id}.json`),
      images: Object.fromEntries(Object.entries(draft.images).map(([kind, image]) => [kind, kind === "solution" ? { ...image, name: `${id}.png` } : image])),
      createdAt: source.createdAt,
      updatedAt: Date.now(),
    };
    tx.set(draftRef(id), moved);
    tx.delete(draftRef(draft.id));
  });
  copyLocalProgress(draft.id, id, next);
}

// A metadata save: the id only changes (a rename) when the form says so.
export async function saveDraftMeta(draft: Draft, json: CrosswordJson, newId: string): Promise<void> {
  if (toAsciiDigits(newId.trim()) === draft.id) await saveDraft(draft, json);
  else await renameDraft(draft, json, newId);
}

// Publishing never changes the id (rename the draft first). Players see the day it went live.
export async function publishDraft(draft: Draft, json: CrosswordJson = draft.json): Promise<void> {
  const id = draft.id;
  if (!isValidPuzzleId(id)) throw new Error(ID_INVALID);
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  json = { ...json, meta: { ...json.meta, id, publishedAt: today } };
  assertPublishable(json);
  const imagePaths = Object.fromEntries(Object.entries(draft.images).map(([kind, image]) => [kind, image.path]));
  const entry: PackEntry = { hash: "", file: draft.file, json: toJsonText(json), images: imagePaths };
  // Same fingerprint savePublishedPuzzle recomputes later (source image name = meta.sourceFile).
  const published: PackEntry = { ...entry, hash: await puzzleHash(json, entryImageRefs(entry, json)) };
  await commitPuzzle(
    id,
    async (current, tx) => {
      // A draft made from an unpublished puzzle reuses its id; a different live puzzle is never replaced.
      if (current) throw new Error(`جدول دیگری با شناسهٔ «${id}» منتشر شده است.`);
      const original = await tx.get(draftRef(id));
      if (!original.exists()) throw new Error("این پیش‌نویس دیگر وجود ندارد؛ فهرست را دوباره بررسی کنید.");
      // A newer draft must be reviewed instead of publishing a stale snapshot over another admin's edits.
      if ((original.data() as DraftDoc).json !== draft.jsonText) throw new Error("محتوای پیش‌نویس تغییر کرده است؛ آن را دوباره بررسی و منتشر کنید.");
      return published;
    },
    (tx) => tx.delete(draftRef(id)),
  );
}
```

  3. Remove now-unused imports (`ImageRef` if no longer used — check with typecheck).

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/adminApi.test.tsx` → PASS. `npm run typecheck` will now FAIL in `AdminPage.tsx`/`DraftPage.tsx` only where they call `publishDraft(draft, json, newId)`: `DraftPage` calls `publishDraft(draft, json)` (fine); `AdminPage` calls `publishDraft(draft, withPublishMeta(...), newId)` — **fix in this task** by deleting the third argument there (`await publishDraft(draft, withPublishMeta(draft.json, meta));`; the inline form is removed properly in Task 6). Re-run `npm run typecheck` → clean, and `npx vitest run test/adminPage.test.tsx` will fail on the old id-field assertions — leave it; Task 6 rewrites that test (skip it now with `npx vitest run test/adminApi.test.tsx test/puzzleMeta.test.ts`).

---

### Task 3: `PuzzleMetaEditor` + `MetaSummary` + CSS

**Files:**
- Create: `app/components/PuzzleMetaEditor.tsx`, `app/components/MetaSummary.tsx`
- Modify: `app/styles.css` (append after `.confirm-modal-error` block at the end)
- Test: `test/puzzleMetaEditor.test.tsx`

**Interfaces:**
- Consumes: Task 1 exports; `usePuzzleLibrary()` from `app/puzzleLibrary.ts` (returns `{ puzzles }`, each with `title/newspaper/author` fields); `localizeInputDigits/toAsciiDigits/toPersianDigits`.
- Produces:
  - `type SourceFileMode = "editable" | "auto" | "none"`
  - `interface PuzzleMetaEditorProps { value: PuzzleMetaForm; onChange: (next: PuzzleMetaForm) => void; idLocked?: boolean; takenIds?: ReadonlySet<string> | undefined; ownId?: string; sourceFile: SourceFileMode; size: { rows: number; cols: number } | undefined; publishedAt?: string | undefined; disabled?: boolean; hideIdProblem?: boolean; idPlaceholder?: string | undefined }`
  - `PuzzleMetaEditor(props)`; `MetaSummary({ json: CrosswordJson; id: string; onEdit?: (() => void) | undefined })`

- [ ] **Step 1: Write the failing tests** — `test/puzzleMetaEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MetaSummary } from "../app/components/MetaSummary";
import { PuzzleMetaEditor, type PuzzleMetaEditorProps } from "../app/components/PuzzleMetaEditor";
import type { PuzzleMetaForm } from "../app/components/puzzleMeta";
import { basicPuzzleV3 } from "./fixtures";

vi.mock("../app/puzzleLibrary", () => ({ usePuzzleLibrary: () => ({ puzzles: [{ id: "x", title: "قدیمی", newspaper: "همشهری", author: "آ" }] }) }));

const start: PuzzleMetaForm = { id: "p1", title: "عنوان", newspaper: "", difficulty: "عادی", author: "", sourceFile: "src.png" };
function Harness(props: Partial<PuzzleMetaEditorProps> & { onForm?: (f: PuzzleMetaForm) => void }) {
  const [value, setValue] = useState(start);
  return <PuzzleMetaEditor value={value} onChange={(next) => { setValue(next); props.onForm?.(next); }} sourceFile="editable" size={{ rows: 3, cols: 4 }} {...props} />;
}

describe("PuzzleMetaEditor", () => {
  it("shows the main fields and edits them with Persian digits shown, ASCII ids stored", () => {
    const onForm = vi.fn();
    render(<Harness onForm={onForm} />);
    fireEvent.change(screen.getByLabelText("شناسهٔ جدول"), { target: { value: "8050-a" } });
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveValue("۸۰۵۰-a");
    expect(onForm).toHaveBeenLastCalledWith(expect.objectContaining({ id: "8050-a" }));
    fireEvent.change(screen.getByLabelText("عنوان"), { target: { value: "جدول 12" } });
    expect(screen.getByLabelText("عنوان")).toHaveValue("جدول ۱۲");
    for (const label of ["روزنامه", "طراح"]) expect(screen.getByLabelText(label)).toBeInTheDocument();
  });

  it("offers the two difficulty levels, keeps an unknown value as an extra option", () => {
    const { unmount } = render(<Harness />);
    expect([...screen.getByLabelText("سطح").querySelectorAll("option")].map((o) => o.value)).toEqual(["عادی", "ویژه"]);
    unmount();
    render(<PuzzleMetaEditor value={{ ...start, difficulty: "سخت" }} onChange={() => {}} sourceFile="none" size={undefined} />);
    expect(screen.getByLabelText("سطح")).toHaveValue("سخت");
  });

  it("flags an invalid or used id, but not the puzzle's own id, and can hide the problem", () => {
    const takenIds = new Set(["p1", "p2"]);
    const { rerender } = render(<PuzzleMetaEditor value={{ ...start, id: "p2" }} onChange={() => {}} takenIds={takenIds} ownId="p1" sourceFile="none" size={undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent("قبلاً استفاده شده");
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveAttribute("aria-invalid", "true");
    rerender(<PuzzleMetaEditor value={{ ...start, id: "p1" }} onChange={() => {}} takenIds={takenIds} ownId="p1" sourceFile="none" size={undefined} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<PuzzleMetaEditor value={{ ...start, id: "bad/id" }} onChange={() => {}} sourceFile="none" size={undefined} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(<PuzzleMetaEditor value={{ ...start, id: "bad/id" }} onChange={() => {}} sourceFile="none" size={undefined} hideIdProblem />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("makes the id read-only when locked", () => {
    render(<Harness idLocked />);
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveAttribute("readonly");
  });

  it("keeps size, publication date and source file in a collapsed advanced section", () => {
    const { container } = render(<Harness publishedAt={undefined} />);
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("پیشرفته")).toBeInTheDocument();
    expect(details).toHaveTextContent("۳ × ۴");
    expect(details).toHaveTextContent("هنگام انتشار ثبت می‌شود");
    expect(within(details).getByLabelText("نام تصویر منبع")).toBeEnabled();
  });

  it("shows a given publication date and disables the source file unless editable", () => {
    const { container, rerender } = render(<PuzzleMetaEditor value={start} onChange={() => {}} sourceFile="none" size={{ rows: 3, cols: 4 }} publishedAt="2026-01-02" />);
    expect(container).toHaveTextContent("۲۰۲۶-۰۱-۰۲");
    expect(screen.getByLabelText("نام تصویر منبع")).toBeDisabled();
    expect(container).toHaveTextContent("تصویر منبع ندارد");
    rerender(<PuzzleMetaEditor value={start} onChange={() => {}} sourceFile="auto" size={undefined} />);
    expect(screen.getByLabelText("نام تصویر منبع")).toBeDisabled();
    expect(container).toHaveTextContent("از شناسه ساخته می‌شود");
  });
});

describe("MetaSummary", () => {
  it("lists the filled metadata and offers the edit action", async () => {
    const onEdit = vi.fn();
    const json = { ...basicPuzzleV3, meta: { title: "عنوان ۱", difficulty: "ویژه", author: 12 as unknown as string } };
    render(<MetaSummary json={json} id="p9" onEdit={onEdit} />);
    expect(screen.getByText("عنوان ۱")).toBeInTheDocument();
    expect(screen.getByText("p9")).toBeInTheDocument();
    expect(screen.getByText("۱۲")).toBeInTheDocument();
    expect(screen.queryByText("روزنامه")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ویرایش مشخصات" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });
  it("omits the edit action without a handler", () => {
    render(<MetaSummary json={basicPuzzleV3} id="p9" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/puzzleMetaEditor.test.tsx` → FAIL (modules missing).

- [ ] **Step 3: Implement** — `app/components/PuzzleMetaEditor.tsx`:

```tsx
import { useId, useMemo } from "react";
import { usePuzzleLibrary } from "../puzzleLibrary";
import { localizeInputDigits, toAsciiDigits, toPersianDigits } from "../persianNumbers";
import { difficultyOptions, metaIdProblem, type PuzzleMetaForm } from "./puzzleMeta";

// editable: a real source image is attached; auto: the name is derived (photo import); none: no source image.
export type SourceFileMode = "editable" | "auto" | "none";

export interface PuzzleMetaEditorProps {
  readonly value: PuzzleMetaForm;
  readonly onChange: (next: PuzzleMetaForm) => void;
  readonly idLocked?: boolean;
  readonly takenIds?: ReadonlySet<string> | undefined;
  // The puzzle's current id: never reported as "taken".
  readonly ownId?: string;
  readonly sourceFile: SourceFileMode;
  readonly size: { readonly rows: number; readonly cols: number } | undefined;
  readonly publishedAt?: string | undefined;
  readonly disabled?: boolean;
  readonly hideIdProblem?: boolean;
  readonly idPlaceholder?: string | undefined;
}

const SUGGESTED = ["title", "newspaper", "author"] as const;

export function PuzzleMetaEditor({ value, onChange, idLocked = false, takenIds, ownId = "", sourceFile, size, publishedAt, disabled = false, hideIdProblem = false, idPlaceholder }: PuzzleMetaEditorProps) {
  const uid = useId();
  const { puzzles } = usePuzzleLibrary();
  // Values already used by published puzzles, offered so spellings stay consistent.
  const suggestions = useMemo(
    () => Object.fromEntries(SUGGESTED.map((field) => [field, [...new Set(puzzles.flatMap((p) => String(p[field] ?? "").trim() || []))]])) as Record<(typeof SUGGESTED)[number], string[]>,
    [puzzles],
  );
  const set = (patch: Partial<PuzzleMetaForm>) => onChange({ ...value, ...patch });
  const idProblem = idLocked || hideIdProblem || !value.id ? "" : metaIdProblem(value.id, ownId, takenIds);
  const text = (field: (typeof SUGGESTED)[number], label: string) => (
    <label>
      {label}
      <input value={toPersianDigits(value[field])} onChange={(e) => set({ [field]: localizeInputDigits(e.currentTarget) })} list={`${uid}-${field}`} disabled={disabled} />
      <datalist id={`${uid}-${field}`}>{suggestions[field].map((v) => <option key={v} value={toPersianDigits(v)} />)}</datalist>
    </label>
  );

  return (
    <div className="publish-meta-fields meta-editor">
      <label>
        شناسهٔ جدول
        <input dir="ltr" value={toPersianDigits(value.id)} readOnly={idLocked} disabled={disabled} placeholder={idPlaceholder} aria-invalid={!!idProblem} aria-describedby={idProblem ? `${uid}-id-error` : undefined} onChange={(e) => set({ id: toAsciiDigits(localizeInputDigits(e.currentTarget)) })} />
      </label>
      {idProblem ? <p id={`${uid}-id-error`} className="admin-error" role="alert">{idProblem}</p> : null}
      {text("title", "عنوان")}
      {text("newspaper", "روزنامه")}
      <label>
        سطح
        <select value={value.difficulty} disabled={disabled} onChange={(e) => set({ difficulty: e.target.value })}>
          {difficultyOptions(value.difficulty).map((option) => <option key={option} value={option}>{option === "" ? "تعیین نشده" : toPersianDigits(option)}</option>)}
        </select>
      </label>
      {text("author", "طراح")}
      <details className="meta-editor-advanced">
        <summary>پیشرفته</summary>
        <div className="meta-editor-advanced-body">
          <label>
            نام تصویر منبع
            <input dir="ltr" value={value.sourceFile} disabled={disabled || sourceFile !== "editable"} onChange={(e) => set({ sourceFile: e.currentTarget.value })} />
          </label>
          {sourceFile === "none" ? <p>این جدول تصویر منبع ندارد.</p> : null}
          {sourceFile === "auto" ? <p>نام تصویر منبع از شناسه ساخته می‌شود.</p> : null}
          <dl className="meta-summary">
            <div><dt>ابعاد</dt><dd>{size ? `${toPersianDigits(size.rows)} × ${toPersianDigits(size.cols)}` : "—"}</dd></div>
            <div><dt>تاریخ انتشار</dt><dd>{publishedAt ? toPersianDigits(publishedAt) : "هنگام انتشار ثبت می‌شود"}</dd></div>
          </dl>
        </div>
      </details>
    </div>
  );
}
```

`app/components/MetaSummary.tsx`:

```tsx
import type { CrosswordJson } from "../../src/index";
import { toPersianDigits } from "../persianNumbers";

// Read-only look at a puzzle's metadata (publish confirmations), with a way into the editor.
export function MetaSummary({ json, id, onEdit }: { json: CrosswordJson; id: string; onEdit?: (() => void) | undefined }) {
  const meta = json.meta;
  const rows: [string, unknown][] = [["عنوان", meta?.title], ["شناسه", id], ["سطح", meta?.difficulty], ["روزنامه", meta?.newspaper], ["طراح", meta?.author]];
  return (
    <>
      <dl className="meta-summary">
        {rows.flatMap(([label, value]) => (value === undefined || value === null || value === "" ? [] : [<div key={label}><dt>{label}</dt><dd><bdi>{toPersianDigits(String(value))}</bdi></dd></div>]))}
      </dl>
      {onEdit ? <button type="button" className="meta-summary-edit" onClick={onEdit}>ویرایش مشخصات</button> : null}
    </>
  );
}
```

Append to `app/styles.css`:

```css
.meta-editor-advanced { grid-column: 1 / -1; font-size: 0.85rem; }
.meta-editor-advanced summary { cursor: pointer; color: #5b6b61; }
.meta-editor-advanced-body { display: grid; gap: 10px; margin-top: 8px; }
.meta-summary { display: grid; gap: 4px; margin: 8px 0; }
.meta-summary > div { display: flex; gap: 8px; }
.meta-summary dt { color: #5b6b61; }
.meta-summary dd { margin: 0; }
.meta-summary-edit { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; }
.meta-dialog { max-height: 90vh; overflow-y: auto; text-align: start; }
.meta-dialog-note { margin: 0 0 8px; color: #5b6b61; font-size: 0.85rem; }
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/puzzleMetaEditor.test.tsx` → PASS; `npm run typecheck` clean.

---

### Task 4: `PuzzleMetaDialog`

**Files:**
- Create: `app/components/PuzzleMetaDialog.tsx`
- Test: `test/puzzleMetaDialog.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`metaFormOf`, `applyMetaForm`, `metaIdProblem`, `PuzzleMetaForm`), Task 3 (`PuzzleMetaEditor`).
- Produces: `PuzzleMetaDialog(props: { json: CrosswordJson; id: string; kind: "draft" | "published"; takenIds?: ReadonlySet<string> | undefined; hasSourceImage: boolean; onSave: (json: CrosswordJson, newId: string) => Promise<void>; onClose: () => void })`. Dialog `role="dialog"`, `aria-label="مشخصات جدول"`; save button name `ذخیره مشخصات`; cancel button `انصراف`; discard prompt buttons `دور انداختن` / `ادامهٔ ویرایش`.

- [ ] **Step 1: Write the failing tests** — `test/puzzleMetaDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PuzzleMetaDialog } from "../app/components/PuzzleMetaDialog";
import type { CrosswordJson } from "../src/index";
import { basicPuzzleV3 } from "./fixtures";

vi.mock("../app/puzzleLibrary", () => ({ usePuzzleLibrary: () => ({ puzzles: [] }) }));

const json: CrosswordJson = { ...basicPuzzleV3, meta: { id: "p1", title: "عنوان", difficulty: "عادی", sourceFile: "src.png", size: { rows: 3, cols: 4 } } };
const SAVE = { name: "ذخیره مشخصات" };

function setup(props: Partial<Parameters<typeof PuzzleMetaDialog>[0]> = {}) {
  const onSave = vi.fn(async () => {});
  const onClose = vi.fn();
  render(<PuzzleMetaDialog json={json} id="p1" kind="draft" takenIds={new Set(["p1", "p2"])} hasSourceImage onSave={onSave} onClose={onClose} {...props} />);
  return { onSave, onClose, dialog: screen.getByRole("dialog", { name: "مشخصات جدول" }) };
}
const field = (label: string) => screen.getByLabelText(label);

describe("PuzzleMetaDialog", () => {
  it("enables Save only once something changed and saves the updated JSON with the id", async () => {
    const { onSave, onClose } = setup();
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
    fireEvent.change(field("عنوان"), { target: { value: "  تازه  " } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ id: "p1", title: "تازه", size: { rows: 3, cols: 4 } }) }), "p1");
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("lets Save repair puzzles whose meta size or id is wrong or missing", () => {
    setup({ json: { ...json, meta: { title: "عنوان", size: { rows: 9, cols: 9 } } } });
    expect(screen.getByRole("button", SAVE)).toBeEnabled();
  });

  it("blocks Save for an invalid id, a used id and a missing title, but allows a new id", () => {
    setup();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "bad/id" } });
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "p2" } });
    expect(screen.getByRole("alert")).toHaveTextContent("قبلاً استفاده شده");
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "p3" } });
    expect(screen.getByRole("button", SAVE)).toBeEnabled();
    fireEvent.change(field("عنوان"), { target: { value: "  " } });
    expect(screen.getByRole("button", SAVE)).toBeDisabled();
  });

  it("passes the changed id to onSave", async () => {
    const { onSave } = setup();
    fireEvent.change(field("شناسهٔ جدول"), { target: { value: "۸۰۵۰" } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ id: "8050" }) }), "8050");
  });

  it("keeps the id read-only for a published puzzle and explains the effect", () => {
    setup({ kind: "published" });
    expect(field("شناسهٔ جدول")).toHaveAttribute("readonly");
    expect(screen.getByRole("dialog")).toHaveTextContent("بلافاصله برای همهٔ بازیکنان");
  });

  it("says a draft change stays private", () => {
    setup();
    expect(screen.getByRole("dialog")).toHaveTextContent("تا زمان انتشار");
  });

  it("closes at once when nothing changed, and asks before discarding edits", async () => {
    const clean = setup();
    await userEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(clean.onClose).toHaveBeenCalledOnce();
  });

  it("asks before discarding edits (Cancel, Escape) and the backdrop does not close a dirty dialog", async () => {
    const { onClose, dialog } = setup();
    fireEvent.change(field("عنوان"), { target: { value: "تغییر" } });
    fireEvent.click(dialog); // backdrop
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(within(dialog).getByText("تغییرات ذخیره‌نشده دور ریخته شود؟")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ادامهٔ ویرایش" }));
    expect(field("عنوان")).toHaveValue("تغییر");
    fireEvent.keyDown(field("عنوان"), { key: "Escape" });
    expect(screen.getByText("تغییرات ذخیره‌نشده دور ریخته شود؟")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "دور انداختن" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a failed save, stays open with the edits and can retry", async () => {
    const { onSave, onClose } = setup();
    onSave.mockRejectedValueOnce(new Error("خطای ارتباط"));
    fireEvent.change(field("عنوان"), { target: { value: "تازه" } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(await screen.findByRole("alert")).toHaveTextContent("خطای ارتباط");
    expect(onClose).not.toHaveBeenCalled();
    expect(field("عنوان")).toHaveValue("تازه");
    expect(screen.getByRole("button", SAVE)).toBeEnabled();
    await userEvent.click(screen.getByRole("button", SAVE));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("disables Save while saving so a double click saves once", async () => {
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const { onClose } = setup({ onSave });
    fireEvent.change(field("عنوان"), { target: { value: "تازه" } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(screen.getByRole("button", { name: "در حال ذخیره…" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(onSave).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("keeps an unusual difficulty and numeric author through a title edit", async () => {
    const odd = { ...json, meta: { ...json.meta, difficulty: "سخت", author: 12 as unknown as string } };
    const { onSave } = setup({ json: odd });
    expect(field("سطح")).toHaveValue("سخت");
    fireEvent.change(field("عنوان"), { target: { value: "تازه" } });
    await userEvent.click(screen.getByRole("button", SAVE));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ difficulty: "سخت", author: "12" }) }), "p1");
  });

  it("focuses the first editable field and gives focus back on close", () => {
    const opener = document.createElement("button");
    document.body.append(opener); opener.focus();
    const view = render(<PuzzleMetaDialog json={json} id="p1" kind="published" hasSourceImage={false} onSave={async () => {}} onClose={() => {}} />);
    expect(screen.getByLabelText("عنوان")).toHaveFocus(); // id is read-only on published puzzles
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/puzzleMetaDialog.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — `app/components/PuzzleMetaDialog.tsx`:

```tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CrosswordJson } from "../../src/index";
import { toAsciiDigits } from "../persianNumbers";
import { PuzzleMetaEditor } from "./PuzzleMetaEditor";
import { applyMetaForm, metaFormOf, metaIdProblem } from "./puzzleMeta";

export interface PuzzleMetaDialogProps {
  readonly json: CrosswordJson;
  readonly id: string;
  readonly kind: "draft" | "published";
  // Ids a draft can't take (published + other drafts).
  readonly takenIds?: ReadonlySet<string> | undefined;
  readonly hasSourceImage: boolean;
  readonly onSave: (json: CrosswordJson, newId: string) => Promise<void>;
  readonly onClose: () => void;
}

// The one place puzzle metadata is edited: a draft saves privately, a published puzzle's change
// goes straight to players (the caller's onSave decides how it's stored).
export function PuzzleMetaDialog({ json, id, kind, takenIds, hasSourceImage, onSave, onClose }: PuzzleMetaDialogProps) {
  const [initial] = useState(() => metaFormOf(json, id));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLInputElement>("input:not([readonly])")?.focus();
    return () => opener?.focus?.();
  }, []);

  const next = applyMetaForm(json, form, hasSourceImage);
  // `changed` compares the result with the stored JSON (so a wrong size or missing id can be repaired
  // by a plain save); `dirty` compares the form with what was opened (so cancel can warn).
  const changed = JSON.stringify(next) !== JSON.stringify(json);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const idProblem = kind === "published" ? "" : metaIdProblem(form.id, id, takenIds);
  const titleMissing = !form.title.trim();
  const canSave = changed && !idProblem && !titleMissing && !saving;

  function requestClose(): void {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function save(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await onSave(next, toAsciiDigits(form.id.trim()));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div
      ref={root}
      className="solution-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="مشخصات جدول"
      onClick={() => { if (!dirty) requestClose(); }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        if (confirmDiscard) setConfirmDiscard(false);
        else requestClose();
      }}
    >
      <form className="solution-modal confirm-modal meta-dialog" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void save(e)}>
        <h2>مشخصات جدول</h2>
        <p className="meta-dialog-note">
          {kind === "draft"
            ? "تا زمان انتشار فقط برای مدیران دیده می‌شود."
            : "تغییرها بلافاصله برای همهٔ بازیکنان اعمال می‌شود. شناسه پس از انتشار قابل تغییر نیست؛ برای تغییر آن ابتدا انتشار را لغو کنید."}
        </p>
        <PuzzleMetaEditor
          value={form}
          onChange={(value) => { setForm(value); setError(""); }}
          idLocked={kind === "published"}
          takenIds={takenIds}
          ownId={id}
          sourceFile={hasSourceImage ? "editable" : "none"}
          size={{ rows: json.grid.length, cols: json.grid[0]?.length ?? 0 }}
          publishedAt={typeof json.meta?.publishedAt === "string" ? json.meta.publishedAt : undefined}
          disabled={saving}
        />
        {titleMissing ? <p className="meta-dialog-note">عنوان جدول را وارد کنید.</p> : null}
        {error ? <p className="clue-edit-error confirm-modal-error" role="alert">{error}</p> : null}
        {confirmDiscard ? (
          <>
            <p className="meta-dialog-note" role="alert">تغییرات ذخیره‌نشده دور ریخته شود؟</p>
            <div className="solution-modal-actions">
              <button type="button" onClick={() => setConfirmDiscard(false)}>ادامهٔ ویرایش</button>
              <button type="button" className="toolbar-menu-danger" onClick={onClose}>دور انداختن</button>
            </div>
          </>
        ) : (
          <div className="solution-modal-actions">
            <button type="button" onClick={requestClose} disabled={saving}>انصراف</button>
            <button type="submit" className="confirm-modal-primary" disabled={!canSave}>{saving ? "در حال ذخیره…" : "ذخیره مشخصات"}</button>
          </div>
        )}
      </form>
    </div>
  );
}
```

(`publishedAt` typed on `CrosswordMeta`? If not, `json.meta?.publishedAt` fails typecheck — it is listed in the spec's `CrosswordMeta`; if the field is missing from `src/types.ts`, read it via `(json.meta as Record<string, unknown> | undefined)?.publishedAt`.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/puzzleMetaDialog.test.tsx test/puzzleMetaEditor.test.tsx` → PASS; `npm run typecheck` clean.

---

### Task 5: Solver, `DraftPage` and `App` wiring

**Files:**
- Modify: `app/pages/SolverPage.tsx` (imports line 67; `PuzzleEditor` lines 70-76; state line 167; `openConfirm`/`runConfirmAction` lines 472-503; toolbar lines 694-699; confirm modal line 725; add dialog after the confirm modal)
- Modify: `app/admin/DraftPage.tsx`, `app/App.tsx`
- Test: `test/app.test.tsx` (append tests inside the existing `describe`)

**Interfaces:**
- Consumes: `PuzzleMetaDialog`, `MetaSummary` (Tasks 3-4); `saveDraftMeta` (Task 2); `usePuzzleLibrary()`; `navigate`.
- Produces: `PuzzleEditor` gains `readonly saveMeta?: ((json: CrosswordJson, newId: string) => Promise<void>) | undefined; readonly takenIds?: ReadonlySet<string> | undefined;`.

- [ ] **Step 1: Write the failing tests** — append inside `describe("Persian crossword UI", …)` in `test/app.test.tsx` (before the final `});`):

```tsx
  it("offers the metadata dialog only when the editor can save metadata, and keeps it through later clue saves", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SolverPage id="sample-10x10-garden" json={json10} editor={{ kind: "draft", save: vi.fn() }} />);
    expect(screen.queryByRole("button", { name: "مشخصات" })).not.toBeInTheDocument();
    unmount();

    const metaSaves: Array<[CrosswordJson, string]> = [];
    const editor = {
      kind: "draft" as const,
      save: vi.fn(async (_json: CrosswordJson) => {}),
      saveMeta: vi.fn(async (json: CrosswordJson, newId: string) => void metaSaves.push([json, newId])),
    };
    render(<SolverPage id="sample-10x10-garden" json={json10} editor={editor} />);
    await user.click(screen.getByRole("button", { name: "مشخصات" }));
    const dialog = screen.getByRole("dialog", { name: "مشخصات جدول" });
    fireEvent.change(within(dialog).getByLabelText("عنوان"), { target: { value: "عنوان تازه" } });
    await user.click(within(dialog).getByRole("button", { name: "ذخیره مشخصات" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "مشخصات جدول" })).not.toBeInTheDocument());
    expect(metaSaves).toHaveLength(1);
    expect(metaSaves[0]![1]).toBe("sample-10x10-garden");
    expect(metaSaves[0]![0].meta).toMatchObject({ title: "عنوان تازه", id: "sample-10x10-garden", size: { rows: 10, cols: 10 } });

    // The page's json prop never changed, yet a later clue save must build on the new metadata.
    await user.click(screen.getAllByTitle("ویرایش متن پرسش (دیباگ)")[0]!);
    const box = screen.getByRole("textbox", { name: "" });
    await user.clear(box);
    await user.type(box, "پرسش اصلاح‌شده");
    await user.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(editor.save).toHaveBeenCalledOnce());
    expect(editor.save.mock.calls[0]![0].meta?.title).toBe("عنوان تازه");
  });

  it("shows a metadata summary in the publish confirmation and opens the editor from it", async () => {
    const user = userEvent.setup();
    const editor = { kind: "draft" as const, save: vi.fn(), publish: vi.fn(async () => {}), saveMeta: vi.fn(async () => {}) };
    render(<SolverPage id="sample-10x10-garden" json={json10} editor={editor} />);
    await user.click(screen.getByRole("button", { name: "انتشار" }));
    const confirm = screen.getByRole("dialog", { name: "تایید عملیات" });
    expect(within(confirm).getByText("sample-10x10-garden")).toBeInTheDocument();
    await user.click(within(confirm).getByRole("button", { name: "ویرایش مشخصات" }));
    expect(screen.queryByRole("dialog", { name: "تایید عملیات" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "مشخصات جدول" })).toBeInTheDocument();
    expect(editor.publish).not.toHaveBeenCalled();
  });
```
Add `fireEvent` to the `@testing-library/react` import at the top of the file if absent.

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/app.test.tsx -t "metadata"` → FAIL (no "مشخصات" button).

- [ ] **Step 3: Implement.**

  `app/pages/SolverPage.tsx`:

  1. Replace line 67 import with:
```ts
import { MetaSummary } from "../components/MetaSummary";
import { PuzzleMetaDialog } from "../components/PuzzleMetaDialog";
```
  and add `Tag` to the existing `lucide-react` import list.

  2. Extend `PuzzleEditor` (keep the existing members):
```ts
  // Saves edited metadata. A draft's changed id renames it (DraftPage); a published puzzle's id never changes.
  readonly saveMeta?: ((json: CrosswordJson, newId: string) => Promise<void>) | undefined;
  // Ids a draft can't be renamed to (published puzzles and other drafts).
  readonly takenIds?: ReadonlySet<string> | undefined;
```

  3. Replace `const [publishMeta, setPublishMeta] = useState<PublishMeta>(() => publishMetaOf(json));` with:
```ts
  // The JSON the metadata dialog was opened on (null = closed).
  const [metaJson, setMetaJson] = useState<CrosswordJson | null>(null);
```

  4. In `openConfirm` delete the line `if (action === "publish") setPublishMeta(publishMetaOf(editedJsonRef.current));`.

  5. In `runConfirmAction` replace `await editor.publish?.(withPublishMeta(editedJsonRef.current, publishMeta));` with `await editor.publish?.(editedJsonRef.current);`.

  6. After `saveJsonEdit` add:
```ts
  // Metadata saves update the same ref, so a later clue/answer save can't revert them.
  async function saveMetaEdit(next: CrosswordJson, newId: string): Promise<void> {
    if (!editor?.saveMeta) return;
    await editor.saveMeta(next, newId);
    editedJsonRef.current = next;
  }
```

  7. In the toolbar menu, before the `editor?.publish` button add:
```tsx
            {editor?.saveMeta ? (
              <button type="button" onClick={() => setMetaJson(editedJsonRef.current)} disabled={isSaving}>
                <Tag size={18} aria-hidden="true" />
                <span>مشخصات</span>
              </button>
            ) : null}
```

  8. In the confirm modal replace `{confirmAction === "publish" ? <PublishMetaFields … /> : null}` with:
```tsx
            {confirmAction === "publish" ? (
              <MetaSummary json={editedJsonRef.current} id={id} onEdit={editor?.saveMeta ? () => { setConfirmAction(null); setMetaJson(editedJsonRef.current); } : undefined} />
            ) : null}
```

  9. Immediately after the closing `) : null}` of the confirm modal block add:
```tsx
      {metaJson && editor?.saveMeta ? (
        <PuzzleMetaDialog json={metaJson} id={id} kind={editor.kind} takenIds={editor.takenIds} hasSourceImage={!!sourceImageUrl} onSave={saveMetaEdit} onClose={() => setMetaJson(null)} />
      ) : null}
```

  `app/admin/DraftPage.tsx`:
```tsx
import { useMemo } from "react";
// …existing imports…
import { usePuzzleLibrary } from "../puzzleLibrary";
import { publishDraft, saveDraft, saveDraftMeta } from "./adminApi";

// inside DraftPage, after `const draft = …`:
  const { puzzles } = usePuzzleLibrary();
  const takenIds = useMemo(() => new Set([...puzzles.map((p) => p.id), ...drafts.map((d) => d.id)]), [puzzles, drafts]);

  const editor = useMemo((): PuzzleEditor | undefined => {
    if (!draft) return undefined;
    return {
      kind: "draft",
      takenIds,
      save: (json: CrosswordJson) => saveDraft(draft, json),
      saveMeta: async (json: CrosswordJson, newId: string) => {
        await saveDraftMeta(draft, json, newId);
        if (newId !== draft.id) navigate(`#/admin/draft/${encodeURIComponent(newId)}`);
      },
      publish: async (json: CrosswordJson) => {
        await publishDraft(draft, json);
        await refreshPuzzleCatalog();
        navigate(`#/puzzle/${encodeURIComponent(draft.id)}`);
      },
    };
  }, [draft, takenIds]);
```
  (`newId` reaches `saveMeta` already ASCII from the dialog.)

  `app/App.tsx` — in `publishedEditor`, share the save and add `saveMeta`:
```ts
function publishedEditor(id: string): PuzzleEditor {
  const save = async (json: CrosswordJson) => {
    await (await adminApi()).savePublishedPuzzle(id, json);
    await refreshPuzzleCatalog();
  };
  return {
    kind: "published",
    save,
    // A published puzzle's id is locked, so the new id is ignored.
    saveMeta: (json: CrosswordJson) => save(json),
    unpublish: async () => { /* unchanged */ },
  };
}
```
  (keep the existing `unpublish` body as is.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/app.test.tsx` → PASS (all, including existing); `npm run typecheck` → errors only from `AdminPage.tsx`/`PhotoImportSection.tsx`/`adminSettings.ts` still importing `PublishMetaFields` — which still exists, so typecheck should be clean.

---

### Task 6: Draft row — "مشخصات" dialog and `PublishConfirmDialog`

**Files:**
- Create: `app/admin/PublishConfirmDialog.tsx`
- Modify: `app/admin/AdminPage.tsx` (imports lines 1-16; `DraftRow` lines 105-210)
- Modify: `test/adminPage.test.tsx` (mock + replace the last test)

**Interfaces:**
- Consumes: `PuzzleMetaDialog`, `MetaSummary`, `saveDraftMeta`, `publishDraft(draft)` (Task 2).
- Produces: `PublishConfirmDialog(props: { draft: Draft; problems: readonly string[]; busy: boolean; error: string | null; onPublish: () => void; onEdit: () => void; onCancel: () => void })` — `role="dialog"`, `aria-label={`انتشار ${title}`}`, buttons `انتشار برای همه` / `انصراف` / `ویرایش مشخصات`.

- [ ] **Step 1: Write the failing tests** — in `test/adminPage.test.tsx`:

  1. Hoisted mock: `const { draftState, publishDraft, saveDraftMeta } = vi.hoisted(() => ({ draftState: { drafts: [] as Draft[] }, publishDraft: vi.fn(), saveDraftMeta: vi.fn() }));` and the adminApi mock: `vi.mock("../app/admin/adminApi", () => ({ createDraft: vi.fn(), deleteDraft: vi.fn(), publishDraft, publishProblems: () => [], saveDraftMeta }));`.
  2. In the test `"displays typed English and Arabic digits…"` the photo-form label lookups `عنوان`/`شناسهٔ جدول` still resolve (the photo tab embeds the new editor in Task 7; both exist before/after), no change needed.
  3. Replace the last test (`"edits the ID with publishing metadata, cancels…"`) with:

```tsx
describe("draft metadata and publishing", () => {
  const draft: Draft = { id: "8050", json: { ...basicPuzzleV3, meta: { id: "8050", title: "جدول قدیم" } },
    jsonText: "{}", file: "admin/8050.json", images: {}, updatedAt: 1, solutionImageUrl: undefined, sourceImageUrl: undefined };
  function setup() {
    draftState.drafts = [draft, { ...draft, id: "8051", json: { ...draft.json, meta: { id: "8051", title: "دیگری" } } }];
    render(<AdminPage />);
    return screen.getByText("جدول قدیم").closest("li")!;
  }

  it("edits metadata in a dialog, blocks used ids and saves with the new id", async () => {
    const row = setup();
    await userEvent.click(within(row).getByRole("button", { name: "مشخصات" }));
    const dialog = screen.getByRole("dialog", { name: "مشخصات جدول" });
    const id = within(dialog).getByLabelText("شناسهٔ جدول");
    expect(id).toHaveValue("۸۰۵۰");
    fireEvent.change(id, { target: { value: "8051" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("قبلاً استفاده شده");
    expect(within(dialog).getByRole("button", { name: "ذخیره مشخصات" })).toBeDisabled();
    fireEvent.change(id, { target: { value: "8052" } });
    fireEvent.change(within(dialog).getByLabelText("عنوان"), { target: { value: "عنوان تازه 8052" } });
    saveDraftMeta.mockResolvedValueOnce(undefined);
    await userEvent.click(within(dialog).getByRole("button", { name: "ذخیره مشخصات" }));
    await waitFor(() => expect(saveDraftMeta).toHaveBeenCalledOnce());
    expect(saveDraftMeta).toHaveBeenCalledWith(draft, expect.objectContaining({ meta: expect.objectContaining({ id: "8052", title: "عنوان تازه ۸۰۵۲" }) }), "8052");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "مشخصات جدول" })).not.toBeInTheDocument());
    expect(publishDraft).not.toHaveBeenCalled();
  });

  it("shows a summary before publishing, keeps the dialog on failure and retries", async () => {
    const row = setup();
    await userEvent.click(within(row).getByRole("button", { name: "انتشار" }));
    const dialog = screen.getByRole("dialog", { name: "انتشار جدول قدیم" });
    expect(within(dialog).getByText("جدول قدیم")).toBeInTheDocument();
    expect(within(dialog).getByText("آماده انتشار")).toBeInTheDocument();
    publishDraft.mockRejectedValueOnce(new Error("خطای ارتباط"));
    await userEvent.click(within(dialog).getByRole("button", { name: "انتشار برای همه" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("خطای ارتباط");
    publishDraft.mockResolvedValueOnce(undefined);
    await userEvent.click(within(dialog).getByRole("button", { name: "انتشار برای همه" }));
    await waitFor(() => expect(publishDraft).toHaveBeenCalledTimes(2));
    expect(publishDraft).toHaveBeenLastCalledWith(draft);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "انتشار جدول قدیم" })).not.toBeInTheDocument());
  });

  it("cancels the publish dialog with Escape without publishing and can jump to the metadata dialog", async () => {
    const row = setup();
    const publish = within(row).getByRole("button", { name: "انتشار" });
    await userEvent.click(publish);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "انتشار جدول قدیم" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(publishDraft).not.toHaveBeenCalled();
    await userEvent.click(publish);
    await userEvent.click(screen.getByRole("button", { name: "ویرایش مشخصات" }));
    expect(screen.queryByRole("dialog", { name: "انتشار جدول قدیم" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "مشخصات جدول" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/adminPage.test.tsx` → FAIL.

- [ ] **Step 3: Implement.**

  `app/admin/PublishConfirmDialog.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { MetaSummary } from "../components/MetaSummary";
import { toPersianDigits } from "../persianNumbers";
import type { Draft } from "./adminApi";

// Last look before a draft goes live: its metadata, whether it is ready, and the way into the editor.
export function PublishConfirmDialog({ draft, problems, busy, error, onPublish, onEdit, onCancel }: {
  draft: Draft; problems: readonly string[]; busy: boolean; error: string | null;
  onPublish: () => void; onEdit: () => void; onCancel: () => void;
}) {
  const publishButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    publishButton.current?.focus();
    return () => opener?.focus?.();
  }, []);
  const title = String(draft.json.meta?.title ?? draft.id);
  return (
    <div className="solution-modal-backdrop" role="dialog" aria-modal="true" aria-label={`انتشار ${title}`}
      onClick={() => { if (!busy) onCancel(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onCancel(); } }}>
      <div className="solution-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>انتشار جدول</h2>
        <p>جدول با این مشخصات برای همه بازیکنان منتشر می‌شود. تاریخ انتشار همان روز ثبت می‌شود.</p>
        <MetaSummary json={draft.json} id={draft.id} onEdit={busy ? undefined : onEdit} />
        {problems.length ? (
          <ul className="admin-problems">{problems.map((p) => <li key={p}>{toPersianDigits(p)}</li>)}</ul>
        ) : (
          <p className="admin-draft-status admin-draft-status-ready">آماده انتشار</p>
        )}
        {error ? <p className="clue-edit-error confirm-modal-error" role="alert">{toPersianDigits(error)}</p> : null}
        <div className="solution-modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>انصراف</button>
          <button ref={publishButton} type="button" className="confirm-modal-primary" onClick={onPublish} disabled={busy || problems.length > 0}>
            {busy ? "در حال انتشار…" : "انتشار برای همه"}
          </button>
        </div>
      </div>
    </div>
  );
}
```
  `app/admin/AdminPage.tsx`:

  1. Imports: remove `useId`, `useRef` (if unused after the edit), `FormEvent`, `Upload` stays, add `Tag`; remove `PublishMetaFields…` import, `AdminHelp`, `isValidPuzzleId` (keep `planImport`, `ImportFile`, `ImportPlan`), `localizeInputDigits`, `toAsciiDigits`; add:
```ts
import { PuzzleMetaDialog } from "../components/PuzzleMetaDialog";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
```
     and change the adminApi import to `import { createDraft, deleteDraft, publishDraft, publishProblems, saveDraftMeta, type Draft } from "./adminApi";`. Keep `toPersianDigits`. Run `npm run typecheck` to spot any other now-unused import (the repo has `noUnusedLocals` semantics via tsc errors if enabled).

  2. Replace the body of `DraftRow` from `const [message, …]` to the end of the component with:

```tsx
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"meta" | "publish" | null>(null);
  const title = draft.json.meta?.title ?? draft.id;

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function remove(): void {
    if (!window.confirm(`پیش‌نویس «${title}» حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    void run(() => deleteDraft(draft.id));
  }

  return (
    <li className="admin-draft">
      <div className="admin-draft-info">
        {/* …unchanged info block, except the message line: */}
        {message && dialog !== "publish" ? <span className="admin-error" role="alert">{toPersianDigits(message)}</span> : null}
      </div>
      <div className="admin-draft-actions">
        <a className="admin-button" href={`#/admin/draft/${encodeURIComponent(draft.id)}`}>
          <Pencil size={16} aria-hidden="true" />
          حل و ویرایش
        </a>
        <button type="button" className="admin-button" onClick={() => setDialog("meta")} disabled={busy}>
          <Tag size={16} aria-hidden="true" />
          مشخصات
        </button>
        <button type="button" className="admin-button admin-button-primary" onClick={() => { setMessage(null); setDialog("publish"); }} disabled={busy || problems.length > 0}>
          <Upload size={16} aria-hidden="true" />
          انتشار
        </button>
        <button type="button" className="admin-button admin-button-danger" onClick={remove} disabled={busy} aria-label={`حذف ${title}`}>
          <Trash2 size={16} aria-hidden="true" />
          حذف
        </button>
      </div>
      {dialog === "meta" ? (
        <PuzzleMetaDialog json={draft.json} id={draft.id} kind="draft" takenIds={takenIds} hasSourceImage={!!draft.images.source}
          onSave={(json, newId) => saveDraftMeta(draft, json, newId)} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "publish" ? (
        <PublishConfirmDialog draft={draft} problems={problems} busy={busy} error={message}
          onPublish={() => void run(async () => { await publishDraft(draft); await refreshPuzzleCatalog(); setDialog(null); })}
          onEdit={() => setDialog("meta")} onCancel={() => { setMessage(null); setDialog(null); }} />
      ) : null}
    </li>
  );
```
  Keep the unchanged `busy` state, `problems`, `percent` lines and the info block (title, id, badge/progress, status) from the current component. Delete `meta`, `nextId`, `publishButton`, `publishFormId`, `newId`, `idProblem`, `cancelPublish`, `publish`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/adminPage.test.tsx test/adminApi.test.tsx` → PASS; `npm run typecheck` clean.

---

### Task 7: Photo import uses the shared editor; remove `PublishMetaFields`

**Files:**
- Modify: `app/admin/PhotoImportSection.tsx` (import line 4, 6, 34, 60-61, 73-92, 172-176), `app/admin/adminSettings.ts` (line 1, 33)
- Modify: `test/photoImport.test.tsx` (lines 91, 99)
- Modify: `app/styles.css` (dead rules)
- Delete: `app/components/PublishMetaFields.tsx`

**Interfaces:**
- Consumes: `PuzzleMetaEditor`, `MetaTextFields`, `applyMetaForm`, `isValidPuzzleId` (still used for the save guard).
- Produces: no new exports. `loadPhotoSettings().meta` is typed `MetaTextFields`; the saved settings shape (`photo.id`, `photo.meta.{title,newspaper,difficulty,author}`) is unchanged.

- [ ] **Step 1: Update the tests first** — in `test/photoImport.test.tsx` change the `سطح` expectations in both loops (lines 91 and 99) from `"سخت"` to `"عادی"` (a select only accepts its options; the special variant defaults to `ویژه`, so `عادی` proves the saved choice wins). Add a test after the "restores all photo form settings" test:

```tsx
  it("keeps an unknown saved difficulty selectable and shows the derived source file and size", () => {
    saveAdminSettings({ photo: { id: "9", rows: 4, cols: 5, meta: { title: "t", difficulty: "سخت" } } });
    const { container } = render(<PhotoImportSection takenIds={new Set()} />);
    expect(screen.getByLabelText("سطح")).toHaveValue("سخت");
    expect(screen.getByLabelText("نام تصویر منبع")).toHaveValue("9-clues.png");
    expect(screen.getByLabelText("نام تصویر منبع")).toBeDisabled();
    expect(container.querySelector(".meta-editor-advanced")).toHaveTextContent("۴ × ۵");
  });

  it("flags a used id in the form but not after the draft was just saved with it", () => {
    saveAdminSettings({ photo: { id: "used" } });
    render(<PhotoImportSection takenIds={new Set(["used"])} />);
    expect(screen.getByRole("alert")).toHaveTextContent("قبلاً استفاده شده");
  });
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run test/photoImport.test.tsx` → FAIL (select/labels missing).

- [ ] **Step 3: Implement.**

  `app/admin/adminSettings.ts`: line 1 → `import type { MetaTextFields } from "../components/puzzleMeta";`; on line 33 replace `satisfies PublishMeta` with `satisfies MetaTextFields`.

  `app/admin/PhotoImportSection.tsx`:
  1. Replace the `PublishMetaFields` import (line 4) with:
```ts
import { PuzzleMetaEditor } from "../components/PuzzleMetaEditor";
import { applyMetaForm, type MetaTextFields } from "../components/puzzleMeta";
```
  2. Line 34 → `const [meta, setMeta] = useState<MetaTextFields>(initial.meta);`.
  3. In `save()` replace the `const json = withPublishMeta(…)` statement (lines 78-80) with:
```ts
      const json = applyMetaForm({ ...review.json, meta: { id: slug, language: "fa", direction: "rtl" } },
        { id: slug, ...meta, title: meta.title.trim() || (puzzleNumber ? `جدول ${puzzleNumber}` : ""), sourceFile: `${slug}-clues.png` }, true);
```
  4. Replace lines 172-176 (the `<div className="publish-meta-fields">` id block and `<PublishMetaFields …/>`) with:
```tsx
      <PuzzleMetaEditor
        value={{ id, ...meta, sourceFile: `${id.trim()}-clues.png` }}
        onChange={({ id: nextId, title, newspaper, difficulty, author }) => { setId(nextId); setMeta({ title, newspaper, difficulty, author }); setSavedId(""); }}
        takenIds={takenIds}
        sourceFile="auto"
        size={validSize ? { rows, cols } : undefined}
        disabled={busy}
        hideIdProblem={!!savedId}
        idPlaceholder={variant === "special" ? "مثلاً ۸۰۵۰-special" : "مثلاً ۸۰۵۰-normal"}
      />
```
     (`validId`/`taken` remain used by the Save button; `toAsciiDigits`/`localizeInputDigits` imports may become unused — remove whatever `npm run typecheck` flags.)

  `app/styles.css`: delete the `.admin-publish-form` block (`.admin-publish-form { … }`), the `.publish-meta-fields.admin-publish-id { … }` rule, and the `.admin-publish-form` entries in the two selector lists near the `admin-panel-in` animation (`…, .admin-import-plan, .admin-publish-form {` → drop `, .admin-publish-form`; same in the reduced-motion list). Keep `.publish-meta-fields` (still used by the editor and `photo-credentials`).

  Delete `app/components/PublishMetaFields.tsx` (`git rm` is not needed; just remove the file) and confirm `Grep PublishMeta` finds nothing in `app/` or `test/`.

- [ ] **Step 4: Run to verify pass** — `npx vitest run test/photoImport.test.tsx test/adminPage.test.tsx` → PASS; `npm run typecheck` clean.

---

### Task 8: Full verification and docs

**Files:**
- Modify: `CLAUDE.md` (the "Admin panel" bullet under "Puzzles in Firebase")

- [ ] **Step 1:** Run `npm run typecheck` → clean. Run `npm run test` → all PASS (note any pre-existing failures separately; do not hide them).
- [ ] **Step 2:** Update `CLAUDE.md`: in the Admin panel bullet add a sentence: "Metadata (id, title, newspaper, difficulty, author; advanced: sourceFile, size, publishedAt) is edited in one `PuzzleMetaDialog` (`app/components/`): drafts can change their id (`renameDraft`), published puzzles keep it; saves go through `PuzzleEditor.saveMeta`. Publishing only shows a summary."
- [ ] **Step 3: Manual check on the emulators** (needs Java 21 and `functions/.secret.local`; see `CLAUDE.md` Commands): start `npx firebase-tools emulators:start --only functions,firestore,storage,auth` and `VITE_FUNCTIONS_EMULATOR=1 npm run dev`, sign in as an admin, then verify:
  1. Import a draft (JSON import), click "مشخصات", change title and id, save → row shows the new id; reload → persists; the old id is gone.
  2. Open the draft editor, click "مشخصات" in the toolbar menu, change title, save; then edit a clue → the title stays.
  3. Publish from the row: summary dialog → "انتشار برای همه"; the puzzle appears on the home page with `publishedAt` set.
  4. Open the published puzzle as admin, "مشخصات": id read-only; change the newspaper, save; a second browser profile refetches that pack and shows the new value; saved letters/progress are unaffected.
  5. Photo import tab: the id/title/level/author form behaves as before; the draft it creates contains `meta.size` equal to rows×cols and `sourceFile` `{id}-clues.png`.
- [ ] **Step 4:** Report results (including anything not run) to the user. **Do not commit**; summarize the changed/created files for the user to review.
