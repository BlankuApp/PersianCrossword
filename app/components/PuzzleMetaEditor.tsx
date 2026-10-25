import { useId, useMemo } from "react";
import { usePuzzleLibrary } from "../puzzleLibrary";
import { localizeInputDigits, toAsciiDigits, toPersianDigits } from "../persianNumbers";
import { difficultyOptions, metaIdProblem, type PuzzleMetaForm } from "./puzzleMeta";

// editable: a real source image is attached; auto: the name is derived (photo import); none: no source image.
export type SourceFileMode = "editable" | "auto" | "none";

export interface PuzzleMetaEditorProps {
  readonly value: PuzzleMetaForm;
  readonly onChange: (next: PuzzleMetaForm) => void;
  readonly idLocked?: boolean;
  readonly creating?: boolean;
  readonly idServerError?: string;
  readonly takenIds?: ReadonlySet<string> | undefined;
  // The puzzle's current id: never reported as "taken".
  readonly ownId?: string;
  readonly sourceFile: SourceFileMode;
  readonly size: { readonly rows: number; readonly cols: number } | undefined;
  readonly publishedAt?: string | undefined;
  readonly disabled?: boolean;
  readonly hideIdProblem?: boolean;
  readonly idPlaceholder?: string | undefined;
}

const SUGGESTED = ["title", "newspaper", "author"] as const;

export function PuzzleMetaEditor({ value, onChange, idLocked = false, creating = false, idServerError = "", takenIds, ownId = "", sourceFile, size, publishedAt, disabled = false, hideIdProblem = false, idPlaceholder }: PuzzleMetaEditorProps) {
  const uid = useId();
  const { puzzles } = usePuzzleLibrary();
  // Values already used by published puzzles, offered so spellings stay consistent.
  const suggestions = useMemo(
    () => Object.fromEntries(SUGGESTED.map((field) => [field, [...new Set(puzzles.flatMap((p) => String(p[field] ?? "").trim() || []))]])) as Record<(typeof SUGGESTED)[number], string[]>,
    [puzzles],
  );
  const set = (patch: Partial<PuzzleMetaForm>) => onChange({ ...value, ...patch });
  const idProblem = idLocked || hideIdProblem ? "" : idServerError || (value.id ? metaIdProblem(value.id, ownId, takenIds) : creating ? "شناسهٔ جدول را بنویسید." : "");
  const text = (field: (typeof SUGGESTED)[number], label: string) => (
    <label>
      {label}
      <input value={toPersianDigits(value[field])} onChange={(e) => set({ [field]: localizeInputDigits(e.currentTarget) })} list={`${uid}-${field}`} disabled={disabled} />
      <datalist id={`${uid}-${field}`}>{suggestions[field].map((v) => <option key={v} value={toPersianDigits(v)} />)}</datalist>
    </label>
  );

  const idField = <>
      <label>
        شناسهٔ جدول
        {creating ? <input type="number" inputMode="numeric" dir="ltr" aria-label="شناسهٔ جدول" min={1} max={Number.MAX_SAFE_INTEGER} step={1} required
          value={value.id} readOnly={idLocked} disabled={disabled} placeholder={idPlaceholder}
          aria-invalid={!!idProblem} aria-describedby={idProblem ? `${uid}-id-error` : undefined}
          onChange={(e) => set({ id: Number.isFinite(e.currentTarget.valueAsNumber) ? String(e.currentTarget.valueAsNumber) : "" })} /> :
          <input dir="ltr" value={toPersianDigits(value.id)} readOnly={idLocked} disabled={disabled} placeholder={idPlaceholder} aria-invalid={!!idProblem} aria-describedby={idProblem ? `${uid}-id-error` : undefined} onChange={(e) => set({ id: toAsciiDigits(localizeInputDigits(e.currentTarget)) })} />}

      </label>
      {idProblem ? <p id={`${uid}-id-error`} className="admin-error" role="alert">{idProblem}</p> : null}
    </>;

  return (
    <div className="publish-meta-fields meta-editor">
      {creating ? <div className="meta-id-field">{idField}</div> : idField}
      {text("title", "عنوان")}
      {text("newspaper", "روزنامه")}
      {!creating ? <label>
        سطح
        <select value={value.difficulty} disabled={disabled} onChange={(e) => set({ difficulty: e.target.value })}>
          {difficultyOptions(value.difficulty).map((option) => <option key={option} value={option}>{option === "" ? "تعیین نشده" : toPersianDigits(option)}</option>)}
        </select>
      </label> : null}
      {text("author", "طراح")}
      {!creating ? <details className="meta-editor-advanced">
        <summary>پیشرفته</summary>
        <div className="meta-editor-advanced-body">
            <label>
              نام تصویر منبع
              <input dir="ltr" value={value.sourceFile} disabled={disabled || sourceFile !== "editable"} onChange={(e) => set({ sourceFile: e.currentTarget.value })} />
            </label>
            {sourceFile === "none" ? <p>این جدول تصویر منبع ندارد.</p> : null}
            {sourceFile === "auto" ? <p>نام تصویر منبع از شناسه ساخته می‌شود.</p> : null}
            <dl className="meta-summary">
              <div><dt>ابعاد</dt><dd>{size ? `${toPersianDigits(size.rows)} × ${toPersianDigits(size.cols)}` : "—"}</dd></div>
              <div><dt>تاریخ انتشار</dt><dd>{publishedAt ? toPersianDigits(publishedAt) : "هنگام انتشار ثبت می‌شود"}</dd></div>
            </dl>
        </div>
      </details> : null}
    </div>
  );
}
