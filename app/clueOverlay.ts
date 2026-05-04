import type { CSSProperties } from "react";

export type OverlayCorner = "top-left" | "top-right";

export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface OverlaySize {
  readonly width: number;
  readonly height: number;
}

interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface ViewportFrame extends ViewportSize {
  readonly left: number;
  readonly top: number;
}

interface ChooseOverlayCornerOptions {
  readonly slotRect: RectLike;
  readonly overlaySize: OverlaySize;
  readonly viewport: ViewportSize;
  readonly margin: number;
  readonly gap: number;
}

interface CandidateCorner {
  readonly corner: OverlayCorner;
  readonly rect: RectLike;
}

const CORNER_ORDER: readonly OverlayCorner[] = ["top-right", "top-left"];

export function chooseOverlayCorner({
  slotRect,
  overlaySize,
  viewport,
  margin,
  gap,
}: ChooseOverlayCornerOptions): OverlayCorner {
  const candidates = getCandidateCorners(viewport, overlaySize, margin);
  const exclusionRect = expandRect(slotRect, gap);
  const scored = candidates.map((candidate) => ({
    corner: candidate.corner,
    isSafe: !rectsOverlap(candidate.rect, exclusionRect),
    distance: rectCenterDistanceSquared(candidate.rect, slotRect),
  }));

  const safe = scored.filter((candidate) => candidate.isSafe);
  const pool = safe.length > 0 ? safe : scored;

  pool.sort((a, b) => {
    if (b.distance !== a.distance) {
      return b.distance - a.distance;
    }
    return CORNER_ORDER.indexOf(a.corner) - CORNER_ORDER.indexOf(b.corner);
  });

  return pool[0]?.corner ?? "top-right";
}

export function getOverlayViewportStyle(
  corner: OverlayCorner,
  margin: number,
  viewport: ViewportFrame,
  overlayWidth: number,
): CSSProperties {
  const minLeft = viewport.left + margin;
  const maxLeft = Math.max(minLeft, viewport.left + viewport.width - margin - overlayWidth);
  const preferredLeft =
    corner === "top-left"
      ? minLeft
      : viewport.left + viewport.width - margin - overlayWidth;

  const base: CSSProperties = {
    position: "fixed",
    top: viewport.top + margin,
    left: Math.min(Math.max(preferredLeft, minLeft), maxLeft),
    zIndex: 950,
    pointerEvents: "none",
  };

  switch (corner) {
    case "top-left":
    case "top-right":
      return base;
  }
}

export function unionRects(rects: readonly RectLike[]): RectLike | undefined {
  if (rects.length === 0) {
    return undefined;
  }

  return rects.reduce<RectLike>(
    (acc, rect) => ({
      left: Math.min(acc.left, rect.left),
      top: Math.min(acc.top, rect.top),
      right: Math.max(acc.right, rect.right),
      bottom: Math.max(acc.bottom, rect.bottom),
    }),
    rects[0]!,
  );
}

function getCandidateCorners(
  viewport: ViewportSize,
  overlaySize: OverlaySize,
  margin: number,
): readonly CandidateCorner[] {
  const width = overlaySize.width;
  const height = overlaySize.height;
  const top = margin;
  const left = margin;
  const right = viewport.width - margin - width;
  const bottom = viewport.height - margin - height;

  return [
    {
      corner: "top-right",
      rect: { left: right, top, right: right + width, bottom: top + height },
    },
    {
      corner: "top-left",
      rect: { left, top, right: left + width, bottom: top + height },
    },
  ];
}

function expandRect(rect: RectLike, gap: number): RectLike {
  return {
    left: rect.left - gap,
    top: rect.top - gap,
    right: rect.right + gap,
    bottom: rect.bottom + gap,
  };
}

function rectsOverlap(a: RectLike, b: RectLike): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rectCenterDistanceSquared(a: RectLike, b: RectLike): number {
  const aCenterX = (a.left + a.right) / 2;
  const aCenterY = (a.top + a.bottom) / 2;
  const bCenterX = (b.left + b.right) / 2;
  const bCenterY = (b.top + b.bottom) / 2;
  const deltaX = aCenterX - bCenterX;
  const deltaY = aCenterY - bCenterY;
  return deltaX ** 2 + deltaY ** 2;
}
