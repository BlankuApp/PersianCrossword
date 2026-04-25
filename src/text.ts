type SegmenterLike = {
  segment(input: string): Iterable<{ segment: string }>;
};

type SegmenterConstructor = new (
  locale?: string,
  options?: { granularity?: "grapheme" },
) => SegmenterLike;

const ARABIC_DIACRITICS_AND_TATWEEL =
  /[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g;

const intlWithSegmenter = Intl as typeof Intl & {
  Segmenter?: SegmenterConstructor;
};

const graphemeSegmenter = intlWithSegmenter.Segmenter
  ? new intlWithSegmenter.Segmenter("fa", { granularity: "grapheme" })
  : undefined;

export function normalizePersianText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0649/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(ARABIC_DIACRITICS_AND_TATWEEL, "")
    .normalize("NFC");
}

export function splitGraphemes(value: string): string[] {
  if (!graphemeSegmenter) {
    return Array.from(value);
  }

  return Array.from(graphemeSegmenter.segment(value), (part) => part.segment);
}

export function splitPersianGraphemes(value: string): string[] {
  return splitGraphemes(normalizePersianText(value));
}

export function countPersianGraphemes(value: string): number {
  return splitPersianGraphemes(value).length;
}
