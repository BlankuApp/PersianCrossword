import { useState } from 'react';
import GridImporterApp from './apps/GridImporterApp';
import ColumnExtractorApp from './apps/ColumnExtractorApp';

type Tab = 'grid-importer' | 'column-extractor';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('grid-importer');

  return (
    <div className="app">
      <header className="app-header">
        <h1>ابزارهای جدول</h1>
        <nav className="tab-bar">
          <button
            className={'tab-btn' + (activeTab === 'grid-importer' ? ' active' : '')}
            onClick={() => setActiveTab('grid-importer')}
          >
            Grid Importer
          </button>
          <button
            className={'tab-btn' + (activeTab === 'column-extractor' ? ' active' : '')}
            onClick={() => setActiveTab('column-extractor')}
          >
            Column Extractor
          </button>
        </nav>
      </header>

      {/* Both subtrees stay mounted so state is preserved when switching tabs */}
      <div style={{ display: activeTab === 'grid-importer' ? 'contents' : 'none' }}>
        <GridImporterApp />
      </div>
      <div style={{ display: activeTab === 'column-extractor' ? 'contents' : 'none' }}>
        <ColumnExtractorApp />
      </div>
    </div>
  );
}
