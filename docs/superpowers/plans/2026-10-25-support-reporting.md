# Support and Clue Error Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact clue-error reporting, public contact submissions, tracked two-way support conversations for real accounts, and an admin inbox with exact-clue navigation.

**Architecture:** Firebase callable functions are the sole write boundary for support data; Firestore and Storage rules expose private reads only to a real owner or admin. React pages read authorized threads, call the support API for mutations, and initialize App Check with reCAPTCHA Enterprise on web and a Play Integrity-backed custom provider on Android.

**Tech Stack:** React 19, TypeScript, Firebase Auth/Firestore/Storage/Functions/App Check, Capacitor 8, `@capacitor-firebase/app-check`, Vitest, Testing Library, Firebase Emulator Suite.

**Spec:** `docs/superpowers/specs/2026-10-25-support-reporting-design.md`

## Global Constraints

- A trackable identity is `user != null && !user.isAnonymous`; do not change anonymous auth behavior elsewhere.
- Clue reports require a trackable identity; contact messages may be untracked.
- The clue action reuses `active-clue-head-actions` and `clue-icon-btn` and adds no vertical row.
- Subject maximum is 120 characters; message maximum is 2,000 characters.
- Initial contact image only: one PNG/JPEG/WebP, maximum 5 MiB decoded; replies are text-only.
- No public image URLs, email/push notifications, public tracking codes, or third-party ticket service.
- App Check debug mode is development-only and must never be enabled by a production build.

## Review Focus

- A stale anonymous session submits contact: store it untracked with no `ownerUid`, then show receipt-only UI.
- A report dialog opened while anonymous survives the upgrade/sign-in render and submits the originally selected slot.
- A clue changed after reporting still displays its immutable snapshot while deep-linking by the original `slotId` fails gracefully if that slot no longer exists.
- A forged MIME type with non-image bytes is rejected before Storage receives it.
- Concurrent replies and read actions never produce negative or lost unread counts.

---

### Task 1: Support input policy and status model

**Files:**
- Create: `functions/src/supportPolicy.ts`
- Create: `functions/src/supportPolicy.test.ts`

**Interfaces:**
- Produces: `SupportKind`, `ClueReportStatus`, `ContactStatus`, `CreateSupportInput`, `ReplySupportInput`.
- Produces: `parseCreateSupportInput(value: unknown, identity: "real" | "anonymous" | "missing"): CreateSupportInput`.
- Produces: `parseReplySupportInput(value: unknown): ReplySupportInput`.
- Produces: `isStatusForKind(kind: SupportKind, status: unknown): boolean`.
- Produces: `readSupportImage(value: unknown): { mimeType: string; bytes: Buffer } | undefined`.
- Produces: `decideSupportUsage(previous: { day: string; count: number } | undefined, day: string, limit: number): { allow: false } | { allow: true; next: { day: string; count: number } }`.

- [ ] **Step 1: Write failing policy tests**

Cover real-only clue reports; anonymous/missing contact becoming untracked; 120/2,000 character boundaries; the two exact status allowlists; 5 MiB boundary; PNG/JPEG/WebP magic bytes; mismatched/forged bytes; and daily counter reset/denial.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm --prefix functions test -- src/supportPolicy.test.ts`

Expected: FAIL because `supportPolicy.ts` does not exist.

- [ ] **Step 3: Implement the policy module**

Use built-in `Buffer` checks and existing Tehran-day conventions from `functions/src/quota.ts`; do not add an image-parsing dependency.

- [ ] **Step 4: Run the focused tests and verify pass**

Run: `npm --prefix functions test -- src/supportPolicy.test.ts`

Expected: all support policy tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/supportPolicy.ts functions/src/supportPolicy.test.ts
git commit -m "test: define support submission policy"
```

### Task 2: Callable support service and persistence

**Files:**
- Create: `functions/src/support.ts`
- Create: `functions/src/support.test.ts`
- Modify: `functions/src/index.ts`
- Modify: `functions/package.json`
- Modify: `functions/package-lock.json`

**Interfaces:**
- Consumes: Task 1 policy types and parsers.
- Produces callable exports: `createSupportThread`, `replySupportThread`, `setSupportStatus`, `markSupportRead`.
- Produces: `networkRateKey(address: string, day: string, secret: string): string` using HMAC-SHA256.
- `createSupportThread` returns `{ tracked: boolean; threadId?: string }`.

- [ ] **Step 1: Write failing callable/service tests**

Exercise: real clue report creation; missing/anonymous clue rejection; untracked contact omitting `ownerUid`; image write path; owner/admin reply authorization; unrelated-user denial; kind-specific admin statuses; transactional unread updates; mark-read; 20 real thread/day, 50 reply/day, and 3 untracked contact/day limits; HMAC output not containing the address.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm --prefix functions test -- src/support.test.ts`

Expected: FAIL because the support service/callables are absent.

- [ ] **Step 3: Implement persistence and callable wrappers**

Use Firestore transactions for thread creation, replies, counters, and read markers. Store images through Admin Storage only after Task 1 validation. Configure all four callables with `region: "us-central1"` and `enforceAppCheck: true`; define `SUPPORT_RATE_LIMIT_SALT` as a Functions secret for the untracked-contact HMAC.

- [ ] **Step 4: Run Functions tests and build**

Run: `npm --prefix functions test`

Expected: PASS.

Run: `npm --prefix functions run build`

Expected: TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add functions/src/index.ts functions/src/support.ts functions/src/support.test.ts functions/package.json functions/package-lock.json
git commit -m "feat: add support conversation functions"
```

### Task 3: Private read rules and emulator proof

**Files:**
- Modify: `firestore.rules`
- Modify: `storage.rules`
- Modify: `firebase.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `test/supportRules.test.ts`

**Interfaces:**
- Consumes: Task 2 collection and Storage paths.
- Produces: read-only client access for a real owner/admin and no direct client writes.

- [ ] **Step 1: Add failing emulator rule tests**

Seed with Admin SDK and assert: owner Google/password reads thread/messages/image; admin reads all; unrelated user, anonymous user, and unauthenticated client are denied; every direct support Firestore/Storage write is denied.

- [ ] **Step 2: Run the emulator test and verify failure**

Run: `npx firebase-tools emulators:exec --only firestore,storage,auth "npx vitest run test/supportRules.test.ts"`

Expected: FAIL because no support rules exist.

- [ ] **Step 3: Implement the minimum rules**

Use `request.auth.token.firebase.sign_in_provider != "anonymous"` for real-owner reads. Messages consult their parent thread. Storage owner comes from `support/{ownerUid}/{threadId}/{file}`; `guest` is admin-only. Add only the emulator configuration/dependency required by the test.

- [ ] **Step 4: Re-run the emulator test**

Run: `npx firebase-tools emulators:exec --only firestore,storage,auth "npx vitest run test/supportRules.test.ts"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules storage.rules firebase.json package.json package-lock.json test/supportRules.test.ts
git commit -m "test: lock down support data access"
```

### Task 4: App Check and client support API

**Files:**
- Create: `app/appCheck.ts`
- Create: `app/support/supportApi.ts`
- Create: `test/supportApi.test.ts`
- Modify: `app/firebase.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: Android files changed by `npx cap sync android`

**Interfaces:**
- Produces: `appCheckReady: Promise<void>`.
- Produces: `isRealUser(user: User | null): boolean`.
- Produces client functions: `createClueReport`, `createContact`, `replySupportThread`, `setSupportStatus`, `markSupportRead`, `subscribeOwnThreads`, `subscribeAllThreads`, `subscribeMessages`, `loadSupportImage`.
- Produces client DTOs matching Task 2 documents without importing Functions source.

- [ ] **Step 1: Write failing API tests**

Mock Firebase modules and assert every mutation awaits `appCheckReady`, reads use owner/admin queries, `isRealUser` rejects null/anonymous, and image reads use authenticated Storage blobs rather than download URLs.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/supportApi.test.ts`

Expected: FAIL because the client modules do not exist.

- [ ] **Step 3: Install and initialize App Check**

Install the Capacitor-8-compatible `@capacitor-firebase/app-check` 8.x package. Web uses `ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY)`. Android initializes the native plugin and bridges `FirebaseAppCheck.getToken()` into Firebase JS `CustomProvider`. Emulator/development uses an explicitly configured debug token only.

- [ ] **Step 4: Implement the client API and sync Android**

Keep all Firebase support reads/calls in `supportApi.ts`; run `npx cap sync android` and retain only generated integration changes needed by the plugin.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run test/supportApi.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/appCheck.ts app/firebase.ts app/support/supportApi.ts test/supportApi.test.ts package.json package-lock.json android
git commit -m "feat: add App Check protected support client"
```

### Task 5: Compact clue report flow and exact-slot link

**Files:**
- Create: `app/support/ClueReportDialog.tsx`
- Modify: `app/components/CluePanel.tsx`
- Modify: `app/pages/SolverPage.tsx`
- Modify: `app/router.ts`
- Modify: `app/App.tsx`
- Modify: `app/styles.css`
- Modify: `test/app.test.tsx`
- Modify: `test/router.test.ts`

**Interfaces:**
- Consumes: Task 4 `createClueReport` and `isRealUser`.
- `ActiveClue` adds `onReportClue?: (slot: Slot) => void` and passes it to each `ClueBlock`.
- Puzzle route adds optional `slotId?: string`; `SolverPageProps` adds the same.

- [ ] **Step 1: Write failing UI and router tests**

Assert the `Flag` action is in `active-clue-head-actions`, uses `clue-icon-btn`, has an accessible Persian name, and does not add a new clue row. Assert dialog snapshot fields, sign-in/upgrade gating with explanation preserved, successful receipt, `slotId` hash parsing, initial exact-slot selection, and graceful fallback when a slot no longer exists.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/app.test.tsx test/router.test.ts`

Expected: FAIL on the missing report action/route data.

- [ ] **Step 3: Implement the minimum report UI**

Place `<Flag size={20}>` beside the existing Search/AI actions. Keep dialog state in `SolverPage` so AuthContext re-renders do not discard the typed explanation. Reuse `AuthButton` for signed-out/anonymous upgrade instead of adding auth code.

- [ ] **Step 4: Implement exact-slot routing**

Encode/decode a `slot` query parameter and select by `puzzle.slots.find(slot => slot.id === slotId)` before falling back to the first slot.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run test/app.test.tsx test/router.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/support/ClueReportDialog.tsx app/components/CluePanel.tsx app/pages/SolverPage.tsx app/router.ts app/App.tsx app/styles.css test/app.test.tsx test/router.test.ts
git commit -m "feat: report errors from the active clue"
```

### Task 6: Public contact and user support center

**Files:**
- Create: `app/support/ContactPage.tsx`
- Create: `app/support/SupportPage.tsx`
- Create: `app/support/SupportThread.tsx`
- Create: `test/supportPages.test.tsx`
- Modify: `app/components/AuthButton.tsx`
- Modify: `app/pages/HomePage.tsx`
- Modify: `app/router.ts`
- Modify: `app/App.tsx`
- Modify: `app/styles.css`

**Interfaces:**
- Consumes: Task 4 subscriptions, mutations, image loader, and `isRealUser`.
- Routes: `contact`, `support`, and `supportThread` with thread id.

- [ ] **Step 1: Write failing page tests**

Cover public contact validation/image preview; guest and anonymous receipt-only success; tracked real-user contact; own-thread list/status/unread; two-way text reply; mark-read on open; private image rendering; account-menu unread badge; and hiding support tracking from anonymous users.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/supportPages.test.tsx`

Expected: FAIL because the pages/routes are absent.

- [ ] **Step 3: Implement contact and support pages**

Use one shared `SupportThread` conversation component. Keep file reading local to the contact form and reject size/type before base64 conversion. Sort the small subscribed thread list client-side.

- [ ] **Step 4: Add navigation and unread badge**

Add `تماس با ما` to home navigation and `گزارش‌ها و پیام‌های من` plus aggregate unread count to the real-account menu. Do not show tracking UI for anonymous users.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run test/supportPages.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/support/ContactPage.tsx app/support/SupportPage.tsx app/support/SupportThread.tsx app/components/AuthButton.tsx app/pages/HomePage.tsx app/router.ts app/App.tsx app/styles.css test/supportPages.test.tsx
git commit -m "feat: add contact and user support center"
```

### Task 7: Admin support inbox

**Files:**
- Create: `app/admin/SupportSection.tsx`
- Create: `test/adminSupport.test.tsx`
- Modify: `app/admin/AdminPage.tsx`
- Modify: `app/styles.css`

**Interfaces:**
- Consumes: Task 4 admin subscriptions/mutations and Task 6 `SupportThread`.
- Produces: admin tab `support` with type/status filters, unread display, reply/status actions, and clue deep link.

- [ ] **Step 1: Write failing admin tests**

Assert admin-only list; type/status filters; unread clearing; replies; only kind-valid Persian statuses; and `باز کردن جدول` navigating to the encoded puzzle id and `slot` query.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run test/adminSupport.test.tsx`

Expected: FAIL because the support admin tab is absent.

- [ ] **Step 3: Implement the admin section**

Reuse `SupportThread`; add the fifth existing-style admin tab and make the sliding-pill width derive from the tab count instead of retaining the hard-coded four-tab width.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run test/adminSupport.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/SupportSection.tsx app/admin/AdminPage.tsx app/styles.css test/adminSupport.test.tsx
git commit -m "feat: add admin support inbox"
```

### Task 8: Privacy, deployment notes, and full verification

**Files:**
- Modify: `public/privacy.html`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Update user-facing privacy disclosure**

Document support text, optional images, real-account linkage, admin replies, private retention, and the HMAC-derived abuse-prevention network key without claiming that anonymous contact can be tracked.

- [ ] **Step 2: Add operator setup and staged rollout notes**

Document `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`, `SUPPORT_RATE_LIMIT_SALT`, Android Play Integrity registration, web/Android debug tokens, emulator commands, deploy commands, verified-request monitoring, and enforcement only after both platforms are healthy.

- [ ] **Step 3: Run the complete verification suite**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npm --prefix functions test`

Expected: PASS.

Run: `npm --prefix functions run build`

Expected: PASS.

Run: `npx firebase-tools emulators:exec --only firestore,storage,auth "npx vitest run test/supportRules.test.ts"`

Expected: PASS.

Run: `npx cap sync android`

Expected: exits 0 with the App Check plugin registered.

- [ ] **Step 4: Perform manual emulator checks**

Verify compact clue layout at the shortest supported viewport; Google and email/password tracking; anonymous report gating; untracked contact receipt; user/admin two-way unread behavior; private image display; status changes; exact-clue opening; and Android debug App Check token acceptance.

- [ ] **Step 5: Commit**

```bash
git add public/privacy.html CLAUDE.md
git commit -m "docs: document support data and rollout"
```

## Self-review result

- Spec coverage: all product decisions, security boundaries, UI surfaces, rollout steps, privacy text, and non-goals map to Tasks 1–8.
- Type consistency: callable names, route fields, status values, limits, and client API names are consistent across tasks.
- Review focus: each listed failure mode has an owning automated test in Tasks 1, 2, 5, or 6.
- Proportion: implementation bodies are left to the executor; the plan fixes interfaces, values, proof commands, and task boundaries only.
