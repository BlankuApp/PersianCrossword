import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadSupportImage, markSupportRead, replySupportThread, subscribeMessages, type SupportMessage, type SupportParticipant, type SupportStatus, type SupportThread as Thread } from "./supportApi";

export const supportStatusText: Record<SupportStatus, string> = {
  submitted: "ارسال‌شده", reviewing: "در حال بررسی", accepted: "تأییدشده", fixed: "اصلاح‌شده",
  rejected: "ردشده", answered: "پاسخ‌داده‌شده", closed: "بسته‌شده",
};

export function SupportThread({ thread, role }: { thread: Thread; role: SupportParticipant }) {
  const [loaded, setLoaded] = useState<{ id: string; messages: SupportMessage[] } | null>(null);
  const lastRead = useRef("");
  const [loadError, setLoadError] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const unread = role === "admin" ? thread.adminUnread : thread.userUnread;

  useEffect(() => {
    let live = true;
    setLoaded(null);
    setLoadError(false);
    const stop = subscribeMessages(thread.id, (messages) => { if (live) setLoaded({ id: thread.id, messages }); }, () => { if (live) setLoadError(true); });
    return () => { live = false; stop(); };
  }, [thread.id]);
  useEffect(() => {
    if (!unread) { lastRead.current = ""; return; }
    const messages = loaded?.id === thread.id ? loaded.messages : null;
    if (loadError || !messages?.length || !messages.some((message) => message.createdAt.toMillis() >= thread.lastMessageAt.toMillis())) return;
    const key = `${thread.id}:${role}:${thread.lastMessageAt.toMillis()}:${unread}`;
    if (lastRead.current === key) return;
    lastRead.current = key;
    let live = true;
    setReadError(null);
    void markSupportRead({ threadId: thread.id, participant: role, observedAt: { seconds: thread.lastMessageAt.seconds, nanoseconds: thread.lastMessageAt.nanoseconds } }).catch(() => { if (live) setReadError(thread.id); });
    return () => { live = false; };
  }, [thread.id, role, unread, thread.lastMessageAt, loaded, loadError]);

  const valid = text.trim().length > 0 && text.trim().length <= 2000;
  async function reply(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setReplyError(false);
    try {
      await replySupportThread({ threadId: thread.id, participant: role, text: text.trim() });
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
      {loadError ? <p className="admin-error" role="alert">خواندن گفت‌وگو انجام نشد. دوباره این صفحه را باز کنید.</p> : loaded?.id !== thread.id ? <p role="status">در حال بارگذاری…</p> : (
        <ol className="support-messages" aria-label="پیام‌های گفت‌وگو">
          {loaded.messages.map((message) => <li key={message.id} className={`support-message support-message-${message.sender}`}>
            <strong>{message.sender === "admin" ? (role === "admin" ? "پشتیبانی (شما)" : "پشتیبانی") : message.sender === "guest" ? "مهمان" : role === "user" ? "شما" : "کاربر"}</strong>
            <time dateTime={message.createdAt.toDate().toISOString()}>{message.createdAt.toDate().toLocaleString("fa-IR")}</time>
            <p dir="auto">{message.text}</p>
            {message.imagePath ? <SupportImage key={message.imagePath} path={message.imagePath} /> : null}
          </li>)}
        </ol>
      )}
      {readError === thread.id ? <p className="admin-error" role="alert">ثبت خوانده‌شدن پیام‌ها انجام نشد. دوباره این صفحه را باز کنید.</p> : null}
      {role === "admin" && !thread.ownerUid ? <p className="admin-note">این پیام بی‌نام است و فرستنده امکان دریافت پاسخ را ندارد.</p> : <form className="support-form" onSubmit={(event) => void reply(event)}>
        <label htmlFor="support-reply">پاسخ شما</label>
        <textarea id="support-reply" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} rows={3} disabled={busy} required />
        {replyError ? <p className="admin-error" role="alert">ارسال پاسخ انجام نشد. دوباره تلاش کنید.</p> : null}
        <button type="submit" className="admin-button admin-button-primary" disabled={!valid || busy}>{busy ? "در حال ارسال…" : "ارسال پاسخ"}</button>
      </form>}
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
