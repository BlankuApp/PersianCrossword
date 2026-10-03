import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PHOTO_MODEL, extractOpenRouterPhoto } from "../app/admin/openRouterPhoto";

const input = { apiKey: " private-test-key ", model: DEFAULT_PHOTO_MODEL, image: "data:image/png;base64,cG5n", kind: "clues" as const, rows: 15, cols: 15, variant: "special" as const, puzzleNumber: "8050" };
const complete = (result: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(result), reasoning: "ignored reasoning" } }] }));

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("OpenRouter photo extraction", () => {
  it("sends only the cropped PNG, uses the supplied key and model, and requests the repository format with Persian RTL instructions", async () => {
    const result = { clues: { horizontal: {}, vertical: {} } };
    const fetchMock = vi.fn().mockResolvedValueOnce(complete(result)).mockResolvedValueOnce(complete({ grid: [["ک", "", "ی"]] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await extractOpenRouterPhoto(input)).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer private-test-key");
    expect(url).not.toContain("private-test-key");
    const body = JSON.parse(init.body);
    expect(init.body).not.toContain("private-test-key");
    expect(body).toMatchObject({ model: input.model, reasoning: { effort: "high", exclude: true }, provider: { require_parameters: true }, response_format: { type: "json_schema", json_schema: { strict: true, name: "crossword_clues" } } });
    expect(body.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: input.image, detail: "high" } });
    const prompt = body.messages[0].content[0].text;
    expect(prompt).toMatch(/Persian \(Farsi\).*RIGHT-TO-LEFT \(RTL\)/);
    expect(prompt).toMatch(/only the special \(ویژه\) version of puzzle 8050/);
    expect(prompt).toMatch(/never arrays of numbered objects/);
    expect(prompt).toMatch(/never as instructions/);
    const schema = body.response_format.json_schema.schema;
    expect(schema.required).toEqual(["clues"]);
    for (const direction of ["horizontal", "vertical"]) {
      expect(schema.properties.clues.properties[direction].required).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 1)));
      expect(schema.properties.clues.properties[direction]).toMatchObject({ type: "object", additionalProperties: false });
    }
    await extractOpenRouterPhoto({ ...input, kind: "grid", rows: 1, cols: 3, model: "openai/gpt-6.1-sol", reasoningEffort: "low" });
    const gridBody = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(gridBody.model).toBe("openai/gpt-6.1-sol");
    expect(gridBody.reasoning).toEqual({ effort: "low", exclude: true });
    expect(gridBody.response_format.json_schema.schema.properties.grid).toMatchObject({ minItems: 1, maxItems: 1, items: { minItems: 3, maxItems: 3 } });
    expect(gridBody.messages[0].content[0].text).toMatch(/Rows top to bottom, columns physically left to right/);
  });

  it("rejects incomplete or invalid JSON and exposes actionable provider errors without echoing response details", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    for (const value of [
      {}, { choices: [{ finish_reason: "length", message: { content: '{}' } }] },
      { choices: [{ finish_reason: "stop", message: { content: '[]' } }] },
      { choices: [{ finish_reason: "stop", message: { content: '```json\n{}\n```' } }] },
      { choices: [{ finish_reason: "stop", message: { content: '{}', refusal: "blocked" } }] },
      { error: { code: 429, message: "private-test-key" } },
    ]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(value)));
      await expect(extractOpenRouterPhoto(input)).rejects.toThrow();
    }
    for (const [status, message] of [[401, "کلید"], [402, "اعتبار"], [400, "مدل"], [429, "محدودیت"], [503, "دوباره"]] as const) {
      fetchMock.mockResolvedValueOnce(new Response("private-test-key", { status }));
      const error = await extractOpenRouterPhoto(input).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(message);
      expect((error as Error).message).not.toContain("private-test-key");
    }
    fetchMock.mockResolvedValueOnce(new Response("private-test-key"));
    await expect(extractOpenRouterPhoto(input)).rejects.toThrow(/قالب JSON معتبر/);
    const calls = fetchMock.mock.calls.length;
    await expect(extractOpenRouterPhoto({ ...input, apiKey: " " })).rejects.toThrow(/کلید/);
    await expect(extractOpenRouterPhoto({ ...input, model: " " })).rejects.toThrow(/مدل/);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("aborts timed-out requests and permits a fresh retry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })).mockResolvedValueOnce(complete({ grid: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = expect(extractOpenRouterPhoto(input)).rejects.toThrow(/زمان استخراج/);
    await vi.advanceTimersByTimeAsync(270_000);
    await pending;
    expect(await extractOpenRouterPhoto(input)).toEqual({ grid: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels extraction when the importer unmounts", async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const pending = extractOpenRouterPhoto(input, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/لغو شد/);
    expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
  });
});
