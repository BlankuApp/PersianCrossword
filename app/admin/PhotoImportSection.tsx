import { useCallback, useEffect, useMemo, useRef, useState, useId, type KeyboardEvent, type ReactNode } from "react";
import { Check, Circle, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import type { PhotoKind, PuzzleVariant } from "../../functions/src/photoFormat";
import { loadOpenRouterKey, saveOpenRouterKey } from "../progress";
import { PuzzleMetaEditor } from "../components/PuzzleMetaEditor";
import { applyMetaForm, type MetaTextFields } from "../components/puzzleMeta";
import { PersianNumberInput } from "../components/PersianNumberInput";
import { localizeInputDigits, toPersianDigits } from "../persianNumbers";
import { createDraft } from "./adminApi";
import { AdminHelp } from "./AdminHelp";
import { ImageCropper } from "./ImageCropper";
import { isValidPuzzleId, planImport, type ImportFile } from "./importPlan";
import { extractedGrid, photoPuzzle, reviewClues } from "./photoImport";
import { REASONING_EFFORTS, extractOpenRouterPhoto, type ReasoningEffort } from "./openRouterPhoto";
import { loadPhotoSettings, saveAdminSettings } from "./adminSettings";

const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
const DIRECTIONS = [["horizontal", "افقی"], ["vertical", "عمودی"]] as const;
type Direction = (typeof DIRECTIONS)[number][0];
type View = "preview" | "json";
type StepState = "done" | "todo" | "problem";
// The extracted clue JSON as far as the preview can read it; groups that are not string arrays are shown as invalid.
type ClueDoc = { clues: Partial<Record<Direction, Record<string, unknown>>> };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isClueGroup = (value: unknown): value is string[] => Array.isArray(value) && value.every((c) => typeof c === "string");

function readClueDoc(text: string): ClueDoc | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || !isRecord(value.clues)) return null;
    const clues: ClueDoc["clues"] = {};
    for (const [dir] of DIRECTIONS) { const groups = value.clues[dir]; if (isRecord(groups)) clues[dir] = groups; }
    return { clues };
  } catch { return null; }
}

export function PhotoImportSection({ takenIds }: { takenIds: ReadonlySet<string> }) {
  const fieldId = useId();
  const [initial] = useState(loadPhotoSettings);
  const [apiKey, setApiKey] = useState(loadOpenRouterKey);
  const [model, setModel] = useState(initial.model);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(initial.reasoningEffort);
  const [settingsOpen, setSettingsOpen] = useState(() => !apiKey.trim() || !model.trim());
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
  const [meta, setMeta] = useState<MetaTextFields>(initial.meta);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState("");
  const [cellError, setCellError] = useState("");
  const [tab, setTab] = useState<PhotoKind>("clues");
  const [clueView, setClueView] = useState<View>("preview");
  const [gridView, setGridView] = useState<View>("preview");
  const [focusCell, setFocusCell] = useState<readonly [number, number] | null>(null);
  const gridEditor = useRef<HTMLDivElement>(null);
  const sections = useRef<(HTMLElement | null)[]>([]);
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
  const clueDoc = useMemo(() => clueText ? readClueDoc(clueText) : null, [clueText]);
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
  const clueCount = clueReview?.clues ? Object.values(clueReview.clues.horizontal).concat(Object.values(clueReview.clues.vertical)).reduce((n, g) => n + g.length, 0) : 0;
  const effortLabel = REASONING_EFFORTS.find(([value]) => value === reasoningEffort)?.[1] ?? reasoningEffort;

  // The first thing still missing, in the order the steps are done; shown beside the save button.
  const blocker = !validSize ? "ابعاد جدول را در مرحلهٔ ۱ درست کنید."
    : !validNumber ? "شمارهٔ جدول را در مرحلهٔ ۱ درست کنید."
    : !clueImage ? "تصویر پرسش‌ها را انتخاب و برش بزنید."
    : !clueText ? "پرسش‌ها را استخراج کنید."
    : !clueReview?.clues ? "پرسش‌های استخراج‌شده را اصلاح کنید."
    : !gridImage ? "تصویر جدول پاسخ را انتخاب و برش بزنید."
    : !gridText ? "جدول را استخراج کنید."
    : !gridReview.grid ? "جدول استخراج‌شده را اصلاح کنید."
    : !review.json ? "پرسش‌ها با جای واژه‌ها در جدول نمی‌خوانند؛ یکی را اصلاح کنید."
    : !id.trim() ? "شناسهٔ جدول را بنویسید."
    : !validId ? "شناسهٔ جدول معتبر نیست."
    : taken ? "این شناسه قبلاً استفاده شده؛ شناسهٔ دیگری بنویسید."
    : "";
  const steps: readonly [string, StepState][] = [
    ["مشخصات جدول", validSize && validNumber ? "done" : "problem"],
    ["پرسش‌ها", clueReview?.clues ? "done" : clueText ? "problem" : "todo"],
    ["جدول پاسخ", gridReview.grid ? "done" : gridText ? "problem" : "todo"],
    ["بررسی و ساخت", savedId ? "done" : review.error || (review.json && (!validId || taken)) ? "problem" : "todo"],
  ];

  function goToStep(index: number) {
    if (index === 1) setTab("clues");
    if (index === 2) setTab("grid");
    sections.current[Math.min(index, 2)]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function editCell(row: number, col: number, value: string) {
    if (!gridReview.grid || busy) return;
    const grid = gridReview.grid.map((cells) => [...cells]);
    grid[row]![col] = value;
    try {
      const normalized = extractedGrid({ grid }, rows, cols);
      setGridText(JSON.stringify({ grid: normalized }, null, 2)); setSavedId(""); setCellError("");
    } catch (e) { setCellError(errorText(e)); }
  }

  function editClue(dir: Direction, key: string, index: number, value: string) {
    const doc = readClueDoc(clueText);
    const group = doc?.clues[dir]?.[key];
    if (!doc || !isClueGroup(group)) return;
    doc.clues[dir]![key] = group.map((c, i) => i === index ? value : c);
    setClueText(JSON.stringify(doc, null, 2)); setSavedId("");
  }

  async function save() {
    if (!review.json || !clueImage || !gridImage || !validId || !validNumber || taken) return;
    setBusy(true); setMessage("");
    try {
      const slug = id.trim();
      const json = applyMetaForm({ ...review.json, meta: { id: slug, language: "fa", direction: "rtl" } },
        { id: slug, ...meta, title: meta.title.trim() || (puzzleNumber ? `جدول ${puzzleNumber}` : ""), sourceFile: `${slug}-clues.png` }, true);
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

  const tabStatus = (kind: PhotoKind): [string, StepState] => {
    const [image, text, ok] = kind === "clues" ? [clueImage, clueText, !!clueReview?.clues] : [gridImage, gridText, !!gridReview.grid];
    if (ok) return [kind === "clues" ? `${toPersianDigits(clueCount)} پرسش` : `${toPersianDigits(rows)}×${toPersianDigits(cols)} درست است`, "done"];
    if (text) return ["نیاز به اصلاح", "problem"];
    return [image ? "آمادهٔ استخراج" : "بدون تصویر", "todo"];
  };
  function tabKeys(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = tab === "clues" ? "grid" : "clues";
    setTab(next);
    document.getElementById(`${fieldId}-tab-${next}`)?.focus();
  }
  const extractProps = { apiKey, model, reasoningEffort, rows, cols, variant, puzzleNumber, busy, setBusy };

  return (
    <section className="ai-build" aria-labelledby="admin-photo-title">
      <header className="ai-build-header">
        <h2 id="admin-photo-title">ساخت جدول با هوش‌واره <AdminHelp label="ساخت با هوش‌واره">ستون‌های پرسش‌ها را از تصویر اول به ترتیب خواندن انتخاب کنید و خود جدول پاسخ را از تصویر دوم برش بزنید. OpenRouter هر تصویر را جداگانه استخراج می‌کند. نتیجه‌ها را کنار تصویر بررسی و اصلاح کنید، سپس پیش‌نویس بسازید. استخراج ممکن است چند دقیقه طول بکشد.</AdminHelp></h2>
      </header>
      {settingsError ? <p className="admin-error" role="alert">{settingsError}</p> : null}

      <div className="ai-settings">
        <div className="ai-settings-bar">
          <strong>تنظیمات هوش‌واره</strong>
          <span className={`ai-chip ${apiKey.trim() ? "ai-chip-ok" : "ai-chip-problem"}`}>{apiKey.trim() ? <><Check size={14} aria-hidden="true" />کلید ذخیره شده</> : <><X size={14} aria-hidden="true" />کلید لازم است</>}</span>
          {model.trim() ? <span className="ai-chip">مدل <bdi dir="ltr">{model}</bdi></span> : null}
          <span className="ai-chip">استدلال: {effortLabel}</span>
          <button type="button" className="ai-link-button" aria-expanded={settingsOpen} aria-controls={`${fieldId}-settings`} onClick={() => setSettingsOpen((open) => !open)}>{settingsOpen ? "بستن" : "تغییر"}</button>
        </div>
        <div id={`${fieldId}-settings`} className="ai-settings-body" hidden={!settingsOpen}>
          <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-key`}>کلید API در OpenRouter</label> <AdminHelp label="کلید OpenRouter">کلید در localStorage همین مرورگر ذخیره و دوباره بازیابی می‌شود. برای حذف آن، فیلد کلید را خالی کنید. کلید در JSON یا پیش‌نویس ذخیره نمی‌شود.</AdminHelp></span><input id={`${fieldId}-key`} aria-label="کلید API در OpenRouter" type="password" dir="ltr" autoComplete="off" spellCheck={false} value={apiKey} disabled={busy} placeholder="sk-or-…" onChange={(e) => {
            const key = e.target.value.trim(); setApiKey(key);
            try { saveOpenRouterKey(key); setKeyError(""); }
            catch { setKeyError("مرورگر اجازهٔ ذخیرهٔ کلید را نداد؛ کلید برای این بار قابل استفاده است."); }
          }} /></div>
          <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-model`}>مدل OpenRouter</label> <AdminHelp label="مدل OpenRouter">شناسهٔ مدلی با پشتیبانی تصویر، JSON Schema و reasoning را وارد کنید. تصویر با جزئیات بالا خوانده می‌شود.</AdminHelp></span><input id={`${fieldId}-model`} aria-label="مدل OpenRouter" dir="ltr" autoComplete="off" spellCheck={false} value={model} disabled={busy} onChange={(e) => setModel(e.target.value)} /></div>
          <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-effort`}>میزان استدلال (Reasoning effort)</label> <AdminHelp label="میزان استدلال">این تنظیم برای استخراج پرسش‌ها و جدول استفاده می‌شود. سطح بیشتر ممکن است زمان و هزینهٔ استخراج را افزایش دهد. تأثیر و پشتیبانی سطح‌ها به مدل انتخاب‌شده بستگی دارد.</AdminHelp></span><select id={`${fieldId}-effort`} value={reasoningEffort} disabled={busy} onChange={(e) => setReasoningEffort(e.target.value as ReasoningEffort)}>{REASONING_EFFORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        </div>
        {keyError ? <p className="admin-error" role="alert">{keyError}</p> : null}
      </div>

      <ol className="ai-stepper" aria-label="مراحل ساخت">
        {steps.map(([label, state], i) => <li key={label}>
          <button type="button" className={`ai-step ai-step-${state}`} onClick={() => goToStep(i)}>
            <span className="ai-step-dot" aria-hidden="true">{state === "done" ? <Check size={15} /> : toPersianDigits(i + 1)}</span>
            <span className="ai-step-label">{label}</span>
            <span className="ai-sr">{state === "done" ? "(انجام شده)" : state === "problem" ? "(نیاز به اصلاح)" : "(مانده)"}</span>
          </button>
        </li>)}
      </ol>

      <section className="ai-card" ref={(el) => { sections.current[0] = el; }} aria-labelledby={`${fieldId}-step1`}>
        <StepHead number={1} id={`${fieldId}-step1`} title="مشخصات جدول" state={steps[0]![1]} status={steps[0]![1] === "done" ? "کامل" : "نیاز به اصلاح"} />
        <div className="ai-fields">
          <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-variant`}>نوع شرح</label> <AdminHelp label="نوع شرح">عادی و ویژه را جداگانه وارد کنید؛ تنها بخش‌های همان نوع را انتخاب کنید. تغییر نوع، کادرها و نتیجه‌ها را پاک می‌کند ولی تصاویر باقی می‌مانند.</AdminHelp></span><select id={`${fieldId}-variant`} aria-label="نوع شرح" value={variant} disabled={busy} onChange={(e) => {
            const next = e.target.value as PuzzleVariant;
            setVariant(next); setClueText(""); setGridText(""); setSavedId(""); setMessage("");
            setMeta((old) => ({ ...old, difficulty: next === "special" ? "ویژه" : "عادی" }));
          }}><option value="normal">عادی</option><option value="special">ویژه</option></select></div>
          <div className="photo-field"><span className="photo-field-heading"><label htmlFor={`${fieldId}-number`}>شمارهٔ جدول (اختیاری)</label> <AdminHelp label="شمارهٔ جدول">شمارهٔ روی پاسخ را با پرسش‌ها تطبیق دهید؛ پاسخ ممکن است پایین صفحهٔ روز بعد باشد. شمارهٔ بالای صفحه لزوماً شمارهٔ پاسخ‌های پایین آن نیست.</AdminHelp></span><input id={`${fieldId}-number`} aria-label="شمارهٔ جدول (اختیاری)" inputMode="numeric" maxLength={8} value={puzzleNumber} disabled={busy} placeholder="مثلاً ۸۰۵۰" onChange={(e) => { setPuzzleNumber(localizeInputDigits(e.currentTarget).trim()); setClueText(""); setGridText(""); setSavedId(""); }} /></div>
          <div className="photo-field"><span className="photo-field-heading"><span id={`${fieldId}-size`}>ابعاد (ردیف × ستون)</span> <AdminHelp label="ابعاد و شمار پرسش‌ها">در جدول ۱۵×۱۵، دقیقاً ۱۵ گروه افقی و ۱۵ گروه عمودی لازم است؛ هر گروه می‌تواند چند پرسش داشته باشد. بعد از استخراج، تعداد پرسش‌های هر گروه با جای واژه‌ها در شبکه هم بررسی می‌شود.</AdminHelp></span>
            <div className="ai-size" role="group" aria-labelledby={`${fieldId}-size`}>
              <PersianNumberInput id={`${fieldId}-rows`} aria-label="تعداد ردیف‌ها" min={1} max={60} value={rows} disabled={busy} onValueChange={(value) => { setRows(value); setSavedId(""); }} />
              <span aria-hidden="true">×</span>
              <PersianNumberInput aria-label="تعداد ستون‌ها" min={1} max={60} value={cols} disabled={busy} onValueChange={(value) => { setCols(value); setSavedId(""); }} />
            </div>
          </div>
        </div>
        {!validSize ? <p className="admin-error">ابعاد جدول را از ۱ تا ۶۰ وارد کنید.</p> : null}
        {!validNumber ? <p className="admin-error">شمارهٔ جدول باید فقط رقم باشد.</p> : null}
      </section>

      <section className="ai-card ai-work" ref={(el) => { sections.current[1] = el; sections.current[2] = el; }} aria-label="پرسش‌ها و جدول پاسخ">
        <div className="ai-tabs" role="tablist" aria-label="تصویرها">
          {(["clues", "grid"] as const).map((kind, i) => {
            const [status, state] = tabStatus(kind);
            return <button key={kind} type="button" role="tab" id={`${fieldId}-tab-${kind}`} aria-selected={tab === kind} aria-controls={`${fieldId}-panel-${kind}`} tabIndex={tab === kind ? 0 : -1} onClick={() => setTab(kind)} onKeyDown={tabKeys}>
              <span className="ai-num" aria-hidden="true">{toPersianDigits(i + 2)}</span>
              <span>{kind === "clues" ? "پرسش‌ها" : "جدول پاسخ"}</span>
              <span className={`ai-pill ai-pill-${state}`}>{status}</span>
            </button>;
          })}
        </div>

        <div role="tabpanel" id={`${fieldId}-panel-clues`} aria-labelledby={`${fieldId}-tab-clues`} className="ai-panel" hidden={tab !== "clues"}>
          <div className="ai-source">
            <div className="ai-source-title"><h3>تصویر پرسش‌ها</h3><AdminHelp label="تصویر پرسش‌ها">چند کادر دور ستون‌های مربوط به شرح انتخاب‌شده بکشید. برش‌ها به ترتیب از بالا به پایین در یک ستون چیده می‌شوند؛ سطرهای ادامه را کامل داخل کادر بگذارید.</AdminHelp></div>
            <ImageCropper multiple disabled={busy} onChange={changeClues} resetKey={variant} showPreview={false} />
            <ExtractPhoto {...extractProps} kind="clues" image={clueImage} hasResult={!!clueText} onResult={(text) => {
              setClueText(text); setSavedId("");
              if (!gridText && reviewClues(text, rows, cols).clues) setTab("grid");
            }} />
          </div>
          <div className="ai-split">
            <PicturePane image={clueImage} alt="کادرهای پرسش‌ها به ترتیب از بالا به پایین" download="clues.png" empty="تصویر پرسش‌ها را انتخاب کنید و دور ستون‌ها کادر بکشید." />
            <div className="ai-pane">
              <PaneHead title="استخراج‌شده" view={clueView} setView={setClueView} previewLabel="پیش‌نمایش" />
              <div className="ai-pane-body">
                {clueView === "preview" ? <ClueList doc={clueDoc} text={clueText} disabled={busy} onEdit={editClue} showJson={() => setClueView("json")} /> : null}
                <label className="photo-result" hidden={clueView !== "json"}>
                  <span className="ai-sr">پرسش‌های استخراج‌شده (قابل ویرایش)</span>
                  <textarea dir="ltr" value={clueText} disabled={busy} onChange={(e) => { setClueText(e.target.value); setSavedId(""); }} placeholder={'{"clues":{"horizontal":{"1":["پرسش"]},"vertical":{"1":["پرسش"]}}}'} />
                </label>
              </div>
            </div>
          </div>
          {clueReview ? <>
            <ul className="ai-review" aria-label="بررسی پرسش‌ها">
              <li>اعتبار قالب و شماره‌ها: {clueReview.clues ? "درست" : "نیاز به اصلاح"}</li>
              <li>گروه‌های افقی: <bdi>{toPersianDigits(clueReview.counts.horizontal)}/{toPersianDigits(rows)}</bdi></li>
              <li>گروه‌های عمودی: <bdi>{toPersianDigits(clueReview.counts.vertical)}/{toPersianDigits(cols)}</bdi></li>
            </ul>
            {clueReview.error ? <p className="admin-error" role="alert">{toPersianDigits(clueReview.error)}{"\n"}نتیجه را اصلاح کنید یا دوباره استخراج کنید.</p> : null}
          </> : null}
        </div>

        <div role="tabpanel" id={`${fieldId}-panel-grid`} aria-labelledby={`${fieldId}-tab-grid`} className="ai-panel" hidden={tab !== "grid"}>
          <div className="ai-source">
            <div className="ai-source-title"><h3>تصویر جدول پاسخ</h3><AdminHelp label="تصویر جدول پاسخ">از پاسخِ دارای حروف استفاده کنید و فقط خود شبکه را بدون شماره‌های حاشیه و نوار عنوان برش بزنید. هر خانه یک حرف فارسی یا رشتهٔ خالی دارد؛ رشتهٔ خالی در پیش‌نویس خانهٔ سیاه است.</AdminHelp></div>
            <ImageCropper multiple={false} disabled={busy} onChange={changeGrid} resetKey={variant} showPreview={false} />
            <ExtractPhoto {...extractProps} kind="grid" image={gridImage} hasResult={!!gridText} onResult={(text) => { setGridText(text); setSavedId(""); }} />
          </div>
          <div className="ai-split">
            <PicturePane image={gridImage} alt="جدول برش‌خورده برای استخراج" download="grid.png" empty="تصویر جدول پاسخ را انتخاب کنید و دور خود شبکه کادر بکشید."
              highlight={focusCell && gridReview.grid && validSize ? { top: focusCell[0] / rows, left: (cols - 1 - focusCell[1]) / cols, width: 1 / cols, height: 1 / rows } : null} />
            <div className="ai-pane">
              <PaneHead title="استخراج‌شده" view={gridView} setView={setGridView} previewLabel="ویرایش خانه‌ها" />
              <div className="ai-pane-body">
                {gridView === "preview" ? gridReview.grid ? <div className="photo-grid-editor">
                  <div ref={gridEditor} className="photo-grid-preview" dir="rtl" role="group" aria-label="ویرایش خانه‌های جدول" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: `${cols * 2.4}em` }} onMouseLeave={() => setFocusCell(null)} onBlur={() => setFocusCell(null)}>
                    {gridReview.grid.flatMap((row, r) => row.map((letter, c) => <input key={`${r},${c}`} aria-label={`خانهٔ ردیف ${toPersianDigits(r + 1)} ستون ${toPersianDigits(c + 1)} از راست`} className={letter ? "" : "photo-grid-block"} value={letter} disabled={busy} autoComplete="off" spellCheck={false}
                      onMouseEnter={() => setFocusCell([r, c])} onFocus={(e) => { e.currentTarget.select(); setFocusCell([r, c]); }} onChange={(e) => editCell(r, c, e.target.value)} onKeyDown={(e) => {
                        const nextRow = r + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0);
                        const nextCol = c + (e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0);
                        if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
                        e.preventDefault();
                        if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) gridEditor.current?.querySelectorAll<HTMLInputElement>("input")[nextRow * cols + nextCol]?.focus();
                      }} />))}
                  </div>
                </div> : <EmptyResult text={gridText} kind="جدول" showJson={() => setGridView("json")} /> : null}
                <label className="photo-result" hidden={gridView !== "json"}>
                  <span className="ai-sr">جدول استخراج‌شده (قابل ویرایش)</span>
                  <textarea dir="ltr" value={gridText} disabled={busy} onChange={(e) => { setGridText(e.target.value); setSavedId(""); }} placeholder={'{"grid":[["ا","","ب"]]}'} />
                </label>
              </div>
            </div>
          </div>
          {gridReview.grid ? <div className="ai-grid-tools">
            <button type="button" className="admin-button" disabled={busy} onClick={() => {
              setGridText(JSON.stringify({ grid: gridReview.grid!.map((row) => [...row].reverse()) }, null, 2)); setSavedId("");
            }}>برعکس کردن چپ و راست</button>
            <AdminHelp label="برعکس کردن چپ و راست">اگر شبکه نسبت به عکس آینه‌ای شده، این دکمه ترتیب خانه‌های هر ردیف را برعکس می‌کند. JSON و بررسی پرسش‌ها هم به‌روز می‌شوند. زدن دوباره، شبکه را به حالت قبل برمی‌گرداند.</AdminHelp>
            <p className="ai-hint">روی هر خانه بزنید و یک حرف فارسی بنویسید؛ خالی کردن خانه آن را سیاه می‌کند. خانهٔ انتخاب‌شده روی تصویر هم نشان داده می‌شود.</p>
          </div> : null}
          {cellError ? <p className="admin-error" role="alert">{toPersianDigits(cellError)}</p> : null}
          {gridReview.error ? <p className="admin-error" role="alert">{toPersianDigits(gridReview.error)}{"\n"}نتیجه را اصلاح کنید یا دوباره استخراج کنید.</p> : null}
        </div>
      </section>

      <section className="ai-card" aria-labelledby={`${fieldId}-step4`}>
        <StepHead number={4} id={`${fieldId}-step4`} title="بررسی و ساخت پیش‌نویس" state={steps[3]![1]} status={savedId ? "ساخته شد" : blocker ? "مانده" : "آماده"} />
        <ul className="ai-checks" aria-label="بررسی‌ها">
          <CheckItem state={clueReview?.clues ? "done" : clueText ? "problem" : "todo"}>پرسش‌ها: گروه‌های افقی <bdi>{toPersianDigits(clueReview?.counts.horizontal ?? 0)}/{toPersianDigits(rows)}</bdi>، عمودی <bdi>{toPersianDigits(clueReview?.counts.vertical ?? 0)}/{toPersianDigits(cols)}</bdi></CheckItem>
          <CheckItem state={gridReview.grid ? "done" : gridText ? "problem" : "todo"}>جدول: ابعاد {toPersianDigits(rows)}×{toPersianDigits(cols)} و یک حرف در هر خانه</CheckItem>
          <CheckItem state={review.json ? "done" : review.error ? "problem" : "todo"}>تعداد پرسش‌های هر ردیف و ستون با جای واژه‌ها در جدول می‌خواند</CheckItem>
          <CheckItem state={validId && !taken ? "done" : id.trim() ? "problem" : "todo"}>شناسهٔ جدول معتبر و تازه است</CheckItem>
        </ul>
        {review.error ? <p className="admin-error" role="alert">بررسی نهایی پرسش‌ها و جای واژه‌ها در جدول انجام نشد؛ نتیجه را اصلاح یا دوباره استخراج کنید:{"\n"}{toPersianDigits(review.error)}</p> : null}
        {review.json ? <p className="ai-hint">پیش از ساخت، حروف و متن را با تصاویر مقایسه کنید.</p> : null}
        <PuzzleMetaEditor
          value={{ id, ...meta, sourceFile: `${id.trim()}-clues.png` }}
          onChange={({ id: nextId, title, newspaper, difficulty, author }) => { setId(nextId); setMeta({ title, newspaper, difficulty, author }); setSavedId(""); }}
          takenIds={takenIds}
          sourceFile="auto"
          size={validSize ? { rows, cols } : undefined}
          disabled={busy}
          hideIdProblem={!!savedId}
          idPlaceholder={variant === "special" ? "مثلاً ۸۰۵۰-special" : "مثلاً ۸۰۵۰-normal"}
        />
      </section>

      <div className="ai-savebar">
        <div className="ai-savebar-text" role="status">
          {savedId ? <>پیش‌نویس ساخته شد. <a href={`#/admin/draft/${encodeURIComponent(savedId)}`}>باز کردن برای حل و ویرایش</a></>
            : busy ? "در حال پردازش…" : blocker ? <>مانده: <strong>{blocker}</strong></> : "همه‌چیز آماده است."}
        </div>
        <button type="button" className="admin-button admin-button-primary" disabled={busy || !validSize || !validNumber || !review.json || !validId || taken || !clueImage || !gridImage || !!savedId} onClick={() => void save()}>{busy ? "در حال پردازش…" : "ساخت پیش‌نویس از نتیجه"}</button>
        {message ? <p className="admin-error" role="alert">{message}</p> : null}
      </div>
    </section>
  );
}

function StepHead({ number, id, title, state, status }: { number: number; id: string; title: string; state: StepState; status: string }) {
  return <div className="ai-card-head">
    <span className="ai-num" aria-hidden="true">{toPersianDigits(number)}</span>
    <h3 id={id}>{title}</h3>
    <span className={`ai-pill ai-pill-${state}`}>{status}</span>
  </div>;
}

function CheckItem({ state, children }: { state: StepState; children: ReactNode }) {
  return <li className={`ai-check-${state}`}>
    <span className="ai-check-icon" aria-hidden="true">{state === "done" ? <Check size={13} /> : state === "problem" ? <X size={13} /> : <Circle size={9} />}</span>
    <span>{children}<span className="ai-sr">{state === "done" ? " (درست)" : state === "problem" ? " (نیاز به اصلاح)" : " (مانده)"}</span></span>
  </li>;
}

function PaneHead({ title, view, setView, previewLabel }: { title: string; view: View; setView: (view: View) => void; previewLabel: string }) {
  return <div className="ai-pane-head">
    <span>{title}</span>
    <span className="ai-segment" role="group" aria-label={`نمایش ${title}`}>
      <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}>{previewLabel}</button>
      <button type="button" aria-pressed={view === "json"} onClick={() => setView("json")}>JSON</button>
    </span>
  </div>;
}

function PicturePane({ image, alt, download, empty, highlight = null }: {
  image: string | null; alt: string; download: string; empty: string;
  // The focused grid cell, as fractions of the cropped image.
  highlight?: { top: number; left: number; width: number; height: number } | null;
}) {
  const [zoom, setZoom] = useState(100);
  const pct = (n: number) => `${n * 100}%`;
  return <div className="ai-pane">
    <div className="ai-pane-head">
      <span>تصویر</span>
      {image ? <span className="ai-pane-tools">
        <button type="button" className="ai-icon-button" aria-label="کوچک‌نمایی تصویر" disabled={zoom <= 50} onClick={() => setZoom((z) => z - 25)}><ZoomOut size={15} aria-hidden="true" /></button>
        <output aria-label="بزرگ‌نمایی تصویر">{toPersianDigits(zoom)}٪</output>
        <button type="button" className="ai-icon-button" aria-label="بزرگ‌نمایی تصویر" disabled={zoom >= 300} onClick={() => setZoom((z) => z + 25)}><ZoomIn size={15} aria-hidden="true" /></button>
        <a className="ai-icon-button" href={image} download={download} aria-label="دریافت تصویر" title="دریافت تصویر"><Download size={15} aria-hidden="true" /></a>
      </span> : null}
    </div>
    <div className="ai-pane-body ai-picture">
      {image ? <div className="ai-picture-frame" style={{ width: `${zoom}%` }}>
        <img src={image} alt={alt} />
        {highlight ? <span className="ai-picture-mark" style={{ top: pct(highlight.top), left: pct(highlight.left), width: pct(highlight.width), height: pct(highlight.height) }} /> : null}
      </div> : <p className="ai-empty">{empty}</p>}
    </div>
  </div>;
}

function EmptyResult({ text, kind, showJson }: { text: string; kind: string; showJson: () => void }) {
  if (!text) return <p className="ai-empty">هنوز نتیجه‌ای نیست. دکمهٔ استخراج را بزنید یا JSON را در زبانهٔ JSON بچسبانید.</p>;
  return <div className="ai-empty">
    <p>{kind} را نمی‌توان به این شکل نشان داد؛ خطا را در زبانهٔ JSON اصلاح کنید.</p>
    <button type="button" className="admin-button" onClick={showJson}>باز کردن JSON</button>
  </div>;
}

function ClueList({ doc, text, disabled, onEdit, showJson }: {
  doc: ClueDoc | null; text: string; disabled: boolean;
  onEdit: (dir: Direction, key: string, index: number, value: string) => void; showJson: () => void;
}) {
  if (!doc) return <EmptyResult text={text} kind="پرسش‌ها" showJson={showJson} />;
  return <div className="ai-clues">
    {DIRECTIONS.map(([dir, label]) => {
      const groups = doc.clues[dir];
      if (!groups) return null;
      return <section key={dir} aria-label={`پرسش‌های ${label}`}>
        <h4>{label}</h4>
        <ol>
          {Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b)).map(([key, group]) => <li key={key}>
            <span className="ai-clue-key">{toPersianDigits(key)}</span>
            {isClueGroup(group) ? <span className="ai-clue-texts">{group.map((clue, i) =>
              <input key={i} value={clue} disabled={disabled} dir="rtl" aria-label={`${label} ${toPersianDigits(key)}، پرسش ${toPersianDigits(i + 1)}`} onChange={(e) => onEdit(dir, key, i, e.target.value)} />)}
            </span> : <span className="ai-clue-bad">قالب این گروه درست نیست؛ در JSON اصلاح کنید.</span>}
          </li>)}
        </ol>
      </section>;
    })}
  </div>;
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

  const why = !apiKey.trim() ? "ابتدا کلید OpenRouter را در تنظیمات وارد کنید." : !model.trim() ? "ابتدا مدل را در تنظیمات وارد کنید." : !image ? "ابتدا تصویر را انتخاب و برش بزنید." : "";
  return <div className="photo-extract">
    <button type="button" className="admin-button admin-button-primary" disabled={busy || !apiKey.trim() || !model.trim() || !image || !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 60 || cols > 60 || (puzzleNumber !== "" && !/^[0-9۰-۹٠-٩]{1,8}$/.test(puzzleNumber))} onClick={() => void run()}>{hasResult ? kind === "clues" ? "استخراج دوبارهٔ پرسش‌ها" : "استخراج دوبارهٔ جدول" : kind === "clues" ? "استخراج پرسش‌ها" : "استخراج جدول"}</button>
    {message ? <p className="admin-note" role="status">{message}</p> : why ? <p className="ai-hint">{why}</p> : null}
  </div>;
}
