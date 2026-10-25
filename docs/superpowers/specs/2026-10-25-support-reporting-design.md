# Support and Clue Error Reporting Design

**Date:** 2026-10-25

## Goal

Add a compact clue-error reporting flow, a public contact form, tracked two-way conversations for real accounts, and an admin inbox that can open the affected published puzzle at the reported clue.

## Product decisions

- A clue error report requires a real Firebase account. Google and email/password accounts count; anonymous accounts do not.
- The public contact form works without signing in. An unregistered sender receives a submission receipt but cannot track or continue the conversation.
- A signed-in, non-anonymous sender can track contact messages and clue reports in one support center and can exchange text replies with admins.
- Notifications are in-app only. No email or push notifications are part of this version.
- Existing anonymous authentication remains available to existing features such as the free AI quota. This feature must not remove or change it.
- Contact submissions accept a subject, text, and at most one PNG, JPEG, or WebP image up to 5 MiB. Conversation replies are text-only.

## User experience

### Clue reports

Each clue header gets a compact `Flag` icon in the existing `active-clue-head-actions` group, using the existing `clue-icon-btn` sizing and spacing. It must have a tooltip and an accessible name and must not add vertical height to the clue panel.

Selecting it opens a report dialog populated with the puzzle id, puzzle title, slot id, direction, group number, and current clue text. The reporter writes an explanation. A real signed-in user can submit immediately. A signed-out or anonymous user is shown the existing sign-in/create-account flow; the pending report remains available after successful sign-in.

Clue reports use these Persian-facing states:

1. `submitted` — ارسال‌شده
2. `reviewing` — در حال بررسی
3. `accepted` — تأییدشده
4. `fixed` — اصلاح‌شده
5. `rejected` — ردشده

### Contact form

The home/account navigation exposes `تماس با ما`. The form accepts subject, text, and one optional image. An unauthenticated or anonymous sender is treated as untracked: the server stores no owner uid and the UI shows only a successful receipt. A real account owns the new thread and sees it in the support center.

Contact threads use these Persian-facing states:

1. `submitted` — ارسال‌شده
2. `reviewing` — در حال بررسی
3. `answered` — پاسخ‌داده‌شده
4. `closed` — بسته‌شده

### Support center

`گزارش‌ها و پیام‌های من` is available only to real accounts. It lists the user's clue reports and tracked contact threads, current status, last activity, and unread count. Opening an item marks admin messages read and shows the two-way text conversation. Sending a reply increments the admin unread count.

The account menu shows an in-app unread badge and links to the support center. Anonymous users do not see this entry or receive read access even if an anonymous Firebase session exists.

### Admin inbox

The admin panel gains a `گزارش‌ها و پیام‌ها` tab. It lists both thread types, supports filtering by type and status, shows unread counts, and opens the full conversation. Admins can reply and set any status valid for that thread type.

A clue report detail has `باز کردن جدول`. It navigates to the existing published puzzle editor with the report's `slotId`; `SolverPage` selects that slot on entry. Fixes continue to use the existing published puzzle save path.

## Architecture

Use Firebase callable functions as the only write boundary. Clients read authorized threads and messages from Firestore but cannot create messages or change status directly. Functions validate authentication, App Check, payload sizes, status values, ownership, unread counters, and rate limits, then write with the Admin SDK.

App Check uses reCAPTCHA Enterprise for web and Play Integrity for Android. The Capacitor App Check plugin supplies the native token through a Firebase JS SDK `CustomProvider`, so existing JS callable functions receive App Check tokens on Android. Local emulator builds use registered debug tokens; production must never enable the debug provider.

## Data model

### `supportThreads/{threadId}`

- `kind`: `clue_error | contact`
- `ownerUid`: real account uid; omitted for untracked contact
- `status`: one of the kind-specific states above
- `subject`: contact subject or generated clue-report subject
- `createdAt`, `updatedAt`, `lastMessageAt`: server timestamps
- `userUnread`, `adminUnread`: non-negative counts
- `clue`: clue reports only; immutable snapshot containing `puzzleId`, `puzzleTitle`, `slotId`, `direction`, `groupNum`, and `text`

### `supportThreads/{threadId}/messages/{messageId}`

- `sender`: `user | admin | guest`
- `text`: validated, trimmed text
- `imagePath`: optional and only allowed on the initial contact message
- `createdAt`: server timestamp

The initial clue snapshot is immutable so later puzzle edits cannot make the report unintelligible.

### Storage

Images use `support/{ownerKey}/{threadId}/{messageId}` where `ownerKey` is the real uid or `guest`. There are no public download tokens. Clients retrieve authorized images with the Firebase Storage SDK, whose rules allow a real owner or admin to read; direct client writes are denied. The create function decodes, signature-checks, and stores the image.

## Callable operations

- `createSupportThread`: creates a clue report for a real account or a contact thread for any App Check-verified client; returns `{ tracked, threadId? }`.
- `replySupportThread`: permits a real owner or admin to add a text reply and updates unread counts.
- `setSupportStatus`: admin-only; accepts only states valid for the thread kind.
- `markSupportRead`: permits a real owner or admin to clear their side's unread count.

All support callables use `enforceAppCheck: true`. Clue reports reject missing and anonymous auth. Contact submissions deliberately accept missing or anonymous auth but omit ownership in both cases.

## Validation and abuse prevention

- Subject: required, trimmed, maximum 120 characters.
- Initial message and replies: required, trimmed, maximum 2,000 characters.
- Clue identifiers and snapshot strings have conservative length and numeric bounds.
- Image: at most 5 MiB decoded; MIME allowlist plus PNG/JPEG/WebP magic-byte validation.
- Real accounts: at most 20 new threads per Tehran day and 50 replies per Tehran day.
- Untracked contact: at most 3 new threads per Tehran day per HMAC-derived network key. The function hashes the request network address with a server secret and never stores the address itself.
- App Check is enabled in monitoring mode before enforcement, then enforced only after web and Android verified-request metrics are healthy.

## Authorization

Firestore rules allow:

- admin claim: read any support thread and messages;
- real, non-anonymous auth: read a thread and messages only when `ownerUid == request.auth.uid`;
- no client writes to support collections;
- no access for missing or anonymous auth.

Storage rules allow reads only to admins or the real uid encoded in the path. They deny guest reads and all direct writes.

## Routing and layout

Add routes for the public contact page, signed-in support center, and a support-thread detail. Extend the puzzle route with an optional `slotId`. Hardware-back behavior returns support/detail pages to their parent and a deep-linked puzzle to the prior page.

The clue report button reuses the existing absolute-positioned action group and icon-button styling. No new row or label is added to the clue block.

## Privacy

Update the privacy page to disclose support text, optional contact images, account linkage for tracked threads, admin replies, and the pseudonymous abuse-prevention key for untracked submissions. Images remain private and are used only to process the submitted contact request.

## Testing

- Pure function tests cover input parsing, real-vs-anonymous identity, status allowlists, rate limits, and image signatures.
- Callable integration tests cover ownership, admin-only operations, unread counters, and untracked contact creation.
- Firestore and Storage emulator rules tests prove owner/admin reads and deny anonymous, unrelated, and client-write access.
- React tests cover the compact clue action, sign-in gating with draft preservation, support/contact flows, unread badge, admin filters/replies/statuses, and exact-slot deep linking.
- Final verification runs root tests/typecheck/build, Functions tests/build, and Android sync/build checks relevant to the App Check plugin.

## Rollout

1. Configure a reCAPTCHA Enterprise score-based key for production web domains and register the web app in Firebase App Check.
2. Register the Android app with Play Integrity and add debug tokens for emulator/development devices.
3. Deploy rules/functions and ship clients with App Check while enforcement is still off.
4. Confirm verified-request metrics for both platforms.
5. Enable App Check enforcement for the support callable functions.

## Not in this version

- Removing anonymous authentication from the rest of the app.
- Email or push notifications.
- Public tracking codes for unregistered senders.
- Multiple attachments, non-image files, or attachments on replies.
- A third-party ticketing service.
