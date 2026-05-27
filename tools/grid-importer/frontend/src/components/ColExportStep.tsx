import { Download, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';

interface Props {
  stitchedB64: string;
  onReset: () => void;
  onBack: () => void;
  onParse: () => void;
}

export default function ColExportStep({ stitchedB64, onReset, onBack, onParse }: Props) {
  const dataUrl = `data:image/png;base64,${stitchedB64}`;

  return (
    <div className="step-panel col-export-step">
      <div className="detect-layout">
        {/* Sidebar */}
        <aside className="detect-sidebar">
          <h2 className="panel-title">نتیجه استخراج</h2>

          <div className="edit-nav">
            <a
              href={dataUrl}
              download="columns.png"
              className="btn btn-primary"
            >
              <Download size={16} />
              دانلود PNG
            </a>
            <button className="btn btn-secondary" onClick={onParse}>
              تجزیه متن <ArrowRight size={16} />
            </button>
            <button className="btn btn-ghost" onClick={onBack}>
              <ArrowLeft size={16} /> بازگشت به انتخاب
            </button>
            <button className="btn btn-ghost" onClick={onReset}>
              <RefreshCw size={16} /> شروع مجدد
            </button>
          </div>
        </aside>

        {/* Image area */}
        <div className="col-export-image-wrap">
          <img
            src={dataUrl}
            alt="ستون‌های استخراج‌شده"
            className="col-export-image"
          />
        </div>
      </div>
    </div>
  );
}
