# Free AI Quota via Firebase Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The AI clue assistant works without a user key by calling a Firebase callable function that holds the owner's Gemini key and enforces a daily quota (guests 10, accounts 100); on quota exhaustion the dialog explains and offers sign-up and/or the user's own key.

**Architecture:** A new `functions/` package deploys one streaming callable, `askAi`, which authenticates via Firebase Auth, counts usage in Firestore `aiUsage/{uid}` inside a transaction, streams Gemini SSE text back with `sendChunk`, and refunds on Gemini failure. The React app calls it through `httpsCallable().stream()` when no own key is saved, signing in anonymously first if needed, and maps `resource-exhausted` to a typed `QuotaError` that drives a new `"quota"` dialog state.

**Tech Stack:** Firebase Functions v2 (`firebase-functions` 7.x, `firebase-admin` 14.x, Node 22), Firestore, firebase JS SDK 12.17 (`firebase/functions`), React 19, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-23-free-ai-quota-design.md`

## Global Constraints

- The owner's Gemini key never appears in client code, the repo, or the build — only as function secret `GEMINI_KEY` (local emulator: `functions/.secret.local`, gitignored).
- Quota: tier `guest` (`sign_in_provider === "anonymous"`) = **10 / day**; tier `account` (anything else) = **100 / day**.
- Day = calendar date in `Asia/Tehran`, format `YYYY-MM-DD`.
- Prompt: must be a non-empty (after trim) string of at most **1000** characters.
- Function: `askAi`, region `us-central1`, model `gemini-flash-lite-latest`.
- `resource-exhausted` details are exactly `{ reason: "user", tier, limit }` (per-user) or `{ reason: "shared" }` (owner key's Google quota hit).
- User's own key path (`streamGemini` in `app/gemini.ts`) is unchanged and still bypasses the proxy.
- `exactOptionalPropertyTypes: true`: optional props that may receive `undefined` are typed `foo?: T | undefined`.
- `functions/` is a separate npm package; root `tsconfig.json` / `tsconfig.app.json` / root Vitest must not include it.
- User-visible copy is Persian; numbers formatted with `toLocaleString("fa-IR")`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feat/free-ai-quota`.
- Run `npm ci` at the repo root once before starting (local `node_modules` may be stale vs. the lockfile).

## Review Focus

1. **Gemini SSE event split across two network chunks** → text must not be lost or duplicated (Task 3 test `joins an event split across chunks`).
2. **Guest who reaches the quota and signs up from inside the dialog** → the dialog must not render a second avatar/UserMenu, and reopening it must ask again on the 100/day tier (Task 6 test `renders nothing for a full account when allowGuestUpgrade`, Task 7 test `reopening after a guest upgrades asks again`).
3. **User with a saved own key** → must never trigger anonymous sign-in or the proxy (Task 7 test `uses own key directly`).
4. **Request just before / after Tehran midnight (20:30 UTC)** → counts must reset on the Tehran date, not UTC (Task 2 test `tehranDay switches at 20:30 UTC`).
5. **Unexpected error shapes from the callable (no `details`, unknown code, network)** → a Persian generic message, never a raw English Firebase string or a crash (Task 5 tests `falls back to shared when details are malformed` and `maps other errors to the generic message`).

---

### Task 1: Fix the stale sign-out test (green baseline)

The existing test `signs out the current user` in `test/authButton.test.tsx` fails on `main`: its mock user lacks `uid`/`providerData`, and it looks for a `خروج` button that now lives inside the avatar menu.

**Files:**
- Modify: `test/authButton.test.tsx:6-9` (authState type) and `:174-180` (test body)

**Interfaces:**
- Consumes: nothing.
- Produces: `authState.user` mock shape `{ uid: string; isAnonymous: boolean; displayName: string | null; email: string | null; providerData: { providerId: string }[] } | null` — Task 6 adds tests using it.

- [ ] **Step 1: Run the failing test to confirm the baseline failure**

Run: `npx vitest run test/authButton.test.tsx`
Expected: FAIL `signs out the current user` with `TypeError: Cannot read properties of undefined (reading 'some')`

- [ ] **Step 2: Update the mock type**

In `test/authButton.test.tsx` replace:

```ts
const authState = vi.hoisted(() => ({
  user: null as null | { isAnonymous: boolean; displayName: string | null; email: string | null },
  signOut: vi.fn(),
}));
```

with:

```ts
interface MockUser {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
  providerData: { providerId: string }[];
}

const authState = vi.hoisted(() => ({
  user: null as null | MockUser,
  signOut: vi.fn(),
}));
```

- [ ] **Step 3: Fix the test body**

Replace the `signs out the current user` test with:

```tsx
  it("signs out the current user", async () => {
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر آزمایشی", email: null, providerData: [] };
    const user = userEvent.setup();
    render(<AuthButton />);
    await user.click(screen.getByRole("button", { name: "حساب کاربری: کاربر آزمایشی" }));
    await user.click(screen.getByRole("button", { name: "خروج از حساب" }));
    expect(authState.signOut).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add test/authButton.test.tsx
git commit -m "Fix stale sign-out test for the avatar menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Functions package scaffold + pure quota logic

**Files:**
- Create: `firebase.json`, `.firebaserc`, `functions/package.json` (via npm), `functions/tsconfig.json`, `functions/src/quota.ts`, `functions/src/quota.test.ts`
- Modify: `.gitignore` (append), `vite.config.ts` (test.exclude)

**Interfaces:**
- Consumes: nothing.
- Produces (from `functions/src/quota.ts`):
  - `type Tier = "guest" | "account"`
  - `const LIMITS: Readonly<Record<Tier, number>>` = `{ guest: 10, account: 100 }`
  - `const MAX_PROMPT_LENGTH = 1000`
  - `interface UsageDoc { readonly day: string; readonly count: number }`
  - `type Decision = { readonly allow: true; readonly next: UsageDoc } | { readonly allow: false }`
  - `function decide(doc: UsageDoc | undefined, today: string, limit: number): Decision`
  - `function tehranDay(now: Date): string`
  - `function tierFor(signInProvider: string | undefined): Tier`
  - `function isValidPrompt(prompt: unknown): prompt is string`

- [ ] **Step 1: Create Firebase project config**

`firebase.json`:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"]
    }
  ],
  "emulators": {
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false }
  }
}
```

`.firebaserc`:

```json
{
  "projects": {
    "default": "persiancrossword"
  }
}
```

- [ ] **Step 2: Create the functions package**

Create `functions/package.json`:

```json
{
  "name": "persian-crossword-functions",
  "private": true,
  "main": "lib/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  }
}
```

Then install (gets current versions, writes `functions/package-lock.json`):

```bash
npm --prefix functions install firebase-functions firebase-admin
npm --prefix functions install -D typescript vitest
```

Create `functions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

Append to `.gitignore`:

```
functions/lib/
functions/node_modules/
functions/.secret.local
.firebase/
firebase-debug.log
firestore-debug.log
```

- [ ] **Step 3: Keep root Vitest out of `functions/`**

In `vite.config.ts` change the import line to:

```ts
import { configDefaults, defineConfig } from "vitest/config";
```

and the `test` block to:

```ts
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    exclude: [...configDefaults.exclude, "functions/**"],
  },
```

- [ ] **Step 4: Write the failing tests**

`functions/src/quota.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decide, isValidPrompt, LIMITS, MAX_PROMPT_LENGTH, tehranDay, tierFor } from "./quota.js";

describe("decide", () => {
  it("allows first use and starts the count at 1", () => {
    expect(decide(undefined, "2026-09-23", 10)).toEqual({ allow: true, next: { day: "2026-09-23", count: 1 } });
  });

  it("increments within the same day", () => {
    expect(decide({ day: "2026-09-23", count: 4 }, "2026-09-23", 10)).toEqual({
      allow: true,
      next: { day: "2026-09-23", count: 5 },
    });
  });

  it("denies once the limit is reached", () => {
    expect(decide({ day: "2026-09-23", count: 10 }, "2026-09-23", 10)).toEqual({ allow: false });
  });

  it("resets on a new day even if yesterday was exhausted", () => {
    expect(decide({ day: "2026-09-22", count: 10 }, "2026-09-23", 10)).toEqual({
      allow: true,
      next: { day: "2026-09-23", count: 1 },
    });
  });
});

describe("tehranDay", () => {
  it("tehranDay switches at 20:30 UTC", () => {
    expect(tehranDay(new Date("2026-09-23T20:29:00Z"))).toBe("2026-09-23");
    expect(tehranDay(new Date("2026-09-23T20:31:00Z"))).toBe("2026-09-24");
  });
});

describe("tierFor", () => {
  it("maps anonymous to guest and everything else to account", () => {
    expect(tierFor("anonymous")).toBe("guest");
    expect(tierFor("google.com")).toBe("account");
    expect(tierFor("password")).toBe("account");
    expect(tierFor(undefined)).toBe("account");
  });

  it("has the agreed limits", () => {
    expect(LIMITS).toEqual({ guest: 10, account: 100 });
  });
});

describe("isValidPrompt", () => {
  it("accepts a normal prompt and the max length", () => {
    expect(isValidPrompt("سلام")).toBe(true);
    expect(isValidPrompt("a".repeat(MAX_PROMPT_LENGTH))).toBe(true);
  });

  it("rejects non-strings, blank, and over-long prompts", () => {
    expect(isValidPrompt(undefined)).toBe(false);
    expect(isValidPrompt(42)).toBe(false);
    expect(isValidPrompt("   ")).toBe(false);
    expect(isValidPrompt("a".repeat(MAX_PROMPT_LENGTH + 1))).toBe(false);
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npm --prefix functions test`
Expected: FAIL — cannot resolve `./quota.js`.

- [ ] **Step 6: Implement `functions/src/quota.ts`**

```ts
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
```

- [ ] **Step 7: Run tests and root checks**

Run: `npm --prefix functions test`
Expected: PASS (all quota tests).

Run: `npm test && npm run typecheck`
Expected: PASS; root Vitest does not list any `functions/` file.

- [ ] **Step 8: Commit**

```bash
git add firebase.json .firebaserc .gitignore vite.config.ts functions/package.json functions/package-lock.json functions/tsconfig.json functions/src/quota.ts functions/src/quota.test.ts
git commit -m "Add functions package with daily AI quota logic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server-side Gemini streaming client

**Files:**
- Create: `functions/src/gemini.ts`, `functions/src/gemini.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `functions/src/gemini.ts`):
  - `class GeminiHttpError extends Error { readonly status: number }`
  - `function streamGemini(prompt: string, apiKey: string, onText: (text: string) => void | Promise<unknown>): Promise<void>` — throws `GeminiHttpError` on non-OK HTTP.

- [ ] **Step 1: Write the failing tests**

`functions/src/gemini.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix functions test`
Expected: FAIL — cannot resolve `./gemini.js`.

- [ ] **Step 3: Implement `functions/src/gemini.ts`**

```ts
const MODEL = "gemini-flash-lite-latest";

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
      try {
        const text = JSON.parse(line.slice(6))?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === "string") await onText(text);
      } catch {
        // malformed SSE line — skip
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm --prefix functions test`
Expected: PASS (quota + gemini).

- [ ] **Step 5: Commit**

```bash
git add functions/src/gemini.ts functions/src/gemini.test.ts
git commit -m "Add server-side Gemini SSE client for the AI proxy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `askAi` callable function

**Files:**
- Create: `functions/src/index.ts`

**Interfaces:**
- Consumes: `decide`, `tehranDay`, `tierFor`, `isValidPrompt`, `LIMITS`, `UsageDoc` (Task 2); `streamGemini`, `GeminiHttpError` (Task 3).
- Produces: deployed callable `askAi` — request `{ prompt: string }`, stream chunks `string`, result `{ ok: true }`; errors `unauthenticated`, `invalid-argument`, `resource-exhausted` (details per Global Constraints), `unavailable`.

- [ ] **Step 1: Implement `functions/src/index.ts`**

```ts
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GeminiHttpError, streamGemini } from "./gemini.js";
import { decide, isValidPrompt, LIMITS, tehranDay, tierFor, type UsageDoc } from "./quota.js";

initializeApp();
const GEMINI_KEY = defineSecret("GEMINI_KEY");

export const askAi = onCall<{ prompt?: unknown }, Promise<{ ok: true }>, string>(
  { region: "us-central1", secrets: [GEMINI_KEY] },
  async (request, response) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
    const prompt = request.data?.prompt;
    if (!isValidPrompt(prompt)) throw new HttpsError("invalid-argument", "Invalid prompt.");

    const tier = tierFor(request.auth.token.firebase?.sign_in_provider);
    const limit = LIMITS[tier];
    const db = getFirestore();
    const ref = db.collection("aiUsage").doc(request.auth.uid);

    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const result = decide(snap.data() as UsageDoc | undefined, tehranDay(new Date()), limit);
      if (result.allow) tx.set(ref, result.next);
      return result.allow;
    });
    if (!allowed) {
      throw new HttpsError("resource-exhausted", "Daily free AI quota used.", { reason: "user", tier, limit });
    }

    try {
      await streamGemini(prompt, GEMINI_KEY.value(), (text) => response?.sendChunk(text));
    } catch (e) {
      // Don't charge the user for our/Google's failure.
      await ref.update({ count: FieldValue.increment(-1) });
      if (e instanceof GeminiHttpError && e.status === 429) {
        throw new HttpsError("resource-exhausted", "Shared free AI quota used.", { reason: "shared" });
      }
      throw new HttpsError("unavailable", "AI request failed.");
    }
    return { ok: true };
  },
);
```

- [ ] **Step 2: Build (type-check against the installed SDK)**

Run: `npm --prefix functions run build`
Expected: exits 0, `functions/lib/index.js`, `lib/quota.js`, `lib/gemini.js` exist, no test files in `lib/`.

If `onCall`'s generic arity or `response.sendChunk` differ in the installed `firebase-functions` major, adjust only the type parameters/import path (`firebase-functions/https` is the v7 alias of `firebase-functions/v2/https`) — keep behavior identical.

- [ ] **Step 3: Re-run unit tests**

Run: `npm --prefix functions test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add functions/src/index.ts
git commit -m "Add askAi callable proxying Gemini with per-user daily quota

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — callable wrapper and `QuotaError`

**Files:**
- Modify: `app/firebase.ts`, `app/gemini.ts`
- Test: `test/gemini.test.ts` (create)

**Interfaces:**
- Consumes: callable `askAi` contract (Task 4).
- Produces:
  - `app/firebase.ts`: `export const functions: Functions`
  - `app/gemini.ts`:
    - `const FREE_AI_LIMITS: Readonly<{ guest: number; account: number }>` = `{ guest: 10, account: 100 }`
    - `type QuotaInfo = { readonly reason: "shared" } | { readonly reason: "user"; readonly tier: "guest" | "account"; readonly limit: number }`
    - `class QuotaError extends Error { readonly info: QuotaInfo }`
    - `function toAiError(e: unknown): Error`
    - `function streamFreeAi(prompt: string, onChunk: (text: string) => void, signal: AbortSignal): Promise<void>`
    - `const AI_GENERIC_ERROR = "ارتباط با هوشواره برقرار نشد."`

- [ ] **Step 1: Write the failing tests**

`test/gemini.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/firebase", () => ({ functions: {} }));

import { AI_GENERIC_ERROR, QuotaError, toAiError } from "../app/gemini";

const fnError = (code: string, details?: unknown) => Object.assign(new Error("x"), { code, details });

describe("toAiError", () => {
  it("maps a per-user quota error with its tier and limit", () => {
    const err = toAiError(fnError("functions/resource-exhausted", { reason: "user", tier: "guest", limit: 10 }));
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).info).toEqual({ reason: "user", tier: "guest", limit: 10 });
  });

  it("maps a shared quota error", () => {
    const err = toAiError(fnError("functions/resource-exhausted", { reason: "shared" }));
    expect((err as QuotaError).info).toEqual({ reason: "shared" });
  });

  it("falls back to shared when details are malformed", () => {
    const err = toAiError(fnError("functions/resource-exhausted", { reason: "user", tier: "vip" }));
    expect((err as QuotaError).info).toEqual({ reason: "shared" });
  });

  it("maps other errors to the generic message", () => {
    for (const e of [fnError("functions/unavailable"), new TypeError("Failed to fetch"), "boom"]) {
      const err = toAiError(e);
      expect(err).not.toBeInstanceOf(QuotaError);
      expect(err.message).toBe(AI_GENERIC_ERROR);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/gemini.test.ts`
Expected: FAIL — `AI_GENERIC_ERROR` / `toAiError` not exported.

- [ ] **Step 3: Export `functions` from `app/firebase.ts`**

Add import:

```ts
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
```

After `export const db = getFirestore(app);` add:

```ts
export const functions = getFunctions(app, "us-central1");
// `VITE_FUNCTIONS_EMULATOR=1 npm run dev` talks to `firebase emulators:start` instead of production.
if (import.meta.env.VITE_FUNCTIONS_EMULATOR) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
```

- [ ] **Step 4: Implement in `app/gemini.ts`**

Add at top:

```ts
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
```

Replace the literal `"ارتباط با هوشواره برقرار نشد."` in `streamGemini` with `AI_GENERIC_ERROR`, and append:

```ts
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
    for await (const chunk of stream) onChunk(chunk);
    await data;
  } catch (e) {
    throw toAiError(e);
  }
}
```

Note: `askAi` is created at module load; `vi.mock("../app/firebase", () => ({ functions: {} }))` in the test keeps that import side-effect-free. If `httpsCallable` throws on the fake `{}` instance at import, change the constant into a call inside `streamFreeAi` (`httpsCallable<...>(functions, "askAi").stream(...)`).

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/gemini.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/firebase.ts app/gemini.ts test/gemini.test.ts
git commit -m "Add client wrapper for the askAi callable with typed quota errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: AuthButton — guest upgrade, portal modal, incentive copy

**Files:**
- Modify: `app/components/AuthButton.tsx`
- Test: `test/authButton.test.tsx`

**Interfaces:**
- Consumes: `FREE_AI_LIMITS` from `app/gemini.ts` (Task 5).
- Produces: `AuthButton` prop `allowGuestUpgrade?: boolean | undefined`. Behavior:
  - no user → sign-in button (as today)
  - anonymous user + `allowGuestUpgrade` → sign-in button (opens modal)
  - non-anonymous user + `allowGuestUpgrade` → renders `null`
  - any user without `allowGuestUpgrade` → `UserMenu` (as today)
  - modal is rendered via `createPortal(..., document.body)` so it works when nested inside other modals/menus.

- [ ] **Step 1: Write the failing tests**

`AuthButton` now imports `app/gemini.ts`, which imports `firebase/functions` and `../firebase` — the existing `vi.mock("../app/firebase", ...)` covers `../firebase`. Add `functions: {}` to that mock:

```ts
vi.mock("../app/firebase", () => ({ auth: { name: "test-auth" }, functions: {} }));
```

Append inside `describe("AuthButton", ...)`:

```tsx
  it("lets an anonymous guest open sign-in when allowGuestUpgrade", async () => {
    authState.user = { uid: "g1", isAnonymous: true, displayName: null, email: null, providerData: [] };
    const user = userEvent.setup();
    render(<AuthButton allowGuestUpgrade initialMode="signup" label="ساخت حساب" />);
    await user.click(screen.getByRole("button", { name: "ساخت حساب" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("روزانه ۱۰۰ پرسش رایگان");
  });

  it("renders nothing for a full account when allowGuestUpgrade", () => {
    authState.user = { uid: "u1", isAnonymous: false, displayName: "کاربر", email: null, providerData: [] };
    const { container } = render(<AuthButton allowGuestUpgrade label="ساخت حساب" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the account upsell in a guest's user menu", async () => {
    authState.user = { uid: "g1", isAnonymous: true, displayName: null, email: null, providerData: [] };
    const user = userEvent.setup();
    render(<AuthButton />);
    await user.click(screen.getByRole("button", { name: "حساب کاربری: مهمان" }));
    expect(screen.getByText(/ساخت حساب = ۱۰۰ پرسش در روز/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ساخت حساب" })).toBeInTheDocument();
  });
```

The user-menu test calls `listPuzzles()` through `computeDifficultyStats`; it already runs for the sign-out test, so no extra mock is needed.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/authButton.test.tsx`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Implement**

In `app/components/AuthButton.tsx`:

Imports — add:

```ts
import { createPortal } from "react-dom";
import { FREE_AI_LIMITS } from "../gemini";
```

Add a formatter near `NO_DIFFICULTY`:

```ts
const fa = (n: number) => n.toLocaleString("fa-IR");
```

In `UserMenu`, replace the whole `<p className="auth-gemini-hint">…</p>` with:

```tsx
              <p className="auth-gemini-hint">
                هوشواره روزانه تا {fa(user.isAnonymous ? FREE_AI_LIMITS.guest : FREE_AI_LIMITS.account)} پرسش رایگان
                پاسخ می‌دهد. برای استفادهٔ بیشتر می‌توانید یک کلید رایگان از{" "}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  Google AI Studio
                </a>{" "}
                بسازید و این‌جا وارد کنید (اختیاری). این کلید فقط در همین مرورگر ذخیره می‌شود و به هیچ سروری ارسال
                نمی‌شود.
              </p>
              {user.isAnonymous ? (
                <p className="auth-gemini-hint">
                  ساخت حساب = {fa(FREE_AI_LIMITS.account)} پرسش در روز{" "}
                  <AuthButton allowGuestUpgrade initialMode="signup" label="ساخت حساب" />
                </p>
              ) : null}
```

`AuthButtonProps` — add:

```ts
  allowGuestUpgrade?: boolean | undefined;
```

Destructure it in `AuthButton({ className, initialMode = "signin", label = "ورود", allowGuestUpgrade }: AuthButtonProps = {})`.

Replace `if (user) return <UserMenu />;` with:

```tsx
  if (allowGuestUpgrade) {
    if (user && !user.isAnonymous) return null;
  } else if (user) {
    return <UserMenu />;
  }
```

In the `auth-sync-info` block, after the second `<p>` add:

```tsx
              <p>
                کاربران دارای حساب روزانه {fa(FREE_AI_LIMITS.account)} پرسش رایگان از هوشواره دارند (مهمان‌ها{" "}
                {fa(FREE_AI_LIMITS.guest)}).
              </p>
```

Wrap the modal in a portal: change

```tsx
      {open && (
        <div className="auth-modal-backdrop" onClick={() => setOpen(false)}>
          ...
        </div>
      )}
```

to

```tsx
      {open &&
        createPortal(
          <div className="auth-modal-backdrop" onClick={() => setOpen(false)}>
            ...
          </div>,
          document.body,
        )}
```

(inner JSX unchanged; only re-indented).

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/authButton.test.tsx && npm test && npm run typecheck`
Expected: PASS (all existing AuthButton tests still pass — `screen` queries search `document.body`, so the portal is transparent to them).

- [ ] **Step 5: Commit**

```bash
git add app/components/AuthButton.tsx test/authButton.test.tsx
git commit -m "Let guests upgrade from anywhere and advertise the account AI quota

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: ClueAiDialog — free tier flow and quota state

**Files:**
- Modify: `app/components/ClueAiDialog.tsx`
- Test: `test/clueAiDialog.test.tsx` (create)

**Interfaces:**
- Consumes: `streamGemini`, `streamFreeAi`, `QuotaError`, `QuotaInfo`, `FREE_AI_LIMITS`, `buildAskPrompt`, `buildExplainPrompt` (`app/gemini.ts`, Task 5); `auth` (`app/firebase.ts`); `signInAnonymously` (`firebase/auth`); `AuthButton` with `allowGuestUpgrade` (Task 6).
- Produces: `ClueAiButton` (same props as today). Dialog statuses: `"idle" | "loading" | "done" | "error" | "quota"` (`"no-key"` removed).

- [ ] **Step 1: Write the failing tests**

`test/clueAiDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fakeAuth = vi.hoisted(() => ({ currentUser: null as null | { uid: string } }));
const mocks = vi.hoisted(() => ({
  streamGemini: vi.fn(),
  streamFreeAi: vi.fn(),
  signInAnonymously: vi.fn(),
}));

vi.mock("../app/firebase", () => ({ auth: fakeAuth, functions: {} }));
vi.mock("firebase/auth", () => ({ signInAnonymously: mocks.signInAnonymously }));
vi.mock("../app/components/AuthButton", () => ({
  AuthButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock("../app/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/gemini")>();
  return { ...actual, streamGemini: mocks.streamGemini, streamFreeAi: mocks.streamFreeAi };
});

import { QuotaError } from "../app/gemini";
import { ClueAiButton } from "../app/components/ClueAiDialog";

function renderButton() {
  render(<ClueAiButton clue="پایتخت ایران" isSolved={false} cellValues={[undefined, undefined, undefined, undefined]} answer="تهران" />);
  return userEvent.setup();
}

describe("ClueAiButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fakeAuth.currentUser = null;
    mocks.signInAnonymously.mockImplementation(async () => {
      fakeAuth.currentUser = { uid: "anon" };
    });
    mocks.streamFreeAi.mockImplementation(async (_p: string, onChunk: (t: string) => void) => onChunk("تهران"));
    mocks.streamGemini.mockImplementation(async (_p: string, _k: string, onChunk: (t: string) => void) => onChunk("تهران"));
  });

  it("uses own key directly", async () => {
    localStorage.setItem("persian-crossword-gemini-key", "my-key");
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText("تهران")).toBeInTheDocument();
    expect(mocks.streamGemini).toHaveBeenCalledOnce();
    expect(mocks.streamGemini.mock.calls[0]?.[1]).toBe("my-key");
    expect(mocks.streamFreeAi).not.toHaveBeenCalled();
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously then uses the free tier when signed out", async () => {
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText("تهران")).toBeInTheDocument();
    expect(mocks.signInAnonymously).toHaveBeenCalledOnce();
    expect(mocks.streamFreeAi).toHaveBeenCalledOnce();
  });

  it("does not sign in again when already signed in", async () => {
    fakeAuth.currentUser = { uid: "u1" };
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    await screen.findByText("تهران");
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it("shows the guest quota message with sign-up and key form", async () => {
    mocks.streamFreeAi.mockRejectedValue(new QuotaError({ reason: "user", tier: "guest", limit: 10 }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText(/سهمیهٔ رایگان امروز شما \(۱۰ پرسش\) تمام شد/)).toBeInTheDocument();
    expect(screen.getByText(/روزانه ۱۰۰ پرسش رایگان دارید/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ساخت حساب" })).toBeInTheDocument();
    expect(screen.getByLabelText("کلید هوشواره (Gemini)")).toBeInTheDocument();
  });

  it("shows the account quota message without sign-up", async () => {
    mocks.streamFreeAi.mockRejectedValue(new QuotaError({ reason: "user", tier: "account", limit: 100 }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText(/\(۱۰۰ پرسش\) تمام شد/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ساخت حساب" })).not.toBeInTheDocument();
  });

  it("shows the shared quota message", async () => {
    mocks.streamFreeAi.mockRejectedValue(new QuotaError({ reason: "shared" }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText(/برای همهٔ کاربران تمام شده/)).toBeInTheDocument();
  });

  it("uses a key entered in the quota form", async () => {
    mocks.streamFreeAi.mockRejectedValue(new QuotaError({ reason: "shared" }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    await user.type(await screen.findByLabelText("کلید هوشواره (Gemini)"), "typed-key");
    await user.click(screen.getByRole("button", { name: "ذخیره و دریافت پاسخ" }));
    expect(await screen.findByText("تهران")).toBeInTheDocument();
    expect(mocks.streamGemini.mock.calls[0]?.[1]).toBe("typed-key");
    expect(localStorage.getItem("persian-crossword-gemini-key")).toBe("typed-key");
  });

  it("reopening after a guest upgrades asks again", async () => {
    mocks.streamFreeAi.mockRejectedValueOnce(new QuotaError({ reason: "user", tier: "guest", limit: 10 }));
    const user = renderButton();
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    await screen.findByText(/\(۱۰ پرسش\) تمام شد/);

    // Guest signs up via the modal (AuthButton is mocked here); the app now has a full account.
    fakeAuth.currentUser = { uid: "u1" };
    await user.click(screen.getByRole("button", { name: "بستن" }));
    await user.click(screen.getByRole("button", { name: /از هوشواره بپرس/ }));
    expect(await screen.findByText("تهران")).toBeInTheDocument();
  });
});
```

Note on the last test: reopening the dialog re-runs the request with the new ID token, so no separate retry button is needed. The server picks the 100/day tier from the token.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/clueAiDialog.test.tsx`
Expected: FAIL — `uses own key directly` may pass; the free-tier/quota tests FAIL (dialog shows the old key form, `streamFreeAi` never called).

- [ ] **Step 3: Implement in `app/components/ClueAiDialog.tsx`**

Replace the imports block (lines 1-4) with:

```tsx
import { Fragment, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { signInAnonymously } from "firebase/auth";
import { auth } from "../firebase";
import {
  AI_GENERIC_ERROR,
  buildAskPrompt,
  buildExplainPrompt,
  FREE_AI_LIMITS,
  QuotaError,
  streamFreeAi,
  streamGemini,
  type QuotaInfo,
} from "../gemini";
import { loadGeminiKey, saveGeminiKey } from "../progress";
import { AuthButton } from "./AuthButton";
```

Add after `renderMarkdown`:

```tsx
const fa = (n: number) => n.toLocaleString("fa-IR");

function quotaMessage(q: QuotaInfo): string {
  if (q.reason === "shared") return "سهمیهٔ رایگانِ مشترکِ امروز برای همهٔ کاربران تمام شده.";
  const used = `سهمیهٔ رایگان امروز شما (${fa(q.limit)} پرسش) تمام شد.`;
  return q.tier === "guest"
    ? `${used} با ساخت حساب، روزانه ${fa(FREE_AI_LIMITS.account)} پرسش رایگان دارید.`
    : `${used} فردا دوباره شارژ می‌شود؛ یا کلید خودتان را وارد کنید.`;
}
```

Inside `ClueAiButton`, change the status state and add quota state:

```tsx
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error" | "quota">("idle");
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
```

Replace `runRequest`, `start`, `submitKey` with:

```tsx
  // Empty apiKey → free tier via the askAi proxy.
  async function runRequest(apiKey: string): Promise<void> {
    setText("");
    const prompt = isSolved ? buildExplainPrompt(clue, answer) : buildAskPrompt(clue, cellValues);
    const ac = new AbortController();
    setController(ac);
    setStatus("loading");
    const onChunk = (chunk: string) => setText((t) => t + chunk);
    try {
      if (apiKey) {
        await streamGemini(prompt, apiKey, onChunk, ac.signal);
      } else {
        if (!auth.currentUser) {
          await signInAnonymously(auth).catch(() => {
            throw new Error(AI_GENERIC_ERROR);
          });
        }
        await streamFreeAi(prompt, onChunk, ac.signal);
      }
      setStatus("done");
    } catch (e) {
      if (ac.signal.aborted) return;
      if (e instanceof QuotaError) {
        setQuota(e.info);
        setStatus("quota");
        return;
      }
      setText(e instanceof Error ? e.message : "خطایی رخ داد.");
      setStatus("error");
    }
  }

  function start(): void {
    setOpen(true);
    const apiKey = loadGeminiKey();
    setKeyInput(apiKey);
    void runRequest(apiKey);
  }

  function submitKey(): void {
    const apiKey = keyInput.trim();
    if (!apiKey) return;
    saveGeminiKey(apiKey);
    void runRequest(apiKey);
  }
```

Replace the `status === "no-key" ? (…key form…) : (…text…)` JSX with:

```tsx
            {status === "quota" && quota ? (
              <div className="clue-ai-key-form" dir="rtl">
                <p>{quotaMessage(quota)}</p>
                {quota.reason === "user" && quota.tier === "guest" ? (
                  <AuthButton allowGuestUpgrade initialMode="signup" label="ساخت حساب" />
                ) : null}
                <label htmlFor="clue-ai-key">کلید هوشواره (Gemini)</label>
                <input
                  id="clue-ai-key"
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitKey()}
                  placeholder="کلید API خود را این‌جا وارد کنید"
                  dir="ltr"
                />
                <p className="auth-gemini-hint">
                  یا کلید Gemini خودتان را وارد کنید تا بدون محدودیت استفاده کنید. یک کلید رایگان از{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                    Google AI Studio
                  </a>{" "}
                  بسازید. این کلید فقط در همین مرورگر شما ذخیره می‌شود و به هیچ سروری ارسال نمی‌شود.
                </p>
                <button type="button" className="auth-btn" onClick={submitKey} disabled={!keyInput.trim()}>
                  ذخیره و دریافت پاسخ
                </button>
              </div>
            ) : (
              <div className="clue-ai-text" dir="rtl">
                {renderMarkdown(text)}
                {status === "loading" && !text ? <p>در حال دریافت پاسخ…</p> : null}
              </div>
            )}
```

(`autoFocus` is dropped from the key input: the quota message is now the first thing to read.)

No auth-state subscription is needed: after a guest signs up, the modal's `AuthButton` returns `null`, and closing/reopening the dialog re-runs with the new token (100/day tier), as the last test covers.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run test/clueAiDialog.test.tsx && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/ClueAiDialog.tsx test/clueAiDialog.test.tsx
git commit -m "Use the free AI quota by default and explain when it runs out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Emulator end-to-end check, docs, what's-new

**Files:**
- Modify: `CLAUDE.md` (Commands + Architecture), `app/whatsNew.ts` (new entry)

**Interfaces:**
- Consumes: everything above.
- Produces: verified E2E behaviour; docs for deploying.

- [ ] **Step 1: Local secret for the emulator**

Create `functions/.secret.local` (gitignored in Task 2) with a real free-tier key:

```
GEMINI_KEY=<paste the owner's free-tier key>
```

Confirm: `git status --short functions/` does not list `.secret.local`.

- [ ] **Step 2: Temporarily lower limits and start emulators**

In `functions/src/quota.ts` temporarily set `LIMITS = { guest: 1, account: 2 }` (do **not** commit this).

```bash
npm --prefix functions run build
npx firebase-tools emulators:start --only functions,firestore
```

In a second terminal:

```bash
VITE_FUNCTIONS_EMULATOR=1 npm run dev
```

(PowerShell: `$env:VITE_FUNCTIONS_EMULATOR=1; npm run dev`)

- [ ] **Step 3: Walk the scenarios in the browser (http://127.0.0.1:5567)**

With no own key saved (clear it in the user menu):
1. Signed out → open a puzzle → «از هوشواره بپرس» → answer streams in; emulator log shows `askAi` invoked; you are now a guest.
2. Ask again → guest quota message (numbers show ۱) + «ساخت حساب» + key form.
3. Click «ساخت حساب» → sign-in modal appears above the AI dialog, mentions ۱۰۰/۱۰ copy → sign in with Google → close and reopen the AI dialog → answer streams.
4. Ask twice more → account quota message, no sign-up button.
5. Enter an own key in the form → answer streams; emulator log shows **no** new `askAi` call.
6. Open the avatar menu as a guest (sign out, trigger step 1 again) → upsell line + «ساخت حساب» button opens the modal correctly positioned.

Revert the temporary `LIMITS` change: `git checkout functions/src/quota.ts`.

- [ ] **Step 4: Document commands in `CLAUDE.md`**

After the `### Grid-importer tool (Python)` block, add:

````markdown
### Firebase Functions (AI proxy)

```bash
npm --prefix functions test                         # quota + Gemini client unit tests
npm --prefix functions run build                    # tsc → functions/lib
npx firebase-tools emulators:start --only functions,firestore   # needs functions/.secret.local
VITE_FUNCTIONS_EMULATOR=1 npm run dev               # app → local askAi emulator
npx firebase-tools functions:secrets:set GEMINI_KEY # owner's free-tier key (separate GCP project, no billing)
npx firebase-tools deploy --only functions          # manual deploy; requires Blaze plan
```
````

In the Architecture block add the line:

```
functions/    Firebase Functions: askAi — Gemini proxy with per-user daily quota (Firestore aiUsage/{uid})
```

- [ ] **Step 5: What's-new entry**

Prepend to `WHATS_NEW` in `app/whatsNew.ts` (use the actual merge date):

```ts
  {
    date: "2026-09-23",
    title: "هوشوارهٔ رایگان",
    body:
      "دیگر برای پرسیدن از هوشواره به کلید Gemini نیازی نیست: مهمان‌ها روزانه ۱۰ و کاربران دارای حساب روزانه ۱۰۰ پرسش رایگان دارند. " +
      "اگر بیشتر لازم داشتید، همچنان می‌توانید کلید رایگان خودتان را از Google AI Studio وارد کنید.",
  },
```

- [ ] **Step 6: Full verification**

Run: `npm test && npm run typecheck && npm --prefix functions test && npm --prefix functions run build && npm run build`
Expected: all PASS / exit 0.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md app/whatsNew.ts
git commit -m "Document the AI proxy and announce the free AI quota

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Owner-only production steps (not automatable — list for the human)**

1. Create the Gemini key in a **separate** Google Cloud project with no billing (AI Studio → Create API key → new project).
2. Firebase console → `persiancrossword` → upgrade to Blaze; add a budget alert in Google Cloud Billing.
3. Firebase console → Firestore → Rules: confirm no `match /{document=**}` allow exposes `aiUsage`; if one exists, add `match /aiUsage/{id} { allow read, write: if false; }`.
4. `npx firebase-tools functions:secrets:set GEMINI_KEY` then `npx firebase-tools deploy --only functions`.
5. Merge the branch → GitHub Pages deploy picks up the client; rebuild the APK (`npm run build && npx cap sync android`).
