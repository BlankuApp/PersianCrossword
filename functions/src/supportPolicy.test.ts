import { describe, expect, it } from "vitest";
import { decideSupportUsage, isStatusForKind, parseCreateSupportInput, parseReplySupportInput, readSupportImage } from "./supportPolicy.js";

const clue = { puzzleId: "p1", puzzleTitle: "جدول", slotId: "s1", direction: "across", groupNum: 1, text: "سرنخ", answer: "پاسخ" };
const input = (kind: string, extra = {}) => ({ kind, subject: " موضوع ", text: " پیام ", ...extra });

describe("parseCreateSupportInput", () => {
  it("allows clue reports only for real identities and trims bounded fields", () => {
    expect(parseCreateSupportInput(input("clue_error", { clue }), "real")).toMatchObject({ kind: "clue_error", subject: "موضوع", text: "پیام", clue });
    expect(parseCreateSupportInput(input("clue_error", { clue: { ...clue, answer: undefined } }), "real").clue).not.toHaveProperty("answer");
    expect(parseCreateSupportInput(input("clue_error", { clue: { ...clue, groupNum: 1 } }), "real").clue?.groupNum).toBe(1);
    expect(() => parseCreateSupportInput(input("clue_error", { clue: { ...clue, groupNum: 0 } }), "real")).toThrow();
    expect(() => parseCreateSupportInput(input("clue_error", { clue }), "anonymous")).toThrow();
    expect(() => parseCreateSupportInput(input("clue_error", { clue }), "missing")).toThrow();
  });

  it("accepts 120-character subjects and 2,000-character messages, rejecting longer values", () => {
    expect(parseCreateSupportInput({ kind: "contact", subject: "s".repeat(120), text: "m".repeat(2000) }, "real").subject).toHaveLength(120);
    expect(() => parseCreateSupportInput({ kind: "contact", subject: "s".repeat(121), text: "m" }, "real")).toThrow();
    expect(() => parseCreateSupportInput({ kind: "contact", subject: "s", text: "m".repeat(2001) }, "real")).toThrow();
  });

  it("accepts long puzzle titles and clues while trimming and clipping the stored snapshot", () => {
    const result = parseCreateSupportInput(input("clue_error", {
      clue: { ...clue, puzzleTitle: `  ${"ت".repeat(200)}عنوان بلند  `, text: `  ${"س".repeat(500)}سرنخ بلند  `, answer: `  ${"پ".repeat(500)}پاسخ بلند  ` },
    }), "real");
    expect(result.clue).toEqual({ ...clue, puzzleTitle: "ت".repeat(200), text: "س".repeat(500), answer: "پ".repeat(500) });
    expect(result.text).toBe("پیام");
  });

  it.each(["puzzleTitle", "text", "answer"])("still rejects blank and non-string snapshot %s", (field) => {
    for (const value of ["", "   ", null, 123, {}, ["سرنخ"]]) {
      expect(() => parseCreateSupportInput(input("clue_error", { clue: { ...clue, [field]: value } }), "real")).toThrow();
    }
  });

  it("makes anonymous and missing contact submissions untracked", () => {
    for (const identity of ["anonymous", "missing"] as const) {
      expect(parseCreateSupportInput(input("contact"), identity)).toMatchObject({ kind: "contact", tracked: false });
    }
    expect(parseCreateSupportInput(input("contact"), "real")).toMatchObject({ tracked: true });
  });
});

describe("status policy", () => {
  it("accepts only the exact kind-specific status strings", () => {
    for (const status of ["submitted", "reviewing", "accepted", "fixed", "rejected"]) expect(isStatusForKind("clue_error", status)).toBe(true);
    expect(isStatusForKind("clue_error", ["submitted"])).toBe(false);
    for (const status of ["submitted", "reviewing", "answered", "closed"]) expect(isStatusForKind("contact", status)).toBe(true);
    for (const status of ["answered", "closed", "Submitted", null]) expect(isStatusForKind("clue_error", status)).toBe(false);
    for (const status of ["accepted", "fixed", "rejected", "Submitted", null]) expect(isStatusForKind("contact", status)).toBe(false);
  });
});

describe("parseReplySupportInput", () => {
  it("rejects blank text, accepts 2,000 characters, and rejects 2,001", () => {
    const input = (text: string) => ({ threadId: "thread", participant: "user", text });
    expect(() => parseReplySupportInput(input("   "))).toThrow();
    expect(parseReplySupportInput(input("x".repeat(2000))).text).toHaveLength(2000);
    expect(() => parseReplySupportInput(input("x".repeat(2001)))).toThrow();
  });
});

describe("readSupportImage", () => {
  it("accepts PNG, JPEG, and WebP signatures up to 5 MiB", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const webp = Buffer.from("RIFF0000WEBP", "ascii");
    for (const [mimeType, bytes] of [["image/png", png], ["image/jpeg", jpeg], ["image/webp", webp]] as const) {
      expect(readSupportImage({ mimeType, data: bytes.toString("base64") })).toMatchObject({ mimeType, bytes });
    }
    expect(readSupportImage({ mimeType: "image/png", data: Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 - png.length)]).toString("base64") })?.bytes).toHaveLength(5 * 1024 * 1024);
    expect(readSupportImage({ mimeType: "image/png", data: Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 - png.length + 1)]).toString("base64") })).toBeUndefined();
  });

  it("rejects forged or mismatched MIME types and malformed payloads", () => {
    expect(readSupportImage({ mimeType: "image/png", data: Buffer.from("not an image").toString("base64") })).toBeUndefined();
    expect(readSupportImage({ mimeType: "image/jpeg", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64") })).toBeUndefined();
    expect(readSupportImage({ mimeType: "image/gif", data: "R0lGODlh" })).toBeUndefined();
  });
});

describe("decideSupportUsage", () => {
  it("resets on day change, increments within the day, and denies at the limit", () => {
    expect(decideSupportUsage(undefined, "2026-10-25", 3)).toEqual({ allow: true, next: { day: "2026-10-25", count: 1 } });
    expect(decideSupportUsage({ day: "2026-10-25", count: 2 }, "2026-10-25", 3)).toEqual({ allow: true, next: { day: "2026-10-25", count: 3 } });
    expect(decideSupportUsage({ day: "2026-10-24", count: 3 }, "2026-10-25", 3)).toEqual({ allow: true, next: { day: "2026-10-25", count: 1 } });
    expect(decideSupportUsage({ day: "2026-10-25", count: 3 }, "2026-10-25", 3)).toEqual({ allow: false });
  });
});
