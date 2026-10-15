import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GeminiHttpError, streamGemini } from "./gemini.js";
import { decide, isValidPrompt, LIMITS, tehranDay, tierFor, type UsageDoc } from "./quota.js";
import { extractPhoto, readPhotoRequest } from "./photoExtraction.js";
import { buildStats, type AdminStats, type ScoreboardEntry, type StatsUserInput } from "./stats.js";
import { getAuth } from "firebase-admin/auth";

initializeApp();
const GEMINI_KEY = defineSecret("GEMINI_KEY");

export const extractPuzzlePhoto = onCall(
  { region: "us-central1", secrets: [GEMINI_KEY], timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign-in required.");
    if (request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
    let input;
    try { input = readPhotoRequest(request.data); }
    catch (e) { throw new HttpsError("invalid-argument", e instanceof Error ? e.message : "Invalid image."); }
    const key = GEMINI_KEY.value();
    if (!key) throw new HttpsError("failed-precondition", "Set GEMINI_KEY on the server first.");
    try {
      return await extractPhoto(input.image, input.kind, input.rows, input.cols, key, input.variant, input.puzzleNumber);
    } catch (e) {
      if (e instanceof GeminiHttpError && (e.status === 400 || e.status === 401 || e.status === 403)) {
        throw new HttpsError("failed-precondition", "Check the server's Gemini API key and model access.");
      }
      if (e instanceof GeminiHttpError && e.status === 429) throw new HttpsError("resource-exhausted", "Gemini quota reached. Try again later.");
      throw new HttpsError("unavailable", "Gemini extraction failed. Try again.");
    }
  },
);

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

// Admin dashboard: one read per scoreboard and aiUsage doc, plus the Auth user list.
// ponytail: reads everything on each refresh; fine to a few thousand users, pre-aggregate beyond that.
export const adminStats = onCall({ region: "us-central1", timeoutSeconds: 120, memory: "512MiB" }, async (request): Promise<AdminStats> => {
  if (request.auth?.token.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const users: StatsUserInput[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const created = Date.parse(u.metadata.creationTime);
      const active = Date.parse(u.metadata.lastRefreshTime ?? u.metadata.lastSignInTime ?? "") || created;
      users.push({
        uid: u.uid, email: u.email, name: u.displayName,
        provider: u.providerData[0]?.providerId ?? "anonymous",
        createdAt: created, lastActiveAt: active,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const db = getFirestore();
  const [boards, ai] = await Promise.all([db.collectionGroup("meta").get(), db.collection("aiUsage").get()]);
  const scoreboards = new Map<string, Record<string, ScoreboardEntry>>();
  for (const doc of boards.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (doc.id === "scoreboard" && uid) scoreboards.set(uid, (doc.get("puzzles") ?? {}) as Record<string, ScoreboardEntry>);
  }
  return buildStats(users, scoreboards, new Map(ai.docs.map((d) => [d.id, d.data()])), Date.now());
});
