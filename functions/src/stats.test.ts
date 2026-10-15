import { describe, expect, it } from "vitest";
import { buildStats, STATS_DAYS } from "./stats.js";

const now = Date.parse("2026-10-15T12:00:00Z");
const hour = 3_600_000;

describe("buildStats", () => {
  it("aggregates users, activity, puzzles and today's AI use", () => {
    const stats = buildStats(
      [
        { uid: "a", email: "a@x.com", name: "A", provider: "google.com", createdAt: now - 2 * hour, lastActiveAt: now - hour },
        { uid: "b", provider: "anonymous", createdAt: now - 40 * 24 * hour, lastActiveAt: now - 10 * 24 * hour },
      ],
      new Map([
        ["a", { p1: { status: "done", percent: 100, playedAt: now - hour, solvedAt: now - hour }, p2: { status: "new" } }],
        ["b", { p1: { status: "progress", percent: 40, playedAt: now - 10 * 24 * hour } }],
      ]),
      new Map([["a", { day: "2026-10-15", count: 3 }], ["b", { day: "2026-10-14", count: 9 }]]),
      now,
    );
    expect(stats.totalUsers).toBe(2);
    expect(stats.byProvider).toEqual({ "google.com": 1, anonymous: 1 });
    expect(stats.active).toEqual({ day: 1, week: 1, month: 2 });
    expect(stats).toMatchObject({ playersEver: 2, totalPlays: 2, totalSolves: 1, aiToday: { users: 1, requests: 3 } });
    expect(stats.puzzles).toEqual([{ id: "p1", players: 2, solved: 1, avgPercent: 70, lastPlayedAt: now - hour }]);
    expect(stats.daily).toHaveLength(STATS_DAYS);
    expect(stats.daily.at(-1)).toEqual({ day: "2026-10-15", signups: 1, players: 1, solves: 1 });
    expect(stats.daily.find((d) => d.day === "2026-10-05")).toMatchObject({ players: 1 });
    expect(stats.users.map((u) => [u.email, u.played, u.solved, u.aiToday])).toEqual([["a@x.com", 1, 1, 3], ["", 1, 0, 0]]);
  });
});
