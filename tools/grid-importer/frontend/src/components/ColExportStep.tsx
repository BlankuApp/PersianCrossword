import { Download } from 'lucide-react';

interface Props {
  stitchedB64: string;
  onReset: () => void;
  onBack: () => void;
}

export default function ColExportStep({ stitchedB64, onReset, onBack }: Props) {
  const dataUrl = `data:image/png;base64,${stitchedB64}`;

  return (
    <div className="step-panel col-export-step">
      <div className="export-layout">
        <div className="export-header">
          <h2 className="panel-title">نتیجه استخراج</h2>
        </div>

        <div className="col-export-image-wrap">
          <img
            src={dataUrl}
            alt="ستون‌های استخراج‌شده"
            className="col-export-image"
          />
        </div>

        <div className="export-actions">
          <a
            href={dataUrl}
            download="columns.png"
            className="btn btn-primary"
          >
            <Download size={15} />
            دانلود PNG
          </a>
          <div className="export-nav">
            <button className="btn btn-ghost" onClick={onBack}>
              ← برگشت به انتخاب
            </button>
            <button className="btn btn-ghost" onClick={onReset}>
              شروع مجدد
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
