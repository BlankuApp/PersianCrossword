import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { getStorage as adminStorage } from "firebase-admin/storage";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { deleteObject, getBytes, listAll, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, describe, it } from "vitest";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-support-rules";
const bucket = `${projectId}.appspot.com`;
const image = new Uint8Array([1, 2, 3]);
const clients = [
  { name: "Google owner", uid: "owner", provider: "google.com" },
  { name: "password owner", uid: "owner", provider: "password" },
  { name: "admin", uid: "admin", provider: "google.com", admin: true },
  { name: "unrelated user", uid: "other", provider: "password" },
  { name: "anonymous owner uid", uid: "owner", provider: "anonymous" },
  { name: "literal guest uid", uid: "guest", provider: "password" },
  { name: "unauthenticated", uid: null, provider: null },
] as const;

// The ordinary unit suite stays offline; emulators:exec enables this integration suite.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST)("support privacy rules", () => {
  let env: RulesTestEnvironment;
  let adminApp: ReturnType<typeof initializeApp>;
  const context = (client: (typeof clients)[number]) => client.uid === null
    ? env.unauthenticatedContext()
    : env.authenticatedContext(client.uid, {
      firebase: { sign_in_provider: client.provider },
      ...("admin" in client ? { admin: true } : {}),
    });

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId,
      firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
      storage: { rules: readFileSync(new URL("../storage.rules", import.meta.url), "utf8") },
    });
    adminApp = initializeApp({ projectId, storageBucket: bucket }, "support-rules-seed");
    const db = adminFirestore(adminApp);
    await Promise.all([
      db.doc("supportThreads/owned").set({ ownerUid: "owner" }),
      db.doc("supportThreads/other").set({ ownerUid: "other" }),
      db.doc("supportThreads/guest").set({ ownerUid: null }),
      // Message data must never grant access independently of the parent thread.
      db.doc("supportThreads/owned/messages/first").set({ text: "private" }),
      db.doc("supportThreads/other/messages/first").set({ ownerUid: "owner", text: "other" }),
      db.doc("supportThreads/guest/messages/first").set({ text: "guest" }),
      db.doc("supportThreads/missing/messages/first").set({ ownerUid: "owner" }),
      db.doc("catalog/index").set({ published: true }),
      db.doc("puzzlePacks/pack").set({ published: true }),
      db.doc("drafts/draft").set({ published: false }),
      db.doc("users/owner/progress/puzzle").set({ score: 1 }),
      ...["support/owner/owned/first", "support/other/other/first", "support/guest/guest/first", "puzzles/puzzle/image"].map((path) =>
        adminStorage(adminApp).bucket().file(path).save(image, { contentType: "image/png" })),
    ]);
  }, 30_000);

  afterAll(async () => {
    await env?.cleanup();
    if (adminApp) await deleteApp(adminApp);
  });

  for (const client of clients) {
    const canReadOwned = client.name === "Google owner" || client.name === "password owner" || client.name === "admin";
    const isAdmin = client.name === "admin";

    it(`${client.name}: enforces owner/admin thread, message, query, and image reads`, async () => {
      const ctx = context(client);
      const db = ctx.firestore();
      const storage = ctx.storage(bucket);
      const checkOwned = canReadOwned ? assertSucceeds : assertFails;
      const checkPrivate = isAdmin ? assertSucceeds : assertFails;
      await checkOwned(getDoc(doc(db, "supportThreads/owned")));
      await checkOwned(getDoc(doc(db, "supportThreads/owned/messages/first")));
      await checkOwned(getDocs(query(collection(db, "supportThreads"), where("ownerUid", "==", "owner"))));
      await checkOwned(getDocs(collection(db, "supportThreads/owned/messages")));
      await checkOwned(getBytes(ref(storage, "support/owner/owned/first")));
      for (const id of ["other", "guest"]) {
        // The unrelated user owns `other`; use guest data to test their denial separately below.
        if (id === "other" && client.uid === "other") continue;
        await checkPrivate(getDoc(doc(db, `supportThreads/${id}`)));
        await checkPrivate(getDoc(doc(db, `supportThreads/${id}/messages/first`)));
        await checkPrivate(getBytes(ref(storage, `support/${id}/${id}/first`)));
      }
      await checkPrivate(getDocs(collection(db, "supportThreads")));
      await checkPrivate(getDoc(doc(db, "supportThreads/missing/messages/first")));
    });

    it(`${client.name}: denies every direct support write`, async () => {
      const ctx = context(client);
      const db = ctx.firestore();
      for (const path of ["supportThreads", "supportThreads/owned/messages"]) {
        const existing = path === "supportThreads" ? "owned" : "first";
        await assertFails(setDoc(doc(db, `${path}/new`), { ownerUid: client.uid }));
        await assertFails(updateDoc(doc(db, `${path}/${existing}`), { text: "changed" }));
        await assertFails(deleteDoc(doc(db, `${path}/${existing}`)));
      }
      for (const owner of ["owner", "guest"]) {
        const storage = ctx.storage(bucket);
        await assertFails(uploadBytes(ref(storage, `support/${owner}/${owner === "owner" ? "owned" : "guest"}/new`), image));
        const existing = ref(storage, `support/${owner}/${owner === "owner" ? "owned" : "guest"}/first`);
        await assertFails(uploadBytes(existing, image));
        await assertFails(deleteObject(existing));
      }
    });
  }

  it("preserves public catalog reads and admin-only catalog/draft writes", async () => {
    const publicDb = env.unauthenticatedContext().firestore();
    const ownerDb = context(clients[0]).firestore();
    const adminDb = context(clients[2]).firestore();
    for (const path of ["catalog/index", "puzzlePacks/pack"]) {
      await assertSucceeds(getDoc(doc(publicDb, path)));
      await assertFails(setDoc(doc(ownerDb, path), { published: true }));
      await assertSucceeds(setDoc(doc(adminDb, path), { published: true }));
    }
    await assertFails(getDoc(doc(publicDb, "drafts/draft")));
    await assertFails(getDoc(doc(ownerDb, "drafts/draft")));
    await assertFails(setDoc(doc(ownerDb, "drafts/draft"), { published: false }));
    await assertSucceeds(getDoc(doc(adminDb, "drafts/draft")));
    await assertSucceeds(setDoc(doc(adminDb, "drafts/draft"), { published: false }));
  });

  it("preserves owner-only progress and public unlisted puzzle images", async () => {
    const ownerDb = context(clients[0]).firestore();
    const otherDb = context(clients[3]).firestore();
    const progress = "users/owner/progress/puzzle";
    await assertSucceeds(getDoc(doc(ownerDb, progress)));
    await assertSucceeds(updateDoc(doc(ownerDb, progress), { score: 2 }));
    await assertFails(getDoc(doc(otherDb, progress)));
    await assertFails(updateDoc(doc(otherDb, progress), { score: 3 }));
    const publicStorage = env.unauthenticatedContext().storage(bucket);
    await assertSucceeds(getBytes(ref(publicStorage, "puzzles/puzzle/image")));
    await assertFails(listAll(ref(publicStorage, "puzzles/puzzle")));
    await assertFails(uploadBytes(ref(context(clients[0]).storage(bucket), "puzzles/puzzle/new"), image, { contentType: "image/png" }));
    const admin = context(clients[2]).storage(bucket);
    await assertSucceeds(uploadBytes(ref(admin, "puzzles/puzzle/new"), image, { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(admin, "puzzles/puzzle/text"), image, { contentType: "text/plain" }));
    await assertFails(deleteObject(ref(admin, "puzzles/puzzle/image")));
  });
});
