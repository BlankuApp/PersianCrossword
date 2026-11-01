// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

interface MockUser {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
  providerData: { providerId: string }[];
}

const authState = vi.hoisted(() => ({
  user: null as null | MockUser,
  isAdmin: false,
  signOut: vi.fn(),
  syncNow: vi.fn(),
  syncStatus: { kind: "synced", unsent: 0 } as { kind: "synced" | "pending" | "offline" | "error"; unsent: number },
}));

const platform = vi.hoisted(() => ({ native: false }));

const firebaseMocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  googleCredential: vi.fn(() => ({ providerId: "google.com" })),
  resetPassword: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithPopup: vi.fn(),
}));

const nativeAuthMocks = vi.hoisted(() => ({ signInWithGoogle: vi.fn() }));

vi.mock("../app/AuthContext", () => ({
  useAuth: () => ({
    user: authState.user,
    isAdmin: authState.isAdmin,
    signOut: authState.signOut,
    syncNow: authState.syncNow,
    syncStatus: authState.syncStatus,
    syncVersion: 0,
  }),
}));

vi.mock("../app/firebase", () => ({ auth: { name: "test-auth" }, functions: {} }));
vi.mock("../app/support/supportApi", () => ({
  isRealUser: (user: MockUser | null) => user !== null && !user.isAnonymous,
  subscribeOwnThreads: () => () => {},
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => platform.native },
}));

vi.mock("@capacitor-firebase/authentication", () => ({
  FirebaseAuthentication: { signInWithGoogle: nativeAuthMocks.signInWithGoogle },
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class GoogleAuthProvider {
    static credential = firebaseMocks.googleCredential;
  },
  createUserWithEmailAndPassword: firebaseMocks.createUser,
  sendPasswordResetEmail: firebaseMocks.resetPassword,
  signInAnonymously: firebaseMocks.signInAnonymously,
  signInWithCredential: firebaseMocks.signInWithCredential,
  signInWithEmailAndPassword: firebaseMocks.signInWithEmail,
  signInWithPopup: firebaseMocks.signInWithPopup,
}));

import { AuthButton } from "../app/components/AuthButton";

async function openDialog() {
  const user = userEvent.setup();
  render(<AuthButton />);
  await user.click(screen.getByRole("button", { name: "ورود" }));
  return user;
}

async function fillEmailForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("ایمیل"), "reader@example.com");
  await user.type(screen.getByLabelText("رمز عبور"), "secret12");
}

describe("AuthButton", () => {
  beforeEach(() => {
    localStorage.clear();
    authState.user = null;
    authState.isAdmin = false;
    authState.syncStatus = { kind: "synced", unsent: 0 };
    platform.native = false;
    vi.clearAllMocks();
    authState.signOut.mockResolvedValue(true);
    firebaseMocks.createUser.mockResolvedValue({});
    firebaseMocks.resetPassword.mockResolvedValue(undefined);
    firebaseMocks.signInAnonymously.mockResolvedValue({});
    firebaseMocks.signInWithCredential.mockResolvedValue({});
    firebaseMocks.signInWithEmail.mockResolvedValue({});
    firebaseMocks.signInWithPopup.mockResolvedValue({});
    nativeAuthMocks.signInWithGoogle.mockResolvedValue({ credential: { idToken: "native-token" } });
  });

  it("explains that signing in syncs progress across devices", async () => {
    await openDialog();

    expect(screen.getByText(/وضعیت حل جدول‌های شما در فضای ابری ذخیره و همگام می‌شود/)).toBeInTheDocument();
    expect(screen.getByText(/در هر دو دستگاه با یک حساب وارد شوید/)).toBeInTheDocument();
  });

  it("uses the Firebase popup flow for Google sign-in on the web", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "ورود با گوگل" }));

    await waitFor(() => expect(firebaseMocks.signInWithPopup).toHaveBeenCalledOnce());
    expect(nativeAuthMocks.signInWithGoogle).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bridges the native Google ID token into Firebase JS Auth", async () => {
    platform.native = true;
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "ورود با گوگل" }));

    await waitFor(() => expect(nativeAuthMocks.signInWithGoogle).toHaveBeenCalledWith({ skipNativeAuth: true }));
    expect(firebaseMocks.googleCredential).toHaveBeenCalledWith("native-token");
    expect(firebaseMocks.signInWithCredential).toHaveBeenCalledWith(
      { name: "test-auth" },
      { providerId: "google.com" },
    );
  });

  it("signs in with email and password", async () => {
    const user = await openDialog();
    await fillEmailForm(user);
    await user.click(screen.getByRole("button", { name: "ورود با ایمیل" }));

    await waitFor(() => expect(firebaseMocks.signInWithEmail).toHaveBeenCalledWith(
      { name: "test-auth" },
      "reader@example.com",
      "secret12",
    ));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("creates an email account", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "ساخت حساب" }));
    await fillEmailForm(user);
    await user.click(screen.getByRole("button", { name: "ساخت حساب" }));

    await waitFor(() => expect(firebaseMocks.createUser).toHaveBeenCalledWith(
      { name: "test-auth" },
      "reader@example.com",
      "secret12",
    ));
  });

  it("can open directly in sign-up mode with a custom label", async () => {
    const user = userEvent.setup();
    render(<AuthButton initialMode="signup" label="ثبت‌نام و دریافت لینک" />);

    await user.click(screen.getByRole("button", { name: "ثبت‌نام و دریافت لینک" }));

    expect(screen.getByRole("heading", { name: "ساخت حساب" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ورود" })).toBeInTheDocument();
  });

  it("sends a password reset email and keeps the confirmation visible", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "رمز را فراموش کرده‌ام" }));
    await user.type(screen.getByLabelText("ایمیل"), "reader@example.com");
    await user.click(screen.getByRole("button", { name: "ارسال پیوند بازنشانی" }));

    await waitFor(() => expect(firebaseMocks.resetPassword).toHaveBeenCalledWith(
      { name: "test-auth" },
      "reader@example.com",
    ));
    expect(screen.getByRole("status")).toHaveTextContent("پیوند بازنشانی");
  });

  it("supports anonymous guest sign-in", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "ادامه به‌عنوان مهمان" }));

    await waitFor(() => expect(firebaseMocks.signInAnonymously).toHaveBeenCalledWith({ name: "test-auth" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a localized authentication error without closing", async () => {
    firebaseMocks.signInWithEmail.mockRejectedValueOnce({ code: "auth/invalid-credential" });
    const user = await openDialog();
    await fillEmailForm(user);
    await user.click(screen.getByRole("button", { name: "ورود با ایمیل" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ایمیل یا رمز عبور نادرست است");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("signs out the current user", async () => {
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر آزمایشی", email: null, providerData: [] };
    const user = userEvent.setup();
    render(<AuthButton />);
    await user.click(screen.getByRole("button", { name: "حساب کاربری: کاربر آزمایشی" }));
    await user.click(screen.getByRole("button", { name: "خروج از حساب" }));
    expect(authState.signOut).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "حساب کاربری" })).not.toBeInTheDocument());
  });

  it("keeps the menu open when the player cancels signing out", async () => {
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر", email: null, providerData: [] };
    authState.signOut.mockResolvedValue(false);
    const user = userEvent.setup();
    render(<AuthButton />);
    await user.click(screen.getByRole("button", { name: "حساب کاربری: کاربر" }));
    await user.click(screen.getByRole("button", { name: "خروج از حساب" }));
    expect(screen.getByRole("dialog", { name: "حساب کاربری" })).toBeInTheDocument();
  });

  it("shows sync status, a dot for lasting problems, and a retry button", async () => {
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر", email: null, providerData: [] };
    authState.syncStatus = { kind: "error", unsent: 2 };
    const user = userEvent.setup();
    const { container } = render(<AuthButton />);
    expect(container.querySelector(".auth-sync-dot")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "حساب کاربری: کاربر" }));
    expect(screen.getByRole("status")).toHaveTextContent("۲ جدول هنوز در فضای ابری ذخیره نشده است");
    await user.click(screen.getByRole("button", { name: "همین حالا تلاش کن" }));
    expect(authState.syncNow).toHaveBeenCalledOnce();
  });

  it("shows no dot or retry when everything is saved", async () => {
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر", email: null, providerData: [] };
    const user = userEvent.setup();
    const { container } = render(<AuthButton />);
    expect(container.querySelector(".auth-sync-dot")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "حساب کاربری: کاربر" }));
    expect(screen.getByRole("status")).toHaveTextContent("همهٔ پیشرفت‌ها در فضای ابری ذخیره شده است.");
    expect(screen.queryByRole("button", { name: "همین حالا تلاش کن" })).not.toBeInTheDocument();
  });

  it("keeps key edits local until save and reopens on the activity tab", async () => {
    localStorage.setItem("persian-crossword-gemini-key", "saved-key");
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر", email: null, providerData: [] };
    const user = userEvent.setup();
    render(<AuthButton />);

    const accountButton = screen.getByRole("button", { name: "حساب کاربری: کاربر" });
    await user.click(accountButton);
    expect(screen.getByRole("tab", { name: "فعالیت من" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "تنظیمات حساب" }));
    const keyInput = screen.getByLabelText("کلید هوشواره (Gemini)");
    await user.clear(keyInput);
    await user.type(keyInput, "new-key");
    expect(localStorage.getItem("persian-crossword-gemini-key")).toBe("saved-key");

    await user.click(screen.getByRole("button", { name: "ذخیره کلید" }));
    expect(localStorage.getItem("persian-crossword-gemini-key")).toBe("new-key");
    expect(screen.getByText("کلید هوشواره ذخیره شد.")).toBeInTheDocument();

    await user.click(accountButton);
    await user.click(accountButton);
    expect(screen.getByRole("tab", { name: "فعالیت من" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps a saved key when clearing is cancelled and removes it after confirmation", async () => {
    localStorage.setItem("persian-crossword-gemini-key", "saved-key");
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر", email: null, providerData: [] };
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    render(<AuthButton />);

    await user.click(screen.getByRole("button", { name: "حساب کاربری: کاربر" }));
    await user.click(screen.getByRole("tab", { name: "تنظیمات حساب" }));
    const keyInput = screen.getByLabelText("کلید هوشواره (Gemini)");

    await user.click(screen.getByRole("button", { name: "پاک کردن کلید" }));
    expect(localStorage.getItem("persian-crossword-gemini-key")).toBe("saved-key");
    expect(keyInput).toHaveValue("saved-key");

    await user.click(screen.getByRole("button", { name: "پاک کردن کلید" }));
    expect(localStorage.getItem("persian-crossword-gemini-key")).toBeNull();
    expect(keyInput).toHaveValue("");
    expect(screen.queryByRole("button", { name: "پاک کردن کلید" })).not.toBeInTheDocument();
    expect(screen.getByText("کلید هوشواره پاک شد.")).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it("switches the accessible account panels with RTL arrow keys and keeps account actions available", async () => {
    authState.user = { uid: "u1", isAnonymous: false, displayName: "مدیر", email: null, providerData: [] };
    authState.isAdmin = true;
    const user = userEvent.setup();
    render(<AuthButton />);

    await user.click(screen.getByRole("button", { name: "حساب کاربری: مدیر" }));
    expect(screen.getByRole("tablist", { name: "بخش حساب کاربری" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: "فعالیت من" })).toBeVisible();
    expect(screen.getByRole("link", { name: "گزارش‌ها و پیام‌های من" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "پنل مدیریت" })).toBeInTheDocument();

    screen.getByRole("tab", { name: "فعالیت من" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "تنظیمات حساب" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "تنظیمات حساب" })).toBeVisible();
    expect(screen.getByRole("button", { name: "خروج از حساب" })).toBeInTheDocument();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "فعالیت من" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "تنظیمات حساب" })).toHaveFocus();
  });

  it("lets an anonymous guest open sign-in when allowGuestUpgrade", async () => {
    authState.user = { uid: "g1", isAnonymous: true, displayName: null, email: null, providerData: [] };
    const user = userEvent.setup();
    render(<AuthButton allowGuestUpgrade initialMode="signup" label="ساخت حساب" />);
    await user.click(screen.getByRole("button", { name: "ساخت حساب" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("روزانه ۱۰۰ پرسش رایگان");
  });

  it("renders nothing for a full account when allowGuestUpgrade", () => {
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر", email: null, providerData: [] };
    const { container } = render(<AuthButton allowGuestUpgrade label="ساخت حساب" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the account upsell in a guest's user menu", async () => {
    authState.user = { uid: "g1", isAnonymous: true, displayName: null, email: null, providerData: [] };
    const user = userEvent.setup();
    render(<AuthButton />);
    await user.click(screen.getByRole("button", { name: "حساب کاربری: مهمان" }));
    expect(screen.getByText(/ساخت حساب = ۱۰۰ پرسش در روز/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ساخت حساب" })).toBeInTheDocument();
  });
});
