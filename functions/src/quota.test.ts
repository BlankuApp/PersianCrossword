import { describe, expect, it } from "vitest";
import { decide, isValidPrompt, LIMITS, MAX_PROMPT_LENGTH, tehranDay, tierFor } from "./quota.js";

describe("decide", () => {
  it("allows first use and starts the count at 1", () => {
    expect(decide(undefined, "2026-09-23", 10)).toEqual({ allow: true, next: { day: "2026-09-23", count: 1 } });
  });

  it("increments within the same day", () => {
    expect(decide({ day: "2026-09-23", count: 4 }, "2026-09-23", 10)).toEqual({
      allow: true,
      next: { day: "2026-09-23", count: 5 },
    });
  });

  it("denies once the limit is reached", () => {
    expect(decide({ day: "2026-09-23", count: 10 }, "2026-09-23", 10)).toEqual({ allow: false });
  });

  it("resets on a new day even if yesterday was exhausted", () => {
    expect(decide({ day: "2026-09-22", count: 10 }, "2026-09-23", 10)).toEqual({
      allow: true,
      next: { day: "2026-09-23", count: 1 },
    });
  });
});

describe("tehranDay", () => {
  it("tehranDay switches at 20:30 UTC", () => {
    expect(tehranDay(new Date("2026-09-23T20:29:00Z"))).toBe("2026-09-23");
    expect(tehranDay(new Date("2026-09-23T20:31:00Z"))).toBe("2026-09-24");
  });
});

describe("tierFor", () => {
  it("maps anonymous to guest and everything else to account", () => {
    expect(tierFor("anonymous")).toBe("guest");
    expect(tierFor("google.com")).toBe("account");
    expect(tierFor("password")).toBe("account");
    expect(tierFor(undefined)).toBe("account");
  });

  it("has the agreed limits", () => {
    expect(LIMITS).toEqual({ guest: 10, account: 100 });
  });
});

describe("isValidPrompt", () => {
  it("accepts a normal prompt and the max length", () => {
    expect(isValidPrompt("سلام")).toBe(true);
    expect(isValidPrompt("a".repeat(MAX_PROMPT_LENGTH))).toBe(true);
  });

  it("rejects non-strings, blank, and over-long prompts", () => {
    expect(isValidPrompt(undefined)).toBe(false);
    expect(isValidPrompt(42)).toBe(false);
    expect(isValidPrompt("   ")).toBe(false);
    expect(isValidPrompt("a".repeat(MAX_PROMPT_LENGTH + 1))).toBe(false);
  });
});
