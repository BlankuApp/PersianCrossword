// Admin dashboard numbers, built from Auth users, every scoreboard and aiUsage. Pure so it can be
// tested; index.ts does the reads. The app imports these types (app/admin/StatsSection.tsx).
import { tehranDay } from "./quota.js";

export interface StatsUserInput {
  readonly uid: string;
  readonly email?: string | undefined;
  readonly name?: string | undefined;
  readonly provider: string; // "anonymous", "google.com", "password", …
  readonly createdAt: number;
  readonly lastActiveAt: number;
}

export interface ScoreboardEntry {
  readonly status?: string;
  readonly percent?: number;
  readonly playedAt?: number;
  readonly solvedAt?: number;
}

export interface DayStats {
  readonly day: string; // YYYY-MM-DD, Tehran
  readonly signups: number;
  readonly players: number; // distinct users whose last edit of some puzzle was that day
  readonly solves: number;
}

export interface PuzzleStats {
  readonly id: string;
  readonly players: number;
  readonly solved: number;
  readonly avgPercent: number;
  readonly lastPlayedAt: number;
}

export interface UserRow {
  readonly name: string;
  readonly email: string;
  readonly provider: string;
  readonly createdAt: number;
  readonly lastActiveAt: number;
  readonly played: number;
  readonly solved: number;
  readonly aiToday: number;
}

export interface AdminStats {
  readonly generatedAt: number;
  readonly totalUsers: number;
  readonly byProvider: Readonly<Record<string, number>>;
  readonly active: { readonly day: number; readonly week: number; readonly month: number };
  readonly playersEver: number;
  readonly totalPlays: number;
  readonly totalSolves: number;
  readonly aiToday: { readonly users: number; readonly requests: number };
  readonly daily: readonly DayStats[];
  readonly puzzles: readonly PuzzleStats[];
  readonly users: readonly UserRow[];
}

export const STATS_DAYS = 30;
// ponytail: the user table is capped; paging lives in the Firebase console if it's ever needed.
export const USER_ROWS = 100;
const DAY_MS = 86_400_000;

export function buildStats(
  users: readonly StatsUserInput[],
  boards: ReadonlyMap<string, Readonly<Record<string, ScoreboardEntry>>>,
  ai: ReadonlyMap<string, { day?: unknown; count?: unknown }>,
  now: number,
): AdminStats {
  const days = Array.from({ length: STATS_DAYS }, (_, i) => tehranDay(new Date(now - (STATS_DAYS - 1 - i) * DAY_MS)));
  const daily = new Map(days.map((day) => [day, { signups: 0, players: new Set<string>(), solves: 0 }]));
  const byProvider: Record<string, number> = {};
  const puzzles = new Map<string, { players: number; solved: number; percent: number; lastPlayedAt: number }>();
  const today = tehranDay(new Date(now));
  const since = (ms: number) => users.filter((u) => u.lastActiveAt > now - ms).length;
  let totalPlays = 0, totalSolves = 0, playersEver = 0, aiUsers = 0, aiRequests = 0;

  const aiCount = (uid: string) => {
    const doc = ai.get(uid);
    return doc?.day === today && typeof doc.count === "number" ? doc.count : 0;
  };
  for (const uid of ai.keys()) {
    const count = aiCount(uid);
    if (count > 0) { aiUsers++; aiRequests += count; }
  }

  const rows: UserRow[] = users.map((u) => {
    byProvider[u.provider] = (byProvider[u.provider] ?? 0) + 1;
    const signupDay = daily.get(tehranDay(new Date(u.createdAt)));
    if (signupDay) signupDay.signups++;
    let played = 0, solved = 0;
    for (const [id, entry] of Object.entries(boards.get(u.uid) ?? {})) {
      if (!entry || entry.status === "new" || !entry.status) continue;
      played++;
      const done = entry.status === "done";
      if (done) solved++;
      const p = puzzles.get(id) ?? { players: 0, solved: 0, percent: 0, lastPlayedAt: 0 };
      p.players++;
      if (done) p.solved++;
      p.percent += done ? 100 : Math.max(0, Math.min(100, entry.percent ?? 0));
      p.lastPlayedAt = Math.max(p.lastPlayedAt, entry.playedAt ?? 0);
      puzzles.set(id, p);
      if (entry.playedAt) daily.get(tehranDay(new Date(entry.playedAt)))?.players.add(u.uid);
      if (done && entry.solvedAt) {
        const d = daily.get(tehranDay(new Date(entry.solvedAt)));
        if (d) d.solves++;
      }
    }
    totalPlays += played;
    totalSolves += solved;
    if (played) playersEver++;
    return {
      name: u.name ?? "", email: u.email ?? "", provider: u.provider,
      createdAt: u.createdAt, lastActiveAt: u.lastActiveAt, played, solved, aiToday: aiCount(u.uid),
    };
  });

  return {
    generatedAt: now,
    totalUsers: users.length,
    byProvider,
    active: { day: since(DAY_MS), week: since(7 * DAY_MS), month: since(30 * DAY_MS) },
    playersEver, totalPlays, totalSolves,
    aiToday: { users: aiUsers, requests: aiRequests },
    daily: days.map((day) => {
      const d = daily.get(day)!;
      return { day, signups: d.signups, players: d.players.size, solves: d.solves };
    }),
    puzzles: [...puzzles].map(([id, p]) => ({
      id, players: p.players, solved: p.solved, avgPercent: Math.round(p.percent / p.players), lastPlayedAt: p.lastPlayedAt,
    })).sort((a, b) => b.players - a.players || b.solved - a.solved),
    users: rows.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, USER_ROWS),
  };
}
