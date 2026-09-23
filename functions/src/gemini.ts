const MODEL = "gemini-3.5-flash-lite";

export class GeminiHttpError extends Error {
  constructor(readonly status: number) {
    super(`Gemini HTTP ${status}`);
  }
}

export async function streamGemini(
  prompt: string,
  apiKey: string,
  onText: (text: string) => void | Promise<unknown>,
): Promise<void> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok || !res.body) throw new GeminiHttpError(res.status);

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
      let text: unknown;
      try {
        text = JSON.parse(line.slice(6))?.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch {
        continue; // malformed SSE line — skip
      }
      if (typeof text === "string") await onText(text);
    }
  }
}
