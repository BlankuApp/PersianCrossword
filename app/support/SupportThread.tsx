import { useEffect, useState, type FormEvent } from "react";
import { loadSupportImage, markSupportRead, replySupportThread, subscribeMessages, type SupportMessage, type SupportStatus, type SupportThread as Thread } from "./supportApi";

export const supportStatusText: Record<SupportStatus, string> = {
  submitted: "ثبت شده", reviewing: "در حال بررسی", accepted: "پذیرفته شده", fixed: "اصلاح شده",
  rejected: "رد شده", answered: "پاسخ داده شده", closed: "بسته شده",
};

export function SupportThread({ thread }: { thread: Thread }) {
  const [messages, setMessages] = useState<SupportMessage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [replyError, setReplyError] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeMessages(thread.id, setMessages, () => setLoadError(true)), [thread.id]);
  useEffect(() => {
    let live = true;
    setReadError(false);
    void markSupportRead(thread.id).catch(() => { if (live) setReadError(true); });
    return () => { live = false; };
  }, [thread.id, thread.userUnread]);

  const valid = text.trim().length > 0 && text.trim().length <= 2000;
  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setReplyError(false);
    try {
      await replySupportThread({ threadId: thread.id, text: text.trim() });
      setText("");
    } catch {
      setReplyError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section support-conversation" aria-label="گفت‌وگو">
      <h2>{thread.subject}</h2>
      <p className="admin-note">{supportStatusText[thread.status]}</p>
      {thread.clue ? <div className="clue-report-snapshot"><strong>{thread.clue.puzzleTitle}</strong><span>{thread.clue.groupNum.toLocaleString("fa-IR")} {thread.clue.direction === "across" ? "افقی" : "عمودی"}</span><p>{thread.clue.text}</p></div> : null}
      {loadError ? <p className="admin-error" role="alert">خواندن گفت‌وگو انجام نشد. دوباره این صفحه را باز کنید.</p> : messages === null ? <p role="status">در حال بارگذاری…</p> : (
        <ol className="support-messages" aria-label="پیام‌های گفت‌وگو">
          {messages.map((message) => <li key={message.id} className={`support-message support-message-${message.sender}`}>
            <strong>{message.sender === "admin" ? "پشتیبانی" : "شما"}</strong>
            <time dateTime={message.createdAt.toDate().toISOString()}>{message.createdAt.toDate().toLocaleString("fa-IR")}</time>
            <p dir="auto">{message.text}</p>
            {message.imagePath ? <SupportImage key={message.imagePath} path={message.imagePath} /> : null}
          </li>)}
        </ol>
      )}
      {readError ? <p className="admin-error" role="alert">ثبت خوانده‌شدن پیام‌ها انجام نشد. دوباره این صفحه را باز کنید.</p> : null}
      <form className="support-form" onSubmit={(event) => void reply(event)}>
        <label htmlFor="support-reply">پاسخ شما</label>
        <textarea id="support-reply" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} rows={3} disabled={busy} required />
        {replyError ? <p className="admin-error" role="alert">ارسال پاسخ انجام نشد. دوباره تلاش کنید.</p> : null}
        <button type="submit" className="admin-button admin-button-primary" disabled={!valid || busy}>{busy ? "در حال ارسال…" : "ارسال پاسخ"}</button>
      </form>
    </section>
  );
}

function SupportImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    let objectUrl: string | undefined;
    void loadSupportImage(path).then((blob) => {
      if (!live) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (live) setError(true); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  return error ? <p className="admin-error" role="alert">بارگذاری تصویر انجام نشد.</p>
    : url ? <img className="support-image" src={url} alt="تصویر پیوست پیام" /> : <p className="admin-note">در حال بارگذاری تصویر…</p>;
}
