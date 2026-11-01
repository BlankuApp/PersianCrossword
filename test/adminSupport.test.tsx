// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportMessage, SupportThread as Thread } from "../app/support/supportApi";

const state = vi.hoisted(() => ({ isAdmin: true, onThreads: null as ((threads: Thread[]) => void) | null }));
const api = vi.hoisted(() => ({ subscribe: vi.fn(), messages: vi.fn(), read: vi.fn(), reply: vi.fn(), status: vi.fn() }));
vi.mock("../app/AuthContext", () => ({ useAuth: () => ({ user: { uid: "admin" }, loading: false, isAdmin: state.isAdmin, syncVersion: 0 }) }));
vi.mock("../app/admin/useDrafts", () => ({ useDrafts: () => ({ drafts: [], loaded: true, error: null }) }));
vi.mock("../app/puzzleLibrary", () => ({ usePuzzleLibrary: () => ({ puzzles: [] }) }));
vi.mock("../app/puzzleSync", () => ({ refreshPuzzleCatalog: vi.fn() }));
vi.mock("../app/pages/HomePage", () => ({ DifficultyBadge: () => null, ProgressBar: () => null }));
vi.mock("../app/admin/adminApi", () => ({ createDraft: vi.fn(), deleteDraft: vi.fn(), publishDraft: vi.fn(), publishProblems: () => [], saveDraftMeta: vi.fn() }));
vi.mock("../app/support/supportApi", async (original) => ({
  ...await original<typeof import("../app/support/supportApi")>(),
  subscribeAllThreads: api.subscribe, subscribeMessages: api.messages, markSupportRead: api.read,
  replySupportThread: api.reply, setSupportStatus: api.status,
}));

import AdminPage from "../app/admin/AdminPage";

const date = (day: number) => Timestamp.fromDate(new Date(`2026-10-${day}T10:00:00Z`));
const clue: Thread = { id: "report/ب", kind: "clue_error", ownerUid: "player", subject: "پرسش اشتباه", status: "submitted", createdAt: date(24), updatedAt: date(24), lastMessageAt: date(24), userUnread: 0, adminUnread: 2,
  clue: { puzzleId: "جدول/۱", puzzleTitle: "جدول نمونه", slotId: "R1-2", direction: "across", groupNum: 3, text: "سرنخ ثبت‌شده" } };
const contact: Thread = { id: "contact", kind: "contact", subject: "کمک", status: "answered", createdAt: date(25), updatedAt: date(25), lastMessageAt: date(25), userUnread: 0, adminUnread: 0 };
const messages: SupportMessage[] = [{ id: "m1", sender: "user", text: "متن پیام", createdAt: date(24) }];

beforeEach(() => {
  vi.clearAllMocks(); state.isAdmin = true; state.onThreads = null; localStorage.clear();
  api.subscribe.mockImplementation((next) => { state.onThreads = next; next([clue, contact]); return vi.fn(); });
  api.messages.mockImplementation((_id, next) => { next(messages); return vi.fn(); });
  api.read.mockResolvedValue({ ok: true }); api.reply.mockResolvedValue({ ok: true }); api.status.mockResolvedValue({ ok: true });
});

async function openInbox() {
  render(<AdminPage />);
  await userEvent.click(screen.getByRole("tab", { name: "گزارش‌ها و پیام‌ها" }));
}

describe("admin support inbox", () => {
  it("hides the selected conversation when a filter excludes it", async () => {
    await openInbox();
    await userEvent.click(screen.getByRole("button", { name: /پرسش اشتباه/ }));
    expect(screen.getByLabelText("وضعیت گزارش")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("نوع گزارش"), "contact");
    expect(screen.queryByLabelText("وضعیت گزارش")).not.toBeInTheDocument();
    expect(screen.queryByText("سرنخ ثبت‌شده")).not.toBeInTheDocument();
  });
  it("subscribes only for admins and lists/filter threads with unread counts", async () => {
    state.isAdmin = false;
    const { rerender } = render(<AdminPage />);
    expect(api.subscribe).not.toHaveBeenCalled();
    state.isAdmin = true; rerender(<AdminPage />);
    await userEvent.click(screen.getByRole("tab", { name: "گزارش‌ها و پیام‌ها" }));
    expect(api.subscribe).toHaveBeenCalledOnce();
    expect(await screen.findByText("پرسش اشتباه")).toBeInTheDocument();
    expect(screen.getByText("۲ پیام خوانده‌نشده")).toBeInTheDocument();
    expect(screen.getByText("۰ پیام خوانده‌نشده")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("نوع گزارش"), "clue_error");
    expect(screen.getByText("پرسش اشتباه")).toBeInTheDocument();
    expect(screen.queryByText("کمک")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("وضعیت"), "reviewing");
    expect(screen.getByText(/موردی پیدا نشد/)).toBeInTheDocument();
  });

  it("limits status filters to the selected kind and clears an incompatible status", async () => {
    await openInbox();
    const kindFilter = screen.getByLabelText("نوع گزارش");
    const statusFilter = screen.getByLabelText("وضعیت");
    await userEvent.selectOptions(statusFilter, "answered");
    expect(screen.getByText("کمک")).toBeInTheDocument();
    await userEvent.selectOptions(kindFilter, "clue_error");
    expect(within(statusFilter).queryByRole("option", { name: "پاسخ داده شده" })).not.toBeInTheDocument();
    expect(statusFilter).toHaveValue("all");
    expect(screen.getByText("پرسش اشتباه")).toBeInTheDocument();
  });

  it("shows the snapshot and encoded puzzle link, replies, clears unread, and limits statuses by kind", async () => {
    await openInbox();
    await userEvent.click(await screen.findByRole("button", { name: /پرسش اشتباه/ }));
    expect(await screen.findByText("سرنخ ثبت‌شده")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "باز کردن جدول" })).toHaveAttribute("href", "#/puzzle/%D8%AC%D8%AF%D9%88%D9%84%2F%DB%B1?slot=R1-2&from=admin-support");
    expect(api.read).toHaveBeenCalledWith({ threadId: clue.id, participant: "admin", observedAt: { seconds: clue.lastMessageAt.seconds, nanoseconds: clue.lastMessageAt.nanoseconds } });
    const status = screen.getByLabelText("وضعیت گزارش");
    expect(within(status).queryByRole("option", { name: "پاسخ داده شده" })).not.toBeInTheDocument();
    expect(within(status).getByRole("option", { name: "تأییدشده" })).toBeInTheDocument();
    await userEvent.selectOptions(status, "reviewing");
    await waitFor(() => expect(api.status).toHaveBeenCalledWith({ threadId: clue.id, status: "reviewing" }));
    await userEvent.type(screen.getByRole("textbox", { name: "پاسخ شما" }), "پاسخ مدیر");
    await userEvent.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    await waitFor(() => expect(api.reply).toHaveBeenCalledWith({ threadId: clue.id, participant: "admin", text: "پاسخ مدیر" }));
  });

  it("opens the support tab from an explicit admin link despite saved tab", async () => {
    window.location.hash = "#/admin?tab=support";
    render(<AdminPage />);
    expect(screen.getByRole("tab", { name: "گزارش‌ها و پیام‌ها" })).toHaveAttribute("aria-selected", "true");
    expect(api.subscribe).toHaveBeenCalledOnce();
  });

  it("does not offer an undeliverable reply to an untracked contact sender", async () => {
    await openInbox();
    await userEvent.click(screen.getByRole("button", { name: /کمک/ }));
    expect(screen.queryByRole("textbox", { name: "پاسخ شما" })).not.toBeInTheDocument();
    expect(screen.getByText(/پیام بی‌نام.*پاسخ/)).toBeInTheDocument();
  });

  it("does not carry a reply draft into a different selected conversation", async () => {
    await openInbox();
    await userEvent.click(screen.getByRole("button", { name: /پرسش اشتباه/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "پاسخ شما" }), { target: { value: "پاسخ برای سرنخ" } });
    await userEvent.click(screen.getByRole("button", { name: /کمک/ }));
    expect(screen.queryByRole("textbox", { name: "پاسخ شما" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /پرسش اشتباه/ }));
    expect(screen.getByRole("textbox", { name: "پاسخ شما" })).toHaveValue("");
  });
});
