import type { Corner, DetectResult } from './types';

export async function detectGrid(
  image: Blob,
  n: number | null,
  corners: Corner[] | null,
): Promise<DetectResult> {
  const fd = new FormData();
  fd.append('image', image, 'image.png');
  if (n !== null) fd.append('n', String(n));
  if (corners !== null) fd.append('corners', JSON.stringify(corners));

  const resp = await fetch('/api/detect', { method: 'POST', body: fd });
  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.detail ?? resp.statusText);
  }

  return data as DetectResult;
}

export interface ApiRect { x: number; y: number; w: number; h: number; }
export interface ExtractResult { stitched_png_b64: string; }

export async function extractColumns(
  image: Blob,
  rects: ApiRect[],
): Promise<ExtractResult> {
  const fd = new FormData();
  fd.append('image', image, 'image.png');
  fd.append('rects', JSON.stringify(rects));

  const resp = await fetch('/api/extract-columns', { method: 'POST', body: fd });
  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.detail ?? resp.statusText);
  }

  return data as ExtractResult;
}
