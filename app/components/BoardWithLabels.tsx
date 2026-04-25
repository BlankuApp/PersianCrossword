import { compilePuzzle } from "../../src/index";

interface BoardWithLabelsProps {
  readonly puzzle: ReturnType<typeof compilePuzzle>;
  readonly children: React.ReactNode;
}

export function BoardWithLabels({ puzzle, children }: BoardWithLabelsProps) {
  const { rows, cols } = puzzle.size;
  return (
    <div className="board-with-labels">
      <div className="board-top-row">
        <div className="corner-spacer" />
        <div
          className="col-numbers"
          style={{ "--grid-cols": cols } as React.CSSProperties}
        >
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className="col-number">
              {c + 1}
            </span>
          ))}
        </div>
      </div>
      <div className="board-bottom-row">
        <div className="row-numbers">
          {Array.from({ length: rows }, (_, r) => (
            <span key={r} className="row-number">
              {r + 1}
            </span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
