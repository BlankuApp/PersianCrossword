export type Corner = [number, number]; // [x, y] in image pixel coords

export interface DetectResult {
  rows: number;
  cols: number;
  matrix: number[][];
  warped_png_b64: string;
  corners: Corner[];
}

export type Step = 'upload' | 'detect' | 'edit' | 'export';
export type ColStep = 'upload' | 'select' | 'export';
