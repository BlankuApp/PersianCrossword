import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { Check, Hand, Move, Scan, X, ZoomIn, ZoomOut } from "lucide-react";
import { AdminHelp } from "./AdminHelp";
import { PersianNumberInput } from "../components/PersianNumberInput";
import { toPersianDigits } from "../persianNumbers";
import { boxFromPoints, composeCrops, type CropBox } from "./photoImport";

type Drag = { x: number; y: number; pointerId: number } & (
  { mode: "draw" } | { mode: "pan"; left: number; top: number; clientX: number; clientY: number }
  | { mode: "move" | "resize"; index: number; box: CropBox }
);

export function ImageCropper({ multiple, disabled, onChange, resetKey = "" }: {
  multiple: boolean; disabled: boolean; onChange: (image: string | null) => void; resetKey?: string;
}) {
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [boxes, setBoxes] = useState<CropBox[]>([]);
  const [drawing, setDrawing] = useState<CropBox | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<"draw" | "pan" | "adjust">("draw");
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const closing = useRef<Animation | null>(null);

  useEffect(() => { setBoxes([]); setDrawing(null); setActive(0); drag.current = null; }, [resetKey]);
  useEffect(() => {
    const modal = dialog.current;
    if (!modal || !editing) return;
    modal.showModal();
    modal.querySelector<HTMLButtonElement>(".photo-crop-close")?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (closing.current) { closing.current.onfinish = null; closing.current.cancel(); closing.current = null; }
      modal.close(); document.body.style.overflow = overflow;
    };
  }, [editing, photo]);

  useEffect(() => {
    setPhoto(null); setBoxes([]); setDrawing(null); setError(""); setEditing(false); setZoom(100); setMode("draw"); setActive(0); drag.current = null;
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
      setError("تصویر PNG، JPG یا WebP تا ۲۰ مگابایت انتخاب کنید."); return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      if (image.naturalWidth * image.naturalHeight > 40_000_000) { setError("ابعاد تصویر خیلی بزرگ است."); return; }
      setPhoto(image);
    };
    image.onerror = () => { if (!cancelled) setError("خواندن تصویر انجام نشد؛ فایل دیگری انتخاب کنید."); };
    image.src = url;
    return () => { cancelled = true; URL.revokeObjectURL(url); };
  }, [file]);

  useEffect(() => {
    setPreview(null); onChange(null);
    if (!photo || !boxes.length) return;
    try {
      const image = composeCrops(photo, boxes);
      setPreview(image); onChange(image); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [photo, boxes, onChange]);

  function point(e: PointerEvent<HTMLDivElement>) {
    const bounds = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - bounds.left) * photo!.naturalWidth / bounds.width, y: (e.clientY - bounds.top) * photo!.naturalHeight / bounds.height };
  }

  function start(e: PointerEvent<HTMLDivElement>) {
    if (disabled || !photo || e.button !== 0 || drag.current) return;
    e.preventDefault();
    const p = point(e), base = { ...p, pointerId: e.pointerId };
    if (mode === "pan" && viewport.current) {
      drag.current = { ...base, mode: "pan", left: viewport.current.scrollLeft, top: viewport.current.scrollTop, clientX: e.clientX, clientY: e.clientY };
    } else if (mode === "adjust") {
      const margin = 12 * photo.naturalWidth / e.currentTarget.getBoundingClientRect().width;
      const hit = [...boxes.entries()].reverse().find(([, b]) => p.x >= b.x - margin && p.x <= b.x + b.width + margin && p.y >= b.y - margin && p.y <= b.y + b.height + margin);
      if (!hit) return;
      const [index, box] = hit;
      const resize = Math.abs(p.x - box.x - box.width) < margin && Math.abs(p.y - box.y - box.height) < margin;
      drag.current = { ...base, mode: resize ? "resize" : "move", index, box };
      setActive(index); setDrawing(box);
    } else {
      drag.current = { ...base, mode: "draw" };
      setDrawing(boxFromPoints(p, p, photo.naturalWidth, photo.naturalHeight));
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function nextBox(e: PointerEvent<HTMLDivElement>): CropBox | null {
    const d = drag.current;
    if (!photo || !d || d.pointerId !== e.pointerId) return null;
    if (d.mode === "pan") {
      if (viewport.current) { viewport.current.scrollLeft = d.left + d.clientX - e.clientX; viewport.current.scrollTop = d.top + d.clientY - e.clientY; }
      return null;
    }
    const p = point(e);
    if (d.mode === "draw") return boxFromPoints(d, p, photo.naturalWidth, photo.naturalHeight);
    if (d.mode === "move") return { ...d.box,
      x: Math.round(Math.max(0, Math.min(photo.naturalWidth - d.box.width, d.box.x + p.x - d.x))),
      y: Math.round(Math.max(0, Math.min(photo.naturalHeight - d.box.height, d.box.y + p.y - d.y))),
    };
    return { ...d.box,
      width: Math.round(Math.min(photo.naturalWidth - d.box.x, Math.max(4, d.box.width + p.x - d.x))),
      height: Math.round(Math.min(photo.naturalHeight - d.box.y, Math.max(4, d.box.height + p.y - d.y))),
    };
  }

  function finish(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!photo || !d || d.pointerId !== e.pointerId) return;
    const box = nextBox(e);
    if (box) {
      if (d.mode === "draw" && box.width >= 4 && box.height >= 4) { setBoxes((old) => multiple ? [...old, box] : [box]); setActive(multiple ? boxes.length : 0); }
      else if (d.mode === "move" || d.mode === "resize") setBoxes((old) => old.map((b, i) => i === d.index ? box : b));
    }
    drag.current = null; setDrawing(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function edit(index: number, field: keyof CropBox, value: number) {
    if (!photo || !Number.isFinite(value)) return;
    setActive(index);
    setBoxes((old) => old.map((b, i) => {
      if (i !== index) return b;
      const next = { ...b, [field]: Math.round(value) };
      next.x = Math.max(0, Math.min(photo.naturalWidth - 1, next.x));
      next.y = Math.max(0, Math.min(photo.naturalHeight - 1, next.y));
      next.width = Math.max(1, Math.min(photo.naturalWidth - next.x, next.width));
      next.height = Math.max(1, Math.min(photo.naturalHeight - next.y, next.height));
      return next;
    }));
  }

  function move(index: number, offset: number) {
    setActive(index + offset);
    setBoxes((old) => {
      const next = [...old];
      [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
      return next;
    });
  }

  function changeZoom(value: number) { setZoom(Math.max(25, Math.min(400, Math.round(value)))); }
  function closeEditor() {
    if (closing.current) return;
    const modal = dialog.current;
    if (!modal?.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setEditing(false); return; }
    // Transitions.dev modal recipe: keep the native dialog open until its 150ms exit finishes.
    closing.current = modal.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.96)" }],
      { duration: 150, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
    closing.current.onfinish = () => setEditing(false);
  }
  const displayBoxes = drawing && drag.current?.mode === "draw" ? [...boxes, drawing]
    : boxes.map((box, index) => drawing && drag.current && "index" in drag.current && drag.current.index === index ? drawing : box);

  return (
    <div className="photo-cropper">
      <label className="admin-button admin-file-picker">
        انتخاب تصویر
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={(e) => { const next = e.target.files?.[0]; if (next) setFile(next); e.target.value = ""; }} />
      </label>
      {file ? <span className="admin-note">{file.name}</span> : null}
      {photo ? <>
        <button type="button" className="photo-open-editor" disabled={disabled} onClick={() => setEditing(true)}>
          <img src={photo.src} alt={multiple ? "تصویر پرسش‌ها" : "تصویر جدول پاسخ"} />
          <span><Scan size={19} aria-hidden="true" />ویرایش برش‌ها در صفحهٔ بزرگ</span>
          <small>{boxes.length ? `${boxes.length.toLocaleString("fa-IR")} کادر انتخاب شده` : "برای انتخاب کادرها کلیک کنید"}</small>
        </button>
        <dialog ref={dialog} className="photo-crop-dialog" dir="rtl" aria-labelledby={`${id}-title`} onCancel={(e) => { e.preventDefault(); closeEditor(); }} onClose={() => { setEditing(false); drag.current = null; setDrawing(null); }}>
          <header className="photo-crop-header">
            <h2 id={`${id}-title`}>{multiple ? "برش ستون‌های پرسش‌ها" : "برش جدول پاسخ"}</h2>
            <AdminHelp label="برش تصویر">{multiple ? "با کشیدن ماوس کادرها را به ترتیب خواندن انتخاب کنید. کادر اول بالای ستون نهایی قرار می‌گیرد؛ ترتیب را از فهرست تغییر دهید. مختصات بر حسب پیکسل تصویر اصلی هستند." : "فقط خود شبکهٔ پاسخ را بدون شماره‌های حاشیه و عنوان انتخاب کنید. کادر تازه جای قبلی را می‌گیرد. برای تنظیم دقیق از مختصات یا ابزار تنظیم کادر استفاده کنید."}</AdminHelp>
            <button type="button" className="admin-button photo-crop-close" aria-label="بستن ابزار برش" onClick={closeEditor}><X size={20} aria-hidden="true" /></button>
          </header>
          <div className="photo-crop-toolbar">
            <div className="photo-crop-modes" role="group" aria-label="ابزار برش">
              <button type="button" className="admin-button" aria-pressed={mode === "draw"} onClick={() => setMode("draw")}><Scan size={16} aria-hidden="true" />کشیدن کادر</button>
              <button type="button" className="admin-button" aria-pressed={mode === "pan"} onClick={() => setMode("pan")}><Hand size={16} aria-hidden="true" />جابه‌جایی تصویر</button>
              <button type="button" className="admin-button" aria-pressed={mode === "adjust"} onClick={() => setMode("adjust")}><Move size={16} aria-hidden="true" />تنظیم کادر</button>
              <AdminHelp label="تنظیم کادر">روی کادر بکشید تا جابه‌جا شود؛ گوشهٔ پایین راست آن را بکشید تا اندازه تغییر کند. در بزرگ‌نمایی بالا، از ابزار جابه‌جایی تصویر برای دیدن بخش‌های دیگر استفاده کنید.</AdminHelp>
            </div>
            <div className="photo-crop-zoom">
              <button type="button" className="admin-button" aria-label="کوچک‌نمایی" disabled={zoom <= 25} onClick={() => changeZoom(zoom - 25)}><ZoomOut size={17} aria-hidden="true" /></button>
              <label>بزرگ‌نمایی<input type="range" min="25" max="400" step="1" value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} /></label>
              <output>{zoom.toLocaleString("fa-IR")}٪</output>
              <button type="button" className="admin-button" aria-label="بزرگ‌نمایی بیشتر" disabled={zoom >= 400} onClick={() => changeZoom(zoom + 25)}><ZoomIn size={17} aria-hidden="true" /></button>
              <button type="button" className="admin-button" onClick={() => { changeZoom(100); viewport.current?.scrollTo?.(0, 0); }}>تناسب با عرض</button>
              <button type="button" className="admin-button" onClick={() => { if (viewport.current?.clientWidth) changeZoom(photo.naturalWidth * 100 / viewport.current.clientWidth); }}>اندازهٔ اصلی</button>
            </div>
          </div>
          <div className="photo-crop-workspace">
            <div className="photo-crop-viewport" ref={viewport} dir="ltr">
              <div className={`photo-crop-surface photo-crop-${mode}`} style={{ width: `${zoom}%` }} onPointerDown={start} onPointerMove={(e) => {
                const next = nextBox(e); if (next) setDrawing(next);
              }} onPointerUp={finish} onPointerCancel={() => { drag.current = null; setDrawing(null); }} onLostPointerCapture={() => { drag.current = null; setDrawing(null); }}>
                <img src={photo.src} alt={multiple ? "تصویر پرسش‌ها برای برش" : "تصویر جدول برای برش"} draggable={false} />
                <svg viewBox={`0 0 ${photo.naturalWidth} ${photo.naturalHeight}`} aria-hidden="true">
                  {displayBoxes.map((b, i) => <g key={i} className={i === active ? "photo-crop-active" : ""}>
                    <rect x={b.x} y={b.y} width={b.width} height={b.height} vectorEffect="non-scaling-stroke" />
                    <text x={b.x + 4} y={b.y + Math.max(18, photo.naturalWidth / 40)} fontSize={Math.max(18, photo.naturalWidth / 40)}>{toPersianDigits(i + 1)}</text>
                    {mode === "adjust" ? <rect className="photo-crop-handle" x={b.x + b.width - photo.naturalWidth / 140} y={b.y + b.height - photo.naturalWidth / 140} width={photo.naturalWidth / 70} height={photo.naturalWidth / 70} /> : null}
                  </g>)}
                </svg>
              </div>
            </div>
            <aside className="photo-crop-settings" aria-label="تنظیم کادرها">
              <h3>کادرها <span className="admin-tab-count">{boxes.length.toLocaleString("fa-IR")}</span></h3>
              <div className="admin-draft-actions">
                <button type="button" className="admin-button" disabled={disabled} onClick={() => { setActive(multiple ? boxes.length : 0); setBoxes((old) => {
                  const whole = { x: 0, y: 0, width: photo.naturalWidth, height: photo.naturalHeight };
                  return multiple ? [...old, whole] : [whole];
                }); }}>افزودن کادر کامل</button>
                <button type="button" className="admin-button" disabled={disabled || !boxes.length} onClick={() => { setBoxes([]); setActive(0); }}>پاک کردن کادرها</button>
                <button type="button" className="admin-button" disabled={disabled || !boxes.length} onClick={() => { setBoxes((old) => old.slice(0, -1)); setActive(Math.max(0, boxes.length - 2)); }}>حذف آخرین کادر</button>
              </div>
              {!boxes.length ? <p className="admin-note">کادرها را روی تصویر بکشید یا یک کادر کامل اضافه کنید.</p> : null}
              <ol className="photo-crop-list">
                {boxes.map((box, i) => <li key={i} className={i === active ? "photo-crop-selected" : ""}>
                  <details>
                    <summary onClick={() => setActive(i)}>کادر {(i + 1).toLocaleString("fa-IR")} — {toPersianDigits(box.width)} × {toPersianDigits(box.height)}</summary>
                    <div className="photo-coordinates">
                      {([["x", "فاصله از چپ"], ["y", "فاصله از بالا"], ["width", "عرض"], ["height", "ارتفاع"]] as const).map(([field, label]) => <label key={field}>
                        {label} (پیکسل)
                        <PersianNumberInput min={field === "x" || field === "y" ? 0 : 1} max={field === "x" || field === "width" ? photo.naturalWidth : photo.naturalHeight} value={box[field]} disabled={disabled} onValueChange={(value) => edit(i, field, value)} />
                      </label>)}
                    </div>
                  </details>
                  <div className="admin-draft-actions">
                    {multiple ? <>
                      <button type="button" className="admin-button" aria-label={`انتقال کادر ${toPersianDigits(i + 1)} به بالا`} disabled={disabled || i === 0} onClick={() => move(i, -1)}>بالا</button>
                      <button type="button" className="admin-button" aria-label={`انتقال کادر ${toPersianDigits(i + 1)} به پایین`} disabled={disabled || i === boxes.length - 1} onClick={() => move(i, 1)}>پایین</button>
                    </> : null}
                    <button type="button" className="admin-button admin-button-danger" aria-label={`حذف کادر ${toPersianDigits(i + 1)}`} disabled={disabled} onClick={() => { setBoxes((old) => old.filter((_, n) => n !== i)); setActive(Math.max(0, i - 1)); }}>حذف</button>
                  </div>
                </li>)}
              </ol>
            </aside>
          </div>
          <footer className="photo-crop-footer">
            {error ? <p className="admin-error" role="alert">{error}</p> : <p className="admin-note">{multiple ? "کادرها از بالا به پایین در یک ستون چیده می‌شوند." : "تغییرات برش به‌صورت خودکار حفظ می‌شوند."}</p>}
            <button type="button" className="admin-button admin-button-primary" onClick={closeEditor}><Check size={17} aria-hidden="true" />پایان برش</button>
          </footer>
        </dialog>
      </> : null}
      {preview ? <details className="photo-preview" open>
        <summary>{multiple ? "پیش‌نمایش ستون نهایی" : "پیش‌نمایش جدول برش‌خورده"}</summary>
        <a className="admin-button" href={preview} download={multiple ? "clues.png" : "grid.png"}>دریافت تصویر</a>
        <div><img src={preview} alt={multiple ? "کادرهای پرسش‌ها به ترتیب از بالا به پایین" : "جدول برش‌خورده برای استخراج"} /></div>
      </details> : null}
      {error && !editing ? <p className="admin-error" role="alert">{error}</p> : null}
    </div>
  );
}
