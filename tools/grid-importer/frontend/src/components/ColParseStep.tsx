import { useState, useCallback } from 'react';
import { Loader, Copy, Check } from 'lucide-react';
import { parseLlamaCloud } from '../api';
import type { ParseResult } from '../api';

const LS_KEY = 'llama_cloud_api_key';

interface Props {
  stitchedB64: string;
  parseResult: ParseResult | null;
  onParseResult: (result: ParseResult) => void;
  onBack: () => void;
  onReset: () => void;
}

export default function ColParseStep({ stitchedB64, parseResult, onParseResult, onBack, onReset }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_KEY) ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleParse = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('لطفاً کلید API را وارد کنید');
      return;
    }
    localStorage.setItem(LS_KEY, apiKey.trim());
    setLoading(true);
    setError(null);
    try {
      const blob = await fetch(`data:image/png;base64,${stitchedB64}`).then(r => r.blob());
      const result = await parseLlamaCloud(blob, apiKey.trim());
      onParseResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطایی رخ داده است');
    } finally {
      setLoading(false);
    }
  }, [apiKey, stitchedB64, onParseResult]);

  const handleCopy = useCallback(() => {
    if (!parseResult) return;
    navigator.clipboard.writeText(parseResult.markdown_full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [parseResult]);

  return (
    <div className="step-panel col-parse-step">
      <div className="detect-layout">
        {/* Sidebar */}
        <aside className="detect-sidebar">
          <h2 className="panel-title">تجزیه متن</h2>

          <div className="field">
            <label className="field-label">کلید API</label>
            <input
              type="password"
              className="parse-api-input"
              placeholder="llx-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              disabled={loading}
              dir="ltr"
            />
            <span className="field-hint">یک بار ذخیره می‌شود</span>
          </div>

          {error && (
            <div className="status-banner error">{error}</div>
          )}

          {loading && (
            <div className="status-banner info">
              در حال پردازش... ممکن است تا ۶۰ ثانیه طول بکشد
            </div>
          )}

          {parseResult && (
            <button
              className={`btn btn-sm ${copied ? 'btn-primary copied' : 'btn-ghost'}`}
              onClick={handleCopy}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'کپی شد' : 'کپی مارکداون'}
            </button>
          )}

          <div className="edit-nav">
            <button
              className="btn btn-primary"
              onClick={handleParse}
              disabled={loading || !apiKey.trim()}
            >
              {loading ? <Loader size={15} className="spin" /> : null}
              تجزیه
            </button>
            <button className="btn btn-ghost" onClick={onBack}>
              ← برگشت به خروجی
            </button>
            <button className="btn btn-ghost" onClick={onReset}>
              شروع مجدد
            </button>
          </div>
        </aside>

        {/* Result area */}
        <div className="parse-result-area">
          {parseResult ? (
            <>
              <div className="parse-result-header">
                <span className="panel-title" style={{ fontSize: '0.875rem' }}>نتیجه</span>
              </div>
              <pre className="parse-result-body">{parseResult.markdown_full}</pre>
            </>
          ) : (
            <div className="parse-placeholder">
              {loading
                ? 'در حال تجزیه تصویر...'
                : 'کلید API را وارد کرده و دکمه تجزیه را بزنید'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
