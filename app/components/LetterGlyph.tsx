import { letterGlyph } from "../letterGlyphs";

export function LetterGlyph({ letter }: { readonly letter: string | null | undefined }) {
  const svg = letter ? letterGlyph(letter) : undefined;
  return svg ? (
    <span className="cell-value" dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <span className="cell-value">{letter ?? ""}</span>
  );
}
