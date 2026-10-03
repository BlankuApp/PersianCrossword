import { photoPrompt, photoSchema, type PhotoKind, type PuzzleVariant } from "../../functions/src/photoFormat";

export const DEFAULT_PHOTO_MODEL = "google/gemini-3.8-flash";
export const REASONING_EFFORTS = [
  ["low", "کم"], ["medium", "متوسط"], ["high", "زیاد"],
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number][0];

function providerError(status: number): Error {
  const message = status === 401 || status === 403 ? "کلید OpenRouter نامعتبر است یا اجازهٔ استفاده از مدل را ندارد."
    : status === 402 ? "اعتبار حساب OpenRouter کافی نیست."
    : status === 429 ? "محدودیت درخواست OpenRouter؛ کمی بعد دوباره تلاش کنید."
    : status === 400 || status === 404 ? "مدل یا درخواست OpenRouter پذیرفته نشد؛ مدلی با پشتیبانی تصویر، JSON Schema و reasoning انتخاب کنید."
    : "استخراج با OpenRouter انجام نشد؛ دوباره تلاش کنید.";
  return new Error(`${message} (${status})`);
}

export async function extractOpenRouterPhoto({ apiKey, model, image, kind, rows, cols, variant, puzzleNumber, reasoningEffort = "high" }: {
  apiKey: string; model: string; image: string; kind: PhotoKind; rows: number; cols: number; variant: PuzzleVariant; puzzleNumber: string;
  reasoningEffort?: ReasoningEffort;
}, signal?: AbortSignal): Promise<unknown> {
  if (!apiKey.trim() || !model.trim()) throw new Error("کلید و مدل OpenRouter را وارد کنید.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 270_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` }, signal: controller.signal,
      body: JSON.stringify({
        model: model.trim(),
        messages: [{ role: "user", content: [
          { type: "text", text: photoPrompt(kind, rows, cols, variant, puzzleNumber) },
          { type: "image_url", image_url: { url: image, detail: "high" } },
        ] }],
        response_format: { type: "json_schema", json_schema: { name: `crossword_${kind}`, strict: true, schema: photoSchema(kind, rows, cols) } },
        provider: { require_parameters: true }, reasoning: { effort: reasoningEffort, exclude: true },
      }),
    });
    if (!response.ok) throw providerError(response.status);
    const value = await response.json() as { error?: { code?: number }; choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[] };
    if (value?.error) throw providerError(Number(value.error.code) || 502);
    const choice = value?.choices?.[0];
    if (choice?.finish_reason !== "stop" || choice.message?.refusal || typeof choice.message?.content !== "string" || !choice.message.content.trim()) {
      throw new Error("OpenRouter نتیجهٔ کامل برنگرداند؛ دوباره تلاش کنید یا مدل را تغییر دهید.");
    }
    let result: unknown;
    try { result = JSON.parse(choice.message.content); }
    catch { throw new Error("پاسخ OpenRouter قالب JSON معتبر ندارد؛ دوباره تلاش کنید یا مدل را تغییر دهید."); }
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("پاسخ OpenRouter باید یک شیء JSON باشد؛ دوباره تلاش کنید.");
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("زمان استخراج تمام شد یا درخواست لغو شد؛ دوباره تلاش کنید.");
    if (error instanceof TypeError) throw new Error("ارتباط با OpenRouter برقرار نشد؛ اتصال را بررسی و دوباره تلاش کنید.");
    if (error instanceof SyntaxError) throw new Error("پاسخ OpenRouter قالب JSON معتبر ندارد؛ دوباره تلاش کنید یا مدل را تغییر دهید.");
    throw error;
  } finally {
    clearTimeout(timeout); signal?.removeEventListener("abort", abort);
  }
}
