import { useState, useCallback } from 'react';
import type { Step, DetectResult, Corner } from '../types';
import StepIndicator from '../components/StepIndicator';

const GRID_STEPS: { id: Step; label: string }[] = [
  { id: 'detect', label: 'تشخیص جدول' },
  { id: 'edit', label: 'ویرایش خانه‌ها' },
  { id: 'export', label: 'خروجی' },
];
const GRID_ORDER: Step[] = ['detect', 'edit', 'export'];
import DetectStep from '../components/DetectStep';
import EditStep from '../components/EditStep';
import ExportStep from '../components/ExportStep';

interface Props {
  sourceBlob: Blob;
  onChangeImage: () => void;
}

export default function GridImporterApp({ sourceBlob, onChangeImage }: Props) {
  const [step, setStep] = useState<Step>('detect');
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [currentMatrix, setCurrentMatrix] = useState<number[][] | null>(null);
  const [corners, setCorners] = useState<Corner[] | null>(null);

  const handleDetected = useCallback((result: DetectResult) => {
    setDetectResult(result);
    setCurrentMatrix(result.matrix.map(r => [...r]));
    setCorners(result.corners);
    setStep('edit');
  }, []);

  const handleCornersChange = useCallback((c: Corner[]) => {
    setCorners(c);
  }, []);

  const handleMatrixChange = useCallback((matrix: number[][]) => {
    setCurrentMatrix(matrix);
  }, []);

  const handleGoToExport = useCallback(() => {
    setStep('export');
  }, []);

  const handleReset = useCallback(() => {
    setStep('detect');
    setDetectResult(null);
    setCurrentMatrix(null);
    setCorners(null);
  }, []);

  return (
    <>
      <StepIndicator steps={GRID_STEPS} current={step} order={GRID_ORDER} />
      <main className="app-main">
        {step === 'detect' && (
          <DetectStep
            sourceBlob={sourceBlob}
            initialCorners={corners}
            onDetected={handleDetected}
            onBack={onChangeImage}
            onCornersChange={handleCornersChange}
          />
        )}
        {step === 'edit' && detectResult && currentMatrix && (
          <EditStep
            detectResult={detectResult}
            currentMatrix={currentMatrix}
            onMatrixChange={handleMatrixChange}
            onNext={handleGoToExport}
            onBack={() => setStep('detect')}
          />
        )}
        {step === 'export' && currentMatrix && (
          <ExportStep
            matrix={currentMatrix}
            onReset={handleReset}
            onBack={() => setStep('edit')}
          />
        )}
      </main>
    </>
  );
}
