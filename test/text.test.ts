import { describe, expect, it } from "vitest";
import {
  countPersianGraphemes,
  normalizePersianText,
  splitPersianGraphemes,
} from "../src/index.js";

describe("Persian text normalization", () => {
  it("normalizes Arabic yeh and kaf to Persian forms", () => {
    expect(normalizePersianText("يك")).toBe("یک");
  });

  it("strips Arabic diacritics and tatweel", () => {
    expect(normalizePersianText("سَــلام")).toBe("سلام");
  });

  it("counts normalized grapheme characters", () => {
    expect(countPersianGraphemes("سَلام")).toBe(4);
    expect(splitPersianGraphemes("كی")).toEqual(["ک", "ی"]);
  });
});
