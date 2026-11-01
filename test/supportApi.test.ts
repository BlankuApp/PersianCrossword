import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

const mocks = vi.hoisted(() => ({
  ready: Promise.resolve(),
  call: vi.fn(),
  onSnapshot: vi.fn(),
  unsubscribe: vi.fn(),
  getBlob: vi.fn(),
}));
vi.mock("../app/appCheck", () => ({ get appCheckReady() { return mocks.ready; } }));
vi.mock("../app/firebase", () => ({ db: "db", functions: "functions", storage: "storage" }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_functions: unknown, name: string) => (data: unknown) => mocks.call(name, data),
}));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => path.join("/"),
  where: (field: string, op: string, value: string) => ({ field, op, value }),
  orderBy: (field: string, direction = "asc") => ({ field, direction }),
  query: (path: string, ...constraints: unknown[]) => ({ path, constraints }),
  onSnapshot: mocks.onSnapshot,
}));
vi.mock("firebase/storage", () => ({
  ref: (storage: unknown, path: string) => ({ storage, path }),
  getBlob: mocks.getBlob,
}));

import * as api from "../app/support/supportApi";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ready = Promise.resolve();
  mocks.call.mockResolvedValue({ data: { ok: true } });
  mocks.onSnapshot.mockReturnValue(mocks.unsubscribe);
});

describe("support client", () => {
  it("only treats non-anonymous signed-in users as real", () => {
    expect(api.isRealUser(null)).toBe(false);
    expect(api.isRealUser({ isAnonymous: true } as User)).toBe(false);
    expect(api.isRealUser({ isAnonymous: false } as User)).toBe(true);
  });

  const clue = { puzzleId: "p1", puzzleTitle: "Puzzle", slotId: "R1-1", direction: "across" as const, groupNum: 1, text: "Clue" };
  const mutations = [
    ["clue report", () => api.createClueReport({ subject: "Clue", text: "Wrong clue", clue }), "createSupportThread", { kind: "clue_error", subject: "Clue", text: "Wrong clue", clue }],
    ["contact", () => api.createContact({ subject: "Help", text: "Message", image: { mimeType: "image/png", data: "aGVsbG8=" } }), "createSupportThread", { kind: "contact", subject: "Help", text: "Message", image: { mimeType: "image/png", data: "aGVsbG8=" } }],
    ["user reply", () => api.replySupportThread({ threadId: "t1", participant: "user", text: "Reply" }), "replySupportThread", { threadId: "t1", participant: "user", text: "Reply" }],
    ["admin reply", () => api.replySupportThread({ threadId: "t1", participant: "admin", text: "Reply" }), "replySupportThread", { threadId: "t1", participant: "admin", text: "Reply" }],
    ["status", () => api.setSupportStatus({ threadId: "t1", status: "fixed" }), "setSupportStatus", { threadId: "t1", status: "fixed" }],
    ["user read marker", () => api.markSupportRead({ threadId: "t1", participant: "user", observedAt: { seconds: 1, nanoseconds: 2 } }), "markSupportRead", { threadId: "t1", participant: "user", observedAt: { seconds: 1, nanoseconds: 2 } }],
    ["admin read marker", () => api.markSupportRead({ threadId: "t1", participant: "admin", observedAt: { seconds: 1, nanoseconds: 2 } }), "markSupportRead", { threadId: "t1", participant: "admin", observedAt: { seconds: 1, nanoseconds: 2 } }],
  ] as const;

  it.each(mutations)("waits for App Check before sending a %s", async (_label, mutate, name, payload) => {
    let resolve!: () => void;
    mocks.ready = new Promise<void>((done) => { resolve = done; });
    const result = mutate();
    await Promise.resolve();
    expect(mocks.call).not.toHaveBeenCalled();
    resolve();
    await expect(result).resolves.toEqual({ ok: true });
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith(name, payload);
  });

  it.each(mutations)("does not send a %s when App Check fails", async (_label, mutate) => {
    const error = new Error("Attestation failed");
    mocks.ready = Promise.reject(error);
    await expect(mutate()).rejects.toBe(error);
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it.each([{ tracked: true, threadId: "t1" }, { tracked: false }])("preserves the server creation result %j", async (data) => {
    mocks.call.mockResolvedValue({ data });
    await expect(api.createContact({ subject: "Help", text: "Message" })).resolves.toEqual(data);
  });

  it("subscribes to the owner query and forwards data, errors, and unsubscribe", () => {
    const changed = vi.fn();
    const failed = vi.fn();
    const unsubscribe = api.subscribeOwnThreads("owner1", changed, failed);
    expect(mocks.onSnapshot.mock.calls[0]?.[0]).toEqual({ path: "supportThreads", constraints: [{ field: "ownerUid", op: "==", value: "owner1" }] });
    const [, next, error] = mocks.onSnapshot.mock.calls[0]!;
    next({ docs: [{ id: "t1", data: () => ({ kind: "contact", ownerUid: "owner1", status: "submitted" }) }] });
    expect(changed).toHaveBeenCalledWith([{ id: "t1", kind: "contact", ownerUid: "owner1", status: "submitted" }]);
    const denial = new Error("permission-denied");
    error(denial);
    expect(failed).toHaveBeenCalledWith(denial);
    expect(unsubscribe).toBe(mocks.unsubscribe);
    unsubscribe();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("subscribes to all threads for the admin without an owner filter", () => {
    const changed = vi.fn();
    const failed = vi.fn();
    expect(api.subscribeAllThreads(changed, failed)).toBe(mocks.unsubscribe);
    expect(mocks.onSnapshot.mock.calls[0]?.[0]).toBe("supportThreads");
    mocks.onSnapshot.mock.calls[0]![1]({ docs: [{ id: "guest1", data: () => ({ kind: "contact" }) }] });
    expect(changed).toHaveBeenCalledWith([{ id: "guest1", kind: "contact" }]);
    expect(mocks.onSnapshot.mock.calls[0]?.[2]).toBe(failed);
  });

  it("subscribes to a thread's messages in chronological order", () => {
    const changed = vi.fn();
    const failed = vi.fn();
    expect(api.subscribeMessages("t1", changed, failed)).toBe(mocks.unsubscribe);
    expect(mocks.onSnapshot.mock.calls[0]?.[0]).toEqual({ path: "supportThreads/t1/messages", constraints: [{ field: "createdAt", direction: "asc" }] });
    mocks.onSnapshot.mock.calls[0]![1]({ docs: [{ id: "m1", data: () => ({ sender: "admin", text: "Reply" }) }] });
    expect(changed).toHaveBeenCalledWith([{ id: "m1", sender: "admin", text: "Reply" }]);
    expect(mocks.onSnapshot.mock.calls[0]?.[2]).toBe(failed);
  });

  it("loads private images as authenticated Storage blobs and preserves failures", async () => {
    const blob = new Blob(["image"], { type: "image/png" });
    mocks.getBlob.mockResolvedValueOnce(blob);
    await expect(api.loadSupportImage("support/owner1/t1/m1")).resolves.toBe(blob);
    expect(mocks.getBlob).toHaveBeenCalledWith({ storage: "storage", path: "support/owner1/t1/m1" });
    mocks.getBlob.mockRejectedValueOnce(new Error("permission-denied"));
    await expect(api.loadSupportImage("support/other/t1/m1")).rejects.toThrow("permission-denied");
  });
});
