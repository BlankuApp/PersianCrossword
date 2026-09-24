import { describe, expect, it } from "vitest";
import { planImport, type ImportFile } from "../app/admin/importPlan";
import sample10 from "../samples/sample-10x10-garden.json";

const encode = (text: string) => new TextEncoder().encode(text);
const jsonFile = (name: string, meta: Record<string, unknown>): ImportFile => ({
  name,
  bytes: encode(JSON.stringify({ ...sample10, meta: { ...sample10.meta, ...meta } })),
});
const image = (name: string): ImportFile => ({ name, bytes: new Uint8Array([1, 2, 3]) });

describe("planImport", () => {
  it("pairs each puzzle with its solution and source images", () => {
    const plan = planImport([jsonFile("301.json", { id: "301", sourceFile: "9100.webp" }), image("301.png"), image("9100.WEBP")], new Set());
    expect(plan.problems).toEqual([]);
    expect(plan.drafts).toHaveLength(1);
    const draft = plan.drafts[0]!;
    expect(draft.id).toBe("301");
    expect(draft.file).toBe("admin/301.json");
    expect(draft.issues).toEqual([]);
    expect(draft.images.map((i) => [i.kind, i.name, i.file.name])).toEqual([
      ["solution", "301.png", "301.png"],
      ["source", "9100.webp", "9100.WEBP"],
    ]);
  });

  it("uses the file name when meta.id is missing", () => {
    const plan = planImport([jsonFile("new-one.json", { id: undefined })], new Set());
    expect(plan.drafts[0]?.id).toBe("new-one");
  });

  it("refuses ids already published or drafted, and duplicates in one batch", () => {
    const plan = planImport([jsonFile("a.json", { id: "14" }), jsonFile("b.json", { id: "400" }), jsonFile("c.json", { id: "400" })], new Set(["14"]));
    expect(plan.drafts.map((d) => d.id)).toEqual(["400"]);
    expect(plan.problems).toHaveLength(2);
  });

  it("reports unreadable files, missing source images and unused images", () => {
    const plan = planImport(
      [{ name: "bad.json", bytes: encode("{") }, jsonFile("5.json", { id: "5", sourceFile: "x.jpg" }), image("stray.png"), { name: "notes.txt", bytes: encode("hi") }],
      new Set(),
    );
    expect(plan.drafts.map((d) => d.id)).toEqual(["5"]);
    expect(plan.problems).toHaveLength(4);
  });

  it("still creates a draft with validation issues, listing them", () => {
    const broken = { name: "7.json", bytes: encode(JSON.stringify({ version: 3, meta: { id: "7" }, grid: [["ا", "ب"], ["پ"]], clues: { horizontal: {}, vertical: {} } })) };
    const plan = planImport([broken], new Set());
    expect(plan.drafts[0]?.issues.length).toBeGreaterThan(0);
  });
});
