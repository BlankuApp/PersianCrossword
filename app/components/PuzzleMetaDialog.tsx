import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CrosswordJson } from "../../src/index";
import { PuzzleMetaEditor } from "./PuzzleMetaEditor";
import { applyMetaForm, ID_INVALID, metaFormOf, metaIdProblem } from "./puzzleMeta";

export interface PuzzleMetaDialogProps {
  readonly json: CrosswordJson;
  readonly id: string;
  readonly kind: "draft" | "published";
  // Ids a draft can't take (published + other drafts).
  readonly takenIds?: ReadonlySet<string> | undefined;
  readonly hasSourceImage: boolean;
  readonly onSave: (json: CrosswordJson, newId: string) => Promise<void>;
  readonly onClose: () => void;
}

// The one place puzzle metadata is edited: a draft saves privately, a published puzzle's change
// goes straight to players (the caller's onSave decides how it's stored).
export function PuzzleMetaDialog({ json, id, kind, takenIds, hasSourceImage, onSave, onClose }: PuzzleMetaDialogProps) {
  const [initial] = useState(() => metaFormOf(json, id));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLInputElement>("input:not([readonly])")?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);

  const next = applyMetaForm(json, form, hasSourceImage);
  // `changed` compares the result with the stored JSON (so a wrong size or missing id can be repaired
  // by a plain save); `dirty` compares the form with what was opened (so cancel can warn).
  const changed = JSON.stringify(next) !== JSON.stringify(json);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const idProblem = kind === "published" ? "" : metaIdProblem(form.id, id, takenIds);
  const titleMissing = !form.title.trim();
  const canSave = changed && !idProblem && !titleMissing && !saving;

  function requestClose(): void {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function save(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await onSave(next, form.id.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div
      ref={root}
      className="solution-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="مشخصات جدول"
      onClick={() => { if (!dirty) requestClose(); }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        if (confirmDiscard) setConfirmDiscard(false);
        else requestClose();
      }}
    >
      <form className="solution-modal confirm-modal meta-dialog" onClick={(e) => e.stopPropagation()} onSubmit={(e) => void save(e)}>
        <h2>مشخصات جدول</h2>
        <p className="meta-dialog-note">
          {kind === "draft"
            ? "تا زمان انتشار فقط برای مدیران دیده می‌شود."
            : "تغییرها بلافاصله برای همهٔ بازیکنان اعمال می‌شود. شناسه پس از انتشار قابل تغییر نیست؛ برای تغییر آن ابتدا انتشار را لغو کنید."}
        </p>
        <PuzzleMetaEditor
          value={form}
          onChange={(value) => { setForm(value); setError(""); }}
          idLocked={kind === "published"}
          takenIds={takenIds}
          ownId={id}
          sourceFile={hasSourceImage ? "editable" : "none"}
          size={{ rows: json.grid.length, cols: json.grid[0]?.length ?? 0 }}
          publishedAt={typeof json.meta?.publishedAt === "string" ? json.meta.publishedAt : undefined}
          disabled={saving}
        />
        {kind === "draft" && !form.id.trim() ? <p className="meta-dialog-note">{ID_INVALID}</p> : null}
        {titleMissing ? <p className="meta-dialog-note">عنوان جدول را وارد کنید.</p> : null}
        {error ? <p className="clue-edit-error confirm-modal-error" role="alert">{error}</p> : null}
        {confirmDiscard ? (
          <>
            <p className="meta-dialog-note" role="alert">تغییرات ذخیره‌نشده دور ریخته شود؟</p>
            <div className="solution-modal-actions">
              <button type="button" autoFocus onClick={() => setConfirmDiscard(false)}>ادامهٔ ویرایش</button>
              <button type="button" className="admin-button-danger" onClick={onClose}>دور انداختن</button>
            </div>
          </>
        ) : (
          <div className="solution-modal-actions">
            <button type="button" onClick={requestClose} disabled={saving}>انصراف</button>
            <button type="submit" className="confirm-modal-primary" disabled={!canSave}>{saving ? "در حال ذخیره…" : "ذخیره مشخصات"}</button>
          </div>
        )}
      </form>
    </div>
  );
}
