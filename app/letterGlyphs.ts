const files = import.meta.glob("./assets/letters/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const glyphsByLetter: Record<string, string> = {};
for (const [path, raw] of Object.entries(files)) {
  const hex = path.match(/(\w+)\.svg$/)![1]!;
  glyphsByLetter[String.fromCodePoint(parseInt(hex, 16))] = raw;
}

export function letterGlyph(letter: string): string | undefined {
  return glyphsByLetter[letter];
}
