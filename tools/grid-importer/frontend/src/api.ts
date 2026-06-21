export interface ApiRect { x: number; y: number; w: number; h: number; }
export interface ExtractResult { stitched_png_b64: string; }
export interface ParseResult { markdown_full: string; text_full: string; }

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

export async function parseLlamaCloud(
  image: Blob,
  apiKey: string,
): Promise<ParseResult> {
  const fd = new FormData();
  fd.append('image', image, 'image.png');
  fd.append('api_key', apiKey);

  const resp = await fetch('/api/parse-llamacloud', { method: 'POST', body: fd });
  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(data.detail ?? resp.statusText);
  }

  return data as ParseResult;
}
