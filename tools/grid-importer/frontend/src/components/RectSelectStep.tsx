import { ChevronUp, ChevronDown, Trash2, Loader } from 'lucide-react';
import RectangleSelector, { type Rect } from './RectangleSelector';

interface Props {
  sourceUrl: string;
  rects: Rect[];
  onRectsChange: (rects: Rect[]) => void;
  onExtract: () => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}

export default function RectSelectStep({
  sourceUrl,
  rects,
  onRectsChange,
  onExtract,
  onBack,
  loading,
  error,
}: Props) {
  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...rects];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onRectsChange(next);
  };

  const moveDown = (i: number) => {
    if (i === rects.length - 1) return;
    const next = [...rects];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onRectsChange(next);
  };

  const remove = (i: number) => {
    onRectsChange(rects.filter((_, idx) => idx !== i));
  };

  return (
    <div className="step-panel rect-select-step">
      <div className="detect-layout">
        {/* Sidebar */}
        <aside className="detect-sidebar">
          <h2 className="panel-title">ناحیه‌های انتخاب‌شده</h2>

          {rects.length === 0 ? (
            <p className="field-hint">هنوز ناحیه‌ای انتخاب نشده — روی تصویر بکشید.</p>
          ) : (
            <ol className="rect-list">
              {rects.map((r, i) => (
                <li key={r.id} className="rect-item">
                  <span className="rect-item-num">{i + 1}</span>
                  <span className="rect-item-dims">
                    {Math.round(r.w)} × {Math.round(r.h)}
                  </span>
                  <span className="rect-item-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      title="به بالا"
                      disabled={i === 0}
                      onClick={() => moveUp(i)}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="به پایین"
                      disabled={i === rects.length - 1}
                      onClick={() => moveDown(i)}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="حذف"
                      onClick={() => remove(i)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {error && (
            <div className="status-banner error">{error}</div>
          )}

          <div className="edit-nav">
            <button
              className="btn btn-primary"
              disabled={rects.length === 0 || loading}
              onClick={onExtract}
            >
              {loading ? <Loader size={15} className="spin" /> : null}
              استخراج ستون‌ها ←
            </button>
            <button className="btn btn-ghost" onClick={onBack}>
              ← برگشت
            </button>
          </div>
        </aside>

        {/* Canvas area */}
        <div className="detect-image-area">
          <RectangleSelector
            imageSrc={sourceUrl}
            rects={rects}
            onChange={onRectsChange}
          />
        </div>
      </div>
    </div>
  );
}
