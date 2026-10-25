import { useEffect, useMemo, useState } from "react";
import { SupportThread as Conversation } from "../support/SupportThread";
import { subscribeAllThreads, setSupportStatus, type SupportKind, type SupportStatus, type SupportThread } from "../support/supportApi";
import { supportStatusText } from "../support/SupportThread";
import { puzzleHash } from "../router";

const statusByKind: Record<SupportKind, SupportStatus[]> = {
  clue_error: ["submitted", "reviewing", "accepted", "fixed", "rejected"],
  contact: ["submitted", "reviewing", "answered", "closed"],
};

export function SupportSection() {
  const [threads, setThreads] = useState<SupportThread[] | null>(null);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState<"all" | SupportKind>("all");
  const [status, setStatus] = useState<"all" | SupportStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => subscribeAllThreads(setThreads, () => setError(true)), []);
  // shortcut: filter and sort the live inbox in memory; move this to a paged query if volume outgrows the current inbox.
  const visibleThreads = useMemo(() => (threads ?? [])
    .filter((thread) => (kind === "all" || thread.kind === kind) && (status === "all" || thread.status === status))
    .sort((a, b) => b.lastMessageAt.toMillis() - a.lastMessageAt.toMillis()), [threads, kind, status]);
  const filterStatuses: SupportStatus[] = kind === "all" ? Object.keys(supportStatusText) as SupportStatus[] : statusByKind[kind];
  const selected = threads?.find((thread) => thread.id === selectedId);

  async function updateStatus(thread: SupportThread, next: SupportStatus) {
    if (!statusByKind[thread.kind].includes(next) || saving) return;
    setSaving(true); setSaveError(false);
    try { await setSupportStatus({ threadId: thread.id, status: next }); }
    catch { setSaveError(true); }
    finally { setSaving(false); }
  }

  return <section className="admin-section" aria-label="گزارش‌ها و پیام‌ها">
    <h2>گزارش‌ها و پیام‌ها</h2>
    <div className="support-inbox-filters">
      <label>نوع گزارش<select aria-label="نوع گزارش" value={kind} onChange={(event) => {
        const next = event.target.value as typeof kind;
        setKind(next);
        if (status !== "all" && next !== "all" && !statusByKind[next].includes(status)) setStatus("all");
      }}>
        <option value="all">همه</option><option value="clue_error">اشکال در سرنخ</option><option value="contact">پیام پشتیبانی</option>
      </select></label>
      <label>وضعیت<select aria-label="وضعیت" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
        <option value="all">همه</option>{filterStatuses.map((value) => <option key={value} value={value}>{supportStatusText[value]}</option>)}
      </select></label>
    </div>
    {error ? <p className="admin-error" role="alert">خواندن پیام‌ها انجام نشد. دوباره تلاش کنید.</p> : null}
    {threads === null && !error ? <p className="admin-note" role="status">در حال بارگذاری…</p> : null}
    {threads !== null && !visibleThreads.length ? <p className="admin-note">موردی پیدا نشد.</p> : null}
    <ul className="support-inbox-list">{visibleThreads.map((thread) => <li key={thread.id}>
      <button type="button" className="support-inbox-item" aria-pressed={selectedId === thread.id} onClick={() => { setSelectedId(thread.id); setSaveError(false); }}>
        <strong>{thread.subject}</strong><span>{thread.kind === "clue_error" ? "گزارش سرنخ" : "پیام پشتیبانی"} · {supportStatusText[thread.status]}</span>
        <time dateTime={thread.lastMessageAt.toDate().toISOString()}>{thread.lastMessageAt.toDate().toLocaleString("fa-IR")}</time>
        <span className={thread.adminUnread > 0 ? "support-inbox-unread" : undefined}>{thread.adminUnread.toLocaleString("fa-IR")} پیام خوانده‌نشده</span>
      </button>
    </li>)}</ul>
    {selected ? <>
      {selected.clue ? <a className="admin-button support-clue-link" href={puzzleHash(selected.clue.puzzleId, selected.clue.slotId, "admin-support")}>باز کردن جدول</a> : null}
      <label className="support-status-control">وضعیت گزارش<select aria-label="وضعیت گزارش" value={selected.status} disabled={saving} onChange={(event) => void updateStatus(selected, event.target.value as SupportStatus)}>
        {statusByKind[selected.kind].map((value) => <option key={value} value={value}>{supportStatusText[value]}</option>)}
      </select></label>
      {saving ? <p role="status">در حال ثبت وضعیت…</p> : null}
      {saveError ? <p className="admin-error" role="alert">ثبت وضعیت انجام نشد. دوباره تلاش کنید.</p> : null}
      <Conversation key={selected.id} thread={selected} role="admin" />
    </> : null}
  </section>;
}
