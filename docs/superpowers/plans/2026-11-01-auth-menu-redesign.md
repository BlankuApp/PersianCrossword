# Auth Menu Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** بازطراحی منوی حساب برای وب و موبایل با دو بخش فعالیت/تنظیمات و کنترل صریح ذخیره و پاک‌کردن کلید هوشواره.

**Architecture:** `UserMenu` موجود حفظ می‌شود و فقط state محلی تب فعال و پیش‌نویس/کلید ذخیره‌شده اضافه می‌شود. CSS موجود popover وب را بازآرایی و در موبایل به bottom sheet تبدیل می‌کند.

**Tech Stack:** React 19، TypeScript، CSS، Vitest، Testing Library، Vite

**Spec:** `docs/superpowers/specs/2026-11-01-auth-menu-redesign-design.md`

## Global Constraints

- وابستگی، مسیر یا تغییر Firebase جدید اضافه نشود.
- کلید Gemini فقط در `localStorage` همان دستگاه بماند و مقدار خالی واقعاً حذف شود.
- رفتار حساب مهمان، مدیر، همگام‌سازی، پیام‌ها و خروج فعلی حفظ شود.
- موبایل bottom sheet دارای اسکرول داخلی و هدف لمسی حداقل ۴۴ پیکسل باشد.

## Review Focus

- بازکردن دوبارهٔ منو از «فعالیت من» شروع شود.
- تایپ بدون ذخیره، `localStorage` را تغییر ندهد.
- لغو پاک‌کردن کلید و ورودی را حفظ کند.
- پاک‌کردن تأییدشده آیتم را حذف کند.
- مهمان و غیرمدیر کنش‌های غیرمجاز نگیرند.

---

### Task 1: رفتار تب‌ها و مدیریت کلید

**Files:** `test/authButton.test.tsx`, `app/components/AuthButton.tsx`, `app/progress.ts`

**Interfaces:** Consumes `loadGeminiKey()`/`saveGeminiKey(value)`؛ produces تب‌های دسترس‌پذیر و ذخیره/پاک‌کردن صریح.

- [ ] تست‌های تغییر تب، بازگشت به فعالیت، عدم ذخیره هنگام تایپ، ذخیره، لغو پاک‌کردن و پاک‌کردن تأییدشده را بنویس.
- [ ] `npx vitest run test/authButton.test.tsx` را اجرا و شکست مورد انتظار را ببین.
- [ ] حذف مقدار خالی را در `saveGeminiKey` با الگوی `saveOpenRouterKey` پیاده‌سازی کن.
- [ ] حداقل state و markup لازم را در `UserMenu` پیاده‌سازی کن؛ پاک‌کردن از `window.confirm` استفاده کند.
- [ ] تست فایل را سبز کن.

### Task 2: چیدمان واکنش‌گرا و دسترس‌پذیری

**Files:** `app/components/AuthButton.tsx`, `app/styles.css`, `test/authButton.test.tsx`

**Interfaces:** Consumes state Task 1؛ produces popover بخش‌بندی‌شده وب و bottom sheet موبایل.

- [ ] تست نقش‌های `tablist`/`tab`/`tabpanel` و باقی‌ماندن کنش‌ها را بنویس و شکست را ببین.
- [ ] CSS وب با عرض حداکثر ۴۴۰ پیکسل و اسکرول داخلی و CSS موبایل fixed bottom sheet را پیاده‌سازی کن.
- [ ] `npx vitest run test/authButton.test.tsx test/supportPages.test.tsx test/clueAiDialog.test.tsx` و `npm run typecheck` را سبز کن.

### Task 3: بازبینی تصویری و اصلاح

**Files:** در صورت نیاز `app/components/AuthButton.tsx`, `app/styles.css`؛ تصاویر خارج repo.

**Interfaces:** Consumes build Task 2؛ produces تصاویر واقعی و یک دور اصلاح.

- [ ] برنامه را اجرا کن و منوی واقعی را باز کن.
- [ ] از `1440×900` و `390×844` تصویر بگیر و هر دو تب را ثبت کن.
- [ ] overflow، RTL، sheet، کنش‌ها، تب فعال، فاصله و کنتراست را بررسی و فقط ایراد مشاهده‌شده را اصلاح کن.
- [ ] `npm run typecheck`, `npm test`, `npm run build` را اجرا کن.
