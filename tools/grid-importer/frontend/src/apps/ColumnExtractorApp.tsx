import { useState, useCallback, useEffect } from 'react';
import type { ColStep } from '../types';
import type { Rect } from '../components/RectangleSelector';
import { extractColumns } from '../api';
import ColStepIndicator from '../components/ColStepIndicator';
import UploadStep from '../components/UploadStep';
import RectSelectStep from '../components/RectSelectStep';
import ColExportStep from '../components/ColExportStep';

export default function ColumnExtractorApp() {
  const [step, setStep] = useState<ColStep>('upload');
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [stitchedB64, setStitchedB64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke the object URL when the source changes to avoid memory leaks
  useEffect(() => {
    return () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBlob]);

  const handleSourceLoaded = useCallback((blob: Blob) => {
    setSourceBlob(blob);
    setSourceUrl(URL.createObjectURL(blob));
    setRects([]);
    setStitchedB64(null);
    setError(null);
    setStep('select');
  }, []);

  const handleExtract = useCallback(async () => {
    if (!sourceBlob || rects.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const apiRects = rects.map(({ x, y, w, h }) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }));
      const result = await extractColumns(sourceBlob, apiRects);
      setStitchedB64(result.stitched_png_b64);
      setStep('export');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطایی رخ داده است');
    } finally {
      setLoading(false);
    }
  }, [sourceBlob, rects]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setSourceBlob(null);
    setSourceUrl(null);
    setRects([]);
    setStitchedB64(null);
    setError(null);
  }, []);

  return (
    <>
      <ColStepIndicator current={step} />
      <main className="app-main">
        {step === 'upload' && (
          <UploadStep
            onSourceLoaded={handleSourceLoaded}
            continueLabel="ادامه به انتخاب ناحیه‌ها ←"
          />
        )}
        {step === 'select' && sourceUrl && (
          <RectSelectStep
            sourceUrl={sourceUrl}
            rects={rects}
            onRectsChange={setRects}
            onExtract={handleExtract}
            onBack={() => setStep('upload')}
            loading={loading}
            error={error}
          />
        )}
        {step === 'export' && stitchedB64 && (
          <ColExportStep
            stitchedB64={stitchedB64}
            onReset={handleReset}
            onBack={() => setStep('select')}
          />
        )}
      </main>
    </>
  );
}
