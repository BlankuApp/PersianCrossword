# انتقال آیکون به پروژهٔ اندروید

## ساده‌ترین راه: Image Asset Studio (اندروید استودیو)
1. روی `res` راست‌کلیک → **New → Image Asset**.
2. Icon Type: **Launcher Icons (Adaptive and Legacy)**.
3. تب **Foreground Layer** → Asset Type: Image → فایل `ic_launcher_foreground.png` را انتخاب کنید. با اسلایدر Resize طرح را داخل ناحیهٔ امن نگه دارید.
4. تب **Background Layer** → Asset Type: Image → `ic_launcher_background.png` (یا Color: `#1E2A23`).
5. Next → Finish. تمام سایزهای mipmap خودکار ساخته می‌شود.

## آیکون فروشگاه Play
`play_store_icon_512.png` را در Play Console بخش Store listing آپلود کنید (۵۱۲×۵۱۲، بدون گوشهٔ گرد — گوگل خودش گرد می‌کند).

## فایل‌ها
- `ic_launcher_foreground.png` — ۱۰۲۴×۱۰۲۴، پس‌زمینهٔ شفاف
- `ic_launcher_background.png` — ۱۰۲۴×۱۰۲۴، سبز تخت با خطوط جدول
- `play_store_icon_512.png` — ۵۱۲×۵۱۲، ترکیب‌شده، مربع کامل
