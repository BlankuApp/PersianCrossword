import { useEffect, useState } from "react";
import { Share2, Smartphone } from "lucide-react";
import {
  PLAY_STORE_URL,
  isWebApp,
  loadPromoDismissed,
  savePromoDismissed,
  shareApp,
  type ShareResult,
} from "../appPromo";

function GooglePlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M3.6 2.2 13.3 12l-9.7 9.8c-.4-.2-.6-.6-.6-1.1V3.3c0-.5.2-.9.6-1.1Z" fill="#00d26a" />
      <path d="m16.6 15.3-3.3-3.3 3.3-3.3 3.9 2.2c1.1.6 1.1 1.6 0 2.2l-3.9 2.2Z" fill="#ffc400" />
      <path d="M16.6 15.3 13.3 12l-9.7 9.8c.4.2.9.2 1.4-.1l11.6-6.4Z" fill="#ff3a44" />
      <path d="M16.6 8.7 5 2.3c-.5-.3-1-.3-1.4-.1l9.7 9.8 3.3-3.3Z" fill="#00a0ff" />
    </svg>
  );
}

export function PlayStoreBadge() {
  return (
    <a className="play-badge" href={PLAY_STORE_URL} target="_blank" rel="noopener">
      <GooglePlayIcon width={22} height={22} />
      <span>
        <small>دریافت از</small>
        Google Play
      </span>
    </a>
  );
}

const SHARE_FEEDBACK: Record<Exclude<ShareResult, "shared">, string> = {
  copied: "لینک کپی شد",
  failed: "کپی نشد",
};

export function ShareAppButton() {
  const [feedback, setFeedback] = useState<keyof typeof SHARE_FEEDBACK | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  async function onClick(): Promise<void> {
    const result = await shareApp();
    setFeedback(result === "shared" ? null : result);
  }

  return (
    <span className="share-app">
      <button type="button" className="auth-btn share-app-btn" onClick={() => void onClick()}>
        <Share2 size={16} strokeWidth={2.2} aria-hidden="true" />
        معرفی به دوستان
      </button>
      <span className="share-app-feedback" role="status">
        {feedback && SHARE_FEEDBACK[feedback]}
      </span>
    </span>
  );
}

/** Home-page card announcing the Android app; web only, hidden for good once closed. */
export function AppPromoCard() {
  const [dismissed, setDismissed] = useState(loadPromoDismissed);
  if (!isWebApp() || dismissed) return null;

  return (
    <section className="app-promo" aria-labelledby="app-promo-title">
      <button
        type="button"
        className="app-promo-close"
        onClick={() => {
          savePromoDismissed();
          setDismissed(true);
        }}
        aria-label="بستن پیام اپ اندروید"
      >
        ✕
      </button>
      <span className="app-promo-icon" aria-hidden="true">
        <Smartphone size={24} strokeWidth={2} />
      </span>
      <div className="app-promo-text">
        <h2 id="app-promo-title">اپ اندروید منتشر شد</h2>
        <p>جدول‌ها را روی گوشی حل کنید؛ پیشرفتتان با حساب کاربری همگام می‌ماند.</p>
      </div>
      <div className="app-promo-actions">
        <PlayStoreBadge />
        <ShareAppButton />
      </div>
    </section>
  );
}

/** Footer copy of the badge and share button, so they stay reachable after the card is closed. */
export function AppPromoFooter() {
  if (!isWebApp()) return null;
  return (
    <div className="app-promo-footer">
      <PlayStoreBadge />
      <ShareAppButton />
    </div>
  );
}
