import { useState, useCallback } from 'react';
import type { Step, DetectResult, Corner } from '../types';
import StepIndicator from '../components/StepIndicator';
import UploadStep from '../components/UploadStep';
import DetectStep from '../components/DetectStep';
import EditStep from '../components/EditStep';
import ExportStep from '../components/ExportStep';

export default function GridImporterApp() {
  const [step, setStep] = useState<Step>('upload');
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [currentMatrix, setCurrentMatrix] = useState<number[][] | null>(null);
  const [corners, setCorners] = useState<Corner[] | null>(null);

  const handleSourceLoaded = useCallback((blob: Blob) => {
    setSourceBlob(blob);
    setDetectResult(null);
    setCurrentMatrix(null);
    setCorners(null);
    setStep('detect');
  }, []);

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
    setStep('upload');
    setSourceBlob(null);
    setDetectResult(null);
    setCurrentMatrix(null);
    setCorners(null);
  }, []);

  return (
    <>
      <StepIndicator current={step} />
      <main className="app-main">
        {step === 'upload' && (
          <UploadStep onSourceLoaded={handleSourceLoaded} />
        )}
        {step === 'detect' && sourceBlob && (
          <DetectStep
            sourceBlob={sourceBlob}
            initialCorners={corners}
            onDetected={handleDetected}
            onBack={() => setStep('upload')}
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
