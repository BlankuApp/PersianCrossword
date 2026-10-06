import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowRight, FileJson, FilePlus2, Files, Pencil, Sparkles, Tag, Trash2, Upload } from "lucide-react";
import { useAuth } from "../AuthContext";
import { PuzzleMetaDialog } from "../components/PuzzleMetaDialog";
import { DifficultyBadge, ProgressBar } from "../pages/HomePage";
import { computeProgress, loadProgress } from "../progress";
import { usePuzzleLibrary } from "../puzzleLibrary";
import { refreshPuzzleCatalog } from "../puzzleSync";
import { goHome } from "../router";
import { createDraft, deleteDraft, publishDraft, publishProblems, saveDraftMeta, type Draft } from "./adminApi";
import { planImport, type ImportFile, type ImportPlan } from "./importPlan";
import { useDrafts } from "./useDrafts";
import { PhotoImportSection } from "./PhotoImportSection";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
import { toPersianDigits } from "../persianNumbers";
import { readAdminSettings, saveAdminSettings } from "./adminSettings";

const fa = (n: number) => n.toLocaleString("fa-IR");
const adminTabs = [
  { id: "drafts", label: "پیش‌نویس‌ها", Icon: Files },
  { id: "ai", label: "ساخت با هوش‌واره", Icon: Sparkles },
  { id: "json", label: "افزودن با JSON", Icon: FileJson },
] as const;

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
  const [tab, setTab] = useState<(typeof adminTabs)[number]["id"]>(() => {
    const saved = readAdminSettings().tab;
    return adminTabs.find((item) => item.id === saved)?.id ?? "drafts";
  });
  useEffect(() => { saveAdminSettings({ tab }); }, [tab]);
  const tabIndex = adminTabs.findIndex((item) => item.id === tab);
  const { drafts, loaded, error } = useDrafts();
  const { puzzles } = usePuzzleLibrary();
  const takenIds = useMemo(() => new Set([...puzzles.map((p) => p.id), ...drafts.map((d) => d.id)]), [puzzles, drafts]);

  return (
    <>
      <div className="admin-tabs" role="tablist" aria-label="بخش‌های مدیریت">
        <span className="admin-tab-pill" aria-hidden="true" style={{ transform: `translateX(calc(-${tabIndex * 100}% - ${tabIndex * 6}px))` }} />
        {adminTabs.map(({ id, label, Icon }, index) => <button key={id} type="button" role="tab" id={`admin-tab-${id}`} aria-controls={`admin-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={(e) => {
          // The tabs follow RTL visual order; right goes to the preceding tab.
          const next = e.key === "ArrowLeft" ? (index + 1) % adminTabs.length
            : e.key === "ArrowRight" ? (index + adminTabs.length - 1) % adminTabs.length
            : e.key === "Home" ? 0 : e.key === "End" ? adminTabs.length - 1 : null;
          if (next === null) return;
          e.preventDefault(); setTab(adminTabs[next]!.id);
          document.getElementById(`admin-tab-${adminTabs[next]!.id}`)?.focus();
        }}><Icon size={18} aria-hidden="true" />{label}{id === "drafts" && loaded ? <span className="admin-tab-count">{fa(drafts.length)}</span> : null}</button>)}
      </div>
      <div role="tabpanel" id="admin-panel-drafts" aria-labelledby="admin-tab-drafts" hidden={tab !== "drafts"} tabIndex={0}>
        <section className="admin-section" aria-labelledby="admin-drafts-title">
          <h2 id="admin-drafts-title">پیش‌نویس‌ها{loaded ? ` (${fa(drafts.length)})` : ""}</h2>
          {error ? <p className="admin-error">خواندن پیش‌نویس‌ها انجام نشد: {error}</p> : null}
          {!loaded ? (
            <p className="admin-note">در حال بارگذاری…</p>
          ) : drafts.length === 0 ? (
            <p className="admin-note">پیش‌نویسی نیست. از تب «ساخت با هوش‌واره» یا «افزودن با JSON» جدول تازه اضافه کنید.</p>
          ) : (
            <ul className="admin-drafts">
              {drafts.map((draft) => (
                <DraftRow key={draft.id} draft={draft} takenIds={takenIds} />
              ))}
            </ul>
          )}
        </section>
      </div>
      <div role="tabpanel" id="admin-panel-ai" aria-labelledby="admin-tab-ai" hidden={tab !== "ai"} tabIndex={0}>
        <PhotoImportSection takenIds={takenIds} />
      </div>
      <div role="tabpanel" id="admin-panel-json" aria-labelledby="admin-tab-json" hidden={tab !== "json"} tabIndex={0}>
        <ImportSection takenIds={takenIds} />
      </div>
    </>
  );
}

function DraftRow({ draft, takenIds }: { draft: Draft; takenIds: ReadonlySet<string> }) {
  const problems = useMemo(() => publishProblems(draft.json), [draft.json]);
  // The admin's own letters on this device (drafts save progress like any puzzle).
  const { syncVersion } = useAuth();
  const percent = useMemo(
    () => computeProgress(draft.json, loadProgress(draft.id)).percent,
    [draft.id, draft.json, syncVersion],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"meta" | "publish" | null>(null);
  const title = draft.json.meta?.title ?? draft.id;

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function remove(): void {
    if (!window.confirm(`پیش‌نویس «${title}» حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    void run(() => deleteDraft(draft.id));
  }

  return (
    <li className="admin-draft">
      <div className="admin-draft-info">
        <strong>{toPersianDigits(title)}</strong>
        <span className="admin-draft-id">شناسه: <bdi>{toPersianDigits(draft.id)}</bdi></span>
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
        {message && dialog !== "publish" ? <span className="admin-error" role="alert">{toPersianDigits(message)}</span> : null}
      </div>
      <div className="admin-draft-actions">
        <a className="admin-button" href={`#/admin/draft/${encodeURIComponent(draft.id)}`}>
          <Pencil size={16} aria-hidden="true" />
          حل و ویرایش
        </a>
        <button type="button" className="admin-button" onClick={() => setDialog("meta")} disabled={busy}>
          <Tag size={16} aria-hidden="true" />
          مشخصات
        </button>
        <button type="button" className="admin-button admin-button-primary" onClick={() => { setMessage(null); setDialog("publish"); }} disabled={busy || problems.length > 0}>
          <Upload size={16} aria-hidden="true" />
          انتشار
        </button>
        <button type="button" className="admin-button admin-button-danger" onClick={remove} disabled={busy} aria-label={`حذف ${title}`}>
          <Trash2 size={16} aria-hidden="true" />
          حذف
        </button>
      </div>
      {dialog === "meta" ? (
        <PuzzleMetaDialog json={draft.json} id={draft.id} kind="draft" takenIds={takenIds} hasSourceImage={!!draft.images.source}
          onSave={(json, newId) => saveDraftMeta(draft, json, newId)} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "publish" ? (
        <PublishConfirmDialog draft={draft} problems={problems} busy={busy} error={message}
          onPublish={() => void run(async () => { await publishDraft(draft); await refreshPuzzleCatalog(); setDialog(null); })}
          onEdit={() => { setMessage(null); setDialog("meta"); }} onCancel={() => { setMessage(null); setDialog(null); }} />
      ) : null}
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
      <h2 id="admin-import-title">افزودن جدول با JSON</h2>
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
