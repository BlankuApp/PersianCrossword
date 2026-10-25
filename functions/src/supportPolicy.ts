export type SupportKind = "clue_error" | "contact";
export type ClueReportStatus = "submitted" | "reviewing" | "accepted" | "fixed" | "rejected";
export type ContactStatus = "submitted" | "reviewing" | "answered" | "closed";

export interface ClueSnapshot {
  puzzleId: string;
  puzzleTitle: string;
  slotId: string;
  direction: string;
  groupNum: number;
  text: string;
}

export interface CreateSupportInput {
  kind: SupportKind;
  subject: string;
  text: string;
  tracked: boolean;
  clue?: ClueSnapshot;
  image?: { mimeType: string; data: string };
}

export interface ReplySupportInput {
  threadId: string;
  text: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const requiredText = (value: unknown, max: number): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error("Invalid support text");
  return value.trim();
};

export function parseCreateSupportInput(value: unknown, identity: "real" | "anonymous" | "missing"): CreateSupportInput {
  if (!isRecord(value) || (value.kind !== "contact" && value.kind !== "clue_error")) throw new Error("Invalid support kind");
  const kind = value.kind;
  if (kind === "clue_error") {
    if (identity !== "real" || !isRecord(value.clue)) throw new Error("Clue reports require a real account and clue snapshot");
    const raw = value.clue;
    if (typeof raw.groupNum !== "number" || !Number.isInteger(raw.groupNum) || raw.groupNum < 1 || raw.groupNum > 10000 || (raw.direction !== "across" && raw.direction !== "down")) throw new Error("Invalid clue snapshot");
    return {
      kind, tracked: true,
      subject: requiredText(value.subject, 120), text: requiredText(value.text, 2000),
      clue: {
        puzzleId: requiredText(raw.puzzleId, 200), puzzleTitle: requiredText(raw.puzzleTitle, 200),
        slotId: requiredText(raw.slotId, 200), direction: raw.direction,
        groupNum: raw.groupNum, text: requiredText(raw.text, 500),
      },
    };
  }
  const image = value.image;
  if (image !== undefined && (!isRecord(image) || typeof image.mimeType !== "string" || typeof image.data !== "string" || !readSupportImage(image))) throw new Error("Invalid support image");
  return {
    kind, tracked: identity === "real", subject: requiredText(value.subject, 120), text: requiredText(value.text, 2000),
    ...(image === undefined ? {} : { image: image as { mimeType: string; data: string } }),
  };
}

export function parseReplySupportInput(value: unknown): ReplySupportInput {
  if (!isRecord(value)) throw new Error("Invalid support reply");
  return { threadId: requiredText(value.threadId, 200), text: requiredText(value.text, 2000) };
}

export function isStatusForKind(kind: SupportKind, status: unknown): boolean {
  if (typeof status !== "string") return false;
  if (kind === "clue_error") return ["submitted", "reviewing", "accepted", "fixed", "rejected"].includes(status);
  if (kind === "contact") return ["submitted", "reviewing", "answered", "closed"].includes(status);
  return false;
}

export function readSupportImage(value: unknown): { mimeType: string; bytes: Buffer } | undefined {
  if (!isRecord(value) || typeof value.mimeType !== "string" || typeof value.data !== "string" || !["image/png", "image/jpeg", "image/webp"].includes(value.mimeType)) return undefined;
  if (value.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) return undefined;
  const bytes = Buffer.from(value.data, "base64");
  if (bytes.length > 5 * 1024 * 1024 || bytes.toString("base64") !== value.data) return undefined;
  const png = value.mimeType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = value.mimeType === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = value.mimeType === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return png || jpeg || webp ? { mimeType: value.mimeType, bytes } : undefined;
}

export function decideSupportUsage(previous: { day: string; count: number } | undefined, day: string, limit: number): { allow: false } | { allow: true; next: { day: string; count: number } } {
  const count = previous?.day === day ? previous.count : 0;
  return count >= limit ? { allow: false } : { allow: true, next: { day, count: count + 1 } };
}
