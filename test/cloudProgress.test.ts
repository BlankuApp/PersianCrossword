// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { basicPuzzle } from "./fixtures";

const cloudStore = new Map<string, { cells: Record<string, string> }>();
const setDocCalls: Array<{ puzzleId: string; cells: Record<string, string> }> = [];

vi.mock("firebase/firestore", () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, ..._path: string[]) => ({ __type: "collection" }),
  doc: (_db: unknown, _users: string, _uid: string, _puzzles: string, puzzleId: string) => ({
    __type: "doc",
    puzzleId,
  }),
  getDocs: async () => ({
    forEach: (cb: (d: { id: string; data: () => { cells: Record<string, string> } }) => void) => {
      for (const [id, value] of cloudStore.entries()) {
        cb({ id, data: () => value });
      }
    },
  }),
  setDoc: async (ref: { puzzleId: string }, data: { cells: Record<string, string> }) => {
    cloudStore.set(ref.puzzleId, { cells: data.cells });
    setDocCalls.push({ puzzleId: ref.puzzleId, cells: data.cells });
  },
}));

vi.mock("../app/puzzleLibrary", () => ({
  getPuzzleById: (id: string) =>
    id === "missing-puzzle" ? undefined : { id, json: basicPuzzle },
}));

import { syncProgress } from "../app/cloudProgress";
import { loadProgress, saveProgress } from "../app/progress";

describe("syncProgress", () => {
  beforeEach(() => {
    window.localStorage.clear();
    cloudStore.clear();
    setDocCalls.length = 0;
  });

  it("uploads local progress to cloud when local is more complete", async () => {
    // basicPuzzle has 11 fillable cells. Local: 5 filled (~45%). Cloud: 1 filled (~9%, stale).
    saveProgress("p1", {
      cells: { "0,0": "س", "0,1": "ل", "0,2": "ا", "0,3": "م", "2,0": "د" },
    });
    cloudStore.set("p1", { cells: { "0,0": "س" } });

    await syncProgress("uid1");

    expect(loadProgress("p1").cells).toEqual({
      "0,0": "س", "0,1": "ل", "0,2": "ا", "0,3": "م", "2,0": "د",
    });
    expect(cloudStore.get("p1")?.cells).toEqual({
      "0,0": "س", "0,1": "ل", "0,2": "ا", "0,3": "م", "2,0": "د",
    });
    expect(setDocCalls.some((c) => c.puzzleId === "p1")).toBe(true);
  });

  it("overwrites local with cloud when cloud is more complete", async () => {
    saveProgress("p2", { cells: { "0,0": "س" } });
    cloudStore.set("p2", {
      cells: { "0,0": "س", "0,1": "ل", "0,2": "ا", "0,3": "م", "2,0": "د" },
    });

    await syncProgress("uid1");

    expect(loadProgress("p2").cells).toEqual({
      "0,0": "س", "0,1": "ل", "0,2": "ا", "0,3": "م", "2,0": "د",
    });
    expect(setDocCalls.some((c) => c.puzzleId === "p2")).toBe(false);
  });

  it("prefers local on an exact percent tie", async () => {
    saveProgress("p3", { cells: { "0,0": "س" } });
    cloudStore.set("p3", { cells: { "2,3": "د" } }); // also 1/11 filled, different cell

    await syncProgress("uid1");

    expect(loadProgress("p3").cells).toEqual({ "0,0": "س" });
    expect(cloudStore.get("p3")?.cells).toEqual({ "0,0": "س" });
  });

  it("uploads local-only puzzles to cloud", async () => {
    saveProgress("local-only", { cells: { "0,0": "س" } });

    await syncProgress("uid1");

    expect(cloudStore.get("local-only")?.cells).toEqual({ "0,0": "س" });
  });

  it("downloads cloud-only puzzles into local storage", async () => {
    cloudStore.set("cloud-only", { cells: { "0,0": "س" } });

    await syncProgress("uid1");

    expect(loadProgress("cloud-only").cells).toEqual({ "0,0": "س" });
  });

  it("treats a puzzle missing from the library as a tie without throwing", async () => {
    saveProgress("missing-puzzle", { cells: { "0,0": "س" } });
    cloudStore.set("missing-puzzle", { cells: { "0,0": "س", "0,1": "ل" } });

    await expect(syncProgress("uid1")).resolves.toBeUndefined();
    // Both sides are treated as 0% complete (puzzle not found), so local wins the tie.
    expect(cloudStore.get("missing-puzzle")?.cells).toEqual({ "0,0": "س" });
  });
});
