import { describe, expect, it } from "vitest";
import {
  ACROSS_CELLS,
  CROSSING_CELL,
  DEMO_BLOCKS,
  DEMO_COLS,
  DEMO_ROWS,
  DEMO_SOLUTION,
  DEMO_TRAYS,
  DOWN_CELLS,
  TUTORIAL_STEPS,
  nextPosition,
  type DemoCellId,
  type DemoDirection,
} from "../app/tutorialSteps";

describe("tutorial step data", () => {
  it("has 6 steps, each with at least one frame and positive hold times", () => {
    expect(TUTORIAL_STEPS).toHaveLength(6);
    for (const step of TUTORIAL_STEPS) {
      expect(step.frames.length).toBeGreaterThan(0);
      for (const frame of step.frames) {
        expect(frame.holdMs).toBeGreaterThan(0);
      }
    }
  });

  it("only writes letters into cells belonging to one of the two demo words", () => {
    const demoWordCells = new Set([...ACROSS_CELLS, ...DOWN_CELLS]);
    for (const step of TUTORIAL_STEPS) {
      for (const frame of step.frames) {
        for (const cell of Object.keys(frame.letters)) {
          expect(demoWordCells.has(cell as DemoCellId)).toBe(true);
        }
      }
    }
  });

  it("keeps tray, word-cell, and drop targets within their direction bounds", () => {
    const wordCells: Readonly<Record<DemoDirection, readonly DemoCellId[]>> = {
      across: ACROSS_CELLS,
      down: DOWN_CELLS,
    };
    for (const step of TUTORIAL_STEPS) {
      for (const frame of step.frames) {
        if (frame.hand.kind === "tray") {
          expect(frame.hand.index).toBeGreaterThanOrEqual(0);
          expect(frame.hand.index).toBeLessThan(DEMO_TRAYS[frame.hand.direction].length);
        }
        if (frame.hand.kind === "word-cell") {
          expect(frame.hand.index).toBeGreaterThanOrEqual(0);
          expect(frame.hand.index).toBeLessThan(wordCells[frame.hand.direction].length);
        }
        if (frame.dropTarget) {
          expect(frame.dropTarget.index).toBeGreaterThanOrEqual(0);
          expect(frame.dropTarget.index).toBeLessThan(wordCells[frame.dropTarget.direction].length);
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

  it("shows both word highlights together after the crossing cell is selected", () => {
    const selectedFrame = TUTORIAL_STEPS[0]!.frames.at(-1)!;
    expect(selectedFrame.selected).toBe(CROSSING_CELL);
    expect(selectedFrame.showHighlights).toBe(true);
    expect(selectedFrame.showClues).toBe(true);
  });

  it("never moves the selection off the crossing cell once it is selected", () => {
    for (const step of TUTORIAL_STEPS.slice(1)) {
      for (const frame of step.frames) {
        expect(frame.selected).toBe(CROSSING_CELL);
      }
    }
  });

  it("taps the whole across word in, then drags one letter into a chosen box", () => {
    const tap = TUTORIAL_STEPS.find((step) => step.id === "tap")!;
    expect(tap.frames.some((frame) => frame.drag)).toBe(false);
    expect(tap.frames.at(-1)!.letters).toEqual({ "0-1": "م", "0-2": "ر", "0-3": "ز" });

    const drag = TUTORIAL_STEPS.find((step) => step.id === "drag")!;
    expect(drag.frames.some((frame) => frame.drag && frame.dropTarget)).toBe(true);
  });

  it("switches check mode on while a wrong letter is showing", () => {
    const help = TUTORIAL_STEPS.find((step) => step.id === "help")!;
    const last = help.frames.at(-1)!;
    expect(last.checkOn).toBe(true);
    const wrong = Object.entries(last.letters).filter(
      ([cell, letter]) => letter !== DEMO_SOLUTION[cell as DemoCellId],
    );
    expect(wrong.length).toBeGreaterThan(0);
  });

  it("ends solved: every demo cell holds its answer letter", () => {
    const lastFrame = TUTORIAL_STEPS.at(-1)!.frames.at(-1)!;
    expect(lastFrame.letters).toEqual(DEMO_SOLUTION);
  });

  it("spells the demo answers in the solution", () => {
    expect(ACROSS_CELLS.map((cell) => DEMO_SOLUTION[cell]).join("")).toBe("مرز");
    expect(DOWN_CELLS.map((cell) => DEMO_SOLUTION[cell]).join("")).toBe("مادر");
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
