import { useState, useCallback } from 'react';
import { ArrowLeft, ScanSearch, Loader2 } from 'lucide-react';
import type { Corner, DetectResult } from '../types';
import { detectGrid } from '../api';
import ImageCornerSelector from './ImageCornerSelector';

interface Props {
  sourceBlob: Blob;
  initialCorners: Corner[] | null;
  onDetected: (result: DetectResult) => void;
  onBack: () => void;
  onCornersChange: (corners: Corner[]) => void;
}

export default function DetectStep({ sourceBlob, initialCorners, onDetected, onBack, onCornersChange }: Props) {
  const imageSrc = URL.createObjectURL(sourceBlob);
  const [corners, setCorners] = useState<Corner[] | null>(initialCorners);
  const [gridSize, setGridSize] = useState<string>('15');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCornersChange = useCallback((c: Corner[]) => {
    setCorners(c.length === 4 ? c : null);
    onCornersChange(c.length === 4 ? c : []);
  }, [onCornersChange]);

  const handleDetect = async () => {
    setError(null);
    setLoading(true);
    try {
      const n = gridSize.trim() !== '' ? parseInt(gridSize, 10) : null;
      const result = await detectGrid(sourceBlob, n, corners);
      onDetected(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطای ناشناخته');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="step-panel detect-step">
      <div className="detect-layout">
        <div className="detect-sidebar">
          <h2 className="panel-title">تشخیص جدول</h2>

          <div className="field">
            <label htmlFor="grid-size" className="field-label">اندازه جدول</label>
            <input
              id="grid-size"
              type="number"
              className="field-input"
              value={gridSize}
              onChange={e => setGridSize(e.target.value)}
              min={3}
              max={50}
              placeholder="خودکار"
              disabled={loading}
            />
            <span className="field-hint">خالی = تشخیص خودکار</span>
          </div>

          <div className="corner-status">
            <div className={'corner-badge' + (corners ? ' set' : '')}>
              {corners ? '✓ گوشه‌ها تنظیم شدند' : 'گوشه‌ها تنظیم نشده (تشخیص خودکار)'}
            </div>
          </div>

          {error && <div className="status-banner error">{error}</div>}

          <button
            className="btn btn-primary"
            onClick={handleDetect}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 size={16} className="spin" /> در حال پردازش…</>
            ) : (
              <><ScanSearch size={16} /> تشخیص جدول</>
            )}
          </button>

          <button className="btn btn-ghost" onClick={onBack} disabled={loading}>
            <ArrowLeft size={16} /> بازگشت
          </button>
        </div>

        <div className="detect-image-area">
          <ImageCornerSelector
            imageSrc={imageSrc}
            corners={corners}
            onChange={handleCornersChange}
          />
        </div>
      </div>
    </div>
  );
}
