export interface WhatsNewEntry {
  readonly date: string; // ISO date
  readonly title: string;
  readonly body: string;
}

// Dash, not the "persian-crossword:" prefix — cloudProgress syncs every such key as a puzzle.
const SEEN_KEY = "persian-crossword-whats-new-seen";

// ponytail: tracks the newest *date* seen, so a second entry dated the same day but shipped
// later won't count as new; give entries ids if same-day follow-ups become common.
export function loadWhatsNewSeen(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SEEN_KEY) ?? "";
}

/** Marks every current entry as seen and returns the new marker. */
export function markWhatsNewSeen(): string {
  const newest = WHATS_NEW[0]?.date ?? "";
  if (typeof window !== "undefined") window.localStorage.setItem(SEEN_KEY, newest);
  return newest;
}

// Newest first.
export const WHATS_NEW: readonly WhatsNewEntry[] = [
  {
    date: "2026-09-24",
    title: "فهرست تازهٔ جدول‌ها",
    body:
      "صفحهٔ اول نو شد: جدول‌ها را بر اساس سطح، وضعیت حل و روزنامه فیلتر کنید، با شماره یا عنوان جستجو کنید و ترتیبشان را تغییر دهید. " +
      "جدول‌هایی که نیمه‌کاره مانده‌اند در بخش «ادامهٔ حل» بالای فهرست می‌آیند، و صفحه و فیلترها در نشانی صفحه می‌مانند تا با برگشتن از جدول، همان‌جا باشید. " +
      "در حالت بررسی پاسخ‌ها هم خانه‌ای که حرف اشتباه بگیرد کمی می‌لرزد.",
  },
  {
    date: "2026-09-23",
    title: "هوشوارهٔ رایگان",
    body:
      "دیگر برای پرسیدن از هوشواره به کلید Gemini نیازی نیست: مهمان‌ها روزانه ۱۰ و کاربران دارای حساب روزانه ۱۰۰ پرسش رایگان دارند. " +
      "اگر بیشتر لازم داشتید، همچنان می‌توانید کلید رایگان خودتان را از Google AI Studio وارد کنید.",
  },
  {
    date: "2026-09-16",
    title: "۱۲ جدول تازه",
    body: "جدول‌های ۸۰۳۱ تا ۸۰۳۶ روزنامهٔ ایران، در دو سطح عادی و ویژه، اضافه شدند.",
  },
  {
    date: "2026-09-14",
    title: "پرسش و پاسخ با هوشواره",
    body:
      "برای هر سوال، دو دکمهٔ تازه اضافه شد: پیش از حل، «از هوشواره بپرس» یک پاسخ پیشنهادی می‌گیرد؛ " +
      "پس از حل، «توضیح با هوشواره» دربارهٔ معنی، ریشه و کاربرد کلمه توضیح می‌دهد. " +
      "برای استفاده باید یک کلید رایگان Gemini از Google AI Studio بسازید و در منوی حساب کاربری (یا در همان دیالوگ) وارد کنید؛ " +
      "این کلید فقط در مرورگر شما ذخیره می‌شود و به هیچ سروری ارسال نمی‌شود.",
  },
  {
    date: "2026-09-10",
    title: "نقش‌های تازه برای خانه‌های سیاه",
    body:
      "خانه‌های سیاه جدول دیگر ساده نیستند؛ هر خانه یک تصویر کوچک و رنگی دارد که آرام جان می‌گیرد. " +
      "هر بار که جدولی را باز کنید، مجموعهٔ تازه‌ای از این نقش‌ها نمایش داده می‌شود. " +
      "اگر در تنظیمات دستگاهتان «کاهش حرکت» را روشن کرده باشید، تصویرها بدون حرکت نشان داده می‌شوند.",
  },
  {
    date: "2026-09-10",
    title: "پنل حساب کاربری با آمار جدول‌ها",
    body:
      "به‌جای نام کاربری، یک تصویر کوچک اختصاصی برای حساب شما نمایش داده می‌شود. " +
      "با کلیک روی آن، مشخصات حسابتان به‌همراه آمار جدول‌های حل‌شده، نیمه‌کاره و حل‌نشده " +
      "به تفکیک سطح جدول و دکمهٔ خروج نشان داده می‌شود.",
  },
  {
    date: "2026-09-02",
    title: "راهنمای سوال هنگام نگه‌داشتن ماوس",
    body:
      "در نسخهٔ دسکتاپ، وقتی نشانگر ماوس را روی یک خانه نگه دارید، سوال‌های افقی و عمودی " +
      "همان خانه در یک راهنمای کوچک نمایش داده می‌شوند؛ دیگر لازم نیست برای دیدن سوال، خانه را انتخاب کنید.",
  },
];
