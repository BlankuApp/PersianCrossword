const MODEL = "gemini-flash-lite-latest";

export function buildAskPrompt(clue: string, cellValues: readonly (string | undefined)[]): string {
  const pattern = cellValues.map((v) => v ?? "_").join(" ");
  return [
    "این یک پرسش جدول کلمات متقاطع فارسی است.",
    `پرسش: «${clue}»`,
    `پاسخ باید دقیقاً ${cellValues.length.toLocaleString("fa-IR")} حرف داشته باشد.`,
    `حروف کشف‌شدهٔ پاسخ تا این‌جا (_ به‌جای حروف ناشناخته): ${pattern}`,
    "فقط خودِ کلمهٔ پاسخ را به فارسی بنویس، بدون هیچ توضیح یا نویسهٔ اضافه.",
  ].join("\n");
}

export function buildExplainPrompt(clue: string, answer: string): string {
  return [
    "این پرسش و پاسخ یک جدول کلمات متقاطع فارسی است.",
    `پرسش: «${clue}»`,
    `پاسخ: «${answer}»`,
    "دربارهٔ این پاسخ به فارسی و خیلی کوتاه توضیح بده: معنی آن، ریشهٔ کلمه (اگر مشخص است) و یک یا دو مثال از کاربردش در جمله.",
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
    throw new Error("ارتباط با هوشواره برقرار نشد.");
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
