export type Tier = "guest" | "account";

// Keep in sync with FREE_AI_LIMITS in app/gemini.ts (used for UI copy).
export const LIMITS: Readonly<Record<Tier, number>> = { guest: 10, account: 100 };

// Real crossword prompts are a few hundred chars; the cap stops the proxy being a free general Gemini.
export const MAX_PROMPT_LENGTH = 1000;

export interface UsageDoc {
  readonly day: string;
  readonly count: number;
}

export type Decision = { readonly allow: true; readonly next: UsageDoc } | { readonly allow: false };

export function decide(doc: UsageDoc | undefined, today: string, limit: number): Decision {
  const used = doc?.day === today ? doc.count : 0;
  return used >= limit ? { allow: false } : { allow: true, next: { day: today, count: used + 1 } };
}

// en-CA formats as YYYY-MM-DD.
const tehranFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" });

export function tehranDay(now: Date): string {
  return tehranFormat.format(now);
}

export function tierFor(signInProvider: string | undefined): Tier {
  return signInProvider === "anonymous" ? "guest" : "account";
}

export function isValidPrompt(prompt: unknown): prompt is string {
  return typeof prompt === "string" && prompt.trim().length > 0 && prompt.length <= MAX_PROMPT_LENGTH;
}
