import { createHmac } from "node:crypto";
import { FieldValue, getFirestore, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineBoolean, defineSecret } from "firebase-functions/params";
import { warn } from "firebase-functions/logger";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { tehranDay } from "./quota.js";
import { decideSupportUsage, isStatusForKind, parseCreateSupportInput, parseReplySupportInput, parseSupportParticipant, readSupportImage, type SupportKind, type SupportParticipant } from "./supportPolicy.js";

const SUPPORT_ENFORCE_APP_CHECK = defineBoolean("SUPPORT_ENFORCE_APP_CHECK", { default: false });
const SUPPORT_RATE_LIMIT_SALT = defineSecret("SUPPORT_RATE_LIMIT_SALT");
const callableOptions = { region: "us-central1", enforceAppCheck: SUPPORT_ENFORCE_APP_CHECK };

interface SupportThread {
  kind: SupportKind;
  ownerUid?: string;
  userUnread: number;
  adminUnread: number;
}

export function networkRateKey(address: string, day: string, secret: string): string {
  return createHmac("sha256", secret).update(`${day}\0${address}`).digest("hex");
}

function identity(request: CallableRequest): "real" | "anonymous" | "missing" {
  if (!request.auth) return "missing";
  return request.auth.token.firebase?.sign_in_provider === "anonymous" ? "anonymous" : "real";
}

function validate<T>(parse: () => T): T {
  try { return parse(); }
  catch (error) { throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Invalid support input."); }
}

function threadIdFrom(data: unknown): string {
  const id = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).threadId : undefined;
  if (typeof id !== "string" || !id.trim() || id.trim().length > 200 || id.includes("/")) {
    throw new HttpsError("invalid-argument", "Invalid support thread id.");
  }
  return id.trim();
}

function requireReal(request: CallableRequest): string {
  if (identity(request) !== "real") throw new HttpsError("unauthenticated", "A real account is required.");
  return request.auth!.uid;
}

async function readThread(tx: Transaction, ref: DocumentReference): Promise<SupportThread> {
  const snapshot = await tx.get(ref);
  if (!snapshot.exists) throw new HttpsError("not-found", "Support thread not found.");
  return snapshot.data() as SupportThread;
}

function authorizeThread(request: CallableRequest, thread: SupportThread, participant: SupportParticipant): boolean {
  const uid = requireReal(request);
  const admin = participant === "admin";
  if (admin ? request.auth!.token.admin !== true : thread.ownerUid !== uid) throw new HttpsError("permission-denied", "Support thread access denied.");
  return admin;
}

async function nextUsage(tx: Transaction, ref: DocumentReference, day: string, limit: number) {
  const usage = await tx.get(ref);
  const result = decideSupportUsage(usage.data() as { day: string; count: number } | undefined, day, limit);
  if (!result.allow) throw new HttpsError("resource-exhausted", "Daily support limit reached.");
  return result.next;
}

export const createSupportThread = onCall(
  { ...callableOptions, secrets: [SUPPORT_RATE_LIMIT_SALT] },
  async (request): Promise<{ tracked: boolean; threadId?: string }> => {
    const input = validate(() => parseCreateSupportInput(request.data, identity(request)));
    const db = getFirestore();
    const thread = db.collection("supportThreads").doc();
    const message = thread.collection("messages").doc();
    const day = tehranDay(new Date());
    const ownerUid = input.tracked ? request.auth!.uid : undefined;
    let usageKey: string;
    if (ownerUid) {
      usageKey = `threads_${ownerUid}`;
    } else {
      const secret = SUPPORT_RATE_LIMIT_SALT.value();
      const address = request.rawRequest.ip;
      if (!secret || !address) throw new HttpsError("failed-precondition", "Contact rate limiting is unavailable.");
      usageKey = `guest_${networkRateKey(address, day, secret)}`;
    }
    const usage = db.collection("supportUsage").doc(usageKey);
    const image = input.image ? readSupportImage(input.image) : undefined;
    const imagePath = image ? `support/${ownerUid ?? "guest"}/${thread.id}/${message.id}` : undefined;
    const imageFile = imagePath ? getStorage().bucket().file(imagePath) : undefined;

    // Reserve image quota before Storage work; image-free creation remains one transaction.
    if (imageFile) {
      await db.runTransaction(async (tx) => {
        tx.set(usage, await nextUsage(tx, usage, day, ownerUid ? 20 : 3));
      });
    }
    try {
      if (image && imageFile) {
        await imageFile.save(image.bytes, { resumable: false, metadata: { contentType: image.mimeType } });
      }
      await db.runTransaction(async (tx) => {
        if (!imageFile) tx.set(usage, await nextUsage(tx, usage, day, ownerUid ? 20 : 3));
        const timestamp = FieldValue.serverTimestamp();
        tx.set(thread, {
          kind: input.kind, subject: input.subject, status: "submitted",
          ...(ownerUid ? { ownerUid } : {}), ...(input.clue ? { clue: input.clue } : {}),
          createdAt: timestamp, updatedAt: timestamp, lastMessageAt: timestamp,
          userUnread: 0, adminUnread: 1,
        });
        tx.set(message, {
          sender: ownerUid ? "user" : "guest", text: input.text, createdAt: timestamp,
          ...(imagePath ? { imagePath } : {}),
        });
      });
    } catch (error) {
      if (imageFile) {
        try {
          const uncommitted = await db.runTransaction(async (tx) => {
            if ((await tx.get(thread)).exists) return false;
            const reserved = (await tx.get(usage)).data();
            if (reserved?.day === day && reserved.count > 0) tx.update(usage, { count: reserved.count - 1 });
            return true;
          });
          if (uncommitted) await imageFile.delete({ ignoreNotFound: true });
        } catch { warn("Failed to roll back support image submission", { imagePath }); }
      }
      throw error;
    }
    return ownerUid ? { tracked: true, threadId: thread.id } : { tracked: false };
  },
);

export const replySupportThread = onCall(callableOptions, async (request) => {
  const uid = requireReal(request);
  const input = validate(() => parseReplySupportInput(request.data));
  const db = getFirestore();
  const thread = db.collection("supportThreads").doc(threadIdFrom(input));
  const message = thread.collection("messages").doc();
  const usage = db.collection("supportUsage").doc(`replies_${uid}`);
  const day = tehranDay(new Date());
  await db.runTransaction(async (tx) => {
    const current = await readThread(tx, thread);
    const admin = authorizeThread(request, current, input.participant);
    const next = await nextUsage(tx, usage, day, 50);
    const timestamp = FieldValue.serverTimestamp();
    tx.set(usage, next);
    tx.set(message, { sender: admin ? "admin" : "user", text: input.text, createdAt: timestamp });
    tx.update(thread, {
      updatedAt: timestamp, lastMessageAt: timestamp,
      ...(admin ? { userUnread: current.userUnread + (current.ownerUid ? 1 : 0) } : { adminUnread: current.adminUnread + 1 }),
    });
  });
  return { ok: true };
});

export const setSupportStatus = onCall(callableOptions, async (request) => {
  if (request.auth?.token.admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const id = threadIdFrom(request.data);
  const status: unknown = request.data.status;
  const db = getFirestore();
  const thread = db.collection("supportThreads").doc(id);
  await db.runTransaction(async (tx) => {
    const current = await readThread(tx, thread);
    if (!isStatusForKind(current.kind, status)) throw new HttpsError("invalid-argument", "Invalid support status.");
    tx.update(thread, { status, updatedAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

export const markSupportRead = onCall(callableOptions, async (request) => {
  requireReal(request);
  const participant = validate(() => parseSupportParticipant(request.data));
  const db = getFirestore();
  const thread = db.collection("supportThreads").doc(threadIdFrom(request.data));
  await db.runTransaction(async (tx) => {
    const current = await readThread(tx, thread);
    const admin = authorizeThread(request, current, participant);
    tx.update(thread, admin ? { adminUnread: 0 } : { userUnread: 0 });
  });
  return { ok: true };
});
