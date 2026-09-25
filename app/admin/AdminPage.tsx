import { useMemo, useState, type ChangeEvent } from "react";
import { ArrowRight, FilePlus2, Pencil, Trash2, Upload } from "lucide-react";
import { useAuth } from "../AuthContext";
import { DifficultyBadge, ProgressBar } from "../pages/HomePage";
import { computeProgress, loadProgress } from "../progress";
import { usePuzzleLibrary } from "../puzzleLibrary";
import { refreshPuzzleCatalog } from "../puzzleSync";
import { goHome } from "../router";
import { createDraft, deleteDraft, publishDraft, publishProblems, type Draft } from "./adminApi";
import { planImport, type ImportFile, type ImportPlan } from "./importPlan";
import { useDrafts } from "./useDrafts";

const fa = (n: number) => n.toLocaleString("fa-IR");

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function AdminPage() {
  const { user, loading, isAdmin } = useAuth();

  return (
    <main className="app-shell home-shell admin-shell" dir="rtl">
      <header className="admin-header">
        <button type="button" className="header-back" onClick={goHome} title="بازگشت به فهرست جدول‌ها" aria-label="بازگشت به فهرست جدول‌ها">
          <ArrowRight size={20} aria-hidden="true" />
        </button>
        <h1>پنل مدیریت</h1>
      </header>
      {loading ? null : isAdmin ? (
        <AdminContent />
      ) : (
        <p className="admin-note">
          {user
            ? "این صفحه فقط برای مدیر است. اگر به‌تازگی دسترسی مدیر گرفته‌اید، یک بار از حساب خارج و دوباره وارد شوید."
            : "برای دیدن این صفحه با حساب مدیر وارد شوید."}
        </p>
      )}
    </main>
  );
}

function AdminContent() {
  const { drafts, loaded, error } = useDrafts();
  const { puzzles } = usePuzzleLibrary();
  const takenIds = useMemo(() => new Set([...puzzles.map((p) => p.id), ...drafts.map((d) => d.id)]), [puzzles, drafts]);

  return (
    <>
      <ImportSection takenIds={takenIds} />
      <section className="admin-section" aria-labelledby="admin-drafts-title">
        <h2 id="admin-drafts-title">پیش‌نویس‌ها{loaded ? ` (${fa(drafts.length)})` : ""}</h2>
        {error ? <p className="admin-error">خواندن پیش‌نویس‌ها انجام نشد: {error}</p> : null}
        {!loaded ? (
          <p className="admin-note">در حال بارگذاری…</p>
        ) : drafts.length === 0 ? (
          <p className="admin-note">پیش‌نویسی نیست. جدول تازه را از بخش بالا اضافه کنید.</p>
        ) : (
          <ul className="admin-drafts">
            {drafts.map((draft) => (
              <DraftRow key={draft.id} draft={draft} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DraftRow({ draft }: { draft: Draft }) {
  const problems = useMemo(() => publishProblems(draft.json), [draft.json]);
  // The admin's own letters on this device (drafts save progress like any puzzle).
  const { syncVersion } = useAuth();
  const percent = useMemo(
    () => computeProgress(draft.json, loadProgress(draft.id)).percent,
    [draft.id, draft.json, syncVersion],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const title = draft.json.meta?.title ?? draft.id;

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(errorText(e));
      setBusy(false);
    }
  }

  function publish(): void {
    if (!window.confirm(`«${title}» برای همه بازیکنان منتشر شود؟`)) return;
    void run(async () => {
      await publishDraft(draft);
      await refreshPuzzleCatalog();
    });
  }

  function remove(): void {
    if (!window.confirm(`پیش‌نویس «${title}» حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    void run(() => deleteDraft(draft.id));
  }

  return (
    <li className="admin-draft">
      <div className="admin-draft-info">
        <strong>{title}</strong>
        <span className="admin-draft-id">شناسه: {draft.id}</span>
        <span className="admin-draft-meta">
          <DifficultyBadge difficulty={draft.json.meta?.difficulty} />
          {percent > 0 ? <ProgressBar percent={percent} /> : <span className="progress-empty">شروع نشده</span>}
        </span>
        {problems.length ? (
          <span className="admin-draft-status admin-draft-status-todo" title={problems.join("\n")}>
            {problems[0]}
            {problems.length > 1 ? ` (و ${fa(problems.length - 1)} مورد دیگر)` : ""}
          </span>
        ) : (
          <span className="admin-draft-status admin-draft-status-ready">آماده انتشار</span>
        )}
        {message ? <span className="admin-error">{message}</span> : null}
      </div>
      <div className="admin-draft-actions">
        <a className="admin-button" href={`#/admin/draft/${encodeURIComponent(draft.id)}`}>
          <Pencil size={16} aria-hidden="true" />
          حل و ویرایش
        </a>
        <button type="button" className="admin-button admin-button-primary" onClick={publish} disabled={busy || problems.length > 0}>
          <Upload size={16} aria-hidden="true" />
          انتشار
        </button>
        <button type="button" className="admin-button admin-button-danger" onClick={remove} disabled={busy} aria-label={`حذف ${title}`}>
          <Trash2 size={16} aria-hidden="true" />
          حذف
        </button>
      </div>
    </li>
  );
}

function ImportSection({ takenIds }: { takenIds: ReadonlySet<string> }) {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const picked = [...(e.target.files ?? [])];
    e.target.value = "";
    setError(null);
    setProgress(null);
    const read = await Promise.all(picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    setFiles(read);
    setPlan(planImport(read, takenIds));
  }

  function cancel(): void {
    setFiles([]);
    setPlan(null);
  }

  async function create(): Promise<void> {
    if (!plan) return;
    setError(null);
    let done = 0;
    try {
      for (const draft of plan.drafts) {
        setProgress(`در حال ساخت پیش‌نویس ${fa(done + 1)} از ${fa(plan.drafts.length)}…`);
        await createDraft(draft);
        done++;
      }
      setProgress(`${fa(done)} پیش‌نویس ساخته شد.`);
      cancel();
    } catch (e) {
      setError(`ساخت پیش‌نویس «${plan.drafts[done]?.id}» انجام نشد: ${errorText(e)}`);
      setProgress(null);
      // Keep the rest for another try; the ones already created are now taken ids.
      setPlan(planImport(files, new Set([...takenIds, ...plan.drafts.slice(0, done).map((d) => d.id)])));
    }
  }

  const creating = progress !== null && plan !== null;

  return (
    <section className="admin-section" aria-labelledby="admin-import-title">
      <h2 id="admin-import-title">افزودن جدول</h2>
      <p className="admin-note">
        فایل JSON جدول‌ها را همراه تصویرهایشان انتخاب کنید: تصویر پاسخ با همان نام فایل و پسوند png، و تصویر منبع با نامی
        که در sourceFile آمده است. هر جدول به‌صورت پیش‌نویس ساخته می‌شود تا آن را حل، اصلاح و منتشر کنید.
      </p>
      <label className="admin-button admin-button-primary admin-file-picker">
        <FilePlus2 size={16} aria-hidden="true" />
        انتخاب فایل‌ها
        <input type="file" multiple accept=".json,.png,.jpg,.jpeg,.webp" onChange={(e) => void onPick(e)} disabled={creating} />
      </label>

      {plan ? (
        <div className="admin-import-plan">
          {plan.drafts.length ? (
            <ul>
              {plan.drafts.map((d) => (
                <li key={d.id}>
                  <strong>{d.title}</strong> — شناسه {d.id}، {fa(d.images.length)} تصویر
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-note">جدولی برای ساخت پیدا نشد.</p>
          )}
          {plan.problems.length ? (
            <ul className="admin-problems">
              {plan.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          <div className="admin-draft-actions">
            <button type="button" className="admin-button admin-button-primary" onClick={() => void create()} disabled={creating || !plan.drafts.length}>
              ساخت {fa(plan.drafts.length)} پیش‌نویس
            </button>
            <button type="button" className="admin-button" onClick={cancel} disabled={creating}>
              انصراف
            </button>
          </div>
        </div>
      ) : null}
      {progress ? <p className="admin-note" role="status">{progress}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </section>
  );
}
