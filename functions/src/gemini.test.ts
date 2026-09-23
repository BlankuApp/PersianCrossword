import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiHttpError, streamGemini } from "./gemini.js";

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const event = (text: string) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;

afterEach(() => vi.unstubAllGlobals());

describe("streamGemini", () => {
  it("emits each text part in order", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([event("سلا"), event("م")])));
    const out: string[] = [];
    await streamGemini("p", "k", (t) => void out.push(t));
    expect(out).toEqual(["سلا", "م"]);
  });

  it("joins an event split across chunks", async () => {
    const full = event("کتاب");
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([full.slice(0, 20), full.slice(20)])));
    const out: string[] = [];
    await streamGemini("p", "k", (t) => void out.push(t));
    expect(out).toEqual(["کتاب"]);
  });

  it("sends the key and prompt to the streaming endpoint", async () => {
    const fetchMock = vi.fn(async () => sseResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    await streamGemini("پرسش", "secret-key", () => {});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("gemini-flash-lite-latest:streamGenerateContent?alt=sse");
    expect(url).toContain("key=secret-key");
    expect(JSON.parse(String(init.body))).toEqual({ contents: [{ parts: [{ text: "پرسش" }] }] });
  });

  it("throws GeminiHttpError with the status on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const err = await streamGemini("p", "k", () => {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiHttpError);
    expect((err as GeminiHttpError).status).toBe(429);
  });
});
