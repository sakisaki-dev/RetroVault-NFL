import { useEffect, useState } from 'react';
import { dataJson } from '@/utils/dataStore';
import { IS_NFL } from '@/config/edition';

/**
 * Fantasy metrics (public/data/nfl/fantasy.json, scripts/nfl/fantasy.py): every figure is a sum, ratio, rank or percentile of
 * nflverse weekly lines in standard PPR. This module is the one place the site reads them and the rules that turn them into
 * labels, so the player card, the Deep Dive, the Team Lab and anything else (a trade simulator) share the same numbers.
 * Nothing here invents data: a missing week is missing, a figure the data cannot back is absent.
 */
export type FPos = 'QB' | 'RB' | 'WR' | 'TE';
export const FANTASY_POS: readonly FPos[] = ['QB', 'RB', 'WR', 'TE'];
export const isFantasyPos = (p: string): p is FPos => (FANTASY_POS as readonly string[]).includes(p);

/** [value, rank at his position, of] (rank null below half his club's games) */
export type RankedStat = [number, number | null, number | null];
/** [week, PPR, opponent, weekly finish at his position] */
export type WeekLine = [number, number, string, number];
export interface FanRec {
  c: string; g: number; t: number; pg: number;
  w: WeekLine[];
  /** [pos rank of total, of, overall rank of total, of, pos rank of per game, of] */
  rk: [number, number, number, number, number | null, number | null];
  l3?: number; p3?: number; l3r?: [number, number];
  sd?: number; cv?: number | null; fl?: number; md?: number; ce?: number;
  sw: number; bm: number; bu: number;
  op?: Partial<Record<'ts' | 'ay' | 'cs' | 'og' | 'po' | 'sn', RankedStat>>;
}
/** [week, opponent | null (bye), home 1/0, date] */
export type SlotRaw = [number, string | null, number?, string?];
export interface FanRaw {
  season: number;
  week: number;
  n: Record<string, { bye: number | null; nx: SlotRaw[] }>;
  /** defence -> position -> [PPR allowed per game, rank (1 = allows the most), games] */
  d: Record<string, Record<FPos, [number, number, number]>>;
  p: Record<string, FanRec>;
}

let job: Promise<FanRaw | null> | null = null;
let loaded: FanRaw | null | undefined;
const load = () => (job ??= dataJson<FanRaw>('data/nfl/fantasy.json').catch(() => null).then((d) => (loaded = d)));

/** The whole file; null while loading, off the NFL edition or when it is missing. */
export const useFantasyRaw = (): FanRaw | null => {
  const [raw, setRaw] = useState(loaded);
  useEffect(() => {
    if (!IS_NFL || loaded !== undefined) return void setRaw(loaded);
    let alive = true;
    load().then((d) => alive && setRaw(d));
    return () => { alive = false; };
  }, []);
  return IS_NFL ? raw ?? null : null;
};

// ---- rules -----------------------------------------------------------------------------------------------------------

/** Weekly finish that counts as start-worthy: top 12 QB and TE, top 24 RB and WR. Boom is half of it, bust is past 1.5x. */
export const startN = (pos: FPos) => (pos === 'QB' || pos === 'TE' ? 12 : 24);
export const boomN = (pos: FPos) => startN(pos) / 2;
export const bustN = (pos: FPos) => startN(pos) * 1.5;
export type WeekTier = 'boom' | 'start' | 'flat' | 'bust';
export const tierOfFinish = (pos: FPos, finish: number): WeekTier =>
  finish <= boomN(pos) ? 'boom' : finish <= startN(pos) ? 'start' : finish > bustN(pos) ? 'bust' : 'flat';

export const ord = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};
export const f1 = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1));
export const pctOf = (n: number, d: number) => (d > 0 ? Math.round((100 * n) / d) : 0);

export type Trend = { dir: 'up' | 'down' | 'flat'; delta: number } | null;
/** Last 3 games against the 3 before: flat inside max(1 point, 10%) of the earlier average. */
export const trendOf = (l3?: number, p3?: number): Trend => {
  if (l3 == null || p3 == null) return null;
  const delta = l3 - p3;
  const band = Math.max(1, 0.1 * p3);
  return { dir: delta > band ? 'up' : delta < -band ? 'down' : 'flat', delta };
};

export type Tone = 'easy' | 'mid' | 'hard';
/** Matchup rank 1 = the defence allows the most to his position. Top 8 of 32 is soft, bottom 8 is tough. */
export const toneOfRank = (rank: number): Tone => (rank <= 8 ? 'easy' : rank >= 25 ? 'hard' : 'mid');
export const TONE_LABEL: Record<Tone, string> = { easy: 'Soft', mid: 'Average', hard: 'Tough' };

export interface Slot {
  week: number;
  /** null on a bye */
  opp: string | null;
  home: boolean;
  date?: string;
  /** PPR that defence has allowed per game to his position, and its rank (1 = softest) */
  allowed: number | null;
  rank: number | null;
  tone: Tone | null;
}

export interface Fantasy {
  key: string;
  pos: FPos;
  season: number;
  /** last week with scores */
  week: number;
  rec: FanRec;
  club: string;
  bye: number | null;
  next: Slot[];
  trend: Trend;
  /** share of his games that were start-worthy, 0..1 */
  startRate: number;
  boomRate: number;
  bustRate: number;
  /** points the position's defences allow, league mean (for projections) */
  leagueAllowed: number;
}

export const slotsFor = (raw: FanRaw, club: string, pos: FPos): Slot[] =>
  (raw.n[club]?.nx ?? []).map((s) => {
    const dd = s[1] ? raw.d[s[1]]?.[pos] : undefined;
    return {
      week: s[0], opp: s[1], home: s[2] === 1, date: s[3],
      allowed: dd ? dd[0] : null, rank: dd ? dd[1] : null, tone: dd ? toneOfRank(dd[1]) : null,
    };
  });

export const leagueAllowedMean = (raw: FanRaw, pos: FPos) => {
  const v = Object.values(raw.d).map((d) => d[pos]?.[0]).filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};

export const fantasyFrom = (raw: FanRaw | null | undefined, key: string): Fantasy | null => {
  const rec = raw?.p[key];
  const pos = key.slice(0, key.indexOf(':'));
  if (!raw || !rec || !isFantasyPos(pos)) return null;
  return {
    key, pos, season: raw.season, week: raw.week, rec, club: rec.c, bye: raw.n[rec.c]?.bye ?? null,
    next: slotsFor(raw, rec.c, pos), trend: trendOf(rec.l3, rec.p3),
    startRate: rec.g ? rec.sw / rec.g : 0, boomRate: rec.g ? rec.bm / rec.g : 0, bustRate: rec.g ? rec.bu / rec.g : 0,
    leagueAllowed: leagueAllowedMean(raw, pos),
  };
};

/** The player's fantasy line for the live season; null while loading, off the NFL edition, or for a player with no game this season. */
export const useFantasy = (key: string | null | undefined): Fantasy | null => {
  const raw = useFantasyRaw();
  return key ? fantasyFrom(raw, key) : null;
};

/**
 * A rule-based projection for one coming game (a derived estimate, never a recorded number): the average of his per-game
 * and last-3 averages (just per-game with fewer than 3 games), scaled by how much that defence allows to his position
 * against the league mean, damped to half. Floor and ceiling are his own 25th and 75th percentile weeks scaled the same way.
 */
export const MATCHUP_DAMP = 0.5;
export interface Projection { mid: number; lo: number | null; hi: number | null }
export const projectGame = (f: Fantasy, slot?: Slot | null): Projection | null => {
  if (slot && !slot.opp) return null; // bye
  const { rec } = f;
  const base = rec.l3 != null ? (rec.pg + rec.l3) / 2 : rec.pg;
  const k = slot?.allowed != null && f.leagueAllowed > 0 ? 1 + MATCHUP_DAMP * (slot.allowed / f.leagueAllowed - 1) : 1;
  const mid = base * k;
  return { mid, lo: rec.fl != null ? Math.min(rec.fl * k, mid) : null, hi: rec.ce != null ? Math.max(rec.ce * k, mid) : null };
};

// ---- start / sit (rules over the same numbers) ------------------------------------------------------------------------

export type HintKind = 'start' | 'sit' | 'swap' | 'watch';
export interface Hint { kind: HintKind; text: string; swap?: string }
export interface Alt { key: string; name: string; mid: number }
/** The rest-of-season ranking pool: his per-game rank must exist (at least half his club's games). */
export const isRegular = (f: Fantasy) => f.rec.rk[4] != null;

/** Lineup player's coming game: [Projection, slot] using the first game on his club's schedule. */
export const outlookOf = (f: Fantasy): { proj: Projection | null; slot: Slot | null } => {
  const slot = f.next[0] ?? null;
  return { proj: projectGame(f, slot), slot };
};

/**
 * One short hint for a lineup player, first rule that fires:
 * bye or out -> sit; a pool player at an eligible slot projects at least max(2 points, 15%) more -> swap;
 * soft matchup and trending up -> start; tough matchup and trending down -> watch; soft or tough alone -> start / watch.
 */
export const hintFor = (f: Fantasy, injury: string | undefined, alt: Alt | null): Hint | null => {
  const { proj, slot } = outlookOf(f);
  if (slot && !slot.opp) return { kind: 'sit', text: 'Bye week' };
  if (injury === 'Out' || injury === 'IR') return { kind: 'sit', text: injury === 'IR' ? 'Injured reserve' : 'Ruled out' };
  const mid = proj?.mid ?? 0;
  if (alt && alt.mid - mid >= Math.max(2, 0.15 * mid)) return { kind: 'swap', text: `+${(alt.mid - mid).toFixed(1)} with ${alt.name}`, swap: alt.key };
  const up = f.trend?.dir === 'up';
  const down = f.trend?.dir === 'down';
  if (slot?.tone === 'easy') return { kind: 'start', text: up ? 'Soft matchup, rising' : 'Soft matchup' };
  if (slot?.tone === 'hard') return { kind: 'watch', text: down ? 'Tough matchup, cooling' : 'Tough matchup' };
  if (up) return { kind: 'start', text: 'Rising form' };
  if (down) return { kind: 'watch', text: 'Cooling off' };
  return null;
};
