// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "../app/admin/AdminPage";
import type { Draft } from "../app/admin/adminApi";
import { basicPuzzleV3 } from "./fixtures";

const { draftState, publishDraft } = vi.hoisted(() => ({ draftState: { drafts: [] as Draft[] }, publishDraft: vi.fn() }));

vi.mock("../app/AuthContext", () => ({ useAuth: () => ({ user: { uid: "admin" }, loading: false, isAdmin: true, syncVersion: 0 }) }));
vi.mock("../app/admin/useDrafts", () => ({ useDrafts: () => ({ drafts: draftState.drafts, loaded: true, error: null }) }));
vi.mock("../app/puzzleLibrary", () => ({ usePuzzleLibrary: () => ({ puzzles: [] }) }));
vi.mock("../app/puzzleSync", () => ({ refreshPuzzleCatalog: vi.fn() }));
vi.mock("../app/pages/HomePage", () => ({ DifficultyBadge: () => null, ProgressBar: () => null }));
vi.mock("../app/admin/adminApi", () => ({ createDraft: vi.fn(), deleteDraft: vi.fn(), publishDraft, publishProblems: () => [] }));

beforeEach(() => { localStorage.clear(); draftState.drafts = []; vi.resetAllMocks(); });

describe("admin tabs", () => {
  it("restores the last selected tab when the admin page reopens", async () => {
    const view = render(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "ساخت با هوش‌واره" }));
    view.unmount();
    render(<AdminPage />);
    expect(screen.getByRole("tab", { name: "ساخت با هوش‌واره" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "admin-panel-ai");
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
    await userEvent.type(screen.getByLabelText("شمارهٔ جدول (اختیاری)"), "8050");
    await userEvent.type(screen.getByLabelText("عنوان"), "جدول 8050");
    await userEvent.type(screen.getByLabelText("شناسهٔ جدول"), "8050-normal");
    expect(screen.getByLabelText("شمارهٔ جدول (اختیاری)")).toHaveValue("۸۰۵۰");
    expect(screen.getByLabelText("عنوان")).toHaveValue("جدول ۸۰۵۰");
    expect(screen.getByLabelText("شناسهٔ جدول")).toHaveValue("۸۰۵۰-normal");
    const number = screen.getByLabelText("شمارهٔ جدول (اختیاری)") as HTMLInputElement;
    number.focus(); number.setSelectionRange(2, 2);
    await userEvent.keyboard("1");
    expect(number).toHaveValue("۸۰۱۵۰"); expect(number.selectionStart).toBe(3);
  });

  it("shows drafts first, supports RTL keyboard navigation, and preserves the AI form when switching tabs", async () => {
    render(<AdminPage />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "admin-panel-drafts");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowLeft" });
    expect(tabs[1]).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "admin-panel-ai");
    fireEvent.change(screen.getByLabelText("مدل OpenRouter"), { target: { value: "chosen/vision-model" } });
    await userEvent.selectOptions(screen.getByLabelText("میزان استدلال (Reasoning effort)"), "medium");
    fireEvent.change(screen.getByLabelText("جدول استخراج‌شده (قابل ویرایش)"), { target: { value: '{"grid":[]}' } });
    await userEvent.click(tabs[2]!);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "admin-panel-json");
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

  it("edits the ID with publishing metadata, cancels without saving and preserves both for a failed publish retry", async () => {
    const draft: Draft = { id: "8050", json: { ...basicPuzzleV3, meta: { id: "8050", title: "جدول قدیم" } },
      jsonText: "{}", file: "admin/8050.json", images: {}, updatedAt: 1, solutionImageUrl: undefined, sourceImageUrl: undefined };
    draftState.drafts = [draft, { ...draft, id: "8051", json: { ...draft.json, meta: { id: "8051", title: "دیگری" } } }];
    const view = render(<AdminPage />);
    const row = screen.getByText("جدول قدیم").closest("li")!;
    expect(screen.queryByRole("button", { name: "تغییر شناسه" })).not.toBeInTheDocument();
    const edit = within(row).getByRole("button", { name: "انتشار" });
    await userEvent.click(edit);
    const initialField = within(row).getByLabelText("شناسهٔ انتشار");
    expect(initialField).toHaveValue("۸۰۵۰"); expect(initialField).toHaveFocus();
    expect(within(row).getByRole("button", { name: "انتشار برای همه" })).toBeEnabled();
    fireEvent.change(initialField, { target: { value: "8052" } });
    fireEvent.keyDown(initialField, { key: "Escape" });
    expect(within(row).queryByLabelText("شناسهٔ انتشار")).not.toBeInTheDocument();
    expect(edit).toHaveFocus(); expect(publishDraft).not.toHaveBeenCalled();
    await userEvent.click(edit);
    const field = within(row).getByLabelText("شناسهٔ انتشار");
    const save = within(row).getByRole("button", { name: "انتشار برای همه" });
    expect(field).toHaveValue("۸۰۵۰");
    fireEvent.change(field, { target: { value: "bad/id" } });
    expect(field).toHaveAttribute("aria-invalid", "true"); expect(save).toBeDisabled();
    fireEvent.change(field, { target: { value: "8051" } });
    expect(within(row).getByRole("alert")).toHaveTextContent("قبلاً استفاده شده");
    expect(save).toBeDisabled(); expect(publishDraft).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "8052" } });
    expect(field).toHaveValue("۸۰۵۲");
    fireEvent.change(within(row).getByLabelText("عنوان"), { target: { value: "عنوان تازه 8052" } });
    publishDraft.mockRejectedValueOnce(new Error("خطای ارتباط"));
    await userEvent.click(save);
    expect(await within(row).findByRole("alert")).toHaveTextContent("خطای ارتباط");
    expect(field).toHaveValue("۸۰۵۲"); expect(save).toBeEnabled();
    expect(within(row).getByLabelText("عنوان")).toHaveValue("عنوان تازه ۸۰۵۲");
    publishDraft.mockImplementationOnce(async () => {
      draftState.drafts = draftState.drafts.filter((d) => d.id !== "8050");
    });
    await userEvent.click(save);
    await waitFor(() => expect(publishDraft).toHaveBeenCalledTimes(2));
    // Simulate the Firestore listener removing the published draft.
    view.rerender(<AdminPage />);
    expect(screen.queryByText("جدول قدیم")).not.toBeInTheDocument();
    expect(publishDraft.mock.calls[0]).toEqual([draft, expect.objectContaining({ meta: expect.objectContaining({ title: "عنوان تازه ۸۰۵۲" }) }), "8052"]);
    expect(publishDraft.mock.calls[1]).toEqual(publishDraft.mock.calls[0]);
  });
});
