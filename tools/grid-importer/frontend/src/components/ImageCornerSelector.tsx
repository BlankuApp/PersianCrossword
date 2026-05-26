import { useRef, useEffect, useCallback, useState } from 'react';
import type { Corner } from '../types';

interface Props {
  imageSrc: string;
  corners: Corner[] | null;
  onChange: (corners: Corner[]) => void;
}

const HANDLE_RADIUS = 9;

function toImageCoords(
  clientX: number, clientY: number,
  rect: DOMRect, natW: number, natH: number,
): Corner {
  return [
    (clientX - rect.left) / rect.width * natW,
    (clientY - rect.top) / rect.height * natH,
  ];
}

function toDisplayCoords(
  imgX: number, imgY: number,
  dispW: number, dispH: number,
  natW: number, natH: number,
): { x: number; y: number } {
  return { x: imgX / natW * dispW, y: imgY / natH * dispH };
}

function cornersFromRect(x1: number, y1: number, x2: number, y2: number): [Corner, Corner, Corner, Corner] {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}

export default function ImageCornerSelector({ imageSrc, corners, onChange }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawStartRef = useRef<{ imgX: number; imgY: number } | null>(null);
  const dragHandleRef = useRef<number | null>(null);
  const cornersRef = useRef<Corner[] | null>(corners);
  useEffect(() => { cornersRef.current = corners; }, [corners]);

  const [imgLoaded, setImgLoaded] = useState(false);

  // Always use the image's bounding rect for coordinate math — it's always correct.
  const getOverlayRect = useCallback(() => imgRef.current!.getBoundingClientRect(), []);
  const getNat = useCallback(() => ({
    w: imgRef.current!.naturalWidth,
    h: imgRef.current!.naturalHeight,
  }), []);

  const draw = useCallback((previewCorners?: Corner[]) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.naturalWidth) return;

    // Read dimensions from the image, not from the canvas (canvas may not be laid out yet).
    const dispW = img.offsetWidth;
    const dispH = img.offsetHeight;
    if (!dispW || !dispH) return;

    // Keep canvas CSS position + size in sync with the image.
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

    const pts = previewCorners ?? cornersRef.current;
    if (!pts || pts.length < 2) return;

    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const mapped = pts.map(([ix, iy]) => toDisplayCoords(ix, iy, dispW, dispH, natW, natH));

    // Fill
    ctx.beginPath();
    ctx.moveTo(mapped[0].x, mapped[0].y);
    for (let i = 1; i < mapped.length; i++) ctx.lineTo(mapped[i].x, mapped[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(26, 115, 232, 0.12)';
    ctx.fill();

    // Dashed border
    ctx.beginPath();
    ctx.setLineDash([8, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(26, 115, 232, 0.9)';
    ctx.moveTo(mapped[0].x, mapped[0].y);
    for (let i = 1; i < mapped.length; i++) ctx.lineTo(mapped[i].x, mapped[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    if (pts.length < 4) return;

    // Handles
    const labels = ['۱', '۲', '۳', '۴'];
    mapped.forEach((pt, i) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#1a73e8';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], pt.x, pt.y);
    });
  }, []);

  // Align canvas exactly over the image (position + size) so pointer events cover the full image
  // before the first draw() call.
  useEffect(() => {
    if (!imgLoaded) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.style.top    = img.offsetTop    + 'px';
    canvas.style.left   = img.offsetLeft   + 'px';
    canvas.style.width  = img.offsetWidth  + 'px';
    canvas.style.height = img.offsetHeight + 'px';
  }, [imgLoaded]);

  useEffect(() => {
    if (imgLoaded) draw();
  }, [corners, imgLoaded, draw]);

  const hitTestHandle = (clientX: number, clientY: number): number => {
    const pts = cornersRef.current;
    if (!pts || pts.length < 4) return -1;
    const rect = getOverlayRect();
    const { w, h } = getNat();
    for (let i = 0; i < pts.length; i++) {
      const d = toDisplayCoords(pts[i][0], pts[i][1], rect.width, rect.height, w, h);
      const dx = clientX - rect.left - d.x;
      const dy = clientY - rect.top - d.y;
      if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_RADIUS + 4) return i;
    }
    return -1;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const hitIdx = hitTestHandle(e.clientX, e.clientY);
    if (hitIdx >= 0) {
      dragHandleRef.current = hitIdx;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const rect = getOverlayRect();
    const { w, h } = getNat();
    const [ix, iy] = toImageCoords(e.clientX, e.clientY, rect, w, h);
    drawStartRef.current = { imgX: ix, imgY: iy };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const rect = getOverlayRect();
    const { w, h } = getNat();
    const [cx, cy] = toImageCoords(e.clientX, e.clientY, rect, w, h);

    if (dragHandleRef.current !== null) {
      const pts = cornersRef.current ? ([...cornersRef.current] as Corner[]) : null;
      if (!pts) return;
      pts[dragHandleRef.current] = [cx, cy];
      draw(pts);
      return;
    }
    if (drawStartRef.current) {
      draw(cornersFromRect(drawStartRef.current.imgX, drawStartRef.current.imgY, cx, cy));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const rect = getOverlayRect();
    const { w, h } = getNat();
    const [cx, cy] = toImageCoords(e.clientX, e.clientY, rect, w, h);

    if (dragHandleRef.current !== null) {
      const pts = cornersRef.current ? ([...cornersRef.current] as Corner[]) : null;
      if (pts) {
        pts[dragHandleRef.current] = [cx, cy];
        onChange(pts);
      }
      dragHandleRef.current = null;
      return;
    }
    if (drawStartRef.current) {
      const { imgX, imgY } = drawStartRef.current;
      drawStartRef.current = null;
      if (Math.abs(cx - imgX) < 10 && Math.abs(cy - imgY) < 10) { draw(); return; }
      onChange(cornersFromRect(imgX, imgY, cx, cy));
    }
  };

  const handleClear = () => onChange([]);

  return (
    <div className="corner-selector">
      <div className="corner-image-wrap">
        <img
          ref={imgRef}
          src={imageSrc}
          alt="تصویر اصلی"
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
        {(!corners || corners.length === 0) && (
          <span>روی تصویر بکشید تا محدوده جدول را مشخص کنید</span>
        )}
        {corners && corners.length === 4 && (
          <>
            <span>گوشه‌ها تنظیم شدند — برای جابجایی دقیق، دستگیره‌ها را بکشید</span>
            <button className="btn btn-ghost btn-sm" onClick={handleClear}>پاک کردن</button>
          </>
        )}
      </div>
    </div>
  );
}
