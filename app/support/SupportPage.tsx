import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../AuthContext";
import { AuthButton } from "../components/AuthButton";
import { goHome, navigate } from "../router";
import { isRealUser, subscribeOwnThreads, type SupportThread as Thread } from "./supportApi";
import { SupportThread, supportStatusText } from "./SupportThread";

export function SupportPage({ threadId }: { threadId?: string }) {
  const { user, loading } = useAuth();
  return <main className="app-shell home-shell support-shell" dir="rtl">
    <header className="admin-header">
      <button type="button" className="header-back" onClick={threadId ? () => navigate("#/support") : goHome} aria-label={threadId ? "بازگشت به گزارش‌ها و پیام‌ها" : "بازگشت به فهرست جدول‌ها"}><ArrowRight size={20} aria-hidden="true" /></button>
      <h1>گزارش‌ها و پیام‌های من</h1>
    </header>
    {loading ? <p role="status">در حال بارگذاری…</p> : isRealUser(user) ? <OwnSupport key={`${user!.uid}:${threadId ?? ""}`} uid={user!.uid} {...(threadId ? { threadId } : {})} /> : <section className="admin-section">
      <p>برای پیگیری گزارش‌ها و پیام‌ها وارد حساب شوید یا حساب مهمان را ارتقا دهید.</p>
      <AuthButton allowGuestUpgrade label="ورود یا ساخت حساب" />
    </section>}
  </main>;
}

function OwnSupport({ uid, threadId }: { uid: string; threadId?: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => subscribeOwnThreads(uid, setThreads, () => setError(true)), [uid]);
  if (error) return <p className="admin-error" role="alert">خواندن گزارش‌ها و پیام‌ها انجام نشد. دوباره این صفحه را باز کنید.</p>;
  if (threads === null) return <p role="status">در حال بارگذاری…</p>;
  if (threadId) {
    const thread = threads.find((item) => item.id === threadId && item.ownerUid === uid);
    return thread ? <SupportThread key={thread.id} thread={thread} /> : <p className="admin-error" role="alert">پیام پیدا نشد یا به این حساب تعلق ندارد.</p>;
  }
  // shortcut: the user's complete thread list is sorted locally, add paginated queries when support volume grows.
  const sorted = [...threads].sort((a, b) => b.lastMessageAt.toMillis() - a.lastMessageAt.toMillis());
  return threads.length ? <ul className="support-list" aria-label="گزارش‌ها و پیام‌ها">
    {sorted.map((thread) => <li key={thread.id}><a href={`#/support/thread/${encodeURIComponent(thread.id)}`}>
      <strong>{thread.subject}</strong>
      <span>{thread.kind === "clue_error" ? "خطای پرسش" : "تماس با ما"} · {supportStatusText[thread.status]}</span>
      <span>آخرین فعالیت: <time dateTime={thread.lastMessageAt.toDate().toISOString()}>{thread.lastMessageAt.toDate().toLocaleString("fa-IR")}</time></span>
      {thread.userUnread > 0 ? <span className="support-unread">{thread.userUnread.toLocaleString("fa-IR")} خوانده‌نشده</span> : null}
    </a></li>)}
  </ul> : <p className="admin-note">هنوز گزارش یا پیامی ندارید.</p>;
}
