// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { basicPuzzleV3 } from "./fixtures";

// In-memory Firestore keyed by document path, counting billed reads and writes.
type Data = Record<string, unknown>;
const fake = vi.hoisted(() => ({
  store: new Map<string, Data>(),
  reads: 0,
  writes: 0,
  offline: false,
  hold: null as Promise<void> | null, // set to pause the next transaction until it resolves
}));

vi.mock("firebase/firestore", () => {
  const clone = (data: Data) => JSON.parse(JSON.stringify(data)) as Data;
  const snap = (path: string) => {
    const data = fake.store.get(path);
    return { id: path.split("/").pop(), exists: () => data !== undefined, data: () => (data ? clone(data) : undefined) };
  };
  const guard = () => {
    if (fake.offline) throw Object.assign(new Error("client is offline"), { code: "unavailable" });
  };
  const read = (path: string) => {
    guard();
    fake.reads++;
    return snap(path);
  };
  return {
    initializeFirestore: () => ({}),
    connectFirestoreEmulator: () => {},
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    getDoc: async (ref: { path: string }) => read(ref.path),
    getDocs: async (ref: { path: string }) => {
      guard();
      const docs = [...fake.store.keys()]
        .filter((key) => key.startsWith(`${ref.path}/`) && !key.slice(ref.path.length + 1).includes("/"))
        .map(snap);
      fake.reads += Math.max(1, docs.length); // an empty query still costs one read
      return { empty: docs.length === 0, docs };
    },
    runTransaction: async (_db: unknown, body: (tx: unknown) => Promise<unknown>) => {
      guard();
      const hold = fake.hold;
      if (hold) await hold;
      const writes: Array<[string, Data]> = [];
      const result = await body({
        get: async (ref: { path: string }) => read(ref.path),
        set: (ref: { path: string }, data: Data) => writes.push([ref.path, clone(data)]),
      });
      for (const [path, data] of writes) fake.store.set(path, data);
      fake.writes += writes.length;
      return result;
    },
  };
});

const authMock = vi.hoisted(() => ({
  listener: null as null | ((user: unknown) => void),
  signOut: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_auth: unknown, listener: (user: unknown) => void) => {
    authMock.listener = listener;
    return () => {};
  },
  signOut: authMock.signOut,
}));

// Puzzle JSON on disk is stored LTR and reversed on load, so the mock serves the on-disk
// shape; basicPuzzleV3.grid is then the internal (RTL) solution.
const onDiskPuzzle = { ...basicPuzzleV3, grid: basicPuzzleV3.grid.map((row) => [...row].reverse()) };
vi.mock("../app/puzzleLibrary", () => ({
  getPuzzleById: (id: string) => (id === "missing-puzzle" ? undefined : { id, json: onDiskPuzzle }),
}));

import { AuthProvider, useAuth } from "../app/AuthContext";
import {
  claimDevice,
  mergeCells,
  pushDirty,
  refreshProgress,
  syncProgress,
  upgradeLocalProgress,
} from "../app/cloudProgress";
import {
  computeProgress,
  loadMirror,
  loadProgress,
  saveMirror,
  saveProgress,
  type ProgressEntry,
} from "../app/progress";

const SOLUTION: Record<string, string> = {};
basicPuzzleV3.grid.forEach((row, r) =>
  row.forEach((letter, c) => {
    if (letter) SOLUTION[`${r},${c}`] = letter;
  }),
);

function entry(patch: Partial<ProgressEntry> = {}): ProgressEntry {
  return { status: "progress", percent: 9, v: 1, dirty: false, playedAt: 1000, ...patch };
}

function seedLocal(entries: Record<string, ProgressEntry>, owner: string | null = "uid1") {
  saveMirror({ owner, ownerAnonymous: false, entries });
}

function seedCloud(id: string, cells: Record<string, string>, cloud: Partial<ProgressEntry> = {}) {
  const { dirty: _dirty, ...rest } = entry(cloud);
  const board = (fake.store.get("users/uid1/meta/scoreboard") ?? { schema: 1, puzzles: {} }) as {
    puzzles: Record<string, unknown>;
  };
  board.puzzles[id] = rest;
  fake.store.set("users/uid1/meta/scoreboard", board);
  fake.store.set(`users/uid1/progress/${id}`, { cells, v: rest.v });
}

const cloudCells = (id: string) => (fake.store.get(`users/uid1/progress/${id}`) as { cells: unknown }).cells;
const cloudBoard = () => (fake.store.get("users/uid1/meta/scoreboard") as { puzzles: Record<string, ProgressEntry> }).puzzles;
const resetCounts = () => {
  fake.reads = 0;
  fake.writes = 0;
};

beforeEach(() => {
  window.localStorage.clear();
  fake.store.clear();
  fake.offline = false;
  fake.hold = null;
  resetCounts();
  vi.restoreAllMocks();
  authMock.signOut.mockReset();
  authMock.signOut.mockImplementation(async () => authMock.listener?.(null));
});

describe("syncProgress", () => {
  it("costs one read and no writes when nothing changed", async () => {
    seedCloud("p1", { "0,0": "م" }, { v: 2 });
    seedLocal({ p1: entry({ v: 2 }) });
    resetCounts();

    await expect(syncProgress("uid1")).resolves.toBe(false);

    expect(fake.reads).toBe(1);
    expect(fake.writes).toBe(0);
  });

  it("downloads only the puzzle that changed on another device", async () => {
    seedCloud("p1", { "0,0": "م", "0,1": "ا" }, { v: 3, playedAt: 5000 });
    seedCloud("p2", { "2,0": "ا" }, { v: 1 });
    seedLocal({ p1: entry({ v: 2 }), p2: entry({ v: 1 }) });
    resetCounts();

    await expect(syncProgress("uid1")).resolves.toBe(true);

    expect(fake.reads).toBe(2); // scoreboard + p1
    expect(fake.writes).toBe(0);
    expect(loadProgress("p1").cells).toEqual({ "0,0": "م", "0,1": "ا" });
    expect(loadMirror().entries.p1).toMatchObject({ v: 3, dirty: false, playedAt: 5000 });
  });

  it("re-derives a downloaded status the cloud got stale", async () => {
    seedCloud("p1", SOLUTION, { v: 3, status: "progress", percent: 100 });
    seedLocal({});

    await syncProgress("uid1");

    expect(loadMirror().entries.p1).toMatchObject({ status: "done", percent: 100, v: 3, dirty: false });
  });

  it("uploads local changes in one transaction and bumps the version", async () => {
    seedCloud("p1", { "0,0": "م" }, { v: 2 });
    saveProgress("p1", { cells: { "0,0": "م", "0,1": "ا" } });
    seedLocal({ p1: entry({ v: 2, dirty: true, playedAt: 9000 }) });
    resetCounts();

    await syncProgress("uid1");

    expect(fake.writes).toBe(2); // progress doc + scoreboard
    expect(cloudCells("p1")).toEqual({ "0,0": "م", "0,1": "ا" });
    expect(cloudBoard().p1).toMatchObject({ v: 3, playedAt: 9000 });
    expect(cloudBoard().p1).not.toHaveProperty("dirty");
    expect(loadMirror().entries.p1).toMatchObject({ v: 3, dirty: false });
  });

  it("combines letters on a clash, the newer copy winning shared squares", async () => {
    seedCloud("p1", { "0,0": "x", "2,0": "ا" }, { v: 2, playedAt: 1000 });
    saveProgress("p1", { cells: { "0,0": "م", "0,1": "ا" } });
    seedLocal({ p1: entry({ v: 1, dirty: true, playedAt: 2000 }) });

    await syncProgress("uid1");

    const combined = { "0,0": "م", "0,1": "ا", "2,0": "ا" };
    expect(loadProgress("p1").cells).toEqual(combined);
    expect(cloudCells("p1")).toEqual(combined);
    expect(cloudBoard().p1).toMatchObject({ v: 3, playedAt: 2000 });
    expect(loadMirror().entries.p1).toMatchObject({ v: 3, dirty: false });
  });

  it("merges when another device uploaded between the check and the push", async () => {
    // The local mirror still thinks v1 is current; the cloud moved to v2 in the meantime.
    seedCloud("p1", { "2,0": "ا" }, { v: 2, playedAt: 1000 });
    saveProgress("p1", { cells: { "0,0": "م" } });
    seedLocal({ p1: entry({ v: 1, dirty: true, playedAt: 2000 }) });

    await expect(pushDirty("uid1")).resolves.toBe(true);

    expect(cloudCells("p1")).toEqual({ "0,0": "م", "2,0": "ا" });
    expect(loadMirror().entries.p1).toMatchObject({ v: 3, dirty: false });
  });

  it("carries a reset to other devices", async () => {
    seedCloud("p1", SOLUTION, { v: 2, status: "done", percent: 100 });
    saveProgress("p1", { cells: {} });
    seedLocal({ p1: entry({ v: 2, dirty: true, status: "new", percent: 0, playedAt: 9000 }) });
    await syncProgress("uid1");
    expect(cloudCells("p1")).toEqual({});

    // The other device still has the old letters at v2.
    window.localStorage.clear();
    saveProgress("p1", { cells: SOLUTION });
    seedLocal({ p1: entry({ v: 2, status: "done", percent: 100 }) });
    await syncProgress("uid1");

    expect(loadProgress("p1").cells).toEqual({});
    expect(loadMirror().entries.p1).toMatchObject({ v: 3, status: "new" });
  });

  it("moves the old per-puzzle collection over once", async () => {
    fake.store.set("users/uid1/puzzles/p1", { cells: { "0,0": "م" } });
    fake.store.set("users/uid1/puzzles/p2", { cells: {} }); // merely opened in the old app
    saveProgress("p3", { cells: { "2,0": "ا" } });
    seedLocal({ p3: entry({ v: 0, dirty: true }) });

    await syncProgress("uid1");

    expect(loadProgress("p1").cells).toEqual({ "0,0": "م" });
    expect(Object.keys(cloudBoard()).sort()).toEqual(["p1", "p3"]);
    expect(cloudCells("p1")).toEqual({ "0,0": "م" });
    expect(fake.store.get("users/uid1/puzzles/p1")).toBeDefined(); // kept as a backup

    resetCounts();
    await syncProgress("uid1");
    expect(fake.reads).toBe(1);
    expect(fake.writes).toBe(0);
  });

  it("records an import that found nothing, so later syncs cost one read", async () => {
    fake.store.set("users/uid1/puzzles/p2", { cells: {} }); // merely opened in the old app
    seedLocal({});

    await syncProgress("uid1");

    expect(fake.store.get("users/uid1/meta/scoreboard")).toEqual({ schema: 1, puzzles: {} });
    resetCounts();
    await syncProgress("uid1");
    expect(fake.reads).toBe(1);
    expect(fake.writes).toBe(0);
  });

  it("uploads to the new account when sign-in happens during the guest's upload", async () => {
    saveProgress("p1", { cells: { "0,0": "م" } });
    saveMirror({ owner: "guest", ownerAnonymous: true, entries: { p1: entry({ v: 0, dirty: true }) } });
    let release!: () => void;
    fake.hold = new Promise((resolve) => (release = resolve));
    const guestPush = pushDirty("guest");
    fake.hold = null;

    claimDevice("uid1", false);
    const accountSync = syncProgress("uid1");
    release();
    await Promise.all([guestPush, accountSync]);

    expect(cloudCells("p1")).toEqual({ "0,0": "م" });
    expect(fake.store.get("users/guest/progress/p1")).toBeUndefined();
    expect(loadMirror().entries.p1).toMatchObject({ v: 1, dirty: false });
  });

  it("keeps changes queued while offline", async () => {
    seedLocal({ p1: entry({ dirty: true }) });
    fake.offline = true;

    await expect(syncProgress("uid1")).rejects.toMatchObject({ code: "unavailable" });

    expect(loadMirror().entries.p1?.dirty).toBe(true);
  });
});

describe("device ownership", () => {
  it("brings signed-out progress into the account, dropping empty entries", () => {
    seedLocal({ p1: entry({ v: 4 }), p2: entry({ status: "new", percent: 0 }) }, null);

    claimDevice("uid1", false);

    expect(loadMirror()).toMatchObject({ owner: "uid1", ownerAnonymous: false });
    expect(loadMirror().entries).toEqual({ p1: entry({ v: 0, dirty: true }) });
  });

  it("clears another real account's leftovers", () => {
    saveProgress("p1", { cells: { "0,0": "م" } });
    seedLocal({ p1: entry() }, "someone-else");

    claimDevice("uid1", false);

    expect(loadMirror()).toMatchObject({ owner: "uid1", ownerAnonymous: false, entries: {} });
    expect(loadProgress("p1").cells).toEqual({});
  });

  it("builds the device record from letters saved by the previous version", () => {
    saveProgress("p1", { cells: { "0,0": "م" } });
    saveProgress("p2", { cells: { "2,0": "ا" } });
    saveProgress("p3", { cells: {} });
    window.localStorage.setItem("persian-crossword-recent", JSON.stringify(["p2", "p1"]));

    upgradeLocalProgress();

    const { entries } = loadMirror();
    expect(Object.keys(entries).sort()).toEqual(["p1", "p2"]);
    expect(entries.p2!.playedAt).toBeGreaterThan(entries.p1!.playedAt);
    expect(entries.p1).toMatchObject({ v: 0, dirty: true, status: "progress" });
    expect(window.localStorage.getItem("persian-crossword-recent")).toBeNull();
  });
});

describe("sign-out", () => {
  function Probe() {
    const { signOut, syncStatus } = useAuth();
    return (
      <button type="button" onClick={() => void signOut()}>
        {syncStatus.kind}
      </button>
    );
  }

  async function signInWithUnsentChange() {
    saveProgress("p1", { cells: { "0,0": "م" } });
    seedLocal({ p1: entry({ v: 0, dirty: true }) }, null);
    fake.offline = true;
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => authMock.listener?.({ uid: "uid1", isAnonymous: false, getIdTokenResult: async () => ({ claims: {} }) }));
    expect(screen.getByRole("button")).toHaveTextContent("offline");
  }

  it("warns about unsent changes and stays signed in on cancel", async () => {
    await signInWithUnsentChange();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    await userEvent.click(screen.getByRole("button"));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("۱ جدول"));
    expect(authMock.signOut).not.toHaveBeenCalled();
    expect(loadProgress("p1").cells).toEqual({ "0,0": "م" });
  });

  it("clears the account's progress from the device after signing out", async () => {
    await signInWithUnsentChange();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await userEvent.click(screen.getByRole("button"));

    expect(authMock.signOut).toHaveBeenCalledOnce();
    expect(loadProgress("p1").cells).toEqual({});
    expect(loadMirror().entries).toEqual({});
  });
});

describe("progress", () => {
  it("counts a full grid as solved only when every letter is right", () => {
    expect(computeProgress(onDiskPuzzle, { cells: SOLUTION })).toEqual({ status: "done", percent: 100 });
    const wrong = { ...SOLUTION, "0,0": "ب" };
    const open = Object.keys(SOLUTION).length;
    const percent = Math.floor(((open - 1) / open) * 100);
    expect(computeProgress(onDiskPuzzle, { cells: wrong })).toEqual({ status: "progress", percent });
    expect(computeProgress(onDiskPuzzle, { cells: {} })).toEqual({ status: "new", percent: 0 });
  });

  it("re-derives a stale status from the letters without marking the letters changed", () => {
    saveProgress("p1", { cells: SOLUTION });
    seedLocal({ p1: entry({ status: "progress", percent: 100, v: 3, playedAt: 500 }) });
    refreshProgress();
    expect(loadMirror().entries.p1).toEqual({
      status: "done", percent: 100, v: 3, dirty: false, playedAt: 500, solvedAt: 500,
    });
  });

  it("merges letters with the newer copy on top", () => {
    expect(mergeCells({ a: "1", b: "2" }, 2, { a: "x", c: "3" }, 1)).toEqual({ a: "1", b: "2", c: "3" });
    expect(mergeCells({ a: "1" }, 1, { a: "x" }, 2)).toEqual({ a: "x" });
    expect(mergeCells({}, 2, { a: "x" }, 1)).toEqual({}); // a newer reset wins
  });
});
