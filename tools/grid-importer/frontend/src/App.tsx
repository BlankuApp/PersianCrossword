import { useState, useCallback } from 'react';
import ColumnExtractorApp from './apps/ColumnExtractorApp';
import UploadStep from './components/UploadStep';

export default function App() {
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);

  const handleChangeImage = useCallback(() => {
    setSourceBlob(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ابزارهای جدول</h1>
        {sourceBlob && (
          <button className="change-image-btn" onClick={handleChangeImage}>
            تغییر تصویر
          </button>
        )}
      </header>

      {!sourceBlob ? (
        <main className="app-main">
          <UploadStep onSourceLoaded={setSourceBlob} continueLabel="ادامه ←" />
        </main>
      ) : (
        <ColumnExtractorApp sourceBlob={sourceBlob} onChangeImage={handleChangeImage} />
      )}
    </div>
  );
}
