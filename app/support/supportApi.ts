import type { User } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, where, type Timestamp, type Unsubscribe } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getBlob, ref } from "firebase/storage";
import { appCheckReady } from "../appCheck";
import { db, functions, storage } from "../firebase";

export type SupportKind = "clue_error" | "contact";
export type SupportParticipant = "user" | "admin";
export type ClueReportStatus = "submitted" | "reviewing" | "accepted" | "fixed" | "rejected";
export type ContactStatus = "submitted" | "reviewing" | "answered" | "closed";
export type SupportStatus = ClueReportStatus | ContactStatus;

export interface ClueSnapshot {
  puzzleId: string;
  puzzleTitle: string;
  slotId: string;
  direction: "across" | "down";
  groupNum: number;
  text: string;
  answer?: string;
}

export interface SupportThread {
  id: string;
  kind: SupportKind;
  ownerUid?: string;
  status: SupportStatus;
  subject: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastMessageAt: Timestamp;
  userUnread: number;
  adminUnread: number;
  clue?: ClueSnapshot;
}

export interface SupportMessage {
  id: string;
  sender: "user" | "admin" | "guest";
  text: string;
  imagePath?: string;
  createdAt: Timestamp;
}

export interface ContactInput {
  subject: string;
  text: string;
  image?: { mimeType: string; data: string };
}
export interface ClueReportInput {
  subject: string;
  text: string;
  clue: ClueSnapshot;
}
export interface CreateSupportResult {
  tracked: boolean;
  threadId?: string;
}

export function isRealUser(user: User | null): boolean {
  return user !== null && !user.isAnonymous;
}

async function call<Input, Output>(name: string, input: Input): Promise<Output> {
  await appCheckReady;
  return (await httpsCallable<Input, Output>(functions, name)(input)).data;
}

export function createClueReport(input: ClueReportInput): Promise<CreateSupportResult> {
  return call("createSupportThread", { ...input, kind: "clue_error" });
}

export function createContact(input: ContactInput): Promise<CreateSupportResult> {
  return call("createSupportThread", { ...input, kind: "contact" });
}

export function replySupportThread(input: { threadId: string; text: string; participant: SupportParticipant }): Promise<{ ok: true }> {
  return call("replySupportThread", input);
}

export function setSupportStatus(input: { threadId: string; status: SupportStatus }): Promise<{ ok: true }> {
  return call("setSupportStatus", input);
}

export function markSupportRead(input: { threadId: string; participant: SupportParticipant; observedAt: { seconds: number; nanoseconds: number } }): Promise<{ ok: true }> {
  return call("markSupportRead", input);
}

export function subscribeOwnThreads(ownerUid: string, onChange: (threads: SupportThread[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "supportThreads"), where("ownerUid", "==", ownerUid)),
    (snapshot) => onChange(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as SupportThread)),
    onError,
  );
}

export function subscribeAllThreads(onChange: (threads: SupportThread[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "supportThreads"),
    (snapshot) => onChange(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as SupportThread)),
    onError,
  );
}

export function subscribeMessages(threadId: string, onChange: (messages: SupportMessage[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, "supportThreads", threadId, "messages"), orderBy("createdAt", "asc")),
    (snapshot) => onChange(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as SupportMessage)),
    onError,
  );
}

export async function loadSupportImage(path: string): Promise<Blob> {
  await appCheckReady;
  return getBlob(ref(storage, path));
}
