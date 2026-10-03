import { GeminiHttpError } from "./gemini.js";
import { photoPrompt, photoSchema, type PhotoKind, type PuzzleVariant } from "./photoFormat.js";

// Gemini image extraction; credentials stay in the Firebase function.
const MODEL = "gemini-3.8-flash";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type { PhotoKind, PuzzleVariant } from "./photoFormat.js";
export interface PhotoExtraction {
  result: unknown;
}

export function readPhotoRequest(data: unknown): { kind: PhotoKind; image: Uint8Array; rows: number; cols: number; variant: PuzzleVariant; puzzleNumber: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expected a photo extraction object.");
  const input = data as Record<string, unknown>;
  if (input.kind !== "clues" && input.kind !== "grid") throw new Error('Photo extraction kind must be "clues" or "grid".');
  const variant = input.variant ?? "normal", puzzleNumber = input.puzzleNumber ?? "";
  if ((variant !== "normal" && variant !== "special") || typeof puzzleNumber !== "string" || (puzzleNumber !== "" && !/^[0-9۰-۹٠-٩]{1,8}$/.test(puzzleNumber))) {
    throw new Error("Choose normal or special and a valid puzzle number.");
  }
  const { rows, cols, image } = input;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || Number(rows) < 1 || Number(rows) > 60 || Number(cols) < 1 || Number(cols) > 60) {
    throw new Error("Grid dimensions must be between 1 and 60.");
  }
  if (typeof image !== "string" || image.length > MAX_IMAGE_BYTES * 4 / 3 + 100 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new Error("Send a PNG crop up to 5 MB.");
  }
  const bytes = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
  if (bytes.length < 24 || bytes.length > MAX_IMAGE_BYTES || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("Invalid PNG image.");
  }
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 16000 || height > 16000 || width * height > 12_000_000) throw new Error("Crop is too large.");
  return { kind: input.kind, image: bytes, rows: Number(rows), cols: Number(cols), variant, puzzleNumber };
}

export async function extractPhoto(image: Uint8Array, kind: PhotoKind, rows: number, cols: number, key: string, variant: PuzzleVariant = "normal", puzzleNumber = ""): Promise<PhotoExtraction> {
  const prompt = photoPrompt(kind, rows, cols, variant, puzzleNumber);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(270_000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from(image).toString("base64") } }, { text: prompt }] }],
      generationConfig: {
        responseFormat: { text: { mimeType: "application/json", schema: photoSchema(kind, rows, cols) } },
        thinkingConfig: { thinkingLevel: "high" }, mediaResolution: "MEDIA_RESOLUTION_HIGH",
      },
    }),
  });
  if (!response.ok) throw new GeminiHttpError(response.status);
  const value = await response.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const candidate = value?.candidates?.[0];
  if (candidate?.finishReason !== "STOP" || !Array.isArray(candidate.content?.parts)) throw new Error("Gemini did not return a complete extraction.");
  const text = candidate.content.parts.filter((part) => !part.thought && typeof part.text === "string").map((part) => part.text).join("");
  const result: unknown = JSON.parse(text);
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid Gemini extraction.");
  return { result };
}
