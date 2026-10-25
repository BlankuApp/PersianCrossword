// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "../app/admin/AdminPage";
import type { Draft } from "../app/admin/adminApi";
import { basicPuzzleV3 } from "./fixtures";

const { draftState, publishDraft, saveDraftMeta, createDraftMock } = vi.hoisted(() => ({ draftState: { drafts: [] as Draft[] }, publishDraft: vi.fn(), saveDraftMeta: vi.fn(), createDraftMock: vi.fn() }));

vi.mock("../app/AuthContext", () => ({ useAuth: () => ({ user: { uid: "admin" }, loading: false, isAdmin: true, syncVersion: 0 }) }));
vi.mock("../app/admin/useDrafts", () => ({ useDrafts: () => ({ drafts: draftState.drafts, loaded: true, error: null }) }));
vi.mock("../app/puzzleLibrary", () => ({ usePuzzleLibrary: () => ({ puzzles: [] }) }));
vi.mock("../app/puzzleSync", () => ({ refreshPuzzleCatalog: vi.fn() }));
vi.mock("../app/pages/HomePage", () => ({ DifficultyBadge: () => null, ProgressBar: () => null }));
vi.mock("../app/admin/adminApi", () => ({ createDraft: createDraftMock, deleteDraft: vi.fn(), publishDraft, publishProblems: () => [], saveDraftMeta }));

beforeEach(() => { localStorage.clear(); draftState.drafts = []; vi.resetAllMocks(); });

// The AI tab has its own clue/grid tabs; the admin page's panel is the outermost visible one.
const adminPanel = () => screen.getAllByRole("tabpanel")[0]!;

describe("admin tabs", () => {
  it("restores the last selected tab when the admin page reopens", async () => {
    const view = render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "ساخت با هوش‌واره" }));
    view.unmount();
    render(<AdminPage />);
    expect(screen.getByRole("tab", { name: "ساخت با هوش‌واره" })).toHaveAttribute("aria-selected", "true");
    expect(adminPanel()).toHaveAttribute("id", "admin-panel-ai");
  });

  it("displays typed English and Arabic digits as Persian digits while keeping dimensions numeric", async () => {
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "ساخت با هوش‌واره" }));
    const rows = screen.getByRole("spinbutton", { name: "تعداد ردیف‌ها" });
    expect(rows).toHaveValue("۱۵");
    await userEvent.clear(rows); await userEvent.type(rows, "15");
    expect(rows).toHaveValue("۱۵"); expect(rows).toHaveAttribute("aria-valuenow", "15");
    fireEvent.change(rows, { target: { value: "٦٠" } });
    fireEvent.keyDown(rows, { key: "ArrowUp" });
    expect(rows).toHaveValue("۶۰");
    fireEvent.keyDown(rows, { key: "ArrowDown" });
    expect(rows).toHaveValue("۵۹");
    fireEvent.change(rows, { target: { value: "bad" } });
    expect(rows).toHaveValue("۵۹");
    await userEvent.clear(rows);
    expect(screen.getByText("ابعاد جدول را از ۱ تا ۶۰ وارد کنید.")).toBeInTheDocument();
    fireEvent.keyDown(rows, { key: "ArrowDown" });
    expect(rows).toHaveValue("۱");
    await userEvent.type(screen.getByLabelText("شماره در روزنامه (اختیاری)"), "8050");
    expect(screen.getByLabelText("عنوان")).toHaveValue("جدول ۸۰۵۰");
    await userEvent.clear(screen.getByLabelText("عنوان"));
    await userEvent.type(screen.getByLabelText("عنوان"), "جدول 8050");
    await userEvent.clear(screen.getByLabelText("شناسهٔ جدول"));
    await userEvent.type(screen.getByLabelText("شناسهٔ جدول"), "8050");
    expect(screen.getByLabelText("شماره در روزنامه (اختیاری)")).toHaveValue("۸۰۵۰");
    expect(screen.getByLabelText("عنوان")).toHaveValue("جدول ۸۰۵۰");
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveValue(8050);
    const number = screen.getByLabelText("شماره در روزنامه (اختیاری)") as HTMLInputElement;
    number.focus(); number.setSelectionRange(2, 2);
    await userEvent.keyboard("1");
    expect(number).toHaveValue("۸۰۱۵۰"); expect(number.selectionStart).toBe(3);
  });

  it("shows drafts first, supports RTL keyboard navigation, and preserves the AI form when switching tabs", async () => {
    render(<AdminPage />);
    const tabs = within(screen.getByRole("tablist", { name: "بخش‌های مدیریت" })).getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(adminPanel()).toHaveAttribute("id", "admin-panel-drafts");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" });
    expect(tabs[1]).toHaveFocus();
    expect(adminPanel()).toHaveAttribute("id", "admin-panel-ai");
    fireEvent.change(screen.getByLabelText("مدل OpenRouter"), { target: { value: "chosen/vision-model" } });
    await userEvent.selectOptions(screen.getByLabelText("میزان استدلال (Reasoning effort)"), "medium");
    fireEvent.change(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)"), { target: { value: '{"grid":[]}' } });
    await userEvent.click(tabs[2]!);
    expect(adminPanel()).toHaveAttribute("id", "admin-panel-json");
    expect(screen.getByRole("heading", { name: "افزودن جدول با JSON" })).toBeInTheDocument();
    fireEvent.keyDown(tabs[2]!, { key: "Home" });
    expect(tabs[0]).toHaveFocus();
    await userEvent.click(tabs[1]!);
    expect(screen.getByLabelText("مدل OpenRouter")).toHaveValue("chosen/vision-model");
    expect(screen.getByLabelText("میزان استدلال (Reasoning effort)")).toHaveValue("medium");
    expect(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)")).toHaveValue('{"grid":[]}');
    fireEvent.keyDown(tabs[1]!, { key: "ArrowRight" });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  it("opens contextual help on hover, focus and touch clicks and dismisses it with Escape", async () => {
    render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "ساخت با هوش‌واره" }));
    const help = screen.getByRole("button", { name: "راهنمای کلید OpenRouter" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.hover(help);
    expect(screen.getByRole("tooltip")).toHaveTextContent("localStorage");
    await userEvent.unhover(help);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.click(help);
    const tooltip = screen.getByRole("tooltip");
    expect(help).toHaveAttribute("aria-describedby", tooltip.id);
    expect(within(tooltip).getByText(/برای حذف آن/)).toBeInTheDocument();
    fireEvent.keyDown(help, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("draft metadata and publishing", () => {
  const draft: Draft = { id: "8050", json: { ...basicPuzzleV3, meta: { id: "8050", title: "جدول قدیم" } },
    jsonText: "{}", file: "admin/8050.json", images: {}, updatedAt: 1, solutionImageUrl: undefined, sourceImageUrl: undefined };
  function setup() {
    draftState.drafts = [draft, { ...draft, id: "8051", json: { ...draft.json, meta: { id: "8051", title: "دیگری" } } }];
    render(<AdminPage />);
    return screen.getByText("جدول قدیم").closest("li")!;
  }


  it("marks an incomplete upload as unpublishable and permits re-importing its files", async () => {
    const json = { ...draft.json, grid: draft.json.grid.map((row) => [...row].reverse()), meta: { ...draft.json.meta, sourceFile: "8050-clues.png" } };
    draftState.drafts = [{ ...draft, json, imagesPending: true, images: {
      solution: { name: "8050.png", path: "puzzles/8050/solution.png", hash: "solution" },
      source: { name: "8050-clues.png", path: "puzzles/8050/source.png", hash: "source" },
    } }];
    render(<AdminPage />);
    const row = screen.getByText("جدول قدیم").closest("li")!;
    expect(within(row).getByRole("button", { name: "انتشار" })).toBeDisabled();
    expect(row).toHaveTextContent("بارگذاری تصاویر کامل نشده");
    expect(within(row).getByRole("button", { name: "مشخصات" })).toBeDisabled();
    expect(within(row).queryByRole("link", { name: "حل و ویرایش" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "افزودن با JSON" }));
    const files = [
      ["8050.json", new TextEncoder().encode(JSON.stringify(json))],
      ["8050.png", new Uint8Array([1])], ["8050-clues.png", new Uint8Array([2])],
    ] as const;
    fireEvent.change(screen.getByLabelText("انتخاب فایل‌ها"), { target: { files: files.map(([name, bytes]) => {
      const file = new File([bytes], name);
      Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
      return file;
    }) } });
    const create = await screen.findByRole("button", { name: /ساخت ۱ پیش‌نویس/ });
    expect(create).toBeEnabled();
    await userEvent.click(create);
    await waitFor(() => expect(createDraftMock).toHaveBeenCalledWith(expect.objectContaining({ id: "8050", images: expect.any(Array) })));
  });

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
