import { useId, useMemo } from "react";
import type { CrosswordJson } from "../../src/index";
import { usePuzzleLibrary } from "../puzzleLibrary";

// Metadata the admin can change right before publishing; publishedAt is set to the publish day
// (adminApi.publishDraft).
const META_FIELDS = [
  ["title", "عنوان"],
  ["newspaper", "روزنامه"],
  ["difficulty", "سطح"],
  ["author", "طراح"],
] as const;
type MetaField = (typeof META_FIELDS)[number][0];
export type PublishMeta = Record<MetaField, string>;

export function publishMetaOf(json: CrosswordJson): PublishMeta {
  return Object.fromEntries(META_FIELDS.map(([field]) => [field, json.meta?.[field] ?? ""])) as PublishMeta;
}

export function withPublishMeta(json: CrosswordJson, meta: PublishMeta): CrosswordJson {
  const edited = Object.fromEntries(Object.entries(meta).map(([field, value]) => [field, value.trim()]));
  return { ...json, meta: { ...json.meta, ...edited } };
}

export function PublishMetaFields({
  meta,
  onChange,
  disabled,
}: {
  meta: PublishMeta;
  onChange: (meta: PublishMeta) => void;
  disabled: boolean;
}) {
  const id = useId();
  const { puzzles } = usePuzzleLibrary();
  // Values already used by published puzzles, offered so spellings stay consistent.
  const suggestions = useMemo(
    () => Object.fromEntries(META_FIELDS.map(([field]) => [field, [...new Set(puzzles.flatMap((p) => p[field]?.trim() || []))]])) as Record<MetaField, string[]>,
    [puzzles],
  );

  return (
    <div className="publish-meta-fields">
      {META_FIELDS.map(([field, label]) => (
        <label key={field}>
          {label}
          <input value={meta[field]} onChange={(e) => onChange({ ...meta, [field]: e.target.value })} list={`${id}-${field}`} disabled={disabled} />
          <datalist id={`${id}-${field}`}>
            {suggestions[field].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
      ))}
      <p>تاریخ انتشار خودکار همان روز انتشار ثبت می‌شود.</p>
    </div>
  );
}
