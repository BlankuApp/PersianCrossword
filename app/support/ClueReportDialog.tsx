import { X } from "lucide-react";
import { useAuth } from "../AuthContext";
import { AuthButton } from "../components/AuthButton";
import { isRealUser, type ClueSnapshot } from "./supportApi";

interface ClueReportDialogProps {
  readonly clue: ClueSnapshot;
  readonly text: string;
  readonly status: "idle" | "sending" | "sent" | "error";
  readonly onTextChange: (text: string) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
}

export function ClueReportDialog({ clue, text, status, onTextChange, onSubmit, onClose }: ClueReportDialogProps) {
  const { user } = useAuth();
  const canSubmit = isRealUser(user);
  const busy = status === "sending";

  return (
    <div className="solution-modal-backdrop" role="dialog" aria-modal="true" aria-label="گزارش خطای پرسش">
      <div className="solution-modal clue-report-modal">
        <div className="solution-modal-header">
          <h2>گزارش خطای پرسش</h2>
          <button type="button" className="solution-close-button" onClick={onClose} disabled={busy} title="بستن" aria-label="بستن">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="clue-report-snapshot">
          <strong>{clue.puzzleTitle}</strong>
          <span dir="auto">{clue.puzzleId}</span>
          <span>{clue.groupNum.toLocaleString("fa-IR")} {clue.direction === "across" ? "افقی" : "عمودی"}</span>
          <span dir="ltr">{clue.slotId}</span>
          <p>{clue.text}</p>
        </div>
        {status === "sent" ? (
          <p role="status">گزارش شما ثبت شد. سپاس از کمک شما برای اصلاح این پرسش.</p>
        ) : (
          <>
            <label htmlFor="clue-report-text">توضیح خطا</label>
            <textarea id="clue-report-text" className="clue-edit-textarea" value={text} onChange={(event) => onTextChange(event.target.value)} rows={3} maxLength={2000} disabled={busy} autoFocus dir="rtl" />
            {!canSubmit ? (
              <div>
                <p>برای ارسال گزارش، وارد حساب شوید یا حساب مهمان را ارتقا دهید. توضیح شما حفظ می‌شود.</p>
                <AuthButton allowGuestUpgrade label="ورود یا ساخت حساب" />
              </div>
            ) : null}
            {status === "error" ? <p className="clue-edit-error" role="alert">ارسال گزارش انجام نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.</p> : null}
            <div className="clue-edit-modal-footer">
              <button type="button" onClick={onSubmit} disabled={!canSubmit || !text.trim() || text.trim().length > 2000 || busy}>
                {busy ? "در حال ارسال…" : "ارسال گزارش"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
