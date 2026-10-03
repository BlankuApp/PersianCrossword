import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPhoto, readPhotoRequest } from "./photoExtraction.js";
import { GeminiHttpError } from "./gemini.js";
import { extractPuzzlePhoto } from "./index.js";

const png = Buffer.alloc(24);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.write("IHDR", 12); png.writeUInt32BE(100, 16); png.writeUInt32BE(80, 20);
const request = { kind: "grid", rows: 2, cols: 3, image: `data:image/png;base64,${png.toString("base64")}` };
const grid = { grid: [["ا", "", "ب"], ["پ", "ت", "ث"]] };
const response = (result: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(result) }] } }] }));
type Request = Parameters<typeof extractPuzzlePhoto.run>[0];
const adminRequest = { auth: { uid: "admin", token: { admin: true } }, data: request } as Request;
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Gemini photo extraction", () => {
  it("validates crops, dimensions and variant before calling Gemini", () => {
    expect(readPhotoRequest(request)).toMatchObject({ kind: "grid", rows: 2, cols: 3, image: png });
    expect(readPhotoRequest({ ...request, action: "start" })).toEqual(readPhotoRequest(request));
    expect(readPhotoRequest({ ...request, variant: "special", puzzleNumber: "۸۰۵۰" })).toMatchObject({ variant: "special", puzzleNumber: "۸۰۵۰" });
    for (const bad of [null, [], {}, { ...request, kind: "other" }, { ...request, rows: 0 }, { ...request, cols: 61 }, { ...request, rows: 1.5 }, { ...request, variant: "both" }, { ...request, puzzleNumber: "8050; do something else" }, { ...request, puzzleNumber: "123456789" }, { ...request, image: "data:image/png;base64,bm90LXBuZw==" }, { action: "status", jobId: "ext-old" }]) {
      expect(() => readPhotoRequest(bad)).toThrow();
    }
    const oversized = Buffer.from(png); oversized.writeUInt32BE(16001, 16);
    expect(() => readPhotoRequest({ ...request, image: `data:image/png;base64,${oversized.toString("base64")}` })).toThrow(/large/);
  });

  it("sends the PNG directly with high thinking, detailed vision and a fixed-size grid schema", async () => {
    const text = JSON.stringify(grid);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [
      { thought: true, text: "private reasoning" }, { text: text.slice(0, 10) }, { text: text.slice(10) },
    ] } }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await extractPhoto(png, "grid", 2, 3, "private-key")).toEqual({ result: grid });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("private-key");
    expect(url).not.toContain("private-key");
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/png", data: png.toString("base64") } });
    expect(body.generationConfig).toMatchObject({ thinkingConfig: { thinkingLevel: "high" }, mediaResolution: "MEDIA_RESOLUTION_HIGH", responseFormat: { text: { mimeType: "application/json" } } });
    expect(body.generationConfig.responseFormat.text.schema.properties.grid).toMatchObject({ minItems: 2, maxItems: 2, items: { minItems: 3, maxItems: 3 } });
    expect(body.contents[0].parts[1].text).toMatch(/left to right/);
    expect(body.contents[0].parts[1].text).toMatch(/Do not infer or solve letters/);
    expect(body.tools).toBeUndefined();
  });

  it("requests 15 numbered maps and Persian RTL OCR for only the selected puzzle variant", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ clues: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await extractPhoto(png, "clues", 15, 15, "key", "special", "8050");
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const schema = body.generationConfig.responseFormat.text.schema;
    expect(schema.required).toEqual(["clues"]);
    const clueSchema = schema.properties.clues;
    expect(clueSchema.required).toEqual(["horizontal", "vertical"]);
    for (const direction of ["horizontal", "vertical"]) {
      expect(clueSchema.properties[direction]).toMatchObject({ type: "object", additionalProperties: false });
      expect(clueSchema.properties[direction].required).toEqual(Array.from({ length: 15 }, (_, i) => String(i + 1)));
      expect(Object.keys(clueSchema.properties[direction].properties)).toEqual(clueSchema.properties[direction].required);
      expect(clueSchema.properties[direction].properties["15"]).toMatchObject({ type: "array", items: { type: "string" } });
    }
    expect(clueSchema.properties.vertical.description).toMatch(/RIGHTMOST/);
    const prompt = body.contents[0].parts[1].text;
    expect(prompt).toMatch(/Persian \(Farsi\).*RIGHT-TO-LEFT \(RTL\)/);
    expect(prompt).toMatch(/never arrays of numbered objects/);
    expect(prompt).toMatch(/only the special \(ویژه\) version of puzzle 8050/);
    expect(prompt).toMatch(/next newspaper page/);
    expect(prompt).toMatch(/without a repeated heading/);
  });

  it("rejects truncated, blocked, empty or malformed responses rather than saving partial JSON", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    for (const value of [
      { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: JSON.stringify(grid) }] } }] },
      { candidates: [{ finishReason: "SAFETY" }] },
      { candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: JSON.stringify(grid) }] } }] },
      { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not json" }] } }] },
      { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "[]" }] } }] },
      {},
    ]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(value)));
      await expect(extractPhoto(png, "grid", 2, 3, "key")).rejects.toThrow();
    }
    fetchMock.mockResolvedValueOnce(new Response("sensitive provider detail", { status: 429 }));
    await expect(extractPhoto(png, "grid", 2, 3, "key")).rejects.toEqual(new GeminiHttpError(429));
  });

  it("denies anonymous/non-admin calls and invalid crops before an external request", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(extractPuzzlePhoto.run({ data: request } as Request)).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(extractPuzzlePhoto.run({ auth: { uid: "user", token: {} }, data: request } as Request)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(extractPuzzlePhoto.run({ ...adminRequest, data: {} })).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(extractPuzzlePhoto.run({ ...adminRequest, data: { action: "start" } })).rejects.toMatchObject({ code: "invalid-argument", message: 'Photo extraction kind must be "clues" or "grid".' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses GEMINI_KEY in the callable and maps provider errors without leaking their response", async () => {
    vi.stubEnv("GEMINI_KEY", "existing-server-key");
    const fetchMock = vi.fn().mockResolvedValueOnce(response(grid)); vi.stubGlobal("fetch", fetchMock);
    expect(await extractPuzzlePhoto.run(adminRequest)).toEqual({ result: grid });
    expect(fetchMock.mock.calls[0]![1].headers["x-goog-api-key"]).toBe("existing-server-key");
    for (const [status, code] of [[403, "failed-precondition"], [429, "resource-exhausted"], [500, "unavailable"]] as const) {
      fetchMock.mockResolvedValueOnce(new Response("sensitive provider detail", { status }));
      await expect(extractPuzzlePhoto.run(adminRequest)).rejects.toMatchObject({ code, message: expect.not.stringContaining("sensitive") });
    }
    vi.stubEnv("GEMINI_KEY", "");
    await expect(extractPuzzlePhoto.run(adminRequest)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
