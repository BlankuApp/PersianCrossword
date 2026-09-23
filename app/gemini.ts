import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const MODEL = "gemini-3.5-flash";

const fa = (n: number) => n.toLocaleString("fa-IR");

// Letters are numbered rather than laid out as "ک _ ت" so the model can't misread RTL order.
export function buildAskPrompt(clue: string, cellValues: readonly (string | undefined)[]): string {
  const known = cellValues.some(Boolean)
    ? `حروف معلوم به ترتیب: ${cellValues.map((v, i) => `حرف ${fa(i + 1)}: ${v ?? "؟"}`).join("، ")}`
    : "هنوز هیچ حرفی معلوم نیست.";
  return [
    "تو در حل جدول کلمات متقاطع فارسی مهارت داری.",
    `پرسش: «${clue}»`,
    `طول پاسخ: ${fa(cellValues.length)} حرف (هر خانه یک حرف؛ پاسخ چندکلمه‌ای بدون فاصله نوشته می‌شود).`,
    known,
    "پاسخ ممکن است مخفف، نام خاص، واژهٔ عربی یا کهن، یا وارونهٔ یک کلمه (وقتی در پرسش «برعکس» آمده) باشد.",
    "هر گزینه را با طول و حروف معلوم بسنج؛ گزینهٔ ناسازگار ننویس.",
    "- اگر مطمئنی: فقط پاسخ را **پررنگ** بنویس.",
    "- اگر مطمئن نیستی: حداکثر ۳ گزینهٔ سازگار را فهرست کن، هر کدام با یک توضیح خیلی کوتاه.",
    "- اگر گزینهٔ سازگاری نیافتی: بنویس «پاسخی پیدا نکردم؛ با دکمهٔ جستجو در گوگل امتحان کنید.»",
  ].join("\n");
}

export function buildExplainPrompt(clue: string, answer: string): string {
  return [
    `پرسش جدول: «${clue}» — پاسخ: «${answer}»`,
    "به فارسی و کوتاه (۳ تا ۵ جمله) توضیح بده:",
    "- پاسخ چیست و چرا با این پرسش جور است (اگر مخفف، وارونه یا ترکیبی است، بگو چطور).",
    "- چند نکتهٔ اطلاعات عمومی جالب و درست دربارهٔ آن که دانش عمومی خواننده را بیشتر کند (برای شخص: دوره و کار مهمش؛ برای مکان: کجاست و به چه مشهور است؛ برای واژه: معنی و ریشه).",
    "مثال جمله‌ای نیاور. چیزی را که از درستی‌اش مطمئن نیستی ننویس.",
  ].join("\n");
}

export async function streamGemini(
  prompt: string,
  apiKey: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal,
    },
  );

  if (!res.ok || !res.body) {
    if (res.status === 400 || res.status === 403) throw new Error("کلید Gemini نامعتبر است.");
    if (res.status === 429) throw new Error("محدودیت درخواست به Gemini رسیده؛ کمی بعد دوباره امتحان کنید.");
    throw new Error(AI_GENERIC_ERROR);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;
      try {
        const parsed = JSON.parse(json);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === "string") onChunk(text);
      } catch {
        // partial/malformed SSE chunk — skip
      }
    }
  }
}

export const AI_GENERIC_ERROR = "ارتباط با هوشواره برقرار نشد.";

// Keep in sync with LIMITS in functions/src/quota.ts.
export const FREE_AI_LIMITS = { guest: 10, account: 100 } as const;

export type QuotaInfo =
  | { readonly reason: "shared" }
  | { readonly reason: "user"; readonly tier: "guest" | "account"; readonly limit: number };

export class QuotaError extends Error {
  constructor(readonly info: QuotaInfo) {
    super("AI quota exhausted");
  }
}

export function toAiError(e: unknown): Error {
  const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : "";
  if (code !== "functions/resource-exhausted") return new Error(AI_GENERIC_ERROR);
  const d = (e as { details?: { reason?: unknown; tier?: unknown; limit?: unknown } }).details;
  if (d?.reason === "user" && (d.tier === "guest" || d.tier === "account") && typeof d.limit === "number") {
    return new QuotaError({ reason: "user", tier: d.tier, limit: d.limit });
  }
  return new QuotaError({ reason: "shared" });
}

const askAi = httpsCallable<{ prompt: string }, { ok: true }, string>(functions, "askAi");

export async function streamFreeAi(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  try {
    const { stream, data } = await askAi.stream({ prompt }, { signal });
    // On error the SDK rejects `data` too; the loop below throws first, so mark it handled.
    data.catch(() => {});
    for await (const chunk of stream) onChunk(chunk);
    await data;
  } catch (e) {
    throw toAiError(e);
  }
}
