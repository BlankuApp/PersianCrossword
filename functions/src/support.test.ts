import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupportThread, markSupportRead, networkRateKey, replySupportThread, setSupportStatus } from "./support.js";

// Only the external persistence boundary is replaced; callable validation and policy stay real.
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(), images: new Map<string, { bytes: Buffer; options: any }>(),
  sequence: 0, queue: Promise.resolve(), failSave: false, failCommit: false,
}));
vi.mock("firebase-admin/firestore", () => {
  const collection = (path: string): any => ({ doc: (id = `id${++store.sequence}`) => ({
    path: `${path}/${id}`, id, collection: (name: string) => collection(`${path}/${id}/${name}`),
  }) });
  return {
    FieldValue: { serverTimestamp: () => "server-time" },
    getFirestore: () => ({ collection, runTransaction: (run: any) => {
      const result = store.queue.then(async () => {
        const writes = new Map<string, Record<string, any>>();
        const value = await run({
          get: async (ref: any) => {
            if (writes.size) throw new Error("Firestore reads must precede writes");
            return { exists: store.docs.has(ref.path), data: () => store.docs.get(ref.path) };
          },
          set: (ref: any, data: any) => writes.set(ref.path, data),
          update: (ref: any, data: any) => writes.set(ref.path, { ...store.docs.get(ref.path), ...data }),
        });
        if (store.failCommit) throw new Error("commit failed");
        for (const [path, data] of writes) store.docs.set(path, data);
        return value;
      });
      store.queue = result.then(() => undefined, () => undefined);
      return result;
    } }),
  };
});
vi.mock("firebase-admin/storage", () => ({ getStorage: () => ({ bucket: () => ({ file: (path: string) => ({
  save: async (bytes: Buffer, options: any) => {
    if (store.failSave) throw new Error("upload failed");
    store.images.set(path, { bytes, options });
  },
  delete: async () => { store.images.delete(path); },
}) }) }) }));

type Request = Parameters<typeof createSupportThread.run>[0];
const request = (data: unknown, uid?: string, provider = "password", admin = false): Request => ({
  data, rawRequest: { ip: "192.0.2.10" },
  ...(uid ? { auth: { uid, token: { admin, firebase: { sign_in_provider: provider } } } } : {}),
}) as Request;
const contact = { kind: "contact", subject: " Help ", text: " My message " };
const clue = { kind: "clue_error", subject: "Wrong clue", text: "Please check", clue: {
  puzzleId: "puzzle", puzzleTitle: "Title", slotId: "slot", direction: "across", groupNum: 1, text: "Original clue",
} };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const imageContact = { ...contact, image: { mimeType: "image/png", data: png.toString("base64") } };
const threadEntries = () => [...store.docs].filter(([path]) => /^supportThreads\/[^/]+$/.test(path));
const messages = (id: string) => [...store.docs].filter(([path]) => path.startsWith(`supportThreads/${id}/messages/`)).map(([, value]) => value);
async function create(data = contact, uid = "owner") {
  const result = await createSupportThread.run(request(data, uid));
  if (!result.threadId) throw new Error("Expected tracked thread");
  return result.threadId;
}

beforeEach(() => {
  store.docs.clear(); store.images.clear(); store.sequence = 0;
  store.queue = Promise.resolve(); store.failSave = false; store.failCommit = false;
  vi.stubEnv("SUPPORT_RATE_LIMIT_SALT", "test-secret");
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("support callable persistence", () => {
  it("creates an owned clue report and immutable initial snapshot with server timestamps", async () => {
    const result = await createSupportThread.run(request(clue, "owner"));
    expect(result).toEqual({ tracked: true, threadId: expect.any(String) });
    expect(store.docs.get(`supportThreads/${result.threadId}`)).toEqual({
      kind: "clue_error", ownerUid: "owner", status: "submitted", subject: "Wrong clue", clue: clue.clue,
      createdAt: "server-time", updatedAt: "server-time", lastMessageAt: "server-time", userUnread: 0, adminUnread: 1,
    });
    expect(messages(result.threadId!)).toEqual([{ sender: "user", text: "Please check", createdAt: "server-time" }]);
  });

  it("rejects missing/anonymous clue identity and malformed data without writes", async () => {
    for (const req of [request(clue), request(clue, "anon", "anonymous"), request({ ...clue, clue: undefined }, "owner")]) {
      await expect(createSupportThread.run(req)).rejects.toMatchObject({ code: "invalid-argument" });
    }
    expect(store.docs.size).toBe(0);
  });

  it("omits ownership and tracking ids for both missing and anonymous contact senders", async () => {
    for (const req of [request({ ...contact, ownerUid: "forged", tracked: true }), request(contact, "anon", "anonymous")]) {
      expect(await createSupportThread.run(req)).toEqual({ tracked: false });
    }
    for (const [path, thread] of threadEntries()) {
      expect(thread).not.toHaveProperty("ownerUid");
      expect(messages(path.split("/")[1]!)).toEqual([{ sender: "guest", text: "My message", createdAt: "server-time" }]);
    }
    expect(JSON.stringify([...store.docs])).not.toContain("192.0.2.10");
  });

  it("stores validated contact images privately at the owner or guest path", async () => {
    const id = await create(imageContact);
    await createSupportThread.run(request(imageContact));
    expect([...store.images.keys()]).toEqual([`support/owner/${id}/id2`, "support/guest/id3/id4"]);
    expect(messages(id)[0]).toMatchObject({ imagePath: `support/owner/${id}/id2` });
    for (const saved of store.images.values()) {
      expect(saved.bytes).toEqual(png);
      expect(saved.options).toMatchObject({ resumable: false, metadata: { contentType: "image/png" } });
      expect(saved.options.public).not.toBe(true);
      expect(saved.options.metadata).not.toHaveProperty("firebaseStorageDownloadTokens");
    }
    await expect(createSupportThread.run(request({ ...imageContact, image: { mimeType: "image/png", data: "YmFk" } }, "owner"))).rejects.toMatchObject({ code: "invalid-argument" });
    expect(store.images.size).toBe(2);
  });

  it("leaves no thread on upload failure and removes an upload when its transaction fails", async () => {
    store.failSave = true;
    await expect(createSupportThread.run(request(imageContact, "owner"))).rejects.toThrow();
    expect(store.docs.size).toBe(0);
    store.failSave = false; store.failCommit = true;
    await expect(createSupportThread.run(request(imageContact, "owner"))).rejects.toThrow();
    expect(store.docs.size).toBe(0); expect(store.images.size).toBe(0);
  });

  it("authorizes owner/admin replies, preserves the clue, and increments each unread side atomically", async () => {
    const id = await create(clue);
    await replySupportThread.run(request({ threadId: id, text: " Owner reply ", sender: "admin", image: imageContact.image }, "owner"));
    await replySupportThread.run(request({ threadId: id, text: "Admin reply" }, "admin", "password", true));
    expect(store.docs.get(`supportThreads/${id}`)).toMatchObject({ userUnread: 1, adminUnread: 2, clue: clue.clue });
    expect(messages(id).slice(1)).toEqual([
      { sender: "user", text: "Owner reply", createdAt: "server-time" },
      { sender: "admin", text: "Admin reply", createdAt: "server-time" },
    ]);
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, () => replySupportThread.run(request({ threadId: id, text: "Concurrent" }, "owner"))));
    expect(attempts.every((result) => result.status === "fulfilled")).toBe(true);
    expect(store.docs.get(`supportThreads/${id}`)?.adminUnread).toBe(7);
  });

  it("denies missing, anonymous, and unrelated callers before changing a thread", async () => {
    const id = await create();
    for (const req of [request({ threadId: id, text: "reply" }), request({ threadId: id, text: "reply" }, "owner", "anonymous"), request({ threadId: id, text: "reply" }, "stranger")]) {
      await expect(replySupportThread.run(req)).rejects.toBeDefined();
      await expect(markSupportRead.run(req)).rejects.toBeDefined();
    }
    expect(messages(id)).toHaveLength(1);
    expect(store.docs.get(`supportThreads/${id}`)).toMatchObject({ userUnread: 0, adminUnread: 1 });
  });

  it("only lets admins set kind-specific statuses and does not alter the clue snapshot", async () => {
    const clueId = await create(clue); const contactId = await create();
    await expect(setSupportStatus.run(request({ threadId: clueId, status: "fixed" }, "owner"))).rejects.toMatchObject({ code: "permission-denied" });
    for (const [threadId, status] of [[clueId, "answered"], [contactId, "fixed"], [contactId, ["closed"]]]) {
      await expect(setSupportStatus.run(request({ threadId, status }, "admin", "password", true))).rejects.toMatchObject({ code: "invalid-argument" });
    }
    await setSupportStatus.run(request({ threadId: clueId, status: "fixed", clue: {} }, "admin", "password", true));
    await setSupportStatus.run(request({ threadId: contactId, status: "answered" }, "admin", "password", true));
    expect(store.docs.get(`supportThreads/${clueId}`)).toMatchObject({ status: "fixed", clue: clue.clue });
    expect(store.docs.get(`supportThreads/${contactId}`)?.status).toBe("answered");
  });

  it("clears only the caller's unread side and keeps guest userUnread at zero", async () => {
    const id = await create();
    await replySupportThread.run(request({ threadId: id, text: "Admin reply" }, "admin", "password", true));
    await markSupportRead.run(request({ threadId: id }, "owner"));
    expect(store.docs.get(`supportThreads/${id}`)).toMatchObject({ userUnread: 0, adminUnread: 1 });
    await markSupportRead.run(request({ threadId: id }, "admin", "password", true));
    expect(store.docs.get(`supportThreads/${id}`)).toMatchObject({ userUnread: 0, adminUnread: 0 });
    await createSupportThread.run(request(contact));
    const guestId = threadEntries().find(([, thread]) => !thread.ownerUid)![0].split("/")[1]!;
    await replySupportThread.run(request({ threadId: guestId, text: "Internal admin response" }, "admin", "password", true));
    expect(store.docs.get(`supportThreads/${guestId}`)?.userUnread).toBe(0);
  });

  it("rejects malformed ids and missing threads with callable errors", async () => {
    for (const threadId of [undefined, " ", "a/b", "a".repeat(201)]) {
      await expect(replySupportThread.run(request({ threadId, text: "reply" }, "owner"))).rejects.toMatchObject({ code: "invalid-argument" });
      await expect(markSupportRead.run(request({ threadId }, "owner"))).rejects.toMatchObject({ code: "invalid-argument" });
      await expect(setSupportStatus.run(request({ threadId, status: "closed" }, "admin", "password", true))).rejects.toMatchObject({ code: "invalid-argument" });
    }
    await expect(replySupportThread.run(request({ threadId: "missing", text: "reply" }, "owner"))).rejects.toMatchObject({ code: "not-found" });
    await expect(markSupportRead.run(request({ threadId: "missing" }, "owner"))).rejects.toMatchObject({ code: "not-found" });
    await expect(setSupportStatus.run(request({ threadId: "missing", status: "closed" }, "admin", "password", true))).rejects.toMatchObject({ code: "not-found" });
  });

  it("limits real users to 20 threads across both kinds per Tehran day, atomically", async () => {
    const attempts = await Promise.allSettled(Array.from({ length: 21 }, (_, i) => createSupportThread.run(request(i % 2 ? clue : contact, "owner"))));
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(20);
    expect(attempts.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { code: "resource-exhausted" } });
    expect(threadEntries()).toHaveLength(20);
    await create(contact, "other");
    vi.setSystemTime(new Date("2026-10-25T20:30:00Z"));
    await create();
    expect(threadEntries()).toHaveLength(22);
  });

  it("limits real owner and admin replies separately to 50 per Tehran day", async () => {
    const id = await create();
    for (const [uid, admin] of [["owner", false], ["admin", true]] as const) {
      for (let i = 0; i < 50; i++) await replySupportThread.run(request({ threadId: id, text: "reply" }, uid, "password", admin));
      await expect(replySupportThread.run(request({ threadId: id, text: "over quota" }, uid, "password", admin))).rejects.toMatchObject({ code: "resource-exhausted" });
    }
    expect(messages(id)).toHaveLength(101);
    vi.setSystemTime(new Date("2026-10-25T20:30:00Z"));
    await replySupportThread.run(request({ threadId: id, text: "new day" }, "owner"));
  });

  it("limits untracked contact to 3 per network/day regardless of anonymous uid", async () => {
    await createSupportThread.run(request(contact));
    await createSupportThread.run(request(contact, "anon1", "anonymous"));
    await createSupportThread.run(request(contact, "anon2", "anonymous"));
    await expect(createSupportThread.run(request(contact))).rejects.toMatchObject({ code: "resource-exhausted" });
    expect(threadEntries()).toHaveLength(3);
    const otherNetwork = request(contact); otherNetwork.rawRequest.ip = "192.0.2.11";
    await createSupportThread.run(otherNetwork);
    vi.setSystemTime(new Date("2026-10-25T20:30:00Z"));
    await createSupportThread.run(request(contact));
    expect(threadEntries()).toHaveLength(5);
  });

  it("fails closed for guest rate limiting without a configured secret or network address", async () => {
    vi.stubEnv("SUPPORT_RATE_LIMIT_SALT", "");
    await expect(createSupportThread.run(request(contact))).rejects.toMatchObject({ code: "failed-precondition" });
    vi.stubEnv("SUPPORT_RATE_LIMIT_SALT", "test-secret");
    const noNetwork = request(contact); noNetwork.rawRequest.ip = undefined;
    await expect(createSupportThread.run(noNetwork)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(store.docs.size).toBe(0);
  });

  it("uses a deterministic keyed hash scoped to the network and day", () => {
    const key = networkRateKey("192.0.2.10", "2026-10-25", "secret");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("192.0.2.10");
    expect(networkRateKey("192.0.2.10", "2026-10-25", "secret")).toBe(key);
    expect(networkRateKey("192.0.2.11", "2026-10-25", "secret")).not.toBe(key);
    expect(networkRateKey("192.0.2.10", "2026-10-26", "secret")).not.toBe(key);
    expect(networkRateKey("192.0.2.10", "2026-10-25", "other-secret")).not.toBe(key);
  });
});
