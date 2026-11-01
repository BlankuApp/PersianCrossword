import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
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
import { LogOut, ShieldCheck } from "lucide-react";
import { auth } from "../firebase";
import { useAuth, type SyncStatus } from "../AuthContext";
import { listPuzzles } from "../puzzleLibrary";
import { loadGeminiKey, loadMirror, saveGeminiKey } from "../progress";
import { puzzleStatus } from "../puzzleListQuery";
import { FREE_AI_LIMITS, freeAiUsageText, loadFreeAiUsed } from "../gemini";
import { isRealUser, subscribeOwnThreads } from "../support/supportApi";

type EmailMode = "signin" | "signup" | "reset";
type UserMenuTab = "activity" | "settings";

const NO_DIFFICULTY = "بدون سطح";
const fa = (n: number) => n.toLocaleString("fa-IR");

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
  const entries = loadMirror().entries;
  for (const puzzle of listPuzzles()) {
    const label = puzzle.difficulty?.trim() || NO_DIFFICULTY;
    const row = byLabel.get(label) ?? { solved: 0, inProgress: 0, untouched: 0 };
    const status = puzzleStatus(entries[puzzle.id]);
    if (status === "done") row.solved++;
    else if (status === "progress") row.inProgress++;
    else row.untouched++;
    byLabel.set(label, row);
  }
  return [...byLabel].map(([label, row]) => ({
    label,
    ...row,
    total: row.solved + row.inProgress + row.untouched,
  }));
}

function syncStatusText({ kind, unsent }: SyncStatus): string {
  const queued = unsent > 0 ? `${fa(unsent)} جدول هنوز در فضای ابری ذخیره نشده است.` : "";
  if (kind === "offline") return `اتصال به اینترنت برقرار نیست؛ اگر در ایران هستید، ممکن است به فیلترشکن نیاز داشته باشید. ${queued || "پیشرفت شما روی همین دستگاه ذخیره است."}`;
  if (kind === "error") return `ذخیره در فضای ابری انجام نشد. ${queued}`;
  if (kind === "pending") return queued;
  return "همهٔ پیشرفت‌ها در فضای ابری ذخیره شده است.";
}

function UserMenu() {
  const { user, isAdmin, signOut, syncVersion, syncStatus, syncNow } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<UserMenuTab>("activity");
  const [signingOut, setSigningOut] = useState(false);
  const [savedGeminiKey, setSavedGeminiKey] = useState(loadGeminiKey);
  const [geminiKey, setGeminiKey] = useState(savedGeminiKey);
  const [keyNotice, setKeyNotice] = useState<string | null>(null);
  const activityTabRef = useRef<HTMLButtonElement>(null);
  const settingsTabRef = useRef<HTMLButtonElement>(null);
  const [aiUsed, setAiUsed] = useState<number | null>(null);
  const [supportUnread, setSupportUnread] = useState<{ uid: string; count: number } | null>(null);
  const supportUid = isRealUser(user) ? user!.uid : null;
  const unread = supportUnread?.uid === supportUid ? supportUnread.count : 0;

  useEffect(() => {
    if (!supportUid) return;
    return subscribeOwnThreads(supportUid,
      (threads) => setSupportUnread({ uid: supportUid, count: threads.reduce((sum, thread) => sum + thread.userUnread, 0) }),
      () => setSupportUnread(null));
  }, [supportUid]);

  // One read per menu open; the count only changes when the user asks the AI.
  useEffect(() => {
    if (!open || !user) return;
    let live = true;
    void loadFreeAiUsed(user.uid).then((used) => live && setAiUsed(used));
    return () => {
      live = false;
    };
  }, [open, user]);

  // Scanning every puzzle isn't free — only do it while the menu is open.
  const stats = useMemo(() => (open ? computeDifficultyStats() : []), [open, syncVersion]);
  // Only problems that keep changes from reaching the cloud earn a dot on the avatar.
  const syncProblem = syncStatus.kind === "error" || (syncStatus.kind === "offline" && syncStatus.unsent > 0);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      if (await signOut()) setOpen(false);
    } finally {
      setSigningOut(false);
    }
  }

  function handleMenuToggle() {
    if (!open) {
      const storedKey = loadGeminiKey();
      setActiveTab("activity");
      setSavedGeminiKey(storedKey);
      setGeminiKey(storedKey);
      setKeyNotice(null);
    }
    setOpen(!open);
  }

  function handleSaveGeminiKey() {
    const key = geminiKey.trim();
    if (!key) return;
    saveGeminiKey(key);
    setGeminiKey(key);
    setSavedGeminiKey(key);
    setKeyNotice("کلید هوشواره ذخیره شد.");
  }

  function handleClearGeminiKey() {
    if (!window.confirm("کلید هوشواره از این دستگاه پاک شود؟")) return;
    saveGeminiKey("");
    setGeminiKey("");
    setSavedGeminiKey("");
    setKeyNotice("کلید هوشواره پاک شد.");
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const nextTab = activeTab === "activity" ? "settings" : "activity";
    event.preventDefault();
    setActiveTab(nextTab);
    (nextTab === "activity" ? activityTabRef : settingsTabRef).current?.focus();
  }

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
        onClick={handleMenuToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`حساب کاربری: ${name}`}
      >
        <img className="auth-avatar" src={avatar} alt="" />
        {syncProblem && <span className="auth-sync-dot" aria-hidden="true" />}
        {unread > 0 ? <span className="auth-support-badge" aria-label={`${fa(unread)} پیام خوانده‌نشده`}>{fa(unread)}</span> : null}
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

            {syncStatus.kind !== "synced" ? (
              <p className={`auth-sync-status auth-sync-${syncStatus.kind}`} role="status">
                {syncStatusText(syncStatus)}
                {(syncStatus.kind === "error" || syncStatus.kind === "offline") && (
                  <button type="button" className="auth-sync-retry" onClick={() => void syncNow()}>
                    همین حالا تلاش کن
                  </button>
                )}
              </p>
            ) : null}

            <div className="auth-menu-tabs" role="tablist" aria-label="بخش حساب کاربری">
              <button
                ref={activityTabRef}
                id="auth-activity-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === "activity"}
                aria-controls="auth-activity-panel"
                tabIndex={activeTab === "activity" ? 0 : -1}
                onClick={() => setActiveTab("activity")}
                onKeyDown={handleTabKeyDown}
              >
                فعالیت من
              </button>
              <button
                ref={settingsTabRef}
                id="auth-settings-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === "settings"}
                aria-controls="auth-settings-panel"
                tabIndex={activeTab === "settings" ? 0 : -1}
                onClick={() => setActiveTab("settings")}
                onKeyDown={handleTabKeyDown}
              >
                تنظیمات حساب
              </button>
            </div>

            <div
              id="auth-activity-panel"
              className="auth-menu-panel"
              role="tabpanel"
              aria-labelledby="auth-activity-tab"
              hidden={activeTab !== "activity"}
            >
              <div className="auth-stat-summary" aria-label="خلاصهٔ فعالیت">
                <div><strong>{fa(totals.solved)}</strong><span>حل‌شده</span></div>
                <div><strong>{fa(totals.inProgress)}</strong><span>نیمه‌کاره</span></div>
                <div><strong>{fa(totals.untouched)}</strong><span>حل‌نشده</span></div>
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
                      <td>{fa(s.solved)}</td>
                      <td>{fa(s.inProgress)}</td>
                      <td>{fa(s.untouched)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">همه ({fa(totals.total)})</th>
                    <td>{fa(totals.solved)}</td>
                    <td>{fa(totals.inProgress)}</td>
                    <td>{fa(totals.untouched)}</td>
                  </tr>
                </tfoot>
              </table>

              {user.isAnonymous ? (
                <p className="auth-account-upsell">
                  ساخت حساب = {fa(FREE_AI_LIMITS.account)} پرسش در روز{" "}
                  <AuthButton allowGuestUpgrade initialMode="signup" label="ساخت حساب" />
                </p>
              ) : null}

              <div className="auth-menu-links">
                {isRealUser(user) ? <a className="auth-menu-link" href="#/support" onClick={() => setOpen(false)}>
                  <span>گزارش‌ها و پیام‌های من</span>{unread > 0 ? <span className="auth-menu-count">{fa(unread)}</span> : null}
                </a> : null}
                {isAdmin ? (
                  <a className="auth-menu-link" href="#/admin" onClick={() => setOpen(false)}>
                    <ShieldCheck size={18} strokeWidth={2} aria-hidden="true" />
                    <span>پنل مدیریت</span>
                  </a>
                ) : null}
              </div>
            </div>

            <div
              id="auth-settings-panel"
              className="auth-menu-panel"
              role="tabpanel"
              aria-labelledby="auth-settings-tab"
              hidden={activeTab !== "settings"}
            >
              <div className="auth-gemini-section">
                <label htmlFor="auth-gemini-key">کلید هوشواره (Gemini)</label>
                <input
                  id="auth-gemini-key"
                  type="password"
                  value={geminiKey}
                  onChange={(event) => {
                    setGeminiKey(event.target.value);
                    setKeyNotice(null);
                  }}
                  placeholder="کلید API خود را این‌جا وارد کنید"
                  dir="ltr"
                />
                <div className="auth-gemini-actions">
                  <button
                    type="button"
                    className="auth-btn auth-primary-btn"
                    onClick={handleSaveGeminiKey}
                    disabled={!geminiKey.trim() || geminiKey.trim() === savedGeminiKey}
                  >
                    ذخیره کلید
                  </button>
                  {savedGeminiKey ? (
                    <button type="button" className="auth-clear-key" onClick={handleClearGeminiKey}>
                      پاک کردن کلید
                    </button>
                  ) : null}
                </div>
                {keyNotice ? <p className="auth-key-notice" role="status">{keyNotice}</p> : null}
                {aiUsed !== null ? <p className="auth-gemini-usage">{freeAiUsageText(aiUsed, user.isAnonymous)}</p> : null}
                <p className="auth-gemini-hint">
                  برای استفادهٔ بیشتر از هوشواره، کلید رایگان خود را از{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>{" "}
                  وارد کنید. کلید فقط در همین مرورگر ذخیره می‌شود.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="auth-btn auth-signout-btn"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut size={16} strokeWidth={2} aria-hidden="true" />
              {signingOut ? "در حال ذخیره…" : "خروج از حساب"}
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
  allowGuestUpgrade?: boolean | undefined;
}

const AUTH_ERRORS: Readonly<Record<string, string>> = {
  "auth/email-already-in-use": "این ایمیل قبلاً ثبت شده است.",
  "auth/invalid-credential": "ایمیل یا رمز عبور نادرست است.",
  "auth/invalid-email": "نشانی ایمیل معتبر نیست.",
  "auth/network-request-failed": "ارتباط با اینترنت برقرار نشد. اگر در ایران هستید، ممکن است برای اتصال به فیلترشکن نیاز داشته باشید.",
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
  allowGuestUpgrade,
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

  if (allowGuestUpgrade) {
    if (user && !user.isAnonymous) return null;
  } else if (user) {
    return <UserMenu />;
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

      {open &&
        createPortal(
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
                <p>
                  کاربران دارای حساب روزانه {fa(FREE_AI_LIMITS.account)} پرسش رایگان از هوشواره دارند (مهمان‌ها{" "}
                  {fa(FREE_AI_LIMITS.guest)}).
                </p>
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
          </div>,
          document.body,
        )}
    </>
  );
}
