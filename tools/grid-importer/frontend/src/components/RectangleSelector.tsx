import { useRef, useEffect, useCallback, useState } from 'react';

export interface Rect {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  imageSrc: string;
  rects: Rect[];
  onChange: (rects: Rect[]) => void;
}

function toImageCoords(
  clientX: number, clientY: number,
  domRect: DOMRect, natW: number, natH: number,
): { x: number; y: number } {
  return {
    x: (clientX - domRect.left) / domRect.width * natW,
    y: (clientY - domRect.top) / domRect.height * natH,
  };
}

function toDisplayCoords(
  imgX: number, imgY: number,
  dispW: number, dispH: number,
  natW: number, natH: number,
): { x: number; y: number } {
  return { x: imgX / natW * dispW, y: imgY / natH * dispH };
}

// Persian/Arabic-Indic numerals for rect labels
const PERSIAN_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];
function toPersianNum(n: number): string {
  return String(n).split('').map(d => PERSIAN_DIGITS[+d] ?? d).join('');
}

export default function RectangleSelector({ imageSrc, rects, onChange }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Active drag state stored in refs to avoid re-renders mid-drag
  const drawStartRef = useRef<{ imgX: number; imgY: number } | null>(null);
  const moveRef = useRef<{ idx: number; offX: number; offY: number } | null>(null);
  // Rubber-band preview rect during drawing (in natural image coords)
  const previewRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  // Keep a ref copy of rects to read inside pointer event handlers without stale closures
  const rectsRef = useRef<Rect[]>(rects);
  useEffect(() => { rectsRef.current = rects; }, [rects]);

  const getOverlayRect = useCallback(() => imgRef.current!.getBoundingClientRect(), []);
  const getNat = useCallback(() => ({
    w: imgRef.current!.naturalWidth,
    h: imgRef.current!.naturalHeight,
  }), []);

  const draw = useCallback((extraPreview?: { x: number; y: number; w: number; h: number } | null) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return;

    const dispW = img.offsetWidth;
    const dispH = img.offsetHeight;
    if (!dispW || !dispH) return;

    canvas.style.top    = img.offsetTop  + 'px';
    canvas.style.left   = img.offsetLeft + 'px';
    canvas.style.width  = dispW + 'px';
    canvas.style.height = dispH + 'px';

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(dispW * dpr);
    canvas.height = Math.round(dispH * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, dispW, dispH);

    const natW = img.naturalWidth;
    const natH = img.naturalHeight;

    const drawRect = (
      r: { x: number; y: number; w: number; h: number },
      label: string | null,
      dashed: boolean,
    ) => {
      const tl = toDisplayCoords(r.x, r.y, dispW, dispH, natW, natH);
      const br = toDisplayCoords(r.x + r.w, r.y + r.h, dispW, dispH, natW, natH);
      const rw = br.x - tl.x;
      const rh = br.y - tl.y;

      // Fill
      ctx.fillStyle = dashed ? 'rgba(26, 115, 232, 0.08)' : 'rgba(26, 115, 232, 0.14)';
      ctx.fillRect(tl.x, tl.y, rw, rh);

      // Border
      ctx.beginPath();
      if (dashed) ctx.setLineDash([8, 5]);
      else ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(26, 115, 232, 0.9)';
      ctx.lineWidth = dashed ? 1.5 : 2;
      ctx.strokeRect(tl.x, tl.y, rw, rh);
      ctx.setLineDash([]);

      // Number badge
      if (label) {
        const cx = tl.x + rw / 2;
        const cy = tl.y + rh / 2;
        const r2 = 11;
        ctx.beginPath();
        ctx.arc(cx, cy, r2, 0, Math.PI * 2);
        ctx.fillStyle = '#1a73e8';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy);
      }
    };

    rectsRef.current.forEach((rect, i) => {
      drawRect(rect, toPersianNum(i + 1), false);
    });

    const preview = extraPreview ?? previewRef.current;
    if (preview && preview.w > 0 && preview.h > 0) {
      drawRect(preview, null, true);
    }
  }, []);

  // Re-draw whenever the image's layout size changes (covers initial load + tab switch from display:none)
  useEffect(() => {
    if (!imgLoaded) return;
    const img = imgRef.current;
    if (!img) return;
    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(img);
    return () => ro.disconnect();
  }, [imgLoaded, draw]);

  useEffect(() => {
    if (imgLoaded) draw();
  }, [rects, imgLoaded, draw]);

  // Hit-test: returns index of rect containing (imgX, imgY), or -1
  const hitTest = (imgX: number, imgY: number): number => {
    const rs = rectsRef.current;
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      if (imgX >= r.x && imgX <= r.x + r.w && imgY >= r.y && imgY <= r.y + r.h) return i;
    }
    return -1;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const domRect = getOverlayRect();
    const { w, h } = getNat();
    const { x: imgX, y: imgY } = toImageCoords(e.clientX, e.clientY, domRect, w, h);

    const hitIdx = hitTest(imgX, imgY);
    if (hitIdx >= 0) {
      const r = rectsRef.current[hitIdx];
      moveRef.current = { idx: hitIdx, offX: imgX - r.x, offY: imgY - r.y };
    } else {
      drawStartRef.current = { imgX, imgY };
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const domRect = getOverlayRect();
    const { w, h } = getNat();
    const { x: cx, y: cy } = toImageCoords(e.clientX, e.clientY, domRect, w, h);

    if (moveRef.current !== null) {
      const { idx, offX, offY } = moveRef.current;
      const updated = rectsRef.current.map((r, i) =>
        i === idx ? { ...r, x: cx - offX, y: cy - offY } : r
      );
      // Update preview directly without going through onChange (avoids churn)
      rectsRef.current = updated;
      draw();
      return;
    }

    if (drawStartRef.current) {
      const { imgX, imgY } = drawStartRef.current;
      const x = Math.min(imgX, cx);
      const y = Math.min(imgY, cy);
      const rw = Math.abs(cx - imgX);
      const rh = Math.abs(cy - imgY);
      previewRef.current = { x, y, w: rw, h: rh };
      draw();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const domRect = getOverlayRect();
    const { w, h } = getNat();
    const { x: cx, y: cy } = toImageCoords(e.clientX, e.clientY, domRect, w, h);

    if (moveRef.current !== null) {
      const { idx, offX, offY } = moveRef.current;
      moveRef.current = null;
      const updated = rectsRef.current.map((r, i) =>
        i === idx ? { ...r, x: cx - offX, y: cy - offY } : r
      );
      onChange(updated);
      return;
    }

    if (drawStartRef.current) {
      const { imgX, imgY } = drawStartRef.current;
      drawStartRef.current = null;
      previewRef.current = null;
      const x = Math.min(imgX, cx);
      const y = Math.min(imgY, cy);
      const rw = Math.abs(cx - imgX);
      const rh = Math.abs(cy - imgY);
      if (rw >= 10 && rh >= 10) {
        const newRect: Rect = { id: Date.now(), x, y, w: rw, h: rh };
        onChange([...rectsRef.current, newRect]);
      } else {
        draw();
      }
    }
  };

  return (
    <div className="rect-selector">
      <div className="corner-image-wrap">
        <img
          ref={imgRef}
          src={imageSrc}
          alt="تصویر منبع"
          className="corner-source-img"
          onLoad={() => setImgLoaded(true)}
          draggable={false}
        />
        {imgLoaded && (
          <canvas
            ref={canvasRef}
            className="corner-overlay-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        )}
        {!imgLoaded && <div className="canvas-placeholder">در حال بارگذاری تصویر…</div>}
      </div>

      <div className="corner-selector-hint">
        {rects.length === 0
          ? <span>روی تصویر بکشید تا ناحیه‌ها را انتخاب کنید</span>
          : <span>{toPersianNum(rects.length)} ناحیه انتخاب شده — برای جابجایی، بکشید</span>
        }
      </div>
    </div>
  );
}
