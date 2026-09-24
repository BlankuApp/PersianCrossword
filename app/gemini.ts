import { httpsCallable } from "firebase/functions";
import { TRAY_DECOY_COUNT } from "./crosswordUi";
import { functions } from "./firebase";

const MODEL = "gemini-3.5-flash-lite";

const fa = (n: number) => n.toLocaleString("fa-IR");

// Letters are numbered rather than laid out as "ک _ ت" so the model can't misread RTL order.
export function buildAskPrompt(
  clue: string,
  cellValues: readonly (string | undefined)[],
  trayLetters: readonly string[] = [],
): string {
  const known = cellValues.some(Boolean)
    ? `حروف معلوم به ترتیب: ${cellValues.map((v, i) => `حرف ${fa(i + 1)}: ${v ?? "؟"}`).join("، ")}`
    : "هنوز هیچ حرفی معلوم نیست.";
  return [
    "تو در حل جدول کلمات متقاطع فارسی استادی.",
    `پرسش: «${clue}»`,
    `طول پاسخ: ${fa(cellValues.length)} حرف (پاسخ چندکلمه‌ای بی‌فاصله نوشته می‌شود).`,
    known,
    ...(trayLetters.length
      ? [`حروف پاسخ از میان این‌هاست (با امکان تکرار؛ ${fa(TRAY_DECOY_COUNT)} تا اضافی‌اند): ${trayLetters.join("، ")}`]
      : []),
    "پاسخ ممکن است مخفف، نام خاص، واژهٔ عربی یا کهن، یا وارونهٔ یک کلمه (وقتی در پرسش «برعکس» آمده) باشد.",
    "اول پرسش را در گوگل جستجو کن (مثلاً «جواب جدول» + پرسش).",
    "حروف هر گزینه را جدا بنویس و بشمار؛ گزینه‌ای که با طول یا حروف معلوم نخواند، ننویس.",
    "هرگز «نمی‌دانم» ننویس؛ ۱ تا ۳ حدس سازگار بده؛ اطمینان «زیاد» فقط با تأیید جستجو.",
    "بدون مقدمه، هر گزینه یک خط:",
    "**گزینه** (حروف جدا) — اطمینان: زیاد/متوسط/کم — توضیح خیلی کوتاه",
    "در پایان یکی دو جمله دربارهٔ منظور پرسش و نوع پاسخ (شخص، مکان، واژهٔ کهن، …) بنویس.",
  ].join("\n");
}

export function buildExplainPrompt(clue: string, answer: string): string {
  return [
    `پرسش جدول: «${clue}» — پاسخ: «${answer}»`,
    "به فارسی و کوتاه (5 تا 7 جمله) توضیح بده:",
    "- چند نکتهٔ اطلاعات عمومی جالب و درست دربارهٔ آن که دانش عمومی خواننده را بیشتر کند (برای مثال برای شخص: دوره و کار مهمش؛ برای مکان: کجاست و به چه مشهور است؛ برای واژه: معنی و ریشه).",
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
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
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

  for (; ;) {
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
    data.catch(() => { });
    for await (const chunk of stream) onChunk(chunk);
    await data;
  } catch (e) {
    throw toAiError(e);
  }
}
