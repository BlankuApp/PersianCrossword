import type { CrosswordJson } from "../src/index";
import sample10 from "../samples/sample-10x10-garden.json";
import sample11 from "../samples/sample-11x11-city.json";
import sample12 from "../samples/sample-12x12-weekend.json";
import sample15 from "../samples/sample-15x15-9439.json";

export interface SamplePuzzle {
  readonly id: string;
  readonly label: string;
  readonly json: CrosswordJson;
}

export const samplePuzzles: readonly SamplePuzzle[] = [
  {
    id: "sample-10x10-garden",
    label: "۱۰ × ۱۰",
    json: sample10 as CrosswordJson,
  },
  {
    id: "sample-11x11-city",
    label: "۱۱ × ۱۱",
    json: sample11 as CrosswordJson,
  },
  {
    id: "sample-12x12-weekend",
    label: "۱۲ × ۱۲",
    json: sample12 as CrosswordJson,
  },
  {
    id: "sample-15x15-9439",
    label: "۱۵ × ۱۵",
    json: sample15 as CrosswordJson,
  }
];
