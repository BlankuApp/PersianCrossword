import { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { BarChart3, ExternalLink, RefreshCw, Search } from "lucide-react";
import { functions } from "../firebase";
import { usePuzzleLibrary } from "../puzzleLibrary";
import { toPersianDigits } from "../persianNumbers";
import type { AdminStats, DayStats, PuzzleStats, UserRow } from "../../functions/src/stats";

const fa = (n: number) => n.toLocaleString("fa-IR");
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const dateTime = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" });
const shortDate = new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric" });
// Missing on the oldest supported WebViews (Chrome < 71); those show plain dates.
const relative = typeof Intl.RelativeTimeFormat === "function" ? new Intl.RelativeTimeFormat("fa", { numeric: "auto" }) : null;
const loadStats = httpsCallable<void, AdminStats>(functions, "adminStats");
const ANALYTICS_URL = "https://console.firebase.google.com/project/persiancrossword/analytics";

const PROVIDERS: Record<string, string> = {
  anonymous: "مهمان", "google.com": "گوگل", password: "ایمیل و رمز", "apple.com": "اپل", phone: "تلفن",
};
const providerName = (id: string) => PROVIDERS[id] ?? id;

function ago(ms: number, now: number): string {
  if (!relative) return dateTime.format(ms);
  const minutes = Math.round((ms - now) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  return Math.abs(days) < 30 ? relative.format(days, "day") : shortDate.format(ms);
}

const dayDate = (day: string) => new Date(`${day}T12:00:00+03:30`);

export function StatsSection() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try { setStats((await loadStats()).data); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="admin-section stats" aria-labelledby="admin-stats-title" aria-busy={busy}>
      <div className="stats-head">
        <div>
          <h2 id="admin-stats-title">آمار اعضا و فعالیت</h2>
          <p className="admin-note">
            {stats ? `به‌روزشده: ${dateTime.format(stats.generatedAt)} · روزها به وقت تهران` : busy ? "در حال جمع‌آوری آمار…" : ""}
          </p>
        </div>
        <div className="admin-draft-actions">
          <a className="admin-button" href={ANALYTICS_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            بازدید صفحه‌ها در Analytics
          </a>
          <button type="button" className="admin-button admin-button-primary" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={16} aria-hidden="true" className={busy ? "stats-spin" : undefined} />
            به‌روزرسانی
          </button>
        </div>
      </div>
      {error ? <p className="admin-error" role="alert">خواندن آمار انجام نشد: {error}</p> : null}
      {stats ? <StatsBody stats={stats} /> : null}
    </section>
  );
}

function StatsBody({ stats }: { stats: AdminStats }) {
  const registered = stats.totalUsers - (stats.byProvider.anonymous ?? 0);
  const last7 = stats.daily.slice(-7), prev7 = stats.daily.slice(-14, -7);
  const sum = (days: readonly DayStats[], key: keyof Omit<DayStats, "day">) => days.reduce((n, d) => n + d[key], 0);
  const signups30 = sum(stats.daily, "signups");

  return (
    <>
      <div className="stats-tiles">
        <Tile label="کل اعضا" value={stats.totalUsers} hint={`${fa(registered)} با حساب، ${fa(stats.totalUsers - registered)} مهمان`} />
        <Tile label="فعال در ۲۴ ساعت" value={stats.active.day} hint={`${fa(pct(stats.active.day, stats.totalUsers))}٪ اعضا`} />
        <Tile label="فعال در ۷ روز" value={stats.active.week} hint={`${fa(pct(stats.active.week, stats.totalUsers))}٪ اعضا`} />
        <Tile label="فعال در ۳۰ روز" value={stats.active.month} hint={`${fa(pct(stats.active.month, stats.totalUsers))}٪ اعضا`} />
        <Tile label="عضو تازه در ۳۰ روز" value={signups30} hint={trend(sum(last7, "signups"), sum(prev7, "signups"))} />
        <Tile label="جدول حل‌شده" value={stats.totalSolves} hint={`${fa(stats.totalPlays)} جدول شروع‌شده، ${fa(pct(stats.totalSolves, stats.totalPlays))}٪ به پایان رسیده`} />
        <Tile label="بازیکن" value={stats.playersEver} hint={`میانگین ${(stats.playersEver ? stats.totalSolves / stats.playersEver : 0).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} جدول حل‌شده برای هر نفر`} />
        <Tile label="درخواست هوش‌واره امروز" value={stats.aiToday.requests} hint={`از ${fa(stats.aiToday.users)} نفر`} />
      </div>

      <div className="stats-charts">
        <DailyChart title="بازیکنان روزانه" unit="بازیکن" days={stats.daily} pick={(d) => d.players}
          note="کسانی که آن روز دست‌کم یک جدول را ویرایش کرده‌اند (آخرین ویرایش هر جدول)." />
        <DailyChart title="جدول‌های حل‌شده" unit="جدول" days={stats.daily} pick={(d) => d.solves} />
        <DailyChart title="عضو تازه" unit="عضو" days={stats.daily} pick={(d) => d.signups} />
        <ProviderBars byProvider={stats.byProvider} total={stats.totalUsers} />
      </div>

      <PuzzleTable puzzles={stats.puzzles} />
      <UserTable users={stats.users} total={stats.totalUsers} now={stats.generatedAt} />
    </>
  );
}

function trend(current: number, previous: number): string {
  const text = `${fa(current)} در ۷ روز اخیر`;
  if (!previous) return text;
  const change = pct(current - previous, previous);
  return `${text} (${change >= 0 ? "▲" : "▼"} ${fa(Math.abs(change))}٪)`;
}

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="stats-tile">
      <span className="stats-tile-label">{label}</span>
      <strong className="stats-tile-value">{fa(value)}</strong>
      <span className="stats-tile-hint">{hint}</span>
    </div>
  );
}

function DailyChart({ title, unit, days, pick, note }: {
  title: string; unit: string; days: readonly DayStats[]; pick: (d: DayStats) => number; note?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = days.map(pick);
  const total = values.reduce((a, b) => a + b, 0);
  // A round axis top: 1, 2, 5, 10, 20, 50…
  const max = Math.max(...values, 1);
  const step = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 5, 10].map((m) => m * step).find((v) => v >= max)!;
  const W = 400, H = 150, pad = { top: 10, bottom: 22, side: 26 };
  const plotW = W - pad.side - 8, plotH = H - pad.top - pad.bottom;
  const slot = plotW / days.length, bar = Math.max(2, slot - 4);
  // RTL: the oldest day sits on the right, today on the left.
  const x = (i: number) => 8 + (days.length - 1 - i) * slot;
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const hovered = hover === null ? null : days[hover];

  return (
    <figure className="stats-card">
      <figcaption>
        <strong>{title}</strong>
        <span>{hovered ? `${shortDate.format(dayDate(hovered.day))}: ${fa(values[hover!]!)} ${unit}` : `${fa(total)} ${unit} در ۳۰ روز`}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}، ${fa(total)} ${unit} در ۳۰ روز`} onMouseLeave={() => setHover(null)}>
        {(top % 2 ? [0, top] : [0, top / 2, top]).map((v) => (
          <g key={v}>
            <line x1={8} x2={W - pad.side} y1={y(v)} y2={y(v)} className={v ? "stats-grid" : "stats-axis"} />
            <text x={W - pad.side + 6} y={y(v) + 4} className="stats-tick" textAnchor="start">{fa(v)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const v = values[i]!, h = (v / top) * plotH;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
              aria-label={`${shortDate.format(dayDate(d.day))}: ${fa(v)} ${unit}`}>
              <rect x={x(i)} y={pad.top} width={slot} height={plotH} fill="transparent" />
              {v ? <rect x={x(i) + (slot - bar) / 2} y={y(v)} width={bar} height={h} rx={Math.min(4, bar / 2)} className={hover === i ? "stats-bar stats-bar-hover" : "stats-bar"} /> : null}
              {i % 7 === days.length % 7 - 1 || i === days.length - 1 ? (
                <text x={x(i) + slot / 2} y={H - 6} textAnchor="middle" className="stats-tick">{i === days.length - 1 ? "امروز" : shortDate.format(dayDate(d.day))}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {note ? <p className="stats-card-note">{note}</p> : null}
    </figure>
  );
}

function ProviderBars({ byProvider, total }: { byProvider: Readonly<Record<string, number>>; total: number }) {
  const rows = Object.entries(byProvider).sort((a, b) => b[1] - a[1]);
  return (
    <figure className="stats-card">
      <figcaption><strong>روش ورود</strong><span>{fa(total)} عضو</span></figcaption>
      <ul className="stats-hbars">
        {rows.map(([id, n]) => (
          <li key={id}>
            <span>{providerName(id)}</span>
            <span className="stats-hbar-track"><span className="stats-hbar" style={{ width: `${pct(n, total)}%` }} /></span>
            <span className="stats-num">{fa(n)} <small>({fa(pct(n, total))}٪)</small></span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

type PuzzleKey = "title" | "players" | "solved" | "rate" | "avgPercent" | "lastPlayedAt";

function PuzzleTable({ puzzles }: { puzzles: readonly PuzzleStats[] }) {
  const { puzzles: library } = usePuzzleLibrary();
  const titles = useMemo(() => new Map(library.map((p) => [p.id, p.title])), [library]);
  const [sort, setSort] = useState<{ key: PuzzleKey; desc: boolean }>({ key: "players", desc: true });
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const value = (p: PuzzleStats): number | string => sort.key === "title" ? titles.get(p.id) ?? p.id
      : sort.key === "rate" ? p.solved / p.players : p[sort.key];
    return [...puzzles].sort((a, b) => {
      const va = value(a), vb = value(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string, "fa") : va - (vb as number);
      return sort.desc ? -c : c;
    });
  }, [puzzles, sort, titles]);
  const shown = all ? rows : rows.slice(0, 15);
  const header = (key: PuzzleKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "title" }))}>
        {label}{sort.key === key ? (sort.desc ? " ▼" : " ▲") : ""}
      </button>
    </th>
  );

  return (
    <div className="stats-table-block">
      <h3><BarChart3 size={18} aria-hidden="true" /> جدول‌ها از نگاه بازیکنان <small>({fa(puzzles.length)} جدول بازی‌شده{library.length ? ` از ${fa(library.length)}` : ""})</small></h3>
      <div className="stats-table-scroll">
        <table className="stats-table">
          <thead><tr>
            {header("title", "جدول")}{header("players", "بازیکن")}{header("solved", "حل‌شده")}
            {header("rate", "نرخ حل")}{header("avgPercent", "میانگین پیشرفت")}{header("lastPlayedAt", "آخرین بازی")}
          </tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td><a href={`#/puzzle/${encodeURIComponent(p.id)}`}>{toPersianDigits(titles.get(p.id) ?? p.id)}</a></td>
                <td className="stats-num">{fa(p.players)}</td>
                <td className="stats-num">{fa(p.solved)}</td>
                <td className="stats-num">{fa(pct(p.solved, p.players))}٪</td>
                <td><span className="stats-meter"><span style={{ width: `${p.avgPercent}%` }} /></span> <span className="stats-num">{fa(p.avgPercent)}٪</span></td>
                <td>{p.lastPlayedAt ? shortDate.format(p.lastPlayedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 15 ? (
        <button type="button" className="admin-button stats-more" onClick={() => setAll(!all)}>{all ? "نمایش کمتر" : `نمایش همه (${fa(rows.length)})`}</button>
      ) : null}
    </div>
  );
}

function UserTable({ users, total, now }: { users: readonly UserRow[]; total: number; now: number }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => `${u.name} ${u.email} ${providerName(u.provider)}`.toLowerCase().includes(q)) : users;
  }, [users, query]);

  return (
    <div className="stats-table-block">
      <div className="stats-table-head">
        <h3>اعضای اخیراً فعال <small>({fa(users.length)} از {fa(total)})</small></h3>
        <label className="stats-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="جستجوی نام یا ایمیل" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="جستجوی اعضا" />
        </label>
      </div>
      <div className="stats-table-scroll">
        <table className="stats-table">
          <thead><tr><th>عضو</th><th>روش ورود</th><th>عضویت</th><th>آخرین فعالیت</th><th>شروع‌شده</th><th>حل‌شده</th><th>هوش‌واره امروز</th></tr></thead>
          <tbody>
            {rows.map((u, i) => (
              <tr key={`${u.email}-${u.createdAt}-${i}`}>
                <td>
                  <span className="stats-user">
                    <span>{u.name || (u.provider === "anonymous" ? "مهمان" : "بی‌نام")}</span>
                    {u.email ? <bdi className="stats-email">{u.email}</bdi> : null}
                  </span>
                </td>
                <td><span className={`stats-chip${u.provider === "anonymous" ? " stats-chip-guest" : ""}`}>{providerName(u.provider)}</span></td>
                <td title={dateTime.format(u.createdAt)}>{shortDate.format(u.createdAt)}</td>
                <td title={dateTime.format(u.lastActiveAt)}>{ago(u.lastActiveAt, now)}</td>
                <td className="stats-num">{fa(u.played)}</td>
                <td className="stats-num">{fa(u.solved)}</td>
                <td className="stats-num">{u.aiToday ? fa(u.aiToday) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <p className="admin-note">عضوی پیدا نشد.</p> : null}
    </div>
  );
}
