import { useCallback } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import type { DetectResult } from '../types';
import CellGrid from './CellGrid';

interface Props {
  detectResult: DetectResult;
  currentMatrix: number[][];
  onMatrixChange: (matrix: number[][]) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function EditStep({ detectResult, currentMatrix, onMatrixChange, onNext, onBack }: Props) {
  const handleReset = useCallback(() => {
    onMatrixChange(detectResult.matrix.map(r => [...r]));
  }, [detectResult, onMatrixChange]);

  const blackCount = currentMatrix.flat().filter(v => v === 1).length;
  const totalCells = detectResult.rows * detectResult.cols;

  return (
    <div className="step-panel edit-step">
      <div className="edit-layout">
        <div className="edit-sidebar">
          <h2 className="panel-title">ویرایش خانه‌ها</h2>

          <div className="grid-stats">
            <div className="stat">
              <span className="stat-value">{detectResult.rows}×{detectResult.cols}</span>
              <span className="stat-label">اندازه جدول</span>
            </div>
            <div className="stat">
              <span className="stat-value">{blackCount}</span>
              <span className="stat-label">خانه مشکی</span>
            </div>
            <div className="stat">
              <span className="stat-value">{totalCells - blackCount}</span>
              <span className="stat-label">خانه سفید</span>
            </div>
          </div>

          <div className="edit-instructions">
            <p>کلیک کنید تا خانه‌ها را تغییر دهید</p>
            <p>برای ویرایش سریع، نگه دارید و بکشید</p>
            <p>برای حرکت از کیبورد استفاده کنید</p>
          </div>

          <button className="btn btn-ghost btn-sm" onClick={handleReset}>
            <RotateCcw size={14} /> بازنشانی به حالت تشخیص‌داده‌شده
          </button>

          <div className="edit-nav">
            <button className="btn btn-ghost" onClick={onBack}>
              <ArrowLeft size={16} /> بازگشت
            </button>
            <button className="btn btn-primary" onClick={onNext}>
              خروجی <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="edit-main">
          <div className="warped-container">
            <img
              src={`data:image/png;base64,${detectResult.warped_png_b64}`}
              alt="جدول تصحیح‌شده"
              className="warped-image"
            />
            <CellGrid matrix={currentMatrix} onChange={onMatrixChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
