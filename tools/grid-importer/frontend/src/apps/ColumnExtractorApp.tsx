import { useState, useCallback, useEffect } from 'react';
import type { ColStep } from '../types';
import type { Rect } from '../components/RectangleSelector';
import { extractColumns } from '../api';
import type { ParseResult } from '../api';
import ColStepIndicator from '../components/ColStepIndicator';
import RectSelectStep from '../components/RectSelectStep';
import ColExportStep from '../components/ColExportStep';
import ColParseStep from '../components/ColParseStep';

interface Props {
  sourceBlob: Blob;
  onChangeImage: () => void;
}

export default function ColumnExtractorApp({ sourceBlob, onChangeImage }: Props) {
  const [step, setStep] = useState<ColStep>('select');
  const [sourceUrl, setSourceUrl] = useState('');
  const [rects, setRects] = useState<Rect[]>([]);
  const [stitchedB64, setStitchedB64] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create the object URL in an effect so React Strict Mode's simulated
  // unmount/remount doesn't revoke the URL before the image ever loads.
  useEffect(() => {
    const url = URL.createObjectURL(sourceBlob);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceBlob]);

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
    setStep('select');
    setRects([]);
    setStitchedB64(null);
    setParseResult(null);
    setError(null);
  }, []);

  return (
    <>
      <ColStepIndicator current={step} />
      <main className="app-main">
        {step === 'select' && sourceUrl && (
          <RectSelectStep
            sourceUrl={sourceUrl}
            rects={rects}
            onRectsChange={setRects}
            onExtract={handleExtract}
            onBack={onChangeImage}
            loading={loading}
            error={error}
          />
        )}
        {step === 'export' && stitchedB64 && (
          <ColExportStep
            stitchedB64={stitchedB64}
            onReset={handleReset}
            onBack={() => setStep('select')}
            onParse={() => setStep('parse')}
          />
        )}
        {step === 'parse' && stitchedB64 && (
          <ColParseStep
            stitchedB64={stitchedB64}
            parseResult={parseResult}
            onParseResult={setParseResult}
            onBack={() => setStep('export')}
            onReset={handleReset}
          />
        )}
      </main>
    </>
  );
}
