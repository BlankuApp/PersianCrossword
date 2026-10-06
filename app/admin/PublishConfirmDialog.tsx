import { useEffect, useRef } from "react";
import { MetaSummary } from "../components/MetaSummary";
import { toPersianDigits } from "../persianNumbers";
import type { Draft } from "./adminApi";

// Last look before a draft goes live: its metadata, whether it is ready, and the way into the editor.
export function PublishConfirmDialog({ draft, problems, busy, error, onPublish, onEdit, onCancel }: {
  draft: Draft; problems: readonly string[]; busy: boolean; error: string | null;
  onPublish: () => void; onEdit: () => void; onCancel: () => void;
}) {
  const publishButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    publishButton.current?.focus();
    return () => opener?.focus?.();
  }, []);
  const title = String(draft.json.meta?.title ?? draft.id);
  return (
    <div className="solution-modal-backdrop" role="dialog" aria-modal="true" aria-label={`انتشار ${title}`}
      onClick={() => { if (!busy) onCancel(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onCancel(); } }}>
      <div className="solution-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>انتشار جدول</h2>
        <p>جدول با این مشخصات برای همه بازیکنان منتشر می‌شود. تاریخ انتشار همان روز ثبت می‌شود.</p>
        <MetaSummary json={draft.json} id={draft.id} onEdit={busy ? undefined : onEdit} />
        {problems.length ? (
          <ul className="admin-problems">{problems.map((p) => <li key={p}>{toPersianDigits(p)}</li>)}</ul>
        ) : (
          <p className="admin-draft-status admin-draft-status-ready">آماده انتشار</p>
        )}
        {error ? <p className="clue-edit-error confirm-modal-error" role="alert">{toPersianDigits(error)}</p> : null}
        <div className="solution-modal-actions">
          <button type="button" onClick={onCancel} disabled={busy}>انصراف</button>
          <button ref={publishButton} type="button" className="confirm-modal-primary" onClick={onPublish} disabled={busy || problems.length > 0}>
            {busy ? "در حال انتشار…" : "انتشار برای همه"}
          </button>
        </div>
      </div>
    </div>
  );
}
