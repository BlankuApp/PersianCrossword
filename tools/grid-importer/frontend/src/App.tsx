import { useState, useCallback } from 'react';
import GridImporterApp from './apps/GridImporterApp';
import ColumnExtractorApp from './apps/ColumnExtractorApp';
import UploadStep from './components/UploadStep';

type Tab = 'grid-importer' | 'column-extractor';

export default function App() {
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('grid-importer');

  const handleChangeImage = useCallback(() => {
    setSourceBlob(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>ابزارهای جدول</h1>
        {sourceBlob && (
          <>
            <nav className="tab-bar">
              <button
                className={'tab-btn' + (activeTab === 'grid-importer' ? ' active' : '')}
                onClick={() => setActiveTab('grid-importer')}
              >
                تشخیص جدول
              </button>
              <button
                className={'tab-btn' + (activeTab === 'column-extractor' ? ' active' : '')}
                onClick={() => setActiveTab('column-extractor')}
              >
                استخراج ستون‌ها
              </button>
            </nav>
            <button className="change-image-btn" onClick={handleChangeImage}>
              تغییر تصویر
            </button>
          </>
        )}
      </header>

      {!sourceBlob ? (
        <main className="app-main">
          <UploadStep onSourceLoaded={setSourceBlob} continueLabel="ادامه ←" />
        </main>
      ) : (
        <>
          {/* Both subtrees stay mounted so state is preserved when switching tabs */}
          <div style={{ display: activeTab === 'grid-importer' ? 'contents' : 'none' }}>
            <GridImporterApp sourceBlob={sourceBlob} onChangeImage={handleChangeImage} />
          </div>
          <div style={{ display: activeTab === 'column-extractor' ? 'contents' : 'none' }}>
            <ColumnExtractorApp sourceBlob={sourceBlob} onChangeImage={handleChangeImage} />
          </div>
        </>
      )}
    </div>
  );
}
