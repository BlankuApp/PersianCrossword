import { useRef, useState, useCallback, useEffect } from 'react';
import { ImagePlus, Clipboard } from 'lucide-react';

interface Props {
  onSourceLoaded: (blob: Blob) => void;
}

export default function UploadStep({ onSourceLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);

  const loadBlob = useCallback((blob: Blob) => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(blob));
    setPendingBlob(blob);
  }, [preview]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find(
        i => i.kind === 'file' && i.type.startsWith('image/'),
      );
      if (!item) return;
      e.preventDefault();
      const blob = item.getAsFile();
      if (blob) loadBlob(blob);
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [loadBlob]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) loadBlob(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadBlob(file);
  };

  return (
    <div className="step-panel upload-step">
      <div
        className={'drop-zone' + (dragging ? ' dragging' : '')}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="آپلود تصویر جدول"
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden-input"
          onChange={handleFileChange}
        />

        {preview ? (
          <div className="drop-zone-preview">
            <img src={preview} alt="پیش‌نمایش تصویر" className="preview-thumb" />
            <p className="drop-zone-hint">برای تغییر تصویر کلیک کنید یا یکی دیگر را رها کنید</p>
          </div>
        ) : (
          <div className="drop-zone-empty">
            <ImagePlus size={48} strokeWidth={1.5} className="drop-icon" />
            <p className="drop-zone-title">تصویر جدول را اینجا بکشید</p>
            <p className="drop-zone-hint">یا کلیک کنید تا فایل انتخاب شود</p>
          </div>
        )}
      </div>

      <div className="paste-hint">
        <Clipboard size={14} />
        <span>می‌توانید با <kbd>Ctrl+V</kbd> تصویر را از کلیپ‌بورد پیست کنید</span>
      </div>

      {pendingBlob && (
        <div className="upload-actions">
          <button
            className="btn btn-primary"
            onClick={() => onSourceLoaded(pendingBlob)}
          >
            ادامه به مرحله تشخیص ←
          </button>
        </div>
      )}
    </div>
  );
}
