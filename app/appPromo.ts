import { Capacitor } from "@capacitor/core";

export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.persiancrossword.app";
export const WEB_APP_URL = "https://blankuapp.github.io/PersianCrossword/";

const SHARE_TITLE = "جدول کلمات فارسی";
const SHARE_TEXT =
  "جدول کلمات فارسی را امتحان کن! جدول‌های روزنامه‌ها، رایگان، روی وب و اندروید.\n" +
  `اندروید: ${PLAY_STORE_URL}`;

// Dash, not the "persian-crossword:" prefix — cloudProgress syncs every such key as a puzzle.
const PROMO_DISMISSED_KEY = "persian-crossword-app-promo-dismissed";

/** Play Store links are for web visitors only; the Android app hides them. */
export function isWebApp(): boolean {
  return !Capacitor.isNativePlatform();
}

export function loadPromoDismissed(): boolean {
  try {
    return window.localStorage.getItem(PROMO_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePromoDismissed(): void {
  try {
    window.localStorage.setItem(PROMO_DISMISSED_KEY, "1");
  } catch {
    // Private mode etc.: the card just comes back next visit.
  }
}

export type ShareResult = "shared" | "copied" | "failed";

/** System share sheet where there is one (phones), else copies the message to the clipboard. */
export async function shareApp(): Promise<ShareResult> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: WEB_APP_URL });
      return "shared";
    } catch (err) {
      // The user closed the sheet: nothing to report.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(`${SHARE_TEXT}\nوب: ${WEB_APP_URL}`);
    return "copied";
  } catch {
    return "failed";
  }
}
