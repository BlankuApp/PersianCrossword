# Free AI quota via Firebase proxy — design

Date: 2026-09-23 · Status: approved in chat, pending spec review

## Goal

The AI clue assistant (هوشواره) works out of the box on the owner's Gemini key, with a daily
free quota per user. When the quota is exhausted the dialog explains why and asks for the user's
own Gemini key, which then works exactly as today. The quota difference between guests and
account holders is used as an incentive to create an account.

## Decisions

| Topic | Decision |
|---|---|
| Quota | Guests (anonymous or signed-out) **10 / day**; Google or email accounts **100 / day** |
| Day boundary | Calendar date in `Asia/Tehran` |
| Proxy host | Firebase Cloud Function (project `persiancrossword`, requires Blaze plan) |
| Function style | Streaming callable: `onCall` + `httpsCallable().stream()` (firebase JS SDK 12) |
| Owner's Gemini key | Free tier, **created in a separate GCP project without billing** — so it can never incur cost. Stored as function secret `GEMINI_KEY`. |
| Global cap | None — Google's free-tier limit on the owner key is the global cap |
| User's own key | Unchanged: stored in localStorage, sent directly to Google, never to our server |

## Constraints

- The owner's key must never reach the client bundle (web or APK).
- Static hosting (GitHub Pages) + Capacitor Android; the function is the only server code.
- `exactOptionalPropertyTypes` is on in both tsconfigs.
- `functions/` is a separate npm package; the root `tsconfig.json`, `tsconfig.app.json` and Vitest
  config must not pick it up (exclude it if their globs would).

## 1. Server — `functions/`

New files:

- `firebase.json`, `.firebaserc` (default project `persiancrossword`) at repo root.
- `functions/package.json` (`firebase-functions`, `firebase-admin`; dev: `typescript`, `vitest`), `functions/tsconfig.json`,
  `functions/src/index.ts`, `functions/src/quota.ts`.

### `askAi` (`onCall`, region `us-central1`, `secrets: [GEMINI_KEY]`)

Input: `{ prompt: string }`. Output: streamed text chunks via `response.sendChunk(text)`; final
return value `{ ok: true }`.

Flow:

1. `request.auth` missing → `HttpsError("unauthenticated")`.
2. `prompt` not a string, empty, or longer than **1000 chars** → `HttpsError("invalid-argument")`.
   (The cap stops the proxy being used as a general-purpose free Gemini.)
3. Tier: `request.auth.token.firebase.sign_in_provider === "anonymous"` → tier `guest` (limit 10),
   else tier `account` (limit 100).
4. Firestore transaction on `aiUsage/{uid}` = `{ day: "YYYY-MM-DD", count: number }`:
   pure function `decide(doc | undefined, today, limit)` returns either
   `{ allow: true, next: { day, count } }` or `{ allow: false }`. A stored `day !== today` counts as 0.
   Deny → `HttpsError("resource-exhausted", "...", { reason: "user", tier, limit })`.
5. `fetch` Gemini `streamGenerateContent?alt=sse` (model `gemini-flash-lite-latest`, same as client),
   parse SSE lines, `sendChunk` each text part.
6. On Gemini failure: refund (`count: FieldValue.increment(-1)`), then
   - Gemini 429 → `HttpsError("resource-exhausted", "...", { reason: "shared" })`
   - anything else → `HttpsError("unavailable")`.

`today` = `new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(now)` (gives `YYYY-MM-DD`).

### Firestore

`aiUsage/*` is written only by the Admin SDK (which bypasses rules). Clients must get no access. Rules are
managed in the Firebase console (no `firestore.rules` in repo): **verify there is no wildcard
`match /{document=**}` allow** that would expose `aiUsage`; if there is, add an explicit
`match /aiUsage/{id} { allow read, write: if false; }`. Then clients can
neither read nor tamper with counts.

### Deploy (manual, one-time setup)

```bash
firebase functions:secrets:set GEMINI_KEY
firebase deploy --only functions
```

No CI deploy for now.

## 2. Client

### `app/firebase.ts`

Export `functions = getFunctions(app, "us-central1")`.

### `app/gemini.ts`

- New `class QuotaError extends Error { reason: "user" | "shared"; tier?: "guest" | "account"; limit?: number }`.
- New `streamFreeAi(prompt, onChunk, signal)`: `httpsCallable(functions, "askAi").stream({ prompt }, { signal })`,
  forwards each chunk to `onChunk`, awaits the result. Maps `functions/resource-exhausted` →
  `QuotaError` from `error.details`; other errors → the existing Persian generic message.
- `streamGemini` (own key) unchanged.

### `app/components/ClueAiDialog.tsx`

`start()`:

1. Own key saved → `streamGemini` (as today; keeps the shared quota for those without a key).
2. Otherwise, if `auth.currentUser` is null → `await signInAnonymously(auth)`.
3. `streamFreeAi`. On `QuotaError` → status `"quota"` (replaces `"no-key"`), showing:
   - guest, `reason: "user"`: «سهمیهٔ رایگان امروز شما (۱۰ پرسش) تمام شد. با ساخت حساب، روزانه ۱۰۰ پرسش رایگان دارید.»
     + `<AuthButton allowGuestUpgrade initialMode="signup" label="ساخت حساب" />`
     + key form with «یا کلید Gemini خودتان را وارد کنید تا بدون محدودیت استفاده کنید.»
   - account, `reason: "user"`: «سهمیهٔ رایگان امروز شما (۱۰۰ پرسش) تمام شد. فردا دوباره شارژ می‌شود؛ یا کلید خودتان را وارد کنید.» + key form
   - `reason: "shared"`: «سهمیهٔ رایگانِ مشترکِ امروز برای همهٔ کاربران تمام شده.» + key form

Numbers in messages come from `limit` (formatted `fa-IR`), not hard-coded.

### `app/components/AuthButton.tsx`

- New prop `allowGuestUpgrade?: boolean | undefined`: when true and `user.isAnonymous`, render the
  sign-in button/modal instead of `UserMenu`. Fixes the existing gap where a guest cannot upgrade
  without signing out. Signing in replaces the anonymous session; local progress is kept because
  `syncProgress` (AuthContext) merges localStorage into the new account.
- Sign-in modal `auth-sync-info`: add «کاربران دارای حساب روزانه ۱۰۰ پرسش رایگان از هوشواره دارند (مهمان‌ها ۱۰).»
- `UserMenu` Gemini section: hint reworded to say the key is optional (only needed beyond the free
  daily quota); for guests add a line «ساخت حساب = ۱۰۰ پرسش در روز» with an
  `<AuthButton allowGuestUpgrade initialMode="signup" label="ساخت حساب" />`.

## Out of scope

- "Remaining today" counter (needs a readable doc or extra call).
- Routing the user's own key through the proxy.
- CI deploy of functions, App Check, global daily cap.

## Testing

- `functions/src/quota.test.ts` (Vitest): `decide` — first use, same-day increment, limit reached,
  day rollover; `today` formatting for Tehran near UTC midnight.
- `test/` (Vitest): `QuotaError` mapping from a `FunctionsError` with `details`.
- Manual E2E with `firebase emulators:start --only functions,firestore` (client `connectFunctionsEmulator`
  under `import.meta.env.DEV` + env flag), temporarily limit 1: guest → quota message + sign-up;
  account → quota message; own key bypasses proxy.
- `npm run typecheck`, `npm run test`.
