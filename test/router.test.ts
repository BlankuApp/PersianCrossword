// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseHash, puzzleHash } from "../app/router";

describe("puzzle hash routes", () => {
  it("keeps existing puzzle links valid without a slot", () => {
    expect(parseHash("#/puzzle/123")).toEqual({ name: "puzzle", id: "123" });
    expect(parseHash("#/puzzle/123?slot=")).toEqual({ name: "puzzle", id: "123" });
  });

  it("decodes the optional exact slot including reserved and Persian characters", () => {
    expect(parseHash("#/puzzle/123?slot=down%3A2%2F%D8%A8%20%26%3F%23%2B")).toEqual({
      name: "puzzle", id: "123", slotId: "down:2/ب &?#+",
    });
  });

  it("builds URI-safe puzzle and slot links", () => {
    expect(puzzleHash("جدول/1", "down:2/ب &?#+")).toBe("#/puzzle/%D8%AC%D8%AF%D9%88%D9%84%2F1?slot=down%3A2%2F%D8%A8%20%26%3F%23%2B");
    expect(parseHash(puzzleHash("جدول/1", "down:2/ب &?#+"))).toEqual({ name: "puzzle", id: "جدول/1", slotId: "down:2/ب &?#+" });
    expect(puzzleHash("123")).toBe("#/puzzle/123");
  });

  it("does not crash on malformed encoded puzzle or slot data", () => {
    expect(() => parseHash("#/puzzle/%?slot=%")).not.toThrow();
    expect(parseHash("#/puzzle/123?slot=%")).toEqual({ name: "puzzle", id: "123", slotId: "%" });
  });
});
