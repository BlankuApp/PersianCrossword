import { useState } from 'react';
import { Copy, Check, ArrowLeft, RefreshCw } from 'lucide-react';

interface Props {
  matrix: number[][];
  onReset: () => void;
  onBack: () => void;
}

function formatMatrix(matrix: number[][]): string {
  return '[\n' + matrix.map(row => '  [' + row.join(', ') + ']').join(',\n') + '\n]';
}

export default function ExportStep({ matrix, onReset, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  const formatted = formatMatrix(matrix);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="step-panel export-step">
      <div className="export-layout">
        <div className="export-header">
          <h2 className="panel-title">ماتریس خروجی</h2>
          <div className="export-meta">
            <span>{matrix.length} ردیف × {matrix[0]?.length ?? 0} ستون</span>
            <span>{matrix.flat().filter(v => v === 1).length} خانه مشکی</span>
          </div>
        </div>

        <div className="output-block">
          <pre className="matrix-output">{formatted}</pre>
        </div>

        <div className="export-actions">
          <button
            className={'btn btn-primary' + (copied ? ' copied' : '')}
            onClick={handleCopy}
          >
            {copied ? <><Check size={16} /> کپی شد!</> : <><Copy size={16} /> کپی ماتریس</>}
          </button>

          <div className="export-nav">
            <button className="btn btn-ghost" onClick={onBack}>
              <ArrowLeft size={16} /> بازگشت به ویرایش
            </button>
            <button className="btn btn-ghost" onClick={onReset}>
              <RefreshCw size={16} /> شروع مجدد
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
