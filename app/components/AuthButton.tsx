import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { auth } from "../firebase";
import { useAuth } from "../AuthContext";

type EmailMode = "signin" | "signup" | "reset";

interface AuthButtonProps {
  className?: string;
  initialMode?: EmailMode;
  label?: string;
}

const AUTH_ERRORS: Readonly<Record<string, string>> = {
  "auth/email-already-in-use": "این ایمیل قبلاً ثبت شده است.",
  "auth/invalid-credential": "ایمیل یا رمز عبور نادرست است.",
  "auth/invalid-email": "نشانی ایمیل معتبر نیست.",
  "auth/network-request-failed": "ارتباط با اینترنت برقرار نشد.",
  "auth/popup-blocked": "مرورگر پنجرهٔ ورود را مسدود کرد.",
  "auth/popup-closed-by-user": "پنجرهٔ ورود پیش از پایان بسته شد.",
  "auth/too-many-requests": "تلاش‌های زیادی انجام شده است؛ کمی بعد دوباره امتحان کنید.",
  "auth/weak-password": "رمز عبور باید دست‌کم ۶ نویسه باشد.",
};

function authErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const message = AUTH_ERRORS[String(error.code)];
    if (message) return message;
  }
  return error instanceof Error ? error.message : "ورود انجام نشد. دوباره امتحان کنید.";
}

export function AuthButton({
  className,
  initialMode = "signin",
  label = "ورود",
}: AuthButtonProps = {}) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<EmailMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isNative = Capacitor.isNativePlatform();

  function chooseMode(nextMode: EmailMode) {
    setMode(nextMode);
    setError(null);
    setNotice(null);
  }

  async function runAuth(action: () => Promise<unknown>, closeOnSuccess = true) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (closeOnSuccess) setOpen(false);
      return true;
    } catch (authError) {
      setError(authErrorMessage(authError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    await runAuth(async () => {
      if (!isNative) {
        await signInWithPopup(auth, new GoogleAuthProvider());
        return;
      }

      // Google's popup flow is blocked in embedded WebViews. Obtain a native ID token
      // and bridge it into the same Firebase JS Auth instance used by the web app.
      const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
      const idToken = result.credential?.idToken;
      if (!idToken) throw new Error("توکن ورود از گوگل دریافت نشد.");
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    });
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "reset") {
      const sent = await runAuth(() => sendPasswordResetEmail(auth, email), false);
      if (sent) setNotice("پیوند بازنشانی رمز عبور به ایمیل شما فرستاده شد.");
      return;
    }

    await runAuth(() =>
      mode === "signup"
        ? createUserWithEmailAndPassword(auth, email, password)
        : signInWithEmailAndPassword(auth, email, password),
    );
  }

  async function handleGuestSignIn() {
    await runAuth(() => signInAnonymously(auth));
  }

  if (user) {
    const label = user.isAnonymous ? "مهمان" : (user.displayName ?? user.email ?? "کاربر");
    return (
      <div className="auth-user">
        <span className="auth-user-name">{label}</span>
        <button type="button" className="auth-btn" onClick={signOut}>خروج</button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`auth-btn${className ? ` ${className}` : ""}`}
        onClick={() => {
          chooseMode(initialMode);
          setOpen(true);
        }}
      >
        {label}
      </button>

      {open && (
        <div className="auth-modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="auth-modal-close"
              onClick={() => setOpen(false)}
              aria-label="بستن"
              disabled={busy}
            >
              ✕
            </button>
            <h2 id="auth-modal-title">
              {mode === "signup" ? "ساخت حساب" : mode === "reset" ? "بازیابی رمز عبور" : "ورود"}
            </h2>

            <div className="auth-sync-info">
              <p>
                با ورود یا ساخت حساب، وضعیت حل جدول‌های شما در فضای ابری ذخیره و همگام می‌شود؛
                بنابراین می‌توانید در نسخهٔ وب یا دستگاه دیگری از همان‌جا ادامه دهید و هنگام
                تعویض دستگاه، پیشرفت خود را بازیابی کنید.
              </p>
              <p>برای انتقال بین دستگاه‌ها، در هر دو دستگاه با یک حساب وارد شوید.</p>
            </div>

            <button
              type="button"
              className="auth-btn auth-btn-block auth-google-btn"
              onClick={handleGoogleSignIn}
              disabled={busy}
            >
              ورود با گوگل
            </button>

            <div className="auth-divider" aria-hidden="true"><span>یا</span></div>

            <form className="auth-form" onSubmit={handleEmailSubmit}>
              <label htmlFor="auth-email">ایمیل</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                required
              />

              {mode !== "reset" && (
                <>
                  <label htmlFor="auth-password">رمز عبور</label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={busy}
                    minLength={6}
                    required
                  />
                </>
              )}

              <button type="submit" className="auth-btn auth-btn-block auth-primary-btn" disabled={busy}>
                {busy
                  ? "لطفاً صبر کنید…"
                  : mode === "signup"
                    ? "ساخت حساب"
                    : mode === "reset"
                      ? "ارسال پیوند بازنشانی"
                      : "ورود با ایمیل"}
              </button>
            </form>

            {error && <p className="auth-error" role="alert">{error}</p>}
            {notice && <p className="auth-notice" role="status">{notice}</p>}

            <div className="auth-mode-actions">
              {mode !== "signin" && (
                <button type="button" onClick={() => chooseMode("signin")} disabled={busy}>ورود</button>
              )}
              {mode !== "signup" && (
                <button type="button" onClick={() => chooseMode("signup")} disabled={busy}>ساخت حساب</button>
              )}
              {mode !== "reset" && (
                <button type="button" onClick={() => chooseMode("reset")} disabled={busy}>
                  رمز را فراموش کرده‌ام
                </button>
              )}
            </div>

            <button
              type="button"
              className="auth-btn auth-btn-block auth-guest-btn"
              onClick={handleGuestSignIn}
              disabled={busy}
            >
              ادامه به‌عنوان مهمان
            </button>
          </div>
        </div>
      )}
    </>
  );
}
