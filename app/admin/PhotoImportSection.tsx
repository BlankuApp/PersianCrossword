import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import type { PhotoKind, PuzzleVariant } from "../../functions/src/photoFormat";
import { loadOpenRouterKey, saveOpenRouterKey } from "../progress";
import { PublishMetaFields, withPublishMeta, type PublishMeta } from "../components/PublishMetaFields";
import { PersianNumberInput } from "../components/PersianNumberInput";
import { localizeInputDigits, toAsciiDigits, toPersianDigits } from "../persianNumbers";
import { createDraft } from "./adminApi";
import { AdminHelp } from "./AdminHelp";
import { ImageCropper } from "./ImageCropper";
import { isValidPuzzleId, planImport, type ImportFile } from "./importPlan";
import { extractedGrid, photoPuzzle, reviewClues } from "./photoImport";
import { REASONING_EFFORTS, extractOpenRouterPhoto, type ReasoningEffort } from "./openRouterPhoto";
import { loadPhotoSettings, saveAdminSettings } from "./adminSettings";

const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

export function PhotoImportSection({ takenIds }: { takenIds: ReadonlySet<string> }) {
  const fieldId = useId();
  const [initial] = useState(loadPhotoSettings);
  const [apiKey, setApiKey] = useState(loadOpenRouterKey);
  const [model, setModel] = useState(initial.model);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(initial.reasoningEffort);
  const [settingsError, setSettingsError] = useState("");
  const [keyError, setKeyError] = useState("");
  const [clueImage, setClueImage] = useState<string | null>(null);
  const [gridImage, setGridImage] = useState<string | null>(null);
  const [clueText, setClueText] = useState("");
  const [gridText, setGridText] = useState("");
  const [rows, setRows] = useState(initial.rows);
  const [cols, setCols] = useState(initial.cols);
  const [variant, setVariant] = useState<PuzzleVariant>(initial.variant);
  const [puzzleNumber, setPuzzleNumber] = useState(initial.puzzleNumber);
  const [id, setId] = useState(initial.id);
  const [meta, setMeta] = useState<PublishMeta>(initial.meta);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState("");
  const [cellError, setCellError] = useState("");
  const gridEditor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const saved = saveAdminSettings({ photo: { model, reasoningEffort, rows, cols, variant, puzzleNumber, id, meta } });
    setSettingsError(saved ? "" : "مرورگر اجازهٔ ذخیرهٔ تنظیمات را نداد؛ تنظیمات تا بستن صفحه قابل استفاده‌اند.");
  }, [model, reasoningEffort, rows, cols, variant, puzzleNumber, id, meta]);
  useEffect(() => { setCellError(""); }, [gridText]);
  const changeClues = useCallback((image: string | null) => { setClueImage(image); setClueText(""); setSavedId(""); }, []);
  const changeGrid = useCallback((image: string | null) => { setGridImage(image); setGridText(""); setSavedId(""); }, []);
  const validSize = Number.isInteger(rows) && Number.isInteger(cols) && rows >= 1 && cols >= 1 && rows <= 60 && cols <= 60;
  const validNumber = puzzleNumber === "" || /^[0-9۰-۹٠-٩]{1,8}$/.test(puzzleNumber);
  const clueReview = useMemo(() => clueText && validSize ? reviewClues(clueText, rows, cols) : null, [clueText, rows, cols, validSize]);
  const gridReview = useMemo(() => {
    if (!gridText || !validSize) return { grid: null, error: "" };
    try { return { grid: extractedGrid(JSON.parse(gridText), rows, cols), error: "" }; }
    catch (e) { return { grid: null, error: e instanceof SyntaxError ? "قالب JSON جدول معتبر نیست؛ نشانه‌ها و گیومه‌ها را بررسی کنید." : errorText(e) }; }
  }, [gridText, rows, cols, validSize]);
  const review = useMemo(() => {
    if (!clueReview?.clues || !gridReview.grid) return { json: null, error: "" };
    try { return { json: photoPuzzle(clueText, gridText, rows, cols), error: "" }; }
    catch (e) { return { json: null, error: errorText(e) }; }
  }, [clueText, gridText, rows, cols, clueReview, gridReview]);
  const validId = isValidPuzzleId(id.trim());
  const taken = takenIds.has(id.trim());

  function editCell(row: number, col: number, value: string) {
    if (!gridReview.grid || busy) return;
    const grid = gridReview.grid.map((cells) => [...cells]);
    grid[row]![col] = value;
    try {
      const normalized = extractedGrid({ grid }, rows, cols);
      setGridText(JSON.stringify({ grid: normalized }, null, 2)); setSavedId(""); setCellError("");
    } catch (e) { setCellError(errorText(e)); }
  }

  async function save() {
    if (!review.json || !clueImage || !gridImage || !validId || !validNumber || taken) return;
    setBusy(true); setMessage("");
    try {
      const slug = id.trim();
      const json = withPublishMeta({ ...review.json, meta: {
        id: slug, sourceFile: `${slug}-clues.png`, size: { rows, cols }, language: "fa", direction: "rtl",
      } }, { ...meta, title: meta.title.trim() || (puzzleNumber ? `جدول ${puzzleNumber}` : "") });
      const imageFile = (name: string, image: string): ImportFile => ({ name, bytes: Uint8Array.from(atob(image.split(",")[1]!), (c) => c.charCodeAt(0)) });
      const files: ImportFile[] = [
        { name: `${slug}.json`, bytes: new TextEncoder().encode(JSON.stringify(json, null, 2)) },
        imageFile(`${slug}.png`, gridImage), imageFile(`${slug}-clues.png`, clueImage),
      ];
      const plan = planImport(files, takenIds);
      if (plan.problems.length || !plan.drafts[0]) throw new Error(plan.problems.join("\n"));
      await createDraft(plan.drafts[0]);
      setSavedId(slug);
    } catch (e) { setMessage(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="admin-section" aria-labelledby="admin-photo-title">
      <h2 id="admin-photo-title">ساخت جدول با هوش‌واره <AdminHelp label="ساخت با هوش‌واره">ستون‌های پرسش‌ها را از تصویر اول به ترتیب خواندن انتخاب کنید و خود جدول پاسخ را از تصویر دوم برش بزنید. OpenRouter هر تصویر را جداگانه استخراج می‌کند. نتیجه‌ها را بررسی و اصلاح کنید، سپس پیش‌نویس بسازید. استخراج ممکن است چند دقیقه طول بکشد.</AdminHelp></h2>
      <p className="admin-note">انتخاب تصویر و برش ← استخراج پرسش‌ها و جدول ← بررسی و ساخت پیش‌نویس</p>
      {settingsError ? <p className="admin-error" role="alert">{settingsError}</p> : null}
      <div className="publish-meta-fields photo-credentials">
        <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-key`}>کلید API در OpenRouter</label> <AdminHelp label="کلید OpenRouter">کلید در localStorage همین مرورگر ذخیره و دوباره بازیابی می‌شود. برای حذف آن، فیلد کلید را خالی کنید. کلید در JSON یا پیش‌نویس ذخیره نمی‌شود.</AdminHelp></span><input id={`${fieldId}-key`} aria-label="کلید API در OpenRouter" type="password" dir="ltr" autoComplete="off" spellCheck={false} value={apiKey} disabled={busy} placeholder="sk-or-…" onChange={(e) => {
          const key = e.target.value.trim(); setApiKey(key);
          try { saveOpenRouterKey(key); setKeyError(""); }
          catch { setKeyError("مرورگر اجازهٔ ذخیرهٔ کلید را نداد؛ کلید برای این بار قابل استفاده است."); }
        }} /></div>
        <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-model`}>مدل OpenRouter</label> <AdminHelp label="مدل OpenRouter">شناسهٔ مدلی با پشتیبانی تصویر، JSON Schema و reasoning را وارد کنید. تصویر با جزئیات بالا خوانده می‌شود.</AdminHelp></span><input id={`${fieldId}-model`} aria-label="مدل OpenRouter" dir="ltr" autoComplete="off" spellCheck={false} value={model} disabled={busy} onChange={(e) => setModel(e.target.value)} /></div>
        <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-effort`}>میزان استدلال (Reasoning effort)</label> <AdminHelp label="میزان استدلال">این تنظیم برای استخراج پرسش‌ها و جدول استفاده می‌شود. سطح بیشتر ممکن است زمان و هزینهٔ استخراج را افزایش دهد. تأثیر و پشتیبانی سطح‌ها به مدل انتخاب‌شده بستگی دارد.</AdminHelp></span><select id={`${fieldId}-effort`} value={reasoningEffort} disabled={busy} onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}>{REASONING_EFFORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      </div>
      {keyError ? <p className="admin-error" role="alert">{keyError}</p> : null}
      <div className="photo-coordinates">
        <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-variant`}>نوع شرح</label> <AdminHelp label="نوع شرح">عادی و ویژه را جداگانه وارد کنید؛ تنها بخش‌های همان نوع را انتخاب کنید. تغییر نوع، کادرها و نتیجه‌ها را پاک می‌کند ولی تصاویر باقی می‌مانند.</AdminHelp></span><select id={`${fieldId}-variant`} aria-label="نوع شرح" value={variant} disabled={busy} onChange={(e) => {
          const next = e.target.value as PuzzleVariant;
          setVariant(next); setClueText(""); setGridText(""); setSavedId(""); setMessage("");
          setMeta((old) => ({ ...old, difficulty: next === "special" ? "ویژه" : "عادی" }));
        }}><option value="normal">عادی</option><option value="special">ویژه</option></select></div>
        <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-number`}>شمارهٔ جدول (اختیاری)</label> <AdminHelp label="شمارهٔ جدول">شمارهٔ روی پاسخ را با پرسش‌ها تطبیق دهید؛ پاسخ ممکن است پایین صفحهٔ روز بعد باشد. شمارهٔ بالای صفحه لزوماً شمارهٔ پاسخ‌های پایین آن نیست.</AdminHelp></span><input id={`${fieldId}-number`} aria-label="شمارهٔ جدول (اختیاری)" inputMode="numeric" maxLength={8} value={puzzleNumber} disabled={busy} placeholder="مثلاً ۸۰۵۰" onChange={(e) => { setPuzzleNumber(localizeInputDigits(e.currentTarget).trim()); setClueText(""); setGridText(""); setSavedId(""); }} /></div>
        <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-rows`}>تعداد ردیف‌ها</label> <AdminHelp label="ابعاد و شمار پرسش‌ها">در جدول ۱۵×۱۵، دقیقاً ۱۵ گروه افقی و ۱۵ گروه عمودی لازم است؛ هر گروه می‌تواند چند پرسش داشته باشد. بعد از استخراج، تعداد پرسش‌های هر گروه با جای واژه‌ها در شبکه هم بررسی می‌شود.</AdminHelp></span><PersianNumberInput id={`${fieldId}-rows`} aria-label="تعداد ردیف‌ها" min={1} max={60} value={rows} disabled={busy} onValueChange={(value) => { setRows(value); setSavedId(""); }} /></div>
        <label>تعداد ستون‌ها<PersianNumberInput min={1} max={60} value={cols} disabled={busy} onValueChange={(value) => { setCols(value); setSavedId(""); }} /></label>
      </div>
      {!validSize ? <p className="admin-error">ابعاد جدول را از ۱ تا ۶۰ وارد کنید.</p> : null}
      {!validNumber ? <p className="admin-error">شمارهٔ جدول باید فقط رقم باشد.</p> : null}
      <div className="photo-import-columns">
        <div>
          <h3>۱. تصویر پرسش‌ها <AdminHelp label="تصویر پرسش‌ها">چند کادر دور ستون‌های مربوط به شرح انتخاب‌شده بکشید. برش‌ها به ترتیب از بالا به پایین در یک ستون چیده می‌شوند؛ سطرهای ادامه را کامل داخل کادر بگذارید.</AdminHelp></h3>
          <ImageCropper multiple disabled={busy} onChange={changeClues} resetKey={variant} />
          <ExtractPhoto apiKey={apiKey} model={model} reasoningEffort={reasoningEffort} kind="clues" image={clueImage} rows={rows} cols={cols} variant={variant} puzzleNumber={puzzleNumber} busy={busy} setBusy={setBusy} hasResult={!!clueText} onResult={(text) => { setClueText(text); setSavedId(""); }} />
          <label className="photo-result">پرسش‌های استخراج‌شده (قابل ویرایش)
            <textarea dir="ltr" value={clueText} disabled={busy} onChange={(e) => { setClueText(e.target.value); setSavedId(""); }} placeholder={'{"clues":{"horizontal":{"1":["پرسش"]},"vertical":{"1":["پرسش"]}}}'} />
          </label>
          {clueReview ? <>
            <ul className="admin-note" aria-label="بررسی پرسش‌ها">
              <li>اعتبار قالب و شماره‌ها: {clueReview.clues ? "درست" : "نیاز به اصلاح"}</li>
              <li>گروه‌های افقی: <bdi>{toPersianDigits(clueReview.counts.horizontal)}/{toPersianDigits(rows)}</bdi></li>
              <li>گروه‌های عمودی: <bdi>{toPersianDigits(clueReview.counts.vertical)}/{toPersianDigits(cols)}</bdi></li>
            </ul>
            {clueReview.error ? <p className="admin-error" role="alert">{toPersianDigits(clueReview.error)}{"\n"}نتیجه را اصلاح کنید یا دوباره استخراج کنید.</p> : null}
          </> : null}
        </div>
        <div>
          <h3>۲. تصویر جدول پاسخ <AdminHelp label="تصویر جدول پاسخ">از پاسخِ دارای حروف استفاده کنید و فقط خود شبکه را بدون شماره‌های حاشیه و نوار عنوان برش بزنید. هر خانه یک حرف فارسی یا رشتهٔ خالی دارد؛ رشتهٔ خالی در پیش‌نویس خانهٔ سیاه است.</AdminHelp></h3>
          <ImageCropper multiple={false} disabled={busy} onChange={changeGrid} resetKey={variant} />
          <ExtractPhoto apiKey={apiKey} model={model} reasoningEffort={reasoningEffort} kind="grid" image={gridImage} rows={rows} cols={cols} variant={variant} puzzleNumber={puzzleNumber} busy={busy} setBusy={setBusy} hasResult={!!gridText} onResult={(text) => { setGridText(text); setSavedId(""); }} />
          <label className="photo-result">جدول استخراج‌شده (قابل ویرایش)
            <textarea dir="ltr" value={gridText} disabled={busy} onChange={(e) => { setGridText(e.target.value); setSavedId(""); }} placeholder={'{"grid":[["ا","","ب"]]}'} />
          </label>
          {gridReview.grid ? <p className="admin-note" role="status">قالب جدول، ابعاد {toPersianDigits(rows)}×{toPersianDigits(cols)} و تک‌حرفی بودن خانه‌ها درست است.</p> : null}
          {gridReview.error ? <p className="admin-error" role="alert">{toPersianDigits(gridReview.error)}{"\n"}نتیجه را اصلاح کنید یا دوباره استخراج کنید.</p> : null}
        </div>
      </div>
      {review.json ? <>
        <p className="admin-note" role="status">اندازهٔ جدول و تعداد پرسش‌ها هماهنگ است؛ پیش از ذخیره، حروف و متن را با تصاویر بررسی کنید.</p>
      </> : null}
      {gridReview.grid ? <div className="photo-grid-editor">
        <h3>ویرایش خانه‌های جدول <AdminHelp label="ویرایش خانه‌های جدول">روی هر خانه کلیک کنید و یک حرف فارسی بنویسید؛ خالی کردن خانه آن را سیاه می‌کند. ردیف‌ها از بالا به پایین و ستون‌ها از چپ به راست در JSON ذخیره می‌شوند. کلیدهای جهت برای رفتن به خانه‌های کناری هستند. هر تغییر، JSON و بررسی تعداد پرسش‌ها را به‌روز می‌کند.</AdminHelp></h3>
        <div className="admin-draft-actions">
          <button type="button" className="admin-button" disabled={busy} onClick={() => {
            setGridText(JSON.stringify({ grid: gridReview.grid!.map((row) => [...row].reverse()) }, null, 2)); setSavedId("");
          }}>برعکس کردن چپ و راست</button>
          <AdminHelp label="برعکس کردن چپ و راست">اگر شبکه نسبت به عکس آینه‌ای شده، این دکمه ترتیب خانه‌های هر ردیف را برعکس می‌کند. JSON و بررسی پرسش‌ها هم به‌روز می‌شوند. زدن دوباره، شبکه را به حالت قبل برمی‌گرداند.</AdminHelp>
        </div>
        <div ref={gridEditor} className="photo-grid-preview" dir="ltr" role="group" aria-label="ویرایش خانه‌های جدول" style={{ gridTemplateColumns: `repeat(${cols}, 2.2em)` }}>
          {gridReview.grid.flatMap((row, r) => row.map((letter, c) => <input key={`${r},${c}`} aria-label={`خانهٔ ردیف ${toPersianDigits(r + 1)} ستون ${toPersianDigits(c + 1)} از چپ`} className={letter ? "" : "photo-grid-block"} value={letter} disabled={busy} autoComplete="off" spellCheck={false} onFocus={(e) => e.currentTarget.select()} onChange={(e) => editCell(r, c, e.target.value)} onKeyDown={(e) => {
            const nextRow = r + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0);
            const nextCol = c + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0);
            if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
            e.preventDefault();
            if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) gridEditor.current?.querySelectorAll<HTMLInputElement>("input")[nextRow * cols + nextCol]?.focus();
          }} />))}
        </div>
        {cellError ? <p className="admin-error" role="alert">{toPersianDigits(cellError)}</p> : null}
      </div> : null}
      {review.error ? <p className="admin-error" role="alert">بررسی نهایی پرسش‌ها و جای واژه‌ها در جدول انجام نشد؛ نتیجه را اصلاح یا دوباره استخراج کنید:{"\n"}{toPersianDigits(review.error)}</p> : null}
      <div className="publish-meta-fields">
        <label>شناسهٔ جدول<input value={toPersianDigits(id)} disabled={busy} onChange={(e) => { setId(toAsciiDigits(localizeInputDigits(e.currentTarget))); setSavedId(""); }} placeholder={variant === "special" ? "مثلاً ۸۰۵۰-special" : "مثلاً ۸۰۵۰-normal"} /></label>
        {id && (!validId || taken) && !savedId ? <p className="admin-error">{taken ? "این شناسه قبلاً استفاده شده است." : "شناسهٔ کوتاه و بدون نقطه، / یا نویسه‌های ویژهٔ نام فایل وارد کنید."}</p> : null}
      </div>
      <PublishMetaFields meta={meta} onChange={setMeta} disabled={busy} />
      <button type="button" className="admin-button admin-button-primary" disabled={busy || !validSize || !validNumber || !review.json || !validId || taken || !clueImage || !gridImage || !!savedId} onClick={() => void save()}>{busy ? "در حال پردازش…" : "ساخت پیش‌نویس از نتیجه"}</button>
      {message ? <p className="admin-error" role="alert">{message}</p> : null}
      {savedId ? <p className="admin-note" role="status">پیش‌نویس ساخته شد. <a href={`#/admin/draft/${encodeURIComponent(savedId)}`}>باز کردن برای حل و ویرایش</a></p> : null}
    </section>
  );
}

function ExtractPhoto({ apiKey, model, reasoningEffort, kind, image, rows, cols, variant, puzzleNumber, busy, setBusy, hasResult, onResult }: {
  apiKey: string; model: string; reasoningEffort: ReasoningEffort;
  kind: PhotoKind; image: string | null; rows: number; cols: number; variant: PuzzleVariant; puzzleNumber: string; busy: boolean;
  setBusy: (busy: boolean) => void; hasResult: boolean; onResult: (text: string) => void;
}) {
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => { setMessage(""); }, [apiKey, model, reasoningEffort, image, rows, cols, variant, puzzleNumber]);

  async function run() {
    if (!image || !apiKey.trim() || !model.trim()) return;
    request.current = new AbortController();
    setBusy(true); setMessage("در حال خواندن تصویر و استخراج با OpenRouter…");
    try {
      const result = await extractOpenRouterPhoto({ apiKey, model, reasoningEffort, kind, image, rows, cols, variant, puzzleNumber }, request.current.signal);
      if (!mounted.current) return;
      onResult(JSON.stringify(result, null, 2)); setMessage("استخراج انجام شد؛ نتیجه را بررسی و در صورت نیاز اصلاح کنید.");
    } catch (e) { if (mounted.current) setMessage(errorText(e)); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <div className="photo-extract">
    <button type="button" className="admin-button admin-button-primary" disabled={busy || !apiKey.trim() || !model.trim() || !image || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 60 || cols > 60 || (puzzleNumber !== "" && !/^[0-9۰-۹٠-٩]{1,8}$/.test(puzzleNumber))} onClick={() => void run()}>{hasResult ? kind === "clues" ? "استخراج دوبارهٔ پرسش‌ها" : "استخراج دوبارهٔ جدول" : kind === "clues" ? "استخراج پرسش‌ها" : "استخراج جدول"}</button>
    {message ? <p className="admin-note" role="status">{message}</p> : null}
  </div>;
}
