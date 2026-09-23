import { describe, expect, it, vi } from "vitest";

const callable = vi.hoisted(() => ({ stream: vi.fn() }));

vi.mock("../app/firebase", () => ({ functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => callable }));

import { AI_GENERIC_ERROR, QuotaError, streamFreeAi, toAiError } from "../app/gemini";

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

describe("streamFreeAi", () => {
  it("rejects with QuotaError and leaves no unhandled rejection when the stream errors", async () => {
    // The SDK errors the iterator and rejects `data` with the same error.
    const err = fnError("functions/resource-exhausted", { reason: "shared" });
    callable.stream.mockResolvedValue({
      stream: (async function* () {
        yield* [];
        throw err;
      })(),
      data: Promise.reject(err),
    });
    await expect(streamFreeAi("p", () => {}, new AbortController().signal)).rejects.toBeInstanceOf(QuotaError);
    await new Promise((r) => setTimeout(r, 0));
  });
});
