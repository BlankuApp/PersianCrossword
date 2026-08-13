// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const authState = vi.hoisted(() => ({
  user: null as null | { isAnonymous: boolean; displayName: string | null; email: string | null },
  signOut: vi.fn(),
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
  useAuth: () => ({ user: authState.user, signOut: authState.signOut }),
}));

vi.mock("../app/firebase", () => ({ auth: { name: "test-auth" } }));

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
    authState.user = null;
    platform.native = false;
    vi.clearAllMocks();
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
    authState.user = { isAnonymous: false, displayName: "کاربر آزمایشی", email: null };
    const user = userEvent.setup();
    render(<AuthButton />);
    await user.click(screen.getByRole("button", { name: "خروج" }));
    expect(authState.signOut).toHaveBeenCalledOnce();
  });
});
