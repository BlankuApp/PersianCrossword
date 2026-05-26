import { useRef, useCallback } from 'react';

interface Props {
  matrix: number[][];
  onChange: (matrix: number[][]) => void;
}

export default function CellGrid({ matrix, onChange }: Props) {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;

  // Paint-drag: records whether the stroke is filling (1) or clearing (0)
  const paintIntentRef = useRef<number | null>(null);
  const focusedRef = useRef<{ r: number; c: number }>({ r: 0, c: 0 });

  const toggle = useCallback((r: number, c: number, force?: number) => {
    const next = matrix.map(row => [...row]);
    next[r][c] = force !== undefined ? force : next[r][c] ^ 1;
    onChange(next);
  }, [matrix, onChange]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>, r: number, c: number) => {
    const intent = matrix[r][c] ^ 1; // flip the cell under the pointer
    paintIntentRef.current = intent;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    toggle(r, c, intent);
  };

  const handlePointerEnter = (r: number, c: number) => {
    if (paintIntentRef.current !== null) {
      toggle(r, c, paintIntentRef.current);
    }
  };

  const handlePointerUp = () => {
    paintIntentRef.current = null;
  };

  const cellAt = (r: number, c: number) =>
    document.querySelector<HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    let nr = r, nc = c;
    switch (e.key) {
      case 'ArrowRight': nc = (c - 1 + cols) % cols; break;
      case 'ArrowLeft':  nc = (c + 1) % cols;        break;
      case 'ArrowDown':  nr = (r + 1) % rows;        break;
      case 'ArrowUp':    nr = (r - 1 + rows) % rows; break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        toggle(r, c);
        return;
      default: return;
    }
    e.preventDefault();
    focusedRef.current = { r: nr, c: nc };
    cellAt(nr, nc)?.focus();
  };

  return (
    <div
      className="cell-grid"
      role="grid"
      aria-label="ویرایش خانه‌های جدول"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {matrix.map((row, r) =>
        row.map((val, c) => (
          <button
            key={`${r}-${c}`}
            className={'cell' + (val ? ' black' : '')}
            data-r={r}
            data-c={c}
            role="gridcell"
            aria-label={`ردیف ${r + 1} ستون ${c + 1}${val ? ' — مشکی' : ''}`}
            tabIndex={r === 0 && c === 0 ? 0 : -1}
            onPointerDown={e => handlePointerDown(e, r, c)}
            onPointerEnter={() => handlePointerEnter(r, c)}
            onKeyDown={e => handleKeyDown(e, r, c)}
          />
        ))
      )}
    </div>
  );
}
