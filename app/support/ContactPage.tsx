import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../AuthContext";
import { goHome } from "../router";
import { createContact, isRealUser } from "./supportApi";

export function ContactPage() {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ ownerUid?: string; threadId?: string } | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    setFile(null);
    setError(null);
    if (files.length > 1) { setError("فقط یک تصویر می‌توانید پیوست کنید."); return; }
    const picked = files[0];
    if (!picked) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(picked.type) || !picked.size || picked.size > 5 * 1024 * 1024) {
      setError("تصویر باید PNG، JPEG یا WebP و حداکثر ۵ مگابایت باشد.");
      return;
    }
    setFile(picked);
  }

  const valid = subject.trim().length > 0 && subject.trim().length <= 120 && text.trim().length > 0 && text.trim().length <= 2000;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      let image;
      if (file) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1] ?? "") : reject(new Error("Image read failed"));
          reader.onerror = () => reject(reader.error);
          reader.onabort = () => reject(new Error("Image read cancelled"));
          reader.readAsDataURL(file);
        });
        image = { mimeType: file.type, data };
      }
      const result = await createContact({ subject: subject.trim(), text: text.trim(), ...(image ? { image } : {}) });
      setReceipt(isRealUser(user) && result.tracked && result.threadId
        ? { ownerUid: user!.uid, threadId: result.threadId } : {});
      setFile(null);
    } catch {
      setError("ارسال پیام انجام نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell home-shell support-shell" dir="rtl">
      <header className="admin-header">
        <button type="button" className="header-back" onClick={goHome} aria-label="بازگشت به فهرست جدول‌ها"><ArrowRight size={20} aria-hidden="true" /></button>
        <h1>تماس با ما</h1>
      </header>
      {receipt ? <section className="admin-section">
        <p role="status">پیام شما ثبت شد. سپاس از همراهی شما.</p>
        {isRealUser(user) && receipt.ownerUid === user?.uid && receipt.threadId
          ? <a className="admin-button" href={`#/support/thread/${encodeURIComponent(receipt.threadId)}`}>پیگیری پیام</a> : null}
      </section> : <form className="admin-section support-form" onSubmit={(event) => void submit(event)}>
        <p className="admin-note">{isRealUser(user) ? "پاسخ را در گزارش‌ها و پیام‌های من پیگیری کنید." : "بدون حساب کاربری فقط رسید ثبت پیام دریافت می‌کنید؛ امکان پیگیری یا دریافت پاسخ ندارید."}</p>
        <label htmlFor="contact-subject">موضوع</label>
        <input id="contact-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={120} required disabled={busy} />
        <label htmlFor="contact-text">متن پیام</label>
        <textarea id="contact-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} rows={5} required disabled={busy} />
        <label htmlFor="contact-image">تصویر پیوست (اختیاری)</label>
        <input id="contact-image" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="contact-image-help" onChange={pickImage} disabled={busy} />
        <p id="contact-image-help" className="admin-note">یک تصویر PNG، JPEG یا WebP، حداکثر ۵ مگابایت.</p>
        {preview ? <div className="support-attachment"><img src={preview} alt="پیش‌نمایش پیوست" /><button type="button" className="admin-button" onClick={() => setFile(null)} disabled={busy}>حذف پیوست</button></div> : null}
        {error ? <p className="admin-error" role="alert">{error}</p> : null}
        <button type="submit" className="admin-button admin-button-primary" disabled={!valid || busy}>{busy ? "در حال ارسال…" : "ارسال پیام"}</button>
      </form>}
    </main>
  );
}
