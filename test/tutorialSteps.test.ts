import { describe, expect, it } from "vitest";
import {
  ACROSS_CELLS,
  CROSSING_CELL,
  DEMO_BLOCKS,
  DEMO_COLS,
  DEMO_ROWS,
  DEMO_TRAY,
  DOWN_CELLS,
  TUTORIAL_STEPS,
  nextPosition,
  type DemoCellId,
} from "../app/tutorialSteps";

describe("tutorial step data", () => {
  it("has 5 steps, each with at least one frame and positive hold times", () => {
    expect(TUTORIAL_STEPS).toHaveLength(5);
    for (const step of TUTORIAL_STEPS) {
      expect(step.frames.length).toBeGreaterThan(0);
      for (const frame of step.frames) {
        expect(frame.holdMs).toBeGreaterThan(0);
      }
    }
  });

  it("only writes letters into cells of the down word", () => {
    for (const step of TUTORIAL_STEPS) {
      for (const frame of step.frames) {
        for (const cell of Object.keys(frame.letters)) {
          expect(DOWN_CELLS).toContain(cell as DemoCellId);
        }
      }
    }
  });

  it("keeps hand tray targets within the demo tray bounds", () => {
    for (const step of TUTORIAL_STEPS) {
      for (const frame of step.frames) {
        if (frame.hand.kind === "tray") {
          expect(frame.hand.index).toBeGreaterThanOrEqual(0);
          expect(frame.hand.index).toBeLessThan(DEMO_TRAY.length);
        }
      }
    }
  });

  it("crosses the across and down words at exactly the crossing cell", () => {
    const shared = ACROSS_CELLS.filter((cell) => DOWN_CELLS.includes(cell));
    expect(shared).toEqual([CROSSING_CELL]);
  });

  it("keeps every word cell on an open (non-block) grid cell", () => {
    expect(DEMO_BLOCKS).toHaveLength(DEMO_ROWS);
    for (const row of DEMO_BLOCKS) {
      expect(row).toHaveLength(DEMO_COLS);
    }
    for (const cell of [...ACROSS_CELLS, ...DOWN_CELLS]) {
      const [row, col] = cell.split("-").map(Number);
      expect(DEMO_BLOCKS[row!]![col!]).toBe(false);
    }
  });

  it("ends the clear step with an empty grid", () => {
    const lastStep = TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]!;
    const lastFrame = lastStep.frames[lastStep.frames.length - 1]!;
    expect(Object.keys(lastFrame.letters)).toHaveLength(0);
  });
});

describe("nextPosition", () => {
  it("advances within a step", () => {
    expect(nextPosition(TUTORIAL_STEPS, { stepIndex: 0, frameIndex: 0 })).toEqual({
      stepIndex: 0,
      frameIndex: 1,
    });
  });

  it("moves to the next step after the last frame", () => {
    const lastFrame = TUTORIAL_STEPS[0]!.frames.length - 1;
    expect(nextPosition(TUTORIAL_STEPS, { stepIndex: 0, frameIndex: lastFrame })).toEqual({
      stepIndex: 1,
      frameIndex: 0,
    });
  });

  it("wraps from the end of the last step back to the start", () => {
    const lastStep = TUTORIAL_STEPS.length - 1;
    const lastFrame = TUTORIAL_STEPS[lastStep]!.frames.length - 1;
    expect(nextPosition(TUTORIAL_STEPS, { stepIndex: lastStep, frameIndex: lastFrame })).toEqual({
      stepIndex: 0,
      frameIndex: 0,
    });
  });

  it("recovers to the start from an out-of-range step", () => {
    expect(nextPosition(TUTORIAL_STEPS, { stepIndex: 99, frameIndex: 0 })).toEqual({
      stepIndex: 0,
      frameIndex: 0,
    });
  });
});
