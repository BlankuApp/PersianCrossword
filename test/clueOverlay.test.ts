import { describe, expect, it } from "vitest";
import { chooseOverlayCorner, getOverlayViewportStyle } from "../app/clueOverlay";

describe("chooseOverlayCorner", () => {
  it("prefers a corner that does not overlap the selected slot", () => {
    const corner = chooseOverlayCorner({
      slotRect: { left: 10, top: 12, right: 200, bottom: 110 },
      overlaySize: { width: 180, height: 80 },
      viewport: { width: 900, height: 700 },
      margin: 12,
      gap: 16,
    });

    expect(corner).toBe("top-right");
  });

  it("chooses the farthest safe corner when several are available", () => {
    const corner = chooseOverlayCorner({
      slotRect: { left: 620, top: 40, right: 820, bottom: 180 },
      overlaySize: { width: 180, height: 80 },
      viewport: { width: 960, height: 720 },
      margin: 12,
      gap: 16,
    });

    expect(corner).toBe("top-left");
  });

  it("returns a deterministic corner when every corner is constrained", () => {
    const corner = chooseOverlayCorner({
      slotRect: { left: 120, top: 120, right: 680, bottom: 520 },
      overlaySize: { width: 280, height: 180 },
      viewport: { width: 800, height: 640 },
      margin: 12,
      gap: 48,
    });

    expect(corner).toBe("top-right");
  });

  it("positions the overlay relative to the visible viewport offsets", () => {
    const style = getOverlayViewportStyle(
      "top-right",
      12,
      { left: 30, top: 140, width: 360, height: 500 },
      180,
    );

    expect(style).toMatchObject({
      position: "fixed",
      top: 152,
      left: 198,
      pointerEvents: "none",
    });
  });
});
