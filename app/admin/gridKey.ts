import type { CrosswordJson } from "../../src/index";

// Identifies a puzzle's grid, so the solver restarts when saved answers or blocks change but
// not when only a clue was edited.
export function gridKey(json: CrosswordJson): string {
  return json.grid.map((row) => row.join("\u0001")).join("\u0002");
}
