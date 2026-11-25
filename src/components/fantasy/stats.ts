import type { FanRaw, FanRec, FPos } from '@/utils/fantasy';
import { f1, isFantasyPos } from '@/utils/fantasy';

/**
 * Every fantasy stat the Deep Dive and the player card show, its plain-words definition and formula, and how to read it from
 * fantasy.json. The league context (rank, percentile, leader, median, distribution) is computed from the same file: the other
 * players at his position, so nothing here needs more data than fantasy.json holds.
 */
export interface StatDef {
  id: string;
  label: string;
  what: string;
  formula: string;
  get: (r: FanRec) => number | null | undefined;
  fmt: (v: number) => string;
  /** lower is better (bust rate, spread) */
  low?: boolean;
  /** the pool: every player with a game ('all') or those with at least half their club's games ('reg') */
  pool: 'all' | 'reg';
  /** his weekly values for the strip under the figure */
  weeks?: (r: FanRec) => number[];
}

const pc = (n: number, d: number) => (d > 0 ? (100 * n) / d : 0);
const pct0 = (v: number) => `${Math.round(v)}%`;
const OPP = (id: 'og' | 'ts' | 'ay' | 'cs' | 'sn' | 'po') => (r: FanRec) => r.op?.[id]?.[0];

export const STATS: StatDef[] = [
  { id: 'ppr', label: 'PPR total', what: 'Every fantasy point he has scored this season.', formula: 'Sum of weekly standard PPR: 1 per catch, 0.1 per rush or receiving yard, 0.04 per pass yard, 6 per TD (4 passing), minus 2 per interception or fumble lost.', get: (r) => r.t, fmt: f1, pool: 'all', weeks: (r) => r.w.map((w) => w[1]) },
  { id: 'pg', label: 'PPR / game', what: 'Points a game, so a missed week does not hurt him.', formula: 'PPR total divided by games played.', get: (r) => r.pg, fmt: f1, pool: 'reg', weeks: (r) => r.w.map((w) => w[1]) },
  { id: 'rank', label: 'Position rank', what: 'Where his season total sits among his position.', formula: 'Rank of PPR total among players at his position with a game (ties share a place).', get: (r) => r.t, fmt: f1, pool: 'all' },
  { id: 'overall', label: 'Overall rank', what: 'His season total against every QB, RB, WR and TE.', formula: 'Rank of PPR total among all four fantasy positions.', get: (r) => r.t, fmt: f1, pool: 'all' },
  { id: 'l3', label: 'Last 3', what: 'His form: the average of his last three games.', formula: 'Mean PPR of his 3 most recent games, against the 3 before.', get: (r) => r.l3, fmt: f1, pool: 'reg', weeks: (r) => r.w.slice(-6).map((w) => w[1]) },
  { id: 'fl', label: 'Floor', what: 'A bad week for him: 3 in 4 weeks beat it.', formula: '25th percentile of his weekly PPR.', get: (r) => r.fl, fmt: f1, pool: 'reg', weeks: (r) => r.w.map((w) => w[1]) },
  { id: 'md', label: 'Median', what: 'His typical week.', formula: '50th percentile of his weekly PPR.', get: (r) => r.md, fmt: f1, pool: 'reg', weeks: (r) => r.w.map((w) => w[1]) },
  { id: 'ce', label: 'Ceiling', what: 'A good week for him: 1 in 4 weeks beat it.', formula: '75th percentile of his weekly PPR.', get: (r) => r.ce, fmt: f1, pool: 'reg', weeks: (r) => r.w.map((w) => w[1]) },
  { id: 'sd', label: 'Std dev', what: 'How much his weeks swing. Lower is steadier.', formula: 'Standard deviation of weekly PPR; CV is that over his mean.', get: (r) => r.sd, fmt: f1, low: true, pool: 'reg', weeks: (r) => r.w.map((w) => w[1]) },
  { id: 'sw', label: 'Start-worthy', what: 'The share of his weeks a fantasy manager was glad to start him.', formula: 'Games with a weekly finish in the top 12 (QB, TE) or top 24 (RB, WR), over games played.', get: (r) => pc(r.sw, r.g), fmt: pct0, pool: 'reg', weeks: (r) => r.w.map((w) => w[3]) },
  { id: 'bm', label: 'Boom', what: 'The share of his weeks that won matchups on their own.', formula: 'Games with a weekly finish in the top 6 (QB, TE) or top 12 (RB, WR), over games played.', get: (r) => pc(r.bm, r.g), fmt: pct0, pool: 'reg', weeks: (r) => r.w.map((w) => w[3]) },
  { id: 'bu', label: 'Bust', what: 'The share of his weeks that hurt a lineup. Lower is better.', formula: 'Games with a weekly finish worse than 18 (QB, TE) or 36 (RB, WR), over games played.', get: (r) => pc(r.bu, r.g), fmt: pct0, low: true, pool: 'reg', weeks: (r) => r.w.map((w) => w[3]) },
  { id: 'og', label: 'Opportunities / game', what: 'Touches that can score for him each game.', formula: 'Carries plus targets over games played (QB: pass attempts plus carries).', get: OPP('og'), fmt: f1, pool: 'reg' },
  { id: 'ts', label: 'Target share', what: 'How much of his club\'s passing game runs through him.', formula: 'His targets over his club\'s targets in the weeks he played.', get: OPP('ts'), fmt: pct0, pool: 'reg' },
  { id: 'ay', label: 'Air yards share', what: 'How deep his club\'s throws go to him.', formula: 'His air yards over his club\'s in the weeks he played.', get: OPP('ay'), fmt: pct0, pool: 'reg' },
  { id: 'cs', label: 'Carry share', what: 'How much of his club\'s running game he gets.', formula: 'His carries over his club\'s in the weeks he played.', get: OPP('cs'), fmt: pct0, pool: 'reg' },
  { id: 'sn', label: 'Offence snaps', what: 'How often he is on the field.', formula: 'Average share of his club\'s offensive snaps in his games.', get: OPP('sn'), fmt: pct0, pool: 'reg' },
  { id: 'po', label: 'PPR / opportunity', what: 'How much he squeezes from each touch.', formula: 'PPR points per carry, target or (QB) pass attempt.', get: OPP('po'), fmt: (v) => v.toFixed(2), pool: 'reg' },
];
export const STAT_BY_ID: Record<string, StatDef> = Object.fromEntries(STATS.map((s) => [s.id, s]));

export interface StatContext {
  def: StatDef;
  value: number | null;
  /** rank among the pool (1 = best), the pool size, percentile 0..100 (100 = best) */
  rank: number | null;
  of: number;
  pct: number | null;
  leader: { key: string; name: string; value: number } | null;
  median: number | null;
  /** the pool's values, sorted ascending (for the strip chart) */
  dist: number[];
  weeks: number[];
}

const nameOf = (k: string) => k.slice(k.indexOf(':') + 1);

/** His value against his position (the whole league for 'overall'). */
export const statContext = (raw: FanRaw, key: string, id: string): StatContext | null => {
  const def = STAT_BY_ID[id];
  const rec = raw.p[key];
  const pos = key.slice(0, key.indexOf(':'));
  if (!def || !rec || !isFantasyPos(pos)) return null;
  const scope = (k: string) => (id === 'overall' ? isFantasyPos(k.slice(0, k.indexOf(':'))) : k.startsWith(`${pos as FPos}:`));
  const pool: { key: string; v: number }[] = [];
  for (const [k, r] of Object.entries(raw.p)) {
    if (!scope(k) || (def.pool === 'reg' && r.rk[4] == null)) continue;
    const v = def.get(r);
    if (v != null && Number.isFinite(v)) pool.push({ key: k, v });
  }
  const value = def.get(rec) ?? null;
  const better = (a: number, b: number) => (def.low ? a < b : a > b);
  const sorted = [...pool].sort((a, b) => (def.low ? a.v - b.v : b.v - a.v) || a.key.localeCompare(b.key));
  const mine = value != null ? pool.find((p) => p.key === key) : null;
  const rank = value != null && mine ? 1 + pool.filter((p) => better(p.v, value)).length : null;
  const vals = pool.map((p) => p.v).sort((a, b) => a - b);
  const median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null;
  return {
    def, value, rank, of: pool.length,
    pct: rank != null && pool.length > 1 ? Math.round((100 * (pool.length - rank)) / (pool.length - 1)) : null,
    leader: sorted[0] ? { key: sorted[0].key, name: nameOf(sorted[0].key), value: sorted[0].v } : null,
    median, dist: vals, weeks: def.weeks ? def.weeks(rec) : [],
  };
};

// ---- a stat opened from elsewhere (the player card's strip) -------------------------------------------------------------
let pendingStat: string | null = null;
const EVT = 'rv:fantasy-stat';
/** Ask the Fantasy section to open and scroll to one stat (it also works if the section mounts after). */
export const requestFantasyStat = (id: string | null) => {
  pendingStat = id;
  if (id) window.dispatchEvent(new CustomEvent(EVT, { detail: id }));
};
export const takeFantasyStat = () => {
  const s = pendingStat;
  pendingStat = null;
  return s;
};
export const onFantasyStat = (cb: (id: string) => void) => {
  const h = (e: Event) => cb((e as CustomEvent<string>).detail);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
};
