import { useMemo, useState, type FormEvent } from "react";
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
import { LogOut } from "lucide-react";
import { auth } from "../firebase";
import { useAuth } from "../AuthContext";
import { listPuzzles } from "../puzzleLibrary";
import { computeProgress, loadProgress } from "../progress";

type EmailMode = "signin" | "signup" | "reset";

const NO_DIFFICULTY = "بدون سطح";

interface DifficultyStats {
  readonly label: string;
  readonly solved: number;
  readonly inProgress: number;
  readonly untouched: number;
  readonly total: number;
}

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path fill="#4285f4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.7Z" />
      <path fill="#34a853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.3c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9l-.3.1-6.7 5.2-.1.3C8 41.3 15.4 46 24 46Z" />
      <path fill="#fbbc05" d="M11.5 28.6a13.6 13.6 0 0 1 0-9.2l-.1-.3-6.8-5.3-.2.1a22 22 0 0 0 0 20l7.1-5.3Z" />
      <path fill="#ea4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.3 29.9 1 24 1 15.4 1 8 5.7 4.4 12.6l7.1 5.5C13.3 13 18.2 9.5 24 9.5Z" />
    </svg>
  );
}

function computeDifficultyStats(): readonly DifficultyStats[] {
  const byLabel = new Map<string, { solved: number; inProgress: number; untouched: number }>();
  for (const puzzle of listPuzzles()) {
    const label = puzzle.difficulty?.trim() || NO_DIFFICULTY;
    const row = byLabel.get(label) ?? { solved: 0, inProgress: 0, untouched: 0 };
    const { filled, completed } = computeProgress(puzzle.json, loadProgress(puzzle.id));
    if (completed) row.solved++;
    else if (filled > 0) row.inProgress++;
    else row.untouched++;
    byLabel.set(label, row);
  }
  return [...byLabel].map(([label, row]) => ({
    label,
    ...row,
    total: row.solved + row.inProgress + row.untouched,
  }));
}

function UserMenu() {
  const { user, signOut, syncVersion } = useAuth();
  const [open, setOpen] = useState(false);

  // Scanning every puzzle isn't free — only do it while the menu is open.
  const stats = useMemo(() => (open ? computeDifficultyStats() : []), [open, syncVersion]);

  if (!user) return null;

  const name = user.isAnonymous ? "مهمان" : (user.displayName ?? user.email ?? "کاربر");
  const seed = user.email ?? user.uid;
  const avatar = `https://api.dicebear.com/10.x/critters/svg?seed=${encodeURIComponent(seed)}&animationVariant=medium`;
  const isGoogle = user.providerData.some((p) => p.providerId === "google.com");
  const totals = stats.reduce(
    (acc, s) => ({
      solved: acc.solved + s.solved,
      inProgress: acc.inProgress + s.inProgress,
      untouched: acc.untouched + s.untouched,
      total: acc.total + s.total,
    }),
    { solved: 0, inProgress: 0, untouched: 0, total: 0 },
  );

  return (
    <div className="auth-user" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        className="auth-avatar-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`حساب کاربری: ${name}`}
      >
        <img className="auth-avatar" src={avatar} alt="" />
      </button>

      {open && (
        <>
          <div className="auth-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="auth-menu" role="dialog" aria-label="حساب کاربری">
            <div className="auth-menu-head">
              <img className="auth-avatar auth-avatar-lg" src={avatar} alt="" />
              <div className="auth-menu-identity">
                <strong>{name}</strong>
                {user.email && <span className="auth-menu-email">{user.email}</span>}
                <span className="auth-menu-provider">
                  {isGoogle ? <GoogleIcon /> : null}
                  {isGoogle ? "ورود با گوگل" : user.isAnonymous ? "حساب مهمان" : "ورود با ایمیل"}
                </span>
              </div>
            </div>

            <table className="auth-stats">
              <thead>
                <tr>
                  <th>سطح</th>
                  <th>حل‌شده</th>
                  <th>نیمه‌کاره</th>
                  <th>حل‌نشده</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.label}>
                    <th scope="row">{s.label}</th>
                    <td>{s.solved.toLocaleString("fa-IR")}</td>
                    <td>{s.inProgress.toLocaleString("fa-IR")}</td>
                    <td>{s.untouched.toLocaleString("fa-IR")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">همه ({totals.total.toLocaleString("fa-IR")})</th>
                  <td>{totals.solved.toLocaleString("fa-IR")}</td>
                  <td>{totals.inProgress.toLocaleString("fa-IR")}</td>
                  <td>{totals.untouched.toLocaleString("fa-IR")}</td>
                </tr>
              </tfoot>
            </table>

            <button type="button" className="auth-btn auth-btn-block auth-signout-btn" onClick={signOut}>
              <LogOut size={16} strokeWidth={2} aria-hidden="true" />
              خروج از حساب
            </button>
          </div>
        </>
      )}
    </div>
  );
}

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

  if (user) return <UserMenu />;

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
