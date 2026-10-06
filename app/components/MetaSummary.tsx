import type { CrosswordJson } from "../../src/index";
import { toPersianDigits } from "../persianNumbers";

// Read-only look at a puzzle's metadata (publish confirmations), with a way into the editor.
export function MetaSummary({ json, id, onEdit }: { json: CrosswordJson; id: string; onEdit?: (() => void) | undefined }) {
  const meta = json.meta;
  const rows: [string, unknown][] = [["عنوان", meta?.title], ["شناسه", id], ["سطح", meta?.difficulty], ["روزنامه", meta?.newspaper], ["طراح", meta?.author]];
  return (
    <>
      <dl className="meta-summary">
        {rows.flatMap(([label, value]) => (value === undefined || value === null || value === "" ? [] : [<div key={label}><dt>{label}</dt><dd><bdi>{label === "شناسه" ? String(value) : toPersianDigits(String(value))}</bdi></dd></div>]))}
      </dl>
      {onEdit ? <button type="button" className="meta-summary-edit" onClick={onEdit}>ویرایش مشخصات</button> : null}
    </>
  );
}
