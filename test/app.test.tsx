// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SolverPage } from "../app/pages/SolverPage";
import { App } from "../app/App";
import type { ReactNode } from "react";
import sample10 from "../samples/sample-10x10-garden.json";
import sample11 from "../samples/sample-11x11-city.json";
import type { CrosswordJson } from "../src/index";
import { compilePuzzle } from "../src/index";
import { normalizeGridDirection } from "../app/progress";
import referencePuzzle from "../puzzles/201-250/223_8004_normal.json";
import type { User } from "firebase/auth";
import { createClueReport } from "../app/support/supportApi";

const json10 = sample10 as CrosswordJson;
const json11 = sample11 as CrosswordJson;
const catalogPuzzle = { json: json10, hash: "published-v1" };

const authState = vi.hoisted(() => ({ user: null as User | null, isAdmin: false, syncVersion: 0, pushChanges: () => {} }));

vi.mock("../app/support/supportApi", async (importOriginal) => ({
  ...await importOriginal<typeof import("../app/support/supportApi")>(),
  createClueReport: vi.fn(),
}));

vi.mock("../app/AuthContext", () => ({
  useAuth: () => authState,
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../app/puzzleLibrary", () => ({
  usePuzzleLibrary: () => ({ puzzles: [], ready: true, sync: "ok" }),
  getPuzzleById: (id: string) => id === "sample-10x10-garden" ? { id, ...catalogPuzzle } : undefined,
  listPuzzles: () => [],
}));

describe("Persian crossword UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Prevent the first-run tutorial from auto-opening in unrelated tests.
    window.localStorage.setItem("persian-crossword-seen-tutorial", "true");
    window.location.hash = "";
    authState.user = null;
    authState.isAdmin = false;
    authState.syncVersion = 0;
    catalogPuzzle.json = json10;
    catalogPuzzle.hash = "published-v1";
    vi.mocked(createClueReport).mockReset().mockResolvedValue({ tracked: true, threadId: "report-1" });
  });

  it.each([
    ["#/contact", "تماس با ما"],
    ["#/support", "گزارش‌ها و پیام‌های من"],
    ["#/support/thread/contact-1", "گزارش‌ها و پیام‌های من"],
  ])("renders the public or account-gated support route %s", (hash, heading) => {
    window.location.hash = hash;
    render(<App />);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    if (hash !== "#/contact") expect(screen.getByText(/برای پیگیری.*وارد حساب/)).toBeInTheDocument();
  });

  it("keeps a report icon in each existing clue action strip without adding clue rows", () => {
    render(<SolverPage id="sample-10x10-garden" json={json10} />);
    const panel = screen.getByLabelText("پرسش فعال");
    const reports = within(panel).getAllByRole("button", { name: "گزارش خطای این پرسش" });
    expect(reports).toHaveLength(2);
    expect(panel.children).toHaveLength(2);
    for (const button of reports) {
      expect(button).toHaveClass("clue-icon-btn");
      expect(button).toHaveAttribute("title", "گزارش خطای پرسش");
      expect(button.parentElement).toHaveClass("active-clue-head-actions");
      expect(button.querySelector("svg")).toHaveClass("lucide-flag");
      expect(button.closest(".active-clue-block")?.children).toHaveLength(3);
    }
  });

  it("returns an admin support puzzle to the support inbox from its visible back button", async () => {
    authState.isAdmin = true;
    window.location.hash = "#/puzzle/sample-10x10-garden?slot=R1-7&from=admin-support";
    render(<App />);
    const back = screen.getByRole("button", { name: "بازگشت به گزارش‌ها و پیام‌ها" });
    expect(back).toHaveAttribute("title", "بازگشت به گزارش‌ها و پیام‌ها");
    await userEvent.click(back);
    expect(window.location.hash).toBe("#/admin?tab=support");
  });

  it("keeps the ordinary puzzle back button labeled for the home list", () => {
    render(<SolverPage id="sample-10x10-garden" json={json10} />);
    expect(screen.getByRole("button", { name: "بازگشت به فهرست جدول‌ها" })).toHaveAttribute("title", "بازگشت به فهرست جدول‌ها");
  });

  it.each([false, true])("preserves the report explanation and selected slot through sign-in (anonymous: %s)", async (anonymous) => {
    const user = userEvent.setup();
    authState.user = anonymous ? { uid: "guest", isAnonymous: true } as User : null;
    const { rerender } = render(<SolverPage id="sample-10x10-garden" json={json10} />);
    await user.click(screen.getByLabelText("ردیف 1 ستون 7"));
    await user.click(screen.getAllByRole("button", { name: "گزارش خطای این پرسش" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "گزارش خطای پرسش" });
    const explanation = within(dialog).getByRole("textbox", { name: "توضیح خطا" });
    await user.type(explanation, "پرسش با پاسخ هماهنگ نیست");
    expect(within(dialog).getByRole("button", { name: "ارسال گزارش" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "ورود یا ساخت حساب" }));
    expect(screen.getByRole("dialog", { name: "ورود" })).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(createClueReport).not.toHaveBeenCalled();

    authState.user = { uid: "player", isAnonymous: false } as User;
    authState.syncVersion++;
    rerender(<SolverPage id="sample-10x10-garden" json={json10} />);
    expect(screen.getByRole("dialog", { name: "گزارش خطای پرسش" })).toBe(dialog);
    expect(explanation).toHaveValue("پرسش با پاسخ هماهنگ نیست");
    expect(screen.getByLabelText("ردیف 1 ستون 7")).toHaveClass("cell-selected");
    expect(within(dialog).getByRole("button", { name: "ارسال گزارش" })).toBeEnabled();
  });

  it("submits the selected clue snapshot and retains a Persian receipt until deliberately closed", async () => {
    authState.user = { uid: "player", isAnonymous: false } as User;
    const user = userEvent.setup();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);
    await user.click(screen.getAllByRole("button", { name: "گزارش خطای این پرسش" })[1]!);
    const dialog = screen.getByRole("dialog", { name: "گزارش خطای پرسش" });
    expect(within(dialog).getByText("باغ — ۱۰ در ۱۰")).toBeInTheDocument();
    expect(within(dialog).getByText("sample-10x10-garden")).toBeInTheDocument();
    expect(within(dialog).getByText("۱ عمودی")).toBeInTheDocument();
    expect(within(dialog).getByText("نمونه عمودی 1، 4 حرف")).toBeInTheDocument();
    const answer = compilePuzzle(normalizeGridDirection(json10)).getSlot("C1-1")!.answer!;
    expect(within(dialog).getByText(`پاسخ: ${answer}`)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(1);
    const submit = within(dialog).getByRole("button", { name: "ارسال گزارش" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "توضیح خطا" }), "  متن پرسش اشتباه است  ");
    await user.click(submit);
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("گزارش شما ثبت شد"));
    expect(createClueReport).toHaveBeenCalledWith({
      subject: "خطای پرسش: باغ — ۱۰ در ۱۰",
      text: "متن پرسش اشتباه است",
      clue: { puzzleId: "sample-10x10-garden", puzzleTitle: "باغ — ۱۰ در ۱۰", slotId: "C1-1", direction: "down", groupNum: 1, text: "نمونه عمودی 1، 4 حرف", answer },
    });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "ارسال گزارش" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "بستن" }));
    expect(dialog).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "گزارش خطای این پرسش" })[0]!);
    expect(screen.getByRole("textbox", { name: "توضیح خطا" })).toHaveValue("");
  });

  it("keeps an unsuccessful report editable and allows retry", async () => {
    authState.user = { uid: "player", isAnonymous: false } as User;
    vi.mocked(createClueReport).mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);
    await user.click(screen.getAllByRole("button", { name: "گزارش خطای این پرسش" })[0]!);
    await user.type(screen.getByRole("textbox", { name: "توضیح خطا" }), "شرح خطا");
    await user.click(screen.getByRole("button", { name: "ارسال گزارش" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ارسال گزارش انجام نشد");
    expect(screen.getByRole("textbox", { name: "توضیح خطا" })).toHaveValue("شرح خطا");
    await user.click(screen.getByRole("button", { name: "ارسال گزارش" }));
    expect(await screen.findByRole("status")).toHaveTextContent("گزارش شما ثبت شد");
  });

  it("keeps the report mounted when an admin signs in through the puzzle route", async () => {
    window.location.hash = "#/puzzle/sample-10x10-garden?slot=C2-1";
    const user = userEvent.setup();
    const { rerender } = render(<App />);
    expect(screen.getByLabelText("پرسش فعال").querySelector(".active-clue-block-active")).toHaveTextContent("۲ عمودی");
    await user.click(screen.getAllByRole("button", { name: "گزارش خطای این پرسش" })[1]!);
    const dialog = screen.getByRole("dialog", { name: "گزارش خطای پرسش" });
    await user.type(within(dialog).getByRole("textbox", { name: "توضیح خطا" }), "توضیح محفوظ");
    authState.user = { uid: "admin", isAnonymous: false } as User;
    authState.isAdmin = true;
    authState.syncVersion++;
    rerender(<App />);
    expect(screen.getByRole("dialog", { name: "گزارش خطای پرسش" })).toBe(dialog);
    expect(within(dialog).getByRole("textbox", { name: "توضیح خطا" })).toHaveValue("توضیح محفوظ");
    expect(screen.getByLabelText("پرسش فعال").querySelector(".active-clue-block-active")).toHaveTextContent("۲ عمودی");
    expect(screen.getAllByTitle("ویرایش متن پرسش (دیباگ)")).toHaveLength(2);

    catalogPuzzle.json = {
      ...sample10,
      clues: { ...sample10.clues, horizontal: { ...sample10.clues.horizontal, "1": ["پرسش اصلاح‌شده", ...sample10.clues.horizontal["1"].slice(1)] } },
    } as CrosswordJson;
    catalogPuzzle.hash = "admin-clue-fix";
    rerender(<App />);
    expect(screen.getByRole("dialog", { name: "گزارش خطای پرسش" })).toBe(dialog);
    expect(within(dialog).getByRole("textbox", { name: "توضیح خطا" })).toHaveValue("توضیح محفوظ");
    await user.click(within(dialog).getByRole("button", { name: "بستن" }));
    await user.click(screen.getAllByRole("button", { name: "گزارش خطای این پرسش" })[0]!);
    expect(within(screen.getByRole("dialog", { name: "گزارش خطای پرسش" })).getByText("پرسش اصلاح‌شده")).toBeInTheDocument();
  });

  it("refreshes a same-grid catalog update without discarding the report, then remounts for a grid change", async () => {
    window.location.hash = "#/puzzle/sample-10x10-garden";
    const user = userEvent.setup();
    const { rerender } = render(<App />);
    await user.click(screen.getAllByRole("button", { name: "گزارش خطای این پرسش" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "گزارش خطای پرسش" });
    await user.type(within(dialog).getByRole("textbox", { name: "توضیح خطا" }), "توضیح محفوظ");
    window.localStorage.setItem("persian-crossword:sample-10x10-garden", JSON.stringify({ cells: { "0,9": "س" } }));
    catalogPuzzle.json = { ...sample10, meta: { ...sample10.meta, title: "عنوان به‌روز" } } as CrosswordJson;
    catalogPuzzle.hash = "published-v2";
    rerender(<App />);
    expect(screen.getByRole("heading", { name: "عنوان به‌روز" })).toBeInTheDocument();
    expect(screen.getByLabelText("ردیف 1 ستون 10")).toHaveTextContent("س");
    expect(screen.getByRole("dialog", { name: "گزارش خطای پرسش" })).toBe(dialog);
    expect(within(dialog).getByRole("textbox", { name: "توضیح خطا" })).toHaveValue("توضیح محفوظ");

    catalogPuzzle.json = { ...sample10, grid: sample10.grid.map((row, i) => i === 0 ? ["ا", ...row.slice(1)] : row) } as CrosswordJson;
    catalogPuzzle.hash = "published-v3";
    rerender(<App />);
    expect(screen.queryByRole("dialog", { name: "گزارش خطای پرسش" })).not.toBeInTheDocument();
  });

  it("selects an exact slot initially, on route changes, and after resetting the puzzle", async () => {
    const puzzle = compilePuzzle(normalizeGridDirection(json10));
    const down = puzzle.slots.find((slot) => slot.direction === "down" && slot.groupNum === 2)!;
    const user = userEvent.setup();
    const { rerender } = render(<SolverPage id="sample-10x10-garden" json={json10} slotId={down.id} />);
    const activeBlock = () => screen.getByLabelText("پرسش فعال").querySelector(".active-clue-block-active");
    expect(activeBlock()).toHaveTextContent("۲ عمودی");
    await user.click(screen.getByLabelText("ردیف 1 ستون 10"));
    await user.click(screen.getByRole("button", { name: "گزینه‌های بیشتر" }));
    await user.click(screen.getByRole("button", { name: "پاک کردن پاسخ‌ها" }));
    await user.click(within(screen.getByRole("dialog", { name: "تایید عملیات" })).getByRole("button", { name: "تایید" }));
    expect(activeBlock()).toHaveTextContent("۲ عمودی");
    rerender(<SolverPage id="sample-10x10-garden" json={json10} slotId="deleted-slot" />);
    expect(activeBlock()).toHaveTextContent("۱ افقی");
    rerender(<SolverPage id="sample-10x10-garden" json={json10} slotId={down.id} />);
    expect(activeBlock()).toHaveTextContent("۲ عمودی");
  });

  it("renders the puzzle title and active clue", () => {
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.getByRole("heading", { name: /باغ.*۱۰ در ۱۰|sample-10x10-garden/i })).toBeInTheDocument();
    expect(screen.getByText("easy").closest(".puzzle-meta-item")).toHaveClass("puzzle-meta-item-difficulty");
    expect(screen.getAllByRole("gridcell")).toHaveLength(100);
    const activeClue = within(screen.getByLabelText("پرسش فعال"));
    expect(activeClue.getByText("۱ افقی")).toHaveClass("active-clue-label");
    expect(activeClue.getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "نوع پرسش" })).not.toBeInTheDocument();
  });

  it.each([false, true])("shows the repository puzzle's answer in the correct physical order (draft: %s)", async (draft) => {
    const original = JSON.stringify(referencePuzzle);
    const json = referencePuzzle as CrosswordJson;
    const puzzle = compilePuzzle(normalizeGridDirection(json));
    const firstAcross = puzzle.slots.filter((slot) => slot.direction === "across" && slot.groupNum === 1);
    expect(firstAcross.map((slot) => slot.answer)).toEqual(["کولر", "بوینوسایرس"]);
    render(<SolverPage id="223" json={json} editor={draft ? { kind: "draft", save: vi.fn() } : undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "نمایش پاسخ" }));
    const cells = within(screen.getByRole("dialog", { name: "پاسخ جدول" })).getAllByRole("gridcell");
    expect(cells.slice(0, 15).map((cell) => cell.textContent?.trim() ?? "")).toEqual([...referencePuzzle.grid[0]!].reverse());
    expect(cells[14]).toHaveTextContent("ک"); // right edge of the LTR board
    expect(cells[0]).toHaveTextContent("س"); // left edge
    expect(JSON.stringify(referencePuzzle)).toBe(original);
  });

  it("adds both RTL clues to intersecting cells", () => {
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    const tooltip = screen.getByLabelText("ردیف 1 ستون 10").querySelector("[role=tooltip]");
    expect(tooltip).toHaveAttribute("dir", "rtl");
    expect(tooltip?.children).toHaveLength(2);
    expect(tooltip).toHaveTextContent("۱ افقی نمونه افقی 1، 2 حرف");
    expect(tooltip).toHaveTextContent("۱ عمودی نمونه عمودی 1، 4 حرف");
  });

  it("renders a different puzzle when a different id/json is given", () => {
    render(<SolverPage id="sample-11x11-city" json={json11} />);

    expect(screen.getAllByRole("gridcell")).toHaveLength(121);
  });

  it("toggles direction when clicking an intersecting cell twice", async () => {
    const user = userEvent.setup();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    const firstCell = screen.getByLabelText("ردیف 1 ستون 10");
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه افقی 1، 2 حرف")).toBeInTheDocument();

    await user.click(firstCell);
    expect(within(screen.getByLabelText("پرسش فعال")).getByText("نمونه عمودی 1، 4 حرف")).toBeInTheDocument();
  });

  it("types one Persian character and advances through the active word", async () => {
    const user = userEvent.setup();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    const firstCell = screen.getByLabelText("ردیف 1 ستون 7");
    const secondCell = screen.getByLabelText("ردیف 1 ستون 6");

    await user.click(firstCell);
    await user.keyboard("س");

    expect(firstCell).toHaveTextContent("س");
    expect(secondCell).toHaveClass("cell-selected");
  });

  it("auto-opens the tutorial on first run and persists dismissal", async () => {
    const user = userEvent.setup();
    window.localStorage.removeItem("persian-crossword-seen-tutorial");

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    const dialog = screen.getByRole("dialog", { name: "راهنمای استفاده" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("افقی")).toBeInTheDocument();
    expect(within(dialog).getByText("عمودی")).toBeInTheDocument();
    expect(within(dialog).getByText("سرحد")).toBeInTheDocument();
    expect(within(dialog).getByText("والده")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button", { name: /مرحله/ })).toHaveLength(6);
    expect(within(dialog).queryByText("راهنمای صفحه‌کلید")).not.toBeInTheDocument();
    expect(dialog.querySelectorAll(".tutorial-stage .cell-value svg").length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole("button", { name: "فهمیدم" }));

    expect(screen.queryByRole("dialog", { name: "راهنمای استفاده" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("persian-crossword-seen-tutorial")).toBe("true");
  });

  it("does not auto-open the tutorial when already seen, but opens from the toolbar", async () => {
    const user = userEvent.setup();

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.queryByRole("dialog", { name: "راهنمای استفاده" })).not.toBeInTheDocument();

    const menuButton = screen.getByRole("button", { name: "گزینه‌های بیشتر" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "راهنمای استفاده" }));

    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("dialog", { name: "راهنمای استفاده" })).toBeInTheDocument();
  });

  it("restores localStorage progress for the given id", () => {
    window.localStorage.setItem(
      "persian-crossword:sample-10x10-garden",
      JSON.stringify({ cells: { "0,9": "س" } }),
    );

    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(screen.getByLabelText("ردیف 1 ستون 10")).toHaveTextContent("س");
  });

  it("saves nothing until the player types, then queues the change for upload", async () => {
    const user = userEvent.setup();
    render(<SolverPage id="sample-10x10-garden" json={json10} />);

    expect(window.localStorage.getItem("persian-crossword:sample-10x10-garden")).toBeNull();
    expect(window.localStorage.getItem("persian-crossword-sync")).toBeNull();

    await user.click(screen.getByLabelText("ردیف 1 ستون 7"));
    await user.keyboard("س");

    expect(JSON.parse(window.localStorage.getItem("persian-crossword:sample-10x10-garden")!).cells).toEqual({ "0,6": "س" });
    const entry = JSON.parse(window.localStorage.getItem("persian-crossword-sync")!).entries["sample-10x10-garden"];
    expect(entry).toMatchObject({ status: "progress", dirty: true, v: 0 });
  });

  it("preserves the selected cell when cloud sync refreshes progress", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SolverPage id="sample-10x10-garden" json={json10} />);

    await user.click(screen.getByLabelText("ردیف 1 ستون 7"));
    expect(screen.getByLabelText("ردیف 1 ستون 7")).toHaveClass("cell-selected");

    window.localStorage.setItem(
      "persian-crossword:sample-10x10-garden",
      JSON.stringify({ cells: { "0,9": "س" } }),
    );
    authState.syncVersion = 1;
    rerender(<SolverPage id="sample-10x10-garden" json={json10} />);

    await waitFor(() => {
      expect(screen.getByLabelText("ردیف 1 ستون 10")).toHaveTextContent("س");
    });
    expect(screen.getByLabelText("ردیف 1 ستون 7")).toHaveClass("cell-selected");
  });

  it("shows the editing tools only with an editor, and keeps every saved clue fix", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SolverPage id="sample-10x10-garden" json={json10} />);
    expect(screen.queryByTitle("ویرایش متن پرسش (دیباگ)")).not.toBeInTheDocument();
    unmount();

    const saved: CrosswordJson[] = [];
    const editor = { kind: "draft" as const, save: vi.fn(async (json: CrosswordJson) => void saved.push(json)) };
    render(<SolverPage id="sample-10x10-garden" json={json10} editor={editor} />);

    async function editClue(pencil: HTMLElement, text: string): Promise<void> {
      await user.click(pencil);
      const box = screen.getByRole("textbox", { name: "" });
      await user.clear(box);
      await user.type(box, text);
      await user.click(screen.getByRole("button", { name: "ذخیره" }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "ویرایش متن پرسش" })).not.toBeInTheDocument());
    }

    const pencils = screen.getAllByTitle("ویرایش متن پرسش (دیباگ)");
    await editClue(pencils[0]!, "اول");
    await editClue(screen.getAllByTitle("ویرایش متن پرسش (دیباگ)")[1]!, "دوم");

    expect(editor.save).toHaveBeenCalledTimes(2);
    // The second save still carries the first fix, although the page's json prop never changed.
    const clues = JSON.stringify(saved[1]!.clues);
    expect(clues).toContain("اول");
    expect(clues).toContain("دوم");
  });

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
});
