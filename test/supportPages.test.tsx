// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import type { SupportMessage, SupportThread as Thread } from "../app/support/supportApi";

const state = vi.hoisted(() => ({ user: null as User | null, isAdmin: false }));
const api = vi.hoisted(() => ({
  create: vi.fn(), own: vi.fn(), messages: vi.fn(), reply: vi.fn(), read: vi.fn(), image: vi.fn(),
  stopOwn: vi.fn(), stopMessages: vi.fn(),
}));
vi.mock("../app/AuthContext", () => ({
  useAuth: () => ({ user: state.user, loading: false, isAdmin: state.isAdmin, syncVersion: 0,
    syncStatus: { kind: "synced", unsent: 0 }, signOut: vi.fn(), syncNow: vi.fn() }),
  AuthProvider: ({ children }: { children: import("react").ReactNode }) => children,
}));
vi.mock("../app/support/supportApi", async (original) => ({
  ...await original<typeof import("../app/support/supportApi")>(),
  createContact: api.create, subscribeOwnThreads: api.own, subscribeMessages: api.messages,
  replySupportThread: api.reply, markSupportRead: api.read, loadSupportImage: api.image,
}));
vi.mock("../app/puzzleLibrary", () => ({
  listPuzzles: () => [], usePuzzleLibrary: () => ({ puzzles: [], ready: true, sync: "ok" }),
}));
vi.mock("../app/puzzleSync", () => ({ retryPuzzleSync: vi.fn() }));
vi.mock("../app/gemini", () => ({
  FREE_AI_LIMITS: { guest: 10, account: 100 }, loadFreeAiUsed: async () => 0, freeAiUsageText: () => "",
}));

import { ContactPage } from "../app/support/ContactPage";
import { SupportPage } from "../app/support/SupportPage";
import { SupportThread } from "../app/support/SupportThread";
import { AuthButton } from "../app/components/AuthButton";
import { HomePage } from "../app/pages/HomePage";

const account = (uid = "player", isAnonymous = false) => ({ uid, isAnonymous, displayName: "کاربر", email: null, providerData: [] }) as unknown as User;
const time = Timestamp.fromDate(new Date("2026-10-25T10:00:00Z"));
const contact: Thread = { id: "contact-1", kind: "contact", ownerUid: "player", subject: "پیشنهاد", status: "answered",
  createdAt: time, updatedAt: time, lastMessageAt: time, userUnread: 2, adminUnread: 0 };
const report: Thread = { ...contact, id: "report-1", kind: "clue_error", subject: "پرسش اشتباه", status: "fixed", userUnread: 1,
  lastMessageAt: Timestamp.fromDate(new Date("2026-10-24T10:00:00Z")) };
const messages: SupportMessage[] = [
  { id: "initial", sender: "user", text: "متن اولیه", createdAt: time, imagePath: "support/player/contact-1/initial" },
  { id: "answer", sender: "admin", text: "پاسخ پشتیبانی", createdAt: time },
];

beforeEach(() => {
  vi.clearAllMocks();
  state.user = null;
  state.isAdmin = false;
  window.location.hash = "#/";
  window.localStorage.clear();
  api.create.mockResolvedValue({ tracked: false });
  api.own.mockImplementation((_uid, next) => { next([report, contact]); return api.stopOwn; });
  api.messages.mockImplementation((_id, next) => { next(messages); return api.stopMessages; });
  api.reply.mockResolvedValue({ ok: true });
  api.read.mockResolvedValue({ ok: true });
  api.image.mockResolvedValue(new Blob(["private"], { type: "image/png" }));
  vi.stubGlobal("URL", URL);
  URL.createObjectURL = vi.fn(() => "blob:private-image");
  URL.revokeObjectURL = vi.fn();
});

async function fillContact() {
  fireEvent.change(screen.getByRole("textbox", { name: "موضوع" }), { target: { value: "  پیشنهاد  " } });
  fireEvent.change(screen.getByRole("textbox", { name: "متن پیام" }), { target: { value: "  متن تماس  " } });
}

describe("public contact", () => {
  it("requires nonblank bounded subject and text before submitting", async () => {
    render(<ContactPage />);
    const submit = screen.getByRole("button", { name: "ارسال پیام" });
    expect(submit).toBeDisabled();
    await fillContact();
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText("متن پیام"), { target: { value: " " } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("متن پیام"), { target: { value: "a".repeat(2001) } });
    expect(submit).toBeDisabled();
    expect(api.create).not.toHaveBeenCalled();
  });

  it.each([null, account("guest", true)])("gives missing/anonymous auth a receipt without any thread link (%s)", async (user) => {
    state.user = user;
    // Even an unexpected tracked response must not expose tracking to a guest.
    api.create.mockResolvedValue({ tracked: true, threadId: "secret" });
    render(<ContactPage />);
    await fillContact();
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
    expect(await screen.findByRole("status")).toHaveTextContent("پیام شما ثبت شد");
    expect(api.create).toHaveBeenCalledWith({ subject: "پیشنهاد", text: "متن تماس" });
    expect(screen.queryByRole("link", { name: /پیگیری/ })).not.toBeInTheDocument();
    expect(api.own).not.toHaveBeenCalled();
  });

  it("returns the tracked conversation link to a real account", async () => {
    state.user = account();
    api.create.mockResolvedValue({ tracked: true, threadId: "thread /ب" });
    render(<ContactPage />);
    await fillContact();
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
    expect(await screen.findByRole("link", { name: "پیگیری پیام" })).toHaveAttribute("href", "#/support/thread/thread%20%2F%D8%A8");
  });

  it.each([
    new File(["bad"], "test.gif", { type: "image/gif" }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
  ])("rejects invalid images before base64 conversion ($name)", async (file) => {
    const read = vi.spyOn(FileReader.prototype, "readAsDataURL");
    render(<ContactPage />);
    await fillContact();
    fireEvent.change(screen.getByLabelText(/تصویر پیوست/), { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/PNG|۵/);
    expect(screen.queryByRole("img", { name: "پیش‌نمایش پیوست" })).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it("previews one valid image, sends its base64, and releases its object URL", async () => {
    const { unmount } = render(<ContactPage />);
    await fillContact();
    fireEvent.change(screen.getByLabelText(/تصویر پیوست/), { target: { files: [new File(["png"], "small.png", { type: "image/png" })] } });
    expect(await screen.findByRole("img", { name: "پیش‌نمایش پیوست" })).toHaveAttribute("src", "blob:private-image");
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
    await screen.findByRole("status");
    expect(api.create).toHaveBeenCalledWith({ subject: "پیشنهاد", text: "متن تماس", image: { mimeType: "image/png", data: "cG5n" } });
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-image");
  });

  it("rejects multiple attachments and permits removing the preview", async () => {
    render(<ContactPage />);
    const file = new File(["x"], "small.webp", { type: "image/webp" });
    const input = screen.getByLabelText(/تصویر پیوست/);
    fireEvent.change(input, { target: { files: [file, file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("یک تصویر");
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole("img", { name: "پیش‌نمایش پیوست" });
    fireEvent.click(screen.getByRole("button", { name: "حذف پیوست" }));
    expect(screen.queryByRole("img", { name: "پیش‌نمایش پیوست" })).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("accepts a JPEG exactly at the 5 MiB boundary without reading base64 before send", async () => {
    const read = vi.spyOn(FileReader.prototype, "readAsDataURL");
    render(<ContactPage />);
    fireEvent.change(screen.getByLabelText(/تصویر پیوست/), { target: { files: [new File([new Uint8Array(5 * 1024 * 1024)], "limit.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByRole("img", { name: "پیش‌نمایش پیوست" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it("blocks duplicate submission and editing until the pending request finishes", async () => {
    let complete!: (result: { tracked: boolean }) => void;
    api.create.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<ContactPage />);
    await fillContact();
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
    expect(screen.getByRole("button", { name: "در حال ارسال…" })).toBeDisabled();
    expect(screen.getByLabelText("متن پیام")).toBeDisabled();
    expect(screen.getByLabelText(/تصویر پیوست/)).toBeDisabled();
    expect(api.create).toHaveBeenCalledOnce();
    await act(async () => complete({ tracked: false }));
    expect(screen.getByRole("status")).toHaveTextContent("پیام شما ثبت شد");
  });

  it("keeps the draft and makes a failed submission retryable", async () => {
    api.create.mockRejectedValueOnce(new Error("offline"));
    render(<ContactPage />);
    await fillContact();
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ارسال پیام انجام نشد");
    expect(screen.getByLabelText("متن پیام")).toHaveValue("  متن تماس  ");
    fireEvent.click(screen.getByRole("button", { name: "ارسال پیام" }));
    expect(await screen.findByRole("status")).toHaveTextContent("پیام شما ثبت شد");
  });
});

describe("account support", () => {
  it.each([null, account("guest", true)])("never queries tracking or messages without a real account (%s)", (user) => {
    state.user = user;
    render(<SupportPage threadId="contact-1" />);
    expect(screen.getByText(/برای پیگیری.*وارد حساب/)).toBeInTheDocument();
    expect(api.own).not.toHaveBeenCalled();
    expect(api.messages).not.toHaveBeenCalled();
    expect(api.read).not.toHaveBeenCalled();
  });

  it("lists both own kinds in latest-activity order with Persian status, date, and unread", () => {
    state.user = account();
    const { unmount } = render(<SupportPage />);
    expect(api.own).toHaveBeenCalledWith("player", expect.any(Function), expect.any(Function));
    const links = within(screen.getByRole("list", { name: "گزارش‌ها و پیام‌ها" })).getAllByRole("link");
    expect(links[0]).toHaveTextContent("پیشنهاد");
    expect(links[0]).toHaveTextContent("پاسخ‌داده‌شده");
    expect(links[0]).toHaveTextContent("۲ خوانده‌نشده");
    expect(links[0]?.querySelector("time")).toHaveAttribute("datetime", "2026-10-25T10:00:00.000Z");
    expect(links[1]).toHaveTextContent("خطای پرسش");
    expect(links[1]).toHaveTextContent("اصلاح‌شده");
    unmount();
    expect(api.stopOwn).toHaveBeenCalled();
  });

  it("does not subscribe to an unknown or other user's conversation", () => {
    state.user = account();
    render(<SupportPage threadId="other-user" />);
    expect(screen.getByRole("alert")).toHaveTextContent("پیام پیدا نشد");
    expect(api.messages).not.toHaveBeenCalled();
  });

  it("opens an owned conversation, marks read, loads the private image, and sends a text-only reply", async () => {
    state.user = account();
    const { unmount } = render(<SupportPage threadId="contact-1" />);
    expect(await screen.findByText("متن اولیه")).toBeInTheDocument();
    expect(screen.getByText("پاسخ پشتیبانی")).toBeInTheDocument();
    expect(api.read).toHaveBeenCalledWith({ threadId: "contact-1", participant: "user" });
    expect(api.image).toHaveBeenCalledWith("support/player/contact-1/initial");
    expect(await screen.findByRole("img", { name: "تصویر پیوست پیام" })).toHaveAttribute("src", "blob:private-image");
    expect(screen.queryByLabelText(/تصویر پیوست/)).not.toBeInTheDocument();
    const reply = screen.getByRole("textbox", { name: "پاسخ شما" });
    fireEvent.change(reply, { target: { value: "  سپاس  " } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    await waitFor(() => expect(reply).toHaveValue(""));
    expect(api.reply).toHaveBeenCalledWith({ threadId: "contact-1", participant: "user", text: "سپاس" });
    unmount();
    expect(api.stopMessages).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private-image");
  });

  it("marks new unread messages while open without dropping the reply draft", async () => {
    state.user = account();
    let nextThreads!: (threads: Thread[]) => void;
    api.own.mockImplementation((_uid, next) => { nextThreads = next; next([{ ...contact, userUnread: 0 }]); return api.stopOwn; });
    render(<SupportPage threadId="contact-1" />);
    const reply = screen.getByRole("textbox", { name: "پاسخ شما" });
    fireEvent.change(reply, { target: { value: "ناتمام" } });
    api.read.mockClear();
    await act(async () => nextThreads([{ ...contact, userUnread: 1 }]));
    expect(api.read).toHaveBeenCalledWith({ threadId: "contact-1", participant: "user" });
    expect(reply).toHaveValue("ناتمام");
  });

  it("does not create an image object URL when a private load finishes after closing", async () => {
    state.user = account();
    let complete!: (blob: Blob) => void;
    api.image.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const { unmount } = render(<SupportPage threadId="contact-1" />);
    expect(api.image).toHaveBeenCalledOnce();
    unmount();
    await act(async () => complete(new Blob(["private"])));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("keeps an admin's personal support center in the user participant context", async () => {
    state.user = account();
    state.isAdmin = true;
    render(<SupportPage threadId="contact-1" />);
    expect(api.read).toHaveBeenCalledWith({ threadId: "contact-1", participant: "user" });
    const items = within(screen.getByRole("list", { name: "پیام‌های گفت‌وگو" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("شما");
    expect(items[1]).toHaveTextContent("پشتیبانی");
    fireEvent.change(screen.getByLabelText("پاسخ شما"), { target: { value: "پیام شخصی مدیر" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    await waitFor(() => expect(api.reply).toHaveBeenCalledWith({ threadId: "contact-1", participant: "user", text: "پیام شخصی مدیر" }));
  });

  it("uses the admin unread counter, participant payloads, and sender labels in the shared admin view", async () => {
    api.messages.mockImplementation((_id, next) => { next([...messages, { id: "guest", sender: "guest", text: "متن مهمان", createdAt: time }]); return api.stopMessages; });
    const { rerender } = render(<SupportThread thread={{ ...contact, adminUnread: 1 }} role="admin" />);
    expect(api.read).toHaveBeenCalledWith({ threadId: "contact-1", participant: "admin" });
    const items = within(screen.getByRole("list", { name: "پیام‌های گفت‌وگو" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("کاربر");
    expect(items[1]).toHaveTextContent("پشتیبانی (شما)");
    expect(items[2]).toHaveTextContent("مهمان");
    const reply = screen.getByLabelText("پاسخ شما");
    fireEvent.change(reply, { target: { value: "پاسخ مدیر" } });
    api.read.mockClear();
    rerender(<SupportThread thread={{ ...contact, userUnread: 3 }} role="admin" />);
    expect(api.read).not.toHaveBeenCalled();
    rerender(<SupportThread thread={{ ...contact, userUnread: 3, adminUnread: 1 }} role="admin" />);
    expect(api.read).toHaveBeenCalledWith({ threadId: "contact-1", participant: "admin" });
    expect(reply).toHaveValue("پاسخ مدیر");
    fireEvent.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    await waitFor(() => expect(api.reply).toHaveBeenCalledWith({ threadId: "contact-1", participant: "admin", text: "پاسخ مدیر" }));
  });

  it("preserves a failed reply and reports image/read failures without hiding the conversation", async () => {
    state.user = account();
    api.reply.mockRejectedValue(new Error("offline"));
    api.image.mockRejectedValue(new Error("offline"));
    api.read.mockRejectedValue(new Error("offline"));
    render(<SupportPage threadId="contact-1" />);
    expect(await screen.findByText(/خوانده‌شدن.*انجام نشد/)).toBeInTheDocument();
    expect(await screen.findByText(/بارگذاری تصویر انجام نشد/)).toBeInTheDocument();
    const reply = screen.getByRole("textbox", { name: "پاسخ شما" });
    fireEvent.change(reply, { target: { value: "پاسخ" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال پاسخ" }));
    expect(await screen.findByText(/ارسال پاسخ انجام نشد/)).toBeInTheDocument();
    expect(reply).toHaveValue("پاسخ");
  });

  it("drops private content and subscriptions immediately on account change", async () => {
    state.user = account();
    const { rerender } = render(<SupportPage threadId="contact-1" />);
    await screen.findByText("متن اولیه");
    state.user = account("guest", true);
    rerender(<SupportPage threadId="contact-1" />);
    expect(screen.queryByText("متن اولیه")).not.toBeInTheDocument();
    expect(api.stopOwn).toHaveBeenCalled();
    expect(api.stopMessages).toHaveBeenCalled();
  });

  it("shows subscription errors instead of an empty list", () => {
    state.user = account();
    api.own.mockImplementation((_uid, _next, error) => { error(new Error("offline")); return api.stopOwn; });
    render(<SupportPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/خواندن.*انجام نشد/);
  });

  it("shows conversation subscription errors", () => {
    state.user = account();
    api.messages.mockImplementation((_id, _next, error) => { error(new Error("offline")); return api.stopMessages; });
    render(<SupportPage threadId="contact-1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("خواندن گفت‌وگو انجام نشد");
  });

  it("waits for the latest message before marking unread, whether the thread or messages arrive first", async () => {
    const older = Timestamp.fromDate(new Date("2026-10-25T09:00:00Z"));
    let next!: (messages: SupportMessage[]) => void;
    api.messages.mockImplementation((_id, callback) => { next = callback; return api.stopMessages; });
    const { rerender } = render(<SupportThread thread={{ ...contact, lastMessageAt: time }} role="user" />);
    expect(api.read).not.toHaveBeenCalled();
    await act(async () => next([{ ...messages[0]!, createdAt: older }]));
    expect(api.read).not.toHaveBeenCalled();
    await act(async () => next(messages));
    expect(api.read).toHaveBeenCalledOnce();
    api.read.mockClear();
    const later = Timestamp.fromDate(new Date("2026-10-25T11:00:00Z"));
    rerender(<SupportThread thread={{ ...contact, lastMessageAt: later }} role="user" />);
    expect(api.read).not.toHaveBeenCalled();
    await act(async () => next([...messages, { id: "later", sender: "admin", text: "تازه", createdAt: later }]));
    expect(api.read).toHaveBeenCalledOnce();
  });

  it("does not mark unread after a message load error or quick leave", async () => {
    let fail!: (error: Error) => void;
    api.messages.mockImplementation((_id, _next, error) => { fail = error; return api.stopMessages; });
    const { unmount } = render(<SupportThread thread={contact} role="user" />);
    await act(async () => fail(new Error("offline")));
    expect(api.read).not.toHaveBeenCalled();
    unmount();
    expect(api.read).not.toHaveBeenCalled();
  });

  it("drops a prior thread's read error when switching conversations", async () => {
    api.read.mockRejectedValueOnce(new Error("offline"));
    const { rerender } = render(<SupportThread thread={contact} role="user" />);
    expect(await screen.findByText(/خوانده‌شدن.*انجام نشد/)).toBeInTheDocument();
    rerender(<SupportThread thread={{ ...report, userUnread: 0 }} role="user" />);
    expect(screen.queryByText(/خوانده‌شدن.*انجام نشد/)).not.toBeInTheDocument();
  });

  it("shows the aggregate unread badge and account support link", async () => {
    state.user = account();
    render(<AuthButton />);
    expect(screen.getByLabelText("۳ پیام خوانده‌نشده")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "حساب کاربری: کاربر" }));
    expect(screen.getByRole("link", { name: /گزارش‌ها و پیام‌های من/ })).toHaveAttribute("href", "#/support");
  });

  it("hides support tracking and never subscribes for an anonymous account menu", async () => {
    state.user = account("guest", true);
    render(<AuthButton />);
    await userEvent.click(screen.getByRole("button", { name: "حساب کاربری: مهمان" }));
    expect(screen.queryByRole("link", { name: /گزارش‌ها و پیام‌های من/ })).not.toBeInTheDocument();
    expect(api.own).not.toHaveBeenCalled();
  });

  it("clears the unread badge and subscription when the account becomes anonymous", () => {
    state.user = account();
    const { rerender } = render(<AuthButton />);
    expect(screen.getByLabelText("۳ پیام خوانده‌نشده")).toBeInTheDocument();
    state.user = account("guest", true);
    rerender(<AuthButton />);
    expect(screen.queryByLabelText("۳ پیام خوانده‌نشده")).not.toBeInTheDocument();
    expect(api.stopOwn).toHaveBeenCalled();
    expect(api.own).toHaveBeenCalledOnce();
  });

  it("provides public contact navigation on Home", () => {
    render(<HomePage />);
    expect(screen.getByRole("link", { name: "تماس با ما" })).toHaveAttribute("href", "#/contact");
  });
});
