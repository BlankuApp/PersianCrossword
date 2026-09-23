import { describe, expect, it, vi } from "vitest";

vi.mock("../app/firebase", () => ({ functions: {} }));

import { AI_GENERIC_ERROR, QuotaError, toAiError } from "../app/gemini";

const fnError = (code: string, details?: unknown) => Object.assign(new Error("x"), { code, details });

describe("toAiError", () => {
  it("maps a per-user quota error with its tier and limit", () => {
    const err = toAiError(fnError("functions/resource-exhausted", { reason: "user", tier: "guest", limit: 10 }));
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).info).toEqual({ reason: "user", tier: "guest", limit: 10 });
  });

  it("maps a shared quota error", () => {
    const err = toAiError(fnError("functions/resource-exhausted", { reason: "shared" }));
    expect((err as QuotaError).info).toEqual({ reason: "shared" });
  });

  it("falls back to shared when details are malformed", () => {
    const err = toAiError(fnError("functions/resource-exhausted", { reason: "user", tier: "vip" }));
    expect((err as QuotaError).info).toEqual({ reason: "shared" });
  });

  it("maps other errors to the generic message", () => {
    for (const e of [fnError("functions/unavailable"), new TypeError("Failed to fetch"), "boom"]) {
      const err = toAiError(e);
      expect(err).not.toBeInstanceOf(QuotaError);
      expect(err.message).toBe(AI_GENERIC_ERROR);
    }
  });
});
