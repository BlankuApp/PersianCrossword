// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxFromPoints, composeCrops, extractedClues, extractedGrid, photoPuzzle, reviewClues, stackLayout } from "../app/admin/photoImport";
import { ImageCropper } from "../app/admin/ImageCropper";

const { extract, createDraft } = vi.hoisted(() => ({ extract: vi.fn(), createDraft: vi.fn() }));
vi.mock("../app/admin/openRouterPhoto", async (original) => ({ ...await original<typeof import("../app/admin/openRouterPhoto")>(), extractOpenRouterPhoto: extract }));
vi.mock("../app/admin/adminApi", () => ({ createDraft }));
import { PhotoImportSection } from "../app/admin/PhotoImportSection";
import { loadOpenRouterKey, saveOpenRouterKey } from "../app/progress";
import { ADMIN_SETTINGS_KEY, loadPhotoSettings, loadCropSettings, saveAdminSettings } from "../app/admin/adminSettings";
import referencePuzzle from "../puzzles/201-250/223_8004_normal.json";

const clues = {
  clues: {
    horizontal: { "1": ["افقی یک"], "2": ["افقی دو"] },
    vertical: { "1": ["ستون راست"], "2": ["ستون چپ"] },
  },
};
const grid = { grid: [["ا", "ب"], ["ك", "ي"]] };
const png = "data:image/png;base64,aW1hZ2U=";
let loadedImages: HTMLImageElement[];
const drawImage = vi.fn();

beforeEach(() => {
  vi.resetAllMocks(); loadedImages = [];
  localStorage.clear(); saveOpenRouterKey("test-openrouter-key");
  vi.stubGlobal("Image", function () {
    const image = document.createElement("img");
    Object.defineProperties(image, { naturalWidth: { value: 120 }, naturalHeight: { value: 80 } });
    loadedImages.push(image); return image;
  });
  vi.stubGlobal("PointerEvent", MouseEvent);
  // jsdom has no native dialog methods; emulate visibility, not browser focus trapping.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } },
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ fillStyle: "", fillRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function pick(input: HTMLInputElement) {
  fireEvent.change(input, { target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] } });
  act(() => loadedImages.at(-1)!.onload!(new Event("load")));
}

// Clues and grid live in separate tabs of the AI build card; only the open tab is accessible.
async function openTab(name: RegExp) {
  await userEvent.click(screen.getByRole("tab", { name }));
}
const CLUES = /پرسش‌ها/, GRID = /جدول پاسخ/;

async function wholeCrop(input: HTMLInputElement) {
  const panel = input.closest<HTMLElement>("[role=tabpanel]")!;
  await openTab(panel.id.endsWith("clues") ? CLUES : GRID);
  const cropper = input.closest<HTMLElement>(".photo-cropper")!;
  await userEvent.click(within(cropper).getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ }));
  await userEvent.click(within(cropper).getByRole("button", { name: "افزودن کادر کامل" }));
  await userEvent.click(within(cropper).getByRole("button", { name: "پایان برش" }));
}

describe("photo import", () => {
  it("requires a key, remembers it locally, uses the chosen model and permits clearing it", async () => {
    localStorage.clear();
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    const key = screen.getByLabelText("کلید API در OpenRouter");
    expect(key).toHaveAttribute("type", "password");
    const fileInput = view.container.querySelector<HTMLInputElement>("input[type=file]")!;
    pick(fileInput); await wholeCrop(fileInput);
    expect(screen.getByRole("button", { name: "استخراج پرسش‌ها" })).toBeDisabled();
    fireEvent.change(key, { target: { value: "  supplied-key  " } });
    expect(loadOpenRouterKey()).toBe("supplied-key");
    expect([...Array(localStorage.length)].map((_, i) => localStorage.key(i))).toEqual(expect.arrayContaining(["persian-crossword-openrouter-key", ADMIN_SETTINGS_KEY]));
    fireEvent.change(screen.getByLabelText("مدل OpenRouter"), { target: { value: "openai/gpt-6.1-sol" } });
    await userEvent.selectOptions(screen.getByLabelText("میزان استدلال (Reasoning effort)"), "low");
    extract.mockResolvedValue(clues);
    await userEvent.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    await waitFor(() => expect(extract).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "supplied-key", model: "openai/gpt-6.1-sol", reasoningEffort: "low", image: png }), expect.any(AbortSignal)));
    view.unmount();
    render(<PhotoImportSection takenIds={new Set()} />);
    expect(screen.getByLabelText("کلید API در OpenRouter")).toHaveValue("supplied-key");
    fireEvent.change(screen.getByLabelText("کلید API در OpenRouter"), { target: { value: "" } });
    expect(loadOpenRouterKey()).toBe("");
    expect(localStorage.getItem("persian-crossword-openrouter-key")).toBeNull();
    expect(localStorage.getItem(ADMIN_SETTINGS_KEY)).not.toBeNull();
  });

  it("restores all photo form settings after reopening without storing the key in settings or issuing OCR requests", async () => {
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    fireEvent.change(screen.getByLabelText("مدل OpenRouter"), { target: { value: "custom/vision" } });
    await userEvent.selectOptions(screen.getByLabelText("میزان استدلال (Reasoning effort)"), "medium");
    await userEvent.selectOptions(screen.getByLabelText("نوع شرح"), "special");
    for (const [label, value] of [["شمارهٔ جدول (اختیاری)", "8050"], ["تعداد ردیف‌ها", "12"], ["تعداد ستون‌ها", "10"], ["شناسهٔ جدول", "8050-special"], ["عنوان", "عنوان 8050"], ["روزنامه", "ایران"], ["سطح", "عادی"], ["طراح", "طراح 2"]]) {
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    }
    const stored = localStorage.getItem(ADMIN_SETTINGS_KEY)!;
    expect(stored).not.toContain("test-openrouter-key");
    expect(ADMIN_SETTINGS_KEY).not.toMatch(/^persian-crossword:/);
    view.unmount();
    render(<PhotoImportSection takenIds={new Set()} />);
    for (const [label, value] of [["مدل OpenRouter", "custom/vision"], ["میزان استدلال (Reasoning effort)", "medium"], ["نوع شرح", "special"], ["شمارهٔ جدول (اختیاری)", "۸۰۵۰"], ["تعداد ردیف‌ها", "۱۲"], ["تعداد ستون‌ها", "۱۰"], ["شناسهٔ جدول", "۸۰۵۰-special"], ["عنوان", "عنوان ۸۰۵۰"], ["روزنامه", "ایران"], ["سطح", "عادی"], ["طراح", "طراح ۲"]]) {
      expect(screen.getByLabelText(label!)).toHaveValue(value);
    }
    expect(extract).not.toHaveBeenCalled();
  });

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

  it("falls back safely for corrupt settings and remains editable when localStorage writes fail", () => {
    localStorage.setItem(ADMIN_SETTINGS_KEY, "broken JSON");
    expect(loadPhotoSettings()).toMatchObject({ rows: 15, cols: 15, reasoningEffort: "high", variant: "normal" });
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify({ photo: { model: 42, rows: 0, cols: 100, reasoningEffort: "invalid", variant: "invalid", puzzleNumber: {}, meta: { title: {}, author: [] } }, clueCrop: { mode: "invalid", zoom: 500 } }));
    expect(loadPhotoSettings()).toMatchObject({ rows: 15, cols: 15, reasoningEffort: "high", variant: "normal", puzzleNumber: "", meta: { title: "", author: "" } });
    expect(loadCropSettings(true)).toEqual({ mode: "draw", zoom: 100 });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
    expect(saveAdminSettings({ tab: "ai" })).toBe(false);
    render(<PhotoImportSection takenIds={new Set()} />);
    fireEvent.change(screen.getByLabelText("مدل OpenRouter"), { target: { value: "still/editable" } });
    expect(screen.getByLabelText("مدل OpenRouter")).toHaveValue("still/editable");
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("مرورگر اجازهٔ ذخیرهٔ تنظیمات را نداد"))).toBe(true);
  });

  it("remembers each cropper's zoom and tool independently across images and remounts", async () => {
    const changes = vi.fn();
    const view = render(<ImageCropper multiple disabled={false} onChange={changes} />);
    pick(view.container.querySelector<HTMLInputElement>("input[type=file]")!);
    await userEvent.click(screen.getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ }));
    fireEvent.change(screen.getByLabelText("بزرگ‌نمایی"), { target: { value: "200" } });
    await userEvent.click(screen.getByRole("button", { name: "جابه‌جایی تصویر" }));
    expect(loadCropSettings(true)).toEqual({ zoom: 200, mode: "pan" });
    // Saving the other cropper or form must not overwrite this cropper's preferences.
    saveAdminSettings({ gridCrop: { zoom: 125, mode: "adjust" }, photo: { rows: 12 } });
    view.unmount();
    const reopened = render(<ImageCropper multiple disabled={false} onChange={changes} />);
    pick(reopened.container.querySelector<HTMLInputElement>("input[type=file]")!);
    await userEvent.click(screen.getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ }));
    expect(screen.getByLabelText("بزرگ‌نمایی")).toHaveValue("200");
    expect(screen.getByRole("button", { name: "جابه‌جایی تصویر" })).toHaveAttribute("aria-pressed", "true");
    expect(loadCropSettings(false)).toEqual({ zoom: 125, mode: "adjust" });
    expect(loadPhotoSettings().rows).toBe(12);
  });

  it("clamps reverse drags and stacks sections in selection order at original resolution", () => {
    expect(boxFromPoints({ x: 130, y: 75 }, { x: -5, y: 10 }, 120, 80)).toEqual({ x: 0, y: 10, width: 120, height: 65 });
    const boxes = [{ x: 50, y: 5, width: 30, height: 20 }, { x: 0, y: 10, width: 50, height: 10 }];
    expect(stackLayout(boxes)).toEqual({ width: 50, height: 38, boxes: [
      { x: 20, y: 0, width: 30, height: 20 }, { x: 0, y: 28, width: 50, height: 10 },
    ] });
    const image = new Image();
    expect(composeCrops(image, boxes)).toBe(png);
    expect(drawImage.mock.calls.map((call) => call.slice(1))).toEqual([
      [50, 5, 30, 20, 20, 0, 30, 20], [0, 10, 50, 10, 0, 28, 50, 10],
    ]);
    expect(() => stackLayout([{ x: 0, y: 0, width: 4000, height: 4000 }])).toThrow();
    expect(() => composeCrops(image, [{ x: 119, y: 0, width: 2, height: 4 }])).toThrow();
  });

  it("normalizes Persian cells without mirroring them, retains blanks and rejects corrupt results", () => {
    expect(extractedGrid({ grid: [["ك", "", "ي"]] }, 1, 3)).toEqual([["ک", "", "ی"]]);
    expect(() => extractedGrid({ grid: [["اب"]] }, 1, 1)).toThrow(/یک حرف/);
    expect(() => extractedGrid({ grid: [[null]] }, 1, 1)).toThrow(/متن/);
    expect(() => extractedGrid(grid, 3, 2)).toThrow(/اندازه/);
    expect(() => extractedClues({ horizontal: [], vertical: [] }, 2, 2)).toThrow(/"clues"/);
    const json = photoPuzzle(JSON.stringify(clues), JSON.stringify(grid), 2, 2);
    expect(json.grid).toEqual([["ا", "ب"], ["ک", "ی"]]);
    expect(json.clues.vertical).toEqual({ "1": ["ستون راست"], "2": ["ستون چپ"] });
    expect(() => photoPuzzle(JSON.stringify({ clues: { ...clues.clues, horizontal: {} } }), JSON.stringify(grid), 2, 2)).toThrow(/شماره‌های جاافتاده: 1، 2/);
  });

  it("requires numbered maps with all 15 groups in each direction, allowing multiple clues per group", () => {
    const groups = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), ["پرسش یک", "پرسش دو", "كلمه ي فارسي"]]));
    const result = { clues: { horizontal: groups, vertical: groups } };
    expect(extractedClues(result, 15, 15).horizontal["15"]).toEqual(["پرسش یک", "پرسش دو", "کلمه ی فارسی"]);
    expect(reviewClues(JSON.stringify(result), 15, 15)).toMatchObject({ counts: { horizontal: 15, vertical: 15 }, error: "" });
    const { "15": _last, ...partial } = groups;
    expect(reviewClues(JSON.stringify({ clues: { horizontal: partial, vertical: partial } }), 15, 15)).toMatchObject({ clues: null, counts: { horizontal: 14, vertical: 14 } });
    expect(() => extractedClues({ clues: { horizontal: partial, vertical: partial } }, 15, 15)).toThrow(/جاافتاده: 15/);
    for (const bad of [
      { horizontal: [{ number: 1, clues: ["پرسش"] }], vertical: groups },
      { horizontal: { ...groups, "01": ["پرسش"] }, vertical: groups },
      { horizontal: { ...groups, "16": ["پرسش"] }, vertical: groups },
      { horizontal: groups, vertical: { ...groups, "1": [" "] } },
      { horizontal: groups, vertical: { ...groups, "1": "پرسش" } },
    ]) expect(() => extractedClues({ clues: bad }, 15, 15)).toThrow();
    expect(reviewClues('{"clues":', 15, 15)).toMatchObject({ clues: null, error: expect.stringContaining("JSON") });
  });

  it("scales mouse coordinates to image pixels, permits reordering and replaces the single grid crop", async () => {
    const changed = vi.fn();
    const view = render(<ImageCropper multiple disabled={false} onChange={changed} />);
    pick(view.container.querySelector("input[type=file]")!);
    await userEvent.click(screen.getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ }));
    const surface = view.container.querySelector<HTMLDivElement>(".photo-crop-surface")!;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 60, height: 40 } as DOMRect);
    surface.setPointerCapture = vi.fn(); surface.hasPointerCapture = () => false;
    fireEvent.pointerDown(surface, { clientX: 5, clientY: 5, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 20, clientY: 15 });
    fireEvent.pointerUp(surface, { clientX: 20, clientY: 15 });
    fireEvent.pointerDown(surface, { clientX: 30, clientY: 0, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 50, clientY: 10 });
    expect(drawImage.mock.calls.at(-2)?.slice(1)).toEqual([10, 10, 30, 20, 10, 0, 30, 20]);
    expect(drawImage.mock.calls.at(-1)?.slice(1)).toEqual([60, 0, 40, 20, 0, 28, 40, 20]);
    await userEvent.click(screen.getByRole("button", { name: "انتقال کادر ۲ به بالا" }));
    expect(drawImage.mock.calls.at(-2)?.slice(1)).toEqual([60, 0, 40, 20, 0, 0, 40, 20]);
    view.rerender(<ImageCropper multiple={false} disabled={false} onChange={changed} />);
    fireEvent.pointerDown(surface, { clientX: 1, clientY: 1, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 59, clientY: 39 });
    expect(view.container.querySelectorAll(".photo-crop-list li")).toHaveLength(1);
  });

  it("zooms, moves and resizes crops in the fullscreen dialog and keeps them after closing", async () => {
    const changed = vi.fn();
    const view = render(<ImageCropper multiple disabled={false} onChange={changed} />);
    pick(view.container.querySelector("input[type=file]")!);
    await userEvent.click(screen.getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ }));
    expect(screen.getByRole("dialog", { name: "برش ستون‌های پرسش‌ها" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بستن ابزار برش" })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    const surface = view.container.querySelector<HTMLDivElement>(".photo-crop-surface")!;
    const viewport = view.container.querySelector<HTMLDivElement>(".photo-crop-viewport")!;
    surface.setPointerCapture = vi.fn(); surface.hasPointerCapture = () => false;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 120, height: 80 } as DOMRect);
    fireEvent.change(screen.getByRole("slider", { name: "بزرگ‌نمایی" }), { target: { value: "200" } });
    expect(surface).toHaveStyle({ width: "200%" });
    fireEvent.pointerDown(surface, { clientX: 20, clientY: 10, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 100, clientY: 70 });
    await userEvent.click(screen.getByRole("button", { name: "تنظیم کادر" }));
    fireEvent.pointerDown(surface, { clientX: 50, clientY: 40, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 60, clientY: 50 });
    expect(drawImage.mock.calls.at(-1)?.slice(1, 5)).toEqual([30, 20, 80, 60]);
    fireEvent.pointerDown(surface, { clientX: 110, clientY: 80, button: 0 });
    fireEvent.pointerUp(surface, { clientX: 90, clientY: 70 });
    expect(drawImage.mock.calls.at(-1)?.slice(1, 5)).toEqual([30, 20, 60, 50]);
    await userEvent.click(screen.getByRole("button", { name: "جابه‌جایی تصویر" }));
    viewport.scrollLeft = 40; viewport.scrollTop = 30;
    fireEvent.pointerDown(surface, { clientX: 70, clientY: 50, button: 0 });
    fireEvent.pointerMove(surface, { clientX: 50, clientY: 40 });
    fireEvent.pointerUp(surface, { clientX: 50, clientY: 40 });
    expect(viewport.scrollLeft).toBe(60); expect(viewport.scrollTop).toBe(40);
    await userEvent.click(screen.getByRole("button", { name: "پایان برش" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(changed.mock.calls.at(-1)).toEqual([png]);
    await userEvent.click(screen.getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ }));
    const summary = screen.getByText(/کادر ۱ — ۶۰ × ۵۰/);
    await userEvent.click(summary);
    const width = screen.getByRole("spinbutton", { name: "عرض (پیکسل)" });
    expect(width).toHaveValue("۶۰");
    fireEvent.change(width, { target: { value: "45" } });
    expect(width).toHaveValue("۴۵");
    expect(drawImage.mock.calls.at(-1)?.slice(1, 5)).toEqual([30, 20, 45, 50]);
  });

  it("keeps the native modal open for its exit animation and closes immediately with reduced motion", async () => {
    const view = render(<ImageCropper multiple disabled={false} onChange={vi.fn()} />);
    pick(view.container.querySelector("input[type=file]")!);
    await userEvent.click(screen.getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ }));
    const modal = screen.getByRole("dialog") as HTMLDialogElement;
    const exit = { onfinish: null, cancel: vi.fn() } as unknown as Animation;
    modal.animate = vi.fn(() => exit);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    fireEvent(modal, new Event("cancel", { cancelable: true }));
    expect(modal).toHaveAttribute("open");
    expect(document.body.style.overflow).toBe("hidden");
    expect(modal.animate).toHaveBeenCalledOnce();
    act(() => { exit.onfinish!.call(exit, {} as AnimationPlaybackEvent); });
    expect(modal).not.toHaveAttribute("open");
    expect(exit.cancel).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe("");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    await userEvent.click(screen.getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ }));
    await userEvent.click(screen.getByRole("button", { name: "پایان برش" }));
    expect(modal).not.toHaveAttribute("open");
    expect(modal.animate).toHaveBeenCalledOnce();
  });

  it("edits Persian letters and black cells in place, keeps the grid visible after validation fails, and updates the saved JSON", async () => {
    extract.mockImplementation(async (input: Record<string, unknown>) => input.kind === "clues" ? clues : grid);
    createDraft.mockResolvedValue(undefined);
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    fireEvent.change(screen.getByLabelText("تعداد ردیف‌ها"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("تعداد ستون‌ها"), { target: { value: "2" } });
    for (const input of view.container.querySelectorAll<HTMLInputElement>("input[type=file]")) { pick(input); await wholeCrop(input); }
    await openTab(CLUES);
    await userEvent.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    await openTab(GRID);
    await userEvent.click(screen.getByRole("button", { name: "استخراج جدول" }));
    fireEvent.change(screen.getByLabelText("شناسهٔ جدول"), { target: { value: "edited-grid" } });
    const cell = screen.getByRole("textbox", { name: "خانهٔ ردیف ۱ ستون ۱ از راست" });
    const save = screen.getByRole("button", { name: "ساخت پیش‌نویس از نتیجه" });
    expect(save).toBeEnabled();
    fireEvent.change(cell, { target: { value: "اب" } });
    expect(cell).toHaveValue("ا");
    expect(screen.getByRole("alert")).toHaveTextContent("تنها یک حرف فارسی");
    fireEvent.change(cell, { target: { value: "" } });
    expect(cell).toHaveClass("photo-grid-block");
    expect(save).toBeDisabled();
    expect(screen.getByRole("group", { name: "ویرایش خانه‌های جدول" })).toBeInTheDocument();
    fireEvent.change(cell, { target: { value: "ي" } });
    expect(cell).toHaveValue("ی");
    expect(save).toBeEnabled();
    expect(JSON.parse((screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)") as HTMLTextAreaElement).value).grid).toEqual([["ی", "ب"], ["ک", "ی"]]);
    cell.focus(); fireEvent.keyDown(cell, { key: "ArrowLeft" });
    expect(screen.getByRole("textbox", { name: "خانهٔ ردیف ۱ ستون ۲ از راست" })).toHaveFocus();
    await userEvent.click(save);
    await waitFor(() => expect(createDraft).toHaveBeenCalledOnce());
    expect(JSON.parse(createDraft.mock.calls[0]![0].jsonText).grid[0][0]).toBe("ی");
  });

  it("mirrors every row including black cells, can undo the mirror, and saves the corrected grid without another OCR request", async () => {
    const source = [["", "ل", "س"], ["ا", "ی", "ر"], ["ب", "ت", "ک"]];
    const corrected = [["س", "ل", ""], ["ر", "ی", "ا"], ["ک", "ت", "ب"]];
    const groups = { "1": ["یک"], "2": ["دو"], "3": ["سه"] };
    const clueResult = { clues: { horizontal: groups, vertical: groups } };
    extract.mockImplementation(async (input: Record<string, unknown>) => input.kind === "clues" ? clueResult : { grid: source });
    createDraft.mockResolvedValue(undefined);
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    fireEvent.change(screen.getByLabelText("تعداد ردیف‌ها"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("تعداد ستون‌ها"), { target: { value: "3" } });
    for (const input of view.container.querySelectorAll<HTMLInputElement>("input[type=file]")) { pick(input); await wholeCrop(input); }
    await openTab(CLUES);
    await userEvent.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    await openTab(GRID);
    await userEvent.click(screen.getByRole("button", { name: "استخراج جدول" }));
    fireEvent.change(screen.getByLabelText("شناسهٔ جدول"), { target: { value: "mirrored-grid" } });
    const mirror = screen.getByRole("button", { name: "برعکس کردن چپ و راست" });
    const result = screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)") as HTMLTextAreaElement;
    expect(screen.getByRole("group", { name: "ویرایش خانه‌های جدول" })).toHaveAttribute("dir", "rtl");
    await userEvent.click(mirror);
    expect(JSON.parse(result.value).grid).toEqual(corrected);
    expect(screen.getByRole("textbox", { name: "خانهٔ ردیف ۱ ستون ۱ از راست" })).toHaveValue("س");
    expect(screen.getByRole("textbox", { name: "خانهٔ ردیف ۱ ستون ۳ از راست" })).toHaveClass("photo-grid-block");
    await userEvent.click(mirror);
    expect(JSON.parse(result.value).grid).toEqual(source);
    await userEvent.click(mirror);
    await userEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس از نتیجه" }));
    await waitFor(() => expect(createDraft).toHaveBeenCalledOnce());
    expect(JSON.parse(createDraft.mock.calls[0]![0].jsonText).grid).toEqual(corrected);
    expect(JSON.parse(createDraft.mock.calls[0]![0].jsonText).clues).toEqual(clueResult.clues);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("previews and saves the supplied repository puzzle in its original right-to-left row order", async () => {
    extract.mockImplementation(async (input: Record<string, unknown>) => input.kind === "clues" ? { clues: referencePuzzle.clues } : { grid: referencePuzzle.grid });
    createDraft.mockResolvedValue(undefined);
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    for (const input of view.container.querySelectorAll<HTMLInputElement>("input[type=file]")) { pick(input); await wholeCrop(input); }
    await openTab(CLUES);
    await userEvent.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    await openTab(GRID);
    await userEvent.click(screen.getByRole("button", { name: "استخراج جدول" }));
    fireEvent.change(screen.getByLabelText("شناسهٔ جدول"), { target: { value: "reference-223" } });
    expect(screen.getByRole("group", { name: "ویرایش خانه‌های جدول" })).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("textbox", { name: "خانهٔ ردیف ۱ ستون ۱ از راست" })).toHaveValue("ک");
    expect(screen.getByRole("textbox", { name: "خانهٔ ردیف ۱ ستون ۱۵ از راست" })).toHaveValue("س");
    await userEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس از نتیجه" }));
    await waitFor(() => expect(createDraft).toHaveBeenCalledOnce());
    const json = JSON.parse(createDraft.mock.calls[0]![0].jsonText);
    expect(json.version).toBe(3);
    expect(json.grid).toEqual(referencePuzzle.grid);
    expect(json.clues).toEqual(extractedClues({ clues: referencePuzzle.clues }, 15, 15));
  });

  it("extracts both photos, refuses mismatched clues and saves a reviewed draft with its cropped images", async () => {
    extract.mockImplementation(async (input: Record<string, unknown>) => input.kind === "clues" ? clues : grid);
    createDraft.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    fireEvent.change(screen.getByLabelText("تعداد ردیف‌ها"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("تعداد ستون‌ها"), { target: { value: "2" } });
    for (const input of view.container.querySelectorAll<HTMLInputElement>("input[type=file]")) { pick(input); await wholeCrop(input); }
    await openTab(CLUES);
    await user.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    await waitFor(() => expect(screen.getByLabelText("پرسش‌های استخراج‌شده (قابل ویرایش)")).toHaveValue(JSON.stringify(clues, null, 2)));
    await openTab(GRID);
    await user.click(screen.getByRole("button", { name: "استخراج جدول" }));
    await waitFor(() => expect(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)")).toHaveValue(JSON.stringify(grid, null, 2)));
    await user.type(screen.getByLabelText("شناسهٔ جدول"), "photo-302");
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveValue("photo-۳۰۲");
    const save = screen.getByRole("button", { name: "ساخت پیش‌نویس از نتیجه" });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText("پرسش‌های استخراج‌شده (قابل ویرایش)"), { target: { value: JSON.stringify({ clues: { ...clues.clues, horizontal: { ...clues.clues.horizontal, "1": ["یک", "اضافی"] } } }) } });
    expect(save).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("ردیف ۱: ۲ پرسش وارد شده، اما شبکه ۱ بخش پیوستهٔ حداقل دوخانه‌ای دارد");
    fireEvent.change(screen.getByLabelText("پرسش‌های استخراج‌شده (قابل ویرایش)"), { target: { value: JSON.stringify(clues) } });
    await user.click(save);
    await waitFor(() => expect(createDraft).toHaveBeenCalledOnce());
    const draft = createDraft.mock.calls[0]![0];
    expect(JSON.parse(draft.jsonText)).toMatchObject({ version: 3, meta: { id: "photo-302", sourceFile: "photo-302-clues.png" }, grid: [["ا", "ب"], ["ک", "ی"]] });
    expect(JSON.parse(draft.jsonText).clues).toEqual(clues.clues);
    expect(draft.jsonText).not.toContain("test-openrouter-key");
    expect(draft.images.map((i: { kind: string }) => i.kind)).toEqual(["solution", "source"]);
    expect(screen.getByRole("link", { name: "باز کردن برای حل و ویرایش" })).toHaveAttribute("href", "#/admin/draft/photo-302");
    expect(extract.mock.calls.map(([request]) => request)).toEqual([
      { apiKey: "test-openrouter-key", model: "google/gemini-3.8-flash", reasoningEffort: "high", kind: "clues", rows: 2, cols: 2, image: png, variant: "normal", puzzleNumber: "" },
      { apiKey: "test-openrouter-key", model: "google/gemini-3.8-flash", reasoningEffort: "high", kind: "grid", rows: 2, cols: 2, image: png, variant: "normal", puzzleNumber: "" },
    ]);
  });

  it("checks format and missing groups before grid extraction and retries with a new OpenRouter request", async () => {
    const groups = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [String(i + 1), ["پرسش"]]));
    const { "15": _last, ...partial } = groups;
    extract.mockResolvedValueOnce({ horizontal: [{ number: 1, clues: ["پرسش"] }], vertical: [] })
      .mockResolvedValueOnce({ clues: { horizontal: partial, vertical: groups } });
    const user = userEvent.setup();
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    const fileInput = view.container.querySelector<HTMLInputElement>("input[type=file]")!;
    pick(fileInput); await wholeCrop(fileInput);
    await user.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('"clues"');
    await user.click(screen.getByRole("button", { name: "استخراج دوبارهٔ پرسش‌ها" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("شماره‌های جاافتاده: ۱۵"));
    expect(screen.getByLabelText("بررسی پرسش‌ها")).toHaveTextContent("گروه‌های افقی: ۱۴/۱۵");
    expect(screen.getByLabelText("بررسی پرسش‌ها")).toHaveTextContent("گروه‌های عمودی: ۱۵/۱۵");
    expect(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)")).toHaveValue("");
    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract.mock.calls[1]![0]).toEqual(extract.mock.calls[0]![0]);
    expect(screen.getByRole("button", { name: "ساخت پیش‌نویس از نتیجه" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("پرسش‌های استخراج‌شده (قابل ویرایش)"), { target: { value: JSON.stringify({ clues: { horizontal: groups, vertical: groups } }) } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("بررسی پرسش‌ها")).toHaveTextContent("اعتبار قالب و شماره‌ها: درست");
    await openTab(GRID);
    fireEvent.change(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)"), { target: { value: JSON.stringify({ grid: [["اب"]] }) } });
    expect(screen.getByRole("alert")).toHaveTextContent("اندازهٔ جدول باید ۱۵ ردیف و ۱۵ ستون باشد");
  });

  it("keeps the newspaper photos but clears normal crops and results when switching to special", async () => {
    extract.mockResolvedValue(clues);
    const user = userEvent.setup();
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    await user.type(screen.getByLabelText("شمارهٔ جدول (اختیاری)"), "۸۰۵۰");
    for (const input of view.container.querySelectorAll<HTMLInputElement>("input[type=file]")) { pick(input); await wholeCrop(input); }
    await openTab(CLUES);
    await user.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    await waitFor(() => expect(screen.getByLabelText("پرسش‌های استخراج‌شده (قابل ویرایش)")).toHaveValue(JSON.stringify(clues, null, 2)));
    fireEvent.change(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)"), { target: { value: JSON.stringify(grid) } });
    await user.selectOptions(screen.getByLabelText("نوع شرح"), "special");
    expect(screen.getByLabelText("پرسش‌های استخراج‌شده (قابل ویرایش)")).toHaveValue("");
    expect(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)")).toHaveValue("");
    expect(view.container.querySelectorAll(".photo-crop-surface")).toHaveLength(2);
    expect(view.container.querySelectorAll(".photo-crop-list li")).toHaveLength(0);
    expect(screen.getByLabelText("سطح")).toHaveValue("ویژه");
    await openTab(CLUES);
    expect(screen.getByRole("button", { name: "استخراج پرسش‌ها" })).toBeDisabled();
    await wholeCrop(view.container.querySelector<HTMLInputElement>("input[type=file]")!);
    await user.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    await waitFor(() => expect(extract).toHaveBeenCalledTimes(2));
    expect(extract.mock.calls[1]![0]).toMatchObject({ variant: "special", puzzleNumber: "۸۰۵۰" });
  });

  it("takes a pasted image into the cropper of the open tab only", async () => {
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    const paste = (type: string) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { files: [new File(["photo"], "image.png", { type })] } });
      fireEvent(document.body, event);
      return event;
    };
    expect(paste("text/plain").defaultPrevented).toBe(false);
    expect(loadedImages).toHaveLength(0);
    expect(paste("image/png").defaultPrevented).toBe(true);
    act(() => loadedImages.at(-1)!.onload!(new Event("load")));
    const [clueCropper, gridCropper] = view.container.querySelectorAll<HTMLElement>(".photo-cropper");
    expect(within(clueCropper!).getByText("image.png")).toBeInTheDocument();
    expect(within(gridCropper!).queryByText("image.png")).not.toBeInTheDocument();
    await openTab(GRID);
    paste("image/png");
    act(() => loadedImages.at(-1)!.onload!(new Event("load")));
    expect(within(gridCropper!).getByRole("button", { name: /ویرایش برش‌ها در صفحهٔ بزرگ/ })).toBeInTheDocument();
    expect(loadedImages).toHaveLength(2);
  });

  it("keeps the crop and other result for an OpenRouter retry after a failed request", async () => {
    extract.mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce(clues);
    const view = render(<PhotoImportSection takenIds={new Set()} />);
    fireEvent.change(screen.getByLabelText("تعداد ردیف‌ها"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("تعداد ستون‌ها"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)"), { target: { value: JSON.stringify(grid) } });
    const fileInput = view.container.querySelector<HTMLInputElement>("input[type=file]")!;
    pick(fileInput); await wholeCrop(fileInput);
    await userEvent.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    expect(await screen.findByText("Connection lost")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "استخراج پرسش‌ها" }));
    await waitFor(() => expect(screen.getByLabelText("پرسش‌های استخراج‌شده (قابل ویرایش)")).toHaveValue(JSON.stringify(clues, null, 2)));
    expect(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)")).toHaveValue(JSON.stringify(grid));
    expect(extract.mock.calls[1]![0]).toEqual(extract.mock.calls[0]![0]);
  });
});
