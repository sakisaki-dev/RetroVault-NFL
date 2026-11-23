import type { Player, Position } from '@/types/player';
import { playerKey } from '@/config/ovr';
import { gradeFor, percentileOf, type GradeStep } from '@/config/skillGrades';

/** A percentile on the lab's 1-99 scale: a hard 0 (a pass rush a hair under the 32 clubs, a lineup below all 500 random ones) read as "nothing"; the last place is 1. */
const pctOf = (sorted: number[], v: number) => {
  const x = percentileOf(sorted, v);
  return Number.isFinite(x) ? Math.min(99, Math.max(1, x)) : x;
};
import { findNFLTeam } from '@/utils/nflTeams';
import { DEFENSE_TERMS, OFFENSE_TERMS, OFFENSE_UNITS, DEFENSE_UNITS, ALL_UNITS, UNIT_LABELS, UNIT_WEIGHTS, buildProfiles, pickDistinct, rng, ordinal, type PlayerProfile, type UnitId } from '@/utils/teamLab';
import type { DepthFile, LabFile } from '@/utils/nflLabData';
import type { InjuryCode } from '@/utils/injuries';

/**
 * NFL edition Team Lab engine (pure, React-free): real 11-man lineups and the same "vs random lineups" grades as the
 * Retro Bowl lab (utils/teamLab.ts supplies the per-player profiles and the unit tables), adapted to 22 starters.
 *
 *  - Formations: offense 11 (1 RB, 1 TE, 3 WR), 12 (2 TE), 21 (2 RB); defense 4-3 or 3-4.
 *  - Units: the same ten (passing, run, protection, explosive, red zone, ball security / pass rush, coverage, run
 *    defense, playmaking) plus star power, scored against 500 random lineups of today's depth-chart starters of the same
 *    formations, then rolled up to Offense, Defense and Team.
 *  - Rating source: every rating the lab reads goes through `ratingOf`: SZN (2026 season, the default; a player with no 2026
 *    snaps falls back to his CAR and is marked) or CAR (the whole career). There is no bare OVR. The 32 clubs' rankings, the
 *    unit grades, the head-to-head and the dream team all follow it.
 *  - Real matchups (pass rush vs protection, receivers vs coverage, run game vs run defense) read the recency-weighted
 *    per-game numbers in lab.json and rank them against the 32 clubs' real starting lineups.
 */

// ---------- Rating source (one switch point) ----------

export type RatingSource = 'szn' | 'car';
export const RATING_SOURCES: { id: RatingSource; label: string; note: string; ready: boolean }[] = [
  { id: 'szn', label: 'SZN', note: 'This season (2026): a player with no 2026 snaps uses his CAR', ready: true },
  { id: 'car', label: 'CAR', note: 'Career: his whole career ranked within the position', ready: true },
];
/** True when SZN is asked for but he has no 2026 snaps, so his CAR stands in. */
export const usesCarFallback = (p: PlayerProfile, src: RatingSource = 'szn'): boolean => src === 'szn' && p.szn == null && p.car != null;
/** The rating the lab uses for a player. The only place a rating is read, so a source switches here. */
export const ratingOf = (p: PlayerProfile, src: RatingSource = 'szn'): number => (src === 'car' ? p.car ?? p.ovr : p.szn ?? p.car ?? p.ovr);
const ovrN = (p: PlayerProfile, src: RatingSource) => ((ratingOf(p, src) - 62) / 37) * 100;

// ---------- Slots and formations ----------

export type OffForm = '11' | '12' | '21';
export type DefForm = '4-3' | '3-4';
export type SlotGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S';
export type Side = 'offense' | 'defense';
export interface NSlot {
  id: string;
  label: string;
  group: SlotGroup;
  positions: Position[];
  side: Side;
  /** the depth chart's slot name */
  depth: string;
  /** 0-based place in the depth list (RB2, WR3, TE2) */
  rank: number;
}

const S = (id: string, label: string, group: SlotGroup, positions: Position[], side: Side, depth: string, rank = 0): NSlot => ({ id, label, group, positions, side, depth, rank });
const EDGE: Position[] = ['DL', 'LB'];
export const SLOT_DEFS: Record<string, NSlot> = Object.fromEntries(
  [
    S('qb', 'QB', 'QB', ['QB'], 'offense', 'QB'),
    S('rb1', 'RB', 'RB', ['RB'], 'offense', 'RB'),
    S('rb2', 'RB', 'RB', ['RB'], 'offense', 'RB', 1),
    S('wr1', 'WR', 'WR', ['WR'], 'offense', 'WR'),
    S('wr2', 'WR', 'WR', ['WR'], 'offense', 'WR', 1),
    S('wr3', 'WR', 'WR', ['WR'], 'offense', 'WR', 2),
    S('te1', 'TE', 'TE', ['TE'], 'offense', 'TE'),
    S('te2', 'TE', 'TE', ['TE'], 'offense', 'TE', 1),
    S('lt', 'LT', 'OL', ['OL'], 'offense', 'LT'),
    S('lg', 'LG', 'OL', ['OL'], 'offense', 'LG'),
    S('c', 'C', 'OL', ['OL'], 'offense', 'C'),
    S('rg', 'RG', 'OL', ['OL'], 'offense', 'RG'),
    S('rt', 'RT', 'OL', ['OL'], 'offense', 'RT'),
    S('de1', 'DE', 'DL', EDGE, 'defense', 'LDE'),
    S('dt1', 'DT', 'DL', ['DL'], 'defense', 'LDT'),
    S('dt2', 'DT', 'DL', ['DL'], 'defense', 'RDT'),
    S('nt', 'NT', 'DL', ['DL'], 'defense', 'NT'),
    S('de2', 'DE', 'DL', EDGE, 'defense', 'RDE'),
    S('wlb', 'LB', 'LB', ['LB', 'DL'], 'defense', 'WLB'),
    S('mlb', 'MLB', 'LB', ['LB'], 'defense', 'MLB'),
    S('ilb1', 'ILB', 'LB', ['LB'], 'defense', 'LILB'),
    S('ilb2', 'ILB', 'LB', ['LB'], 'defense', 'RILB'),
    S('slb', 'LB', 'LB', ['LB', 'DL'], 'defense', 'SLB'),
    S('cb1', 'CB', 'CB', ['DB'], 'defense', 'LCB'),
    S('cb2', 'CB', 'CB', ['DB'], 'defense', 'RCB'),
    S('ss', 'SS', 'S', ['DB'], 'defense', 'SS'),
    S('fs', 'FS', 'S', ['DB'], 'defense', 'FS'),
  ].map((s) => [s.id, s]),
);
const OL5 = ['lt', 'lg', 'c', 'rg', 'rt'];
export const OFF_SLOTS: Record<OffForm, string[]> = {
  '11': ['qb', 'rb1', 'wr1', 'wr2', 'wr3', 'te1', ...OL5],
  '12': ['qb', 'rb1', 'wr1', 'wr2', 'te1', 'te2', ...OL5],
  '21': ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'te1', ...OL5],
};
export const DEF_SLOTS: Record<DefForm, string[]> = {
  '4-3': ['de1', 'dt1', 'dt2', 'de2', 'wlb', 'mlb', 'slb', 'cb1', 'cb2', 'ss', 'fs'],
  '3-4': ['de1', 'nt', 'de2', 'wlb', 'ilb1', 'ilb2', 'slb', 'cb1', 'cb2', 'ss', 'fs'],
};
export const OFF_FORMS: { id: OffForm; label: string; note: string }[] = [
  { id: '11', label: '11', note: '1 RB · 1 TE · 3 WR' },
  { id: '12', label: '12', note: '1 RB · 2 TE · 2 WR' },
  { id: '21', label: '21', note: '2 RB · 1 TE · 2 WR' },
];
export const DEF_FORMS: { id: DefForm; label: string; note: string }[] = [
  { id: '4-3', label: '4-3', note: '4 DL · 3 LB' },
  { id: '3-4', label: '3-4', note: '3 DL · 4 LB' },
];

/** Where a slot stands on the wide field (x: 0-100 left to right, offense left of the line at 50; y: feet row). */
const OFF_WIDE: Record<string, [number, number]> = {
  qb: [35, 62], rb1: [25, 62], rb2: [25, 76], wr1: [46, 22], wr2: [46, 97], wr3: [40, 32], te1: [46, 90], te2: [46, 30],
  lt: [46, 40], lg: [46, 49], c: [46, 58], rg: [46, 67], rt: [46, 76],
};
const OFF_WIDE_OVERRIDE: Partial<Record<OffForm, Record<string, [number, number]>>> = {
  '11': { te1: [46, 91], wr3: [39, 36], rb1: [25, 62] },
  '12': { te1: [46, 91], te2: [46, 30], wr1: [43, 18], wr2: [43, 97], rb1: [25, 62] },
  '21': { rb1: [25, 52], rb2: [25, 72], te1: [46, 91], wr1: [43, 18], wr2: [43, 97] },
};
const DEF_WIDE: Record<DefForm, Record<string, [number, number]>> = {
  '4-3': { de1: [55, 40], dt1: [55, 55], dt2: [55, 69], de2: [55, 84], wlb: [64, 34], mlb: [64, 62], slb: [64, 86], cb1: [73, 20], cb2: [73, 98], ss: [82, 48], fs: [84, 74] },
  '3-4': { de1: [55, 42], nt: [55, 62], de2: [55, 82], wlb: [57, 28], ilb1: [65, 50], ilb2: [65, 74], slb: [57, 96], cb1: [73, 20], cb2: [73, 98], ss: [82, 48], fs: [84, 74] },
};
export const spotOf = (l: Pick<NLineup, 'off' | 'def'>, id: string, tall: boolean): { x: number; y: number } => {
  const s = SLOT_DEFS[id];
  const [x, y] = s.side === 'offense' ? OFF_WIDE_OVERRIDE[l.off]?.[id] ?? OFF_WIDE[id] : DEF_WIDE[l.def][id];
  if (!tall) return { x, y };
  // tall: the line of scrimmage runs across at 56% from the top; offense below it, defense above
  const tx = 7 + ((y - 16) / 82) * 86;
  // names are wider than the sprites on a phone: the line zig-zags a little so the tags clear each other
  const zig = ({ wr1: -4, lt: 3, lg: -3, c: 3, rg: -3, rt: 3, te1: -3, wr2: 3, te2: 3 } as Record<string, number>)[id] ?? 0;
  const ty = (s.side === 'offense' ? 60 + (46 - x) * 1.45 : 56 - (x - 50) * 1.2) + zig;
  return { x: tx, y: ty };
};

/** The field's yard spots for a fantasy lineup (QB, RBs, WRs, TE, FLEX); DST stands on the defense side. */
export const FANTASY_SPOTS: Record<string, [number, number]> = {
  qb: [36, 62], rb1: [26, 50], rb2: [26, 74], wr1: [46, 22], wr2: [46, 97], te1: [46, 80], flex: [41, 40], dst: [74, 62],
};
export const fantasySpot = (id: string, tall: boolean): { x: number; y: number } => {
  const [x, y] = FANTASY_SPOTS[id];
  if (!tall) return { x, y };
  return { x: 7 + ((y - 16) / 82) * 86, y: id === 'dst' ? 30 : 60 + (46 - x) * 1.45 };
};

// ---------- Lineups ----------

export interface NLineup {
  off: OffForm;
  def: DefForm;
  /** slot id → player key ("POS:Name"); '' / missing = empty */
  s: Record<string, string>;
}
export const emptyNLineup = (off: OffForm = '11', def: DefForm = '4-3'): NLineup => ({ off, def, s: {} });
export const activeSlots = (l: Pick<NLineup, 'off' | 'def'>): NSlot[] => [...OFF_SLOTS[l.off], ...DEF_SLOTS[l.def]].map((id) => SLOT_DEFS[id]);
export const keysOf = (l: NLineup): string[] => activeSlots(l).map((s) => l.s[s.id]).filter(Boolean);
export const filledN = (l: NLineup) => keysOf(l).length;
export const isCompleteN = (l: NLineup) => filledN(l) === 22;
/** Change a slot; a player already in another slot moves out of it. */
export const setSlotN = (l: NLineup, id: string, key: string): NLineup => {
  const s = { ...l.s };
  if (key) Object.keys(s).forEach((k) => s[k] === key && (s[k] = ''));
  s[id] = key;
  return { ...l, s };
};
/** Switch formation: players keep their slots where the slot exists in both; the rest wait at their position. */
export const reformN = (l: NLineup, off: OffForm, def: DefForm): NLineup => {
  const keep = new Set<string>([...OFF_SLOTS[off], ...DEF_SLOTS[def]]);
  const s: Record<string, string> = {};
  Object.entries(l.s).forEach(([id, k]) => {
    if (k && keep.has(id)) s[id] = k;
  });
  return { off, def, s };
};

// ---------- Context ----------

export interface NflCtx {
  league: Player[];
  profiles: Map<string, PlayerProfile>;
  byPos: Map<Position, PlayerProfile[]>;
  /** regular starters (16+ games): the benchmark's draw pool */
  regulars: Map<Position, PlayerProfile[]>;
  benchCache: Map<string, Bench>;
}
const groupByPos = (list: PlayerProfile[]) => {
  const m = new Map<Position, PlayerProfile[]>();
  list.forEach((p) => m.set(p.position, [...(m.get(p.position) ?? []), p]));
  m.forEach((arr) => arr.sort((a, b) => b.ovr - a.ovr || b.overallPct - a.overallPct || a.name.localeCompare(b.name)));
  return m;
};
export const createNflCtx = (league: Player[], ovrMap: Map<string, number>, ratings?: { car: Map<string, number>; szn: Record<string, number> }): NflCtx => {
  const players = league.filter((p) => !p.isRealLegend);
  const profiles = buildProfiles(players, players, ovrMap);
  // the two ratings (owner, 2026-11-23): SZN only for an active player who played this season; CAR for everyone
  profiles.forEach((pr, key) => {
    pr.car = ratings?.car.get(key) ?? pr.ovr;
    pr.szn = pr.player.status === 'Active' ? ratings?.szn[key] ?? null : null;
  });
  const all = [...profiles.values()];
  return { league: players, profiles, byPos: groupByPos(all), regulars: groupByPos(all.filter((p) => p.player.games >= 16)), benchCache: new Map() };
};
/** Benchmark pool = the players on today's depth charts (the first two deep at every slot): "better than X% of lineups of real starters". */
export const withStarters = (ctx: NflCtx, depth: DepthFile): NflCtx => {
  const keys = new Set<string>();
  Object.values(depth.clubs).forEach((c) => [...Object.values(c.o), ...Object.values(c.d)].forEach((l) => l.slice(0, 2).forEach((k) => keys.add(k))));
  const starters = [...keys].map((k) => ctx.profiles.get(k)).filter((p): p is PlayerProfile => !!p);
  return { ...ctx, regulars: groupByPos(starters), benchCache: new Map() };
};
export const clubAbbr = (p: PlayerProfile | Player | undefined): string => (p ? findNFLTeam('player' in (p as PlayerProfile) ? (p as PlayerProfile).team : (p as Player).team)?.abbreviation ?? '' : '');

// ---------- Real current starters ----------

export const BENCHED: InjuryCode[] = ['IR', 'Out', 'Doubtful'];
export interface Skipped {
  slot: string;
  key: string;
  code: InjuryCode;
}
export interface Loaded {
  lineup: NLineup;
  skipped: Skipped[];
  /** a slot the depth chart could not fill (filled from the club's roster instead) */
  filled: string[];
}
const fits = (ctx: NflCtx, key: string, slot: NSlot) => {
  const p = ctx.profiles.get(key);
  return !!p && slot.positions.includes(p.position);
};

/** A club's real current starters in the formation: the depth chart, injured players (IR, Out, Doubtful) stepping aside. */
export const loadClub = (ctx: NflCtx, depth: DepthFile, abbr: string, off: OffForm, def: DefForm | null, injured: Map<string, InjuryCode>): Loaded | null => {
  const dc = depth.clubs[abbr];
  if (!dc) return null;
  const form: DefForm = def ?? dc.base;
  const l = emptyNLineup(off, form);
  const used = new Set<string>();
  const skipped: Skipped[] = [];
  const filled: string[] = [];
  const clubPool = [...ctx.profiles.values()].filter((p) => clubAbbr(p) === abbr);
  const ranked = (list: string[]) => list.filter((k) => ctx.profiles.has(k));
  const offOrder = ['qb', ...OL5, 'te1', 'te2', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3'].filter((id) => OFF_SLOTS[off].includes(id));
  const baseChart = Object.values(dc.d).flat();
  const take = (slot: NSlot, list: string[]) => {
    for (const k of list) {
      if (used.has(k) || !fits(ctx, k, slot)) continue;
      const code = injured.get(k);
      if (code && BENCHED.includes(code)) {
        if (!skipped.some((x) => x.key === k)) skipped.push({ slot: slot.id, key: k, code });
        continue;
      }
      l.s[slot.id] = k;
      used.add(k);
      return true;
    }
    return false;
  };
  const fallback = (slot: NSlot) => {
    const pool = clubPool.filter((p) => slot.positions.includes(p.position) && !used.has(p.key) && !(injured.get(p.key) && BENCHED.includes(injured.get(p.key)!))).sort((a, b) => b.ovr - a.ovr);
    // prefer a player the club has actually played recently over a long-retired namesake: the pool is the club's roster
    if (pool[0]) {
      l.s[slot.id] = pool[0].key;
      used.add(pool[0].key);
      filled.push(slot.id);
    }
  };
  offOrder.forEach((id) => {
    const slot = SLOT_DEFS[id];
    const list = ranked(dc.o[slot.depth] ?? []);
    // rank-based slots (RB2, WR2, TE2…) walk the same list, so a taken starter steps over to the next
    if (!take(slot, list)) fallback(slot);
  });
  DEF_SLOTS[form].forEach((id) => {
    const slot = SLOT_DEFS[id];
    const own = ranked(dc.d[slot.depth] ?? []);
    if (!take(slot, own) && !take(slot, ranked(baseChart))) fallback(slot);
  });
  return { lineup: l, skipped, filled };
};

// ---------- Scoring ----------

export interface NUnit {
  id: UnitId;
  label: string;
  raw: number;
  score: number;
  grade: GradeStep;
  /** what drives it: the two best contributors, e.g. "QB Josh Allen: 7.9 Y/A" */
  leaders: string[];
}
export interface Rollup {
  raw: number;
  score: number;
  grade: GradeStep;
}
export interface NScore {
  units: Record<UnitId, NUnit>;
  offense: Rollup;
  defense: Rollup;
  team: Rollup;
}
export interface Bench {
  units: Record<UnitId, number[]>;
  offense: number[];
  defense: number[];
  team: number[];
}
type SP = Record<string, PlayerProfile>;

const gradeOf = (pct: number) => gradeFor(pct) ?? gradeFor(0)!;
const wmean = (items: { v: number; w: number }[]) => {
  let s = 0;
  let w = 0;
  items.forEach((i) => {
    if (Number.isFinite(i.v) && i.w > 0) {
      s += i.v * i.w;
      w += i.w;
    }
  });
  return w > 0 ? s / w : 50;
};
const OFF_W: Record<string, number> = { rb2: 0.6, te1: 0.7, te2: 0.5 };
const statPct = (p: PlayerProfile, stat: string) => p.stats[stat]?.pct ?? NaN;
/** Offensive-line quality: blocks/G percentile (games played) blended with the rating when both exist. */
const olQ = (p: PlayerProfile, src: RatingSource) => {
  const b = statPct(p, 'blocksG');
  return Number.isFinite(b) ? 0.35 * b + 0.65 * ovrN(p, src) : ovrN(p, src);
};
const idsOf = (l: NLineup, group: SlotGroup) => activeSlots(l).filter((s) => s.group === group).map((s) => s.id);

const unitRaws = (l: NLineup, sp: SP, src: RatingSource) => {
  const raws = {} as Record<UnitId, number>;
  const qb = sp.qb;
  const rbs = idsOf(l, 'RB').map((id) => ({ p: sp[id], w: OFF_W[id] ?? 1 }));
  const recs = [...idsOf(l, 'WR'), ...idsOf(l, 'TE')].map((id) => ({ p: sp[id], w: OFF_W[id] ?? 1 }));
  const ol = idsOf(l, 'OL').map((id) => sp[id]);
  OFFENSE_UNITS.forEach((u) => {
    const items = OFFENSE_TERMS[u].map((t) => {
      if (t.slot === 'qb') return { v: statPct(qb, t.stat), w: t.w };
      if (t.slot === 'rb') return { v: wmean(rbs.map((r) => ({ v: statPct(r.p, t.stat), w: r.w }))), w: t.w };
      if (t.slot === 'rec') return { v: wmean(recs.map((r) => ({ v: statPct(r.p, t.stat), w: r.w }))), w: t.w };
      return { v: wmean(ol.map((p) => ({ v: olQ(p, src), w: 1 }))), w: t.w };
    });
    raws[u] = wmean(items);
  });
  const defs = [...DEF_SLOTS[l.def]].map((id) => sp[id]);
  DEFENSE_UNITS.forEach((u) => {
    raws[u] = DEFENSE_TERMS[u].reduce((s, t) => s + t.w * defs.reduce((a, p) => a + (p.rates[t.rate] ?? 0), 0), 0);
  });
  raws.star = wmean(
    activeSlots(l).map((s) => {
      const p = sp[s.id];
      const n = ovrN(p, src);
      return { v: Number.isFinite(p.legacyPct) ? 0.6 * n + 0.4 * p.legacyPct : n, w: 1 };
    }),
  );
  return raws;
};

const rollOffense = (s: Record<UnitId, number>) => OFFENSE_UNITS.reduce((a, u) => a + UNIT_WEIGHTS.offense[u] * s[u], 0);
const rollDefense = (s: Record<UnitId, number>) => DEFENSE_UNITS.reduce((a, u) => a + UNIT_WEIGHTS.defense[u] * s[u], 0);
const rollTeam = (o: number, d: number, star: number) => UNIT_WEIGHTS.team.offense * o + UNIT_WEIGHTS.team.defense * d + UNIT_WEIGHTS.team.star * star;

export const BENCH_SIZE = 500;
const BENCH_SEED = 2026;
const benchFor = (ctx: NflCtx, off: OffForm, def: DefForm, src: RatingSource): Bench => {
  const k = `${off}|${def}|${src}`;
  const hit = ctx.benchCache.get(k);
  if (hit) return hit;
  const r = rng(BENCH_SEED);
  const form = { off, def };
  const slots = activeSlots(form);
  const rows: Record<UnitId, number>[] = [];
  for (let i = 0; i < BENCH_SIZE; i += 1) {
    const used = new Set<string>();
    const sp: SP = {};
    let ok = true;
    for (const s of slots) {
      const pool = s.positions.flatMap((pos) => ctx.regulars.get(pos) ?? []).filter((p) => !used.has(p.key));
      const pick = pickDistinct(pool, 1, r)[0];
      if (!pick) {
        ok = false;
        break;
      }
      used.add(pick.key);
      sp[s.id] = pick;
    }
    if (ok) rows.push(unitRaws({ ...form, s: {} }, sp, src));
  }
  const sorted = (xs: number[]) => xs.filter(Number.isFinite).sort((a, b) => a - b);
  const units = Object.fromEntries(ALL_UNITS.map((u) => [u, sorted(rows.map((x) => x[u]))])) as Record<UnitId, number[]>;
  const scored = rows.map((raws) => Object.fromEntries(ALL_UNITS.map((u) => [u, pctOf(units[u], raws[u])])) as Record<UnitId, number>);
  const offRaw = scored.map(rollOffense);
  const defRaw = scored.map(rollDefense);
  const offense = sorted(offRaw);
  const defense = sorted(defRaw);
  const team = sorted(scored.map((s, i) => rollTeam(pctOf(offense, offRaw[i]), pctOf(defense, defRaw[i]), s.star)));
  const b = { units, offense, defense, team };
  ctx.benchCache.set(k, b);
  return b;
};

const spOf = (ctx: NflCtx, l: NLineup): SP | null => {
  const sp: SP = {};
  for (const s of activeSlots(l)) {
    const p = ctx.profiles.get(l.s[s.id]);
    if (!p) return null;
    sp[s.id] = p;
  }
  return sp;
};

const RATE_LABEL: Record<string, string> = { sackG: 'sacks/G', ffG: 'FF/G', intG: 'INT/G', tklG: 'tackles/G' };
const leadersFor = (l: NLineup, sp: SP, u: UnitId): string[] => {
  if (DEFENSE_UNITS.includes(u)) {
    const rate = DEFENSE_TERMS[u].reduce((a, t) => (t.w > a.w ? t : a)).rate;
    return DEF_SLOTS[l.def]
      .map((id) => sp[id])
      .sort((a, b) => (b.rates[rate] ?? 0) - (a.rates[rate] ?? 0))
      .slice(0, 2)
      .map((p) => `${p.position} ${p.name}: ${(p.rates[rate] ?? 0).toFixed(rate === 'tklG' ? 1 : 2)} ${RATE_LABEL[rate]}`);
  }
  if (u === 'star') return activeSlots(l).map((s) => sp[s.id]).sort((a, b) => b.ovr - a.ovr).slice(0, 2).map((p) => `${p.position} ${p.name}: ${p.ovr} OVR`);
  const terms = OFFENSE_TERMS[u].slice().sort((a, b) => b.w - a.w);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of terms) {
    const ids = t.slot === 'qb' ? ['qb'] : t.slot === 'rb' ? idsOf(l, 'RB') : t.slot === 'rec' ? [...idsOf(l, 'WR'), ...idsOf(l, 'TE')] : [];
    if (!ids.length) continue;
    const best = ids.map((id) => sp[id]).filter((p) => p.stats[t.stat]).sort((a, b) => statPct(b, t.stat) - statPct(a, t.stat))[0];
    if (!best || seen.has(best.key)) continue;
    seen.add(best.key);
    const st = best.stats[t.stat];
    out.push(`${best.position} ${best.name}: ${st.display} ${st.label}`);
    if (out.length === 2) break;
  }
  if (u === 'protection') return [`OL ${ordinal(wmean(idsOf(l, 'OL').map((id) => ({ v: olQ(sp[id], 'szn'), w: 1 }))))} percentile quality`, ...out].slice(0, 2);
  return out;
};

export const scoreN = (ctx: NflCtx, l: NLineup, src: RatingSource = 'szn', detail = false): NScore | null => {
  const sp = spOf(ctx, l);
  if (!sp) return null;
  const bench = benchFor(ctx, l.off, l.def, src);
  const raws = unitRaws(l, sp, src);
  const units = {} as Record<UnitId, NUnit>;
  ALL_UNITS.forEach((u) => {
    const score = pctOf(bench.units[u], raws[u]);
    units[u] = { id: u, label: UNIT_LABELS[u], raw: raws[u], score, grade: gradeOf(score), leaders: detail ? leadersFor(l, sp, u) : [] };
  });
  const scores = Object.fromEntries(ALL_UNITS.map((u) => [u, units[u].score])) as Record<UnitId, number>;
  const oRaw = rollOffense(scores);
  const dRaw = rollDefense(scores);
  const offense = { raw: oRaw, score: pctOf(bench.offense, oRaw), grade: gradeOf(0) };
  const defense = { raw: dRaw, score: pctOf(bench.defense, dRaw), grade: gradeOf(0) };
  offense.grade = gradeOf(offense.score);
  defense.grade = gradeOf(defense.score);
  const tRaw = rollTeam(offense.score, defense.score, scores.star);
  const tScore = pctOf(bench.team, tRaw);
  return { units, offense, defense, team: { raw: tRaw, score: tScore, grade: gradeOf(tScore) } };
};

// ---------- Real matchups (lab.json numbers against the 32 clubs' real starters) ----------

export interface Indices {
  /** sacks + half the QB hits per game of the four best rushers (DL / LB) */
  rush: number;
  /** sacks taken per game by the QB */
  qbSk: number;
  /** offensive-line rating (mean of the five) */
  olQ: number;
  /** receiving yards per game of the top four receivers (WR / TE) */
  recv: number;
  /** passes defended + 2 × INT per game of the corners and safeties */
  cov: number;
  /** the lead back's rushing yards per game, and yards per carry */
  rbYds: number;
  rbYpc: number;
  /** tackles + tackles for loss per game of the front seven's six best */
  runD: number;
}
const KEYS: (keyof Indices)[] = ['rush', 'qbSk', 'olQ', 'recv', 'cov', 'rbYds', 'rbYpc', 'runD'];

export const indicesOf = (ctx: NflCtx, lab: LabFile, l: NLineup, src: RatingSource = 'szn'): Indices | null => {
  const sp = spOf(ctx, l);
  if (!sp) return null;
  const d = (id: string) => lab.p[sp[id].key]?.d;
  const front = [...idsOf(l, 'DL'), ...idsOf(l, 'LB')];
  const rushers = front.map((id) => { const x = d(id); return x ? x[0] + 0.5 * x[1] : (sp[id].rates.sackG ?? 0); }).sort((a, b) => b - a).slice(0, 4);
  const stoppers = front.map((id) => { const x = d(id); return x ? x[4] + x[5] : (sp[id].rates.tklG ?? 0); }).sort((a, b) => b - a).slice(0, 6);
  const backs = [...idsOf(l, 'CB'), ...idsOf(l, 'S')].map((id) => { const x = d(id); return x ? x[2] + 2 * x[3] : (sp[id].rates.intG ?? 0) * 2; });
  const recv = [...idsOf(l, 'WR'), ...idsOf(l, 'TE')].map((id) => lab.p[sp[id].key]?.f[6] ?? 0).sort((a, b) => b - a).slice(0, 4);
  const rb = lab.p[sp.rb1.key];
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    rush: sum(rushers),
    qbSk: lab.p[sp.qb.key]?.r[2] ?? 2,
    olQ: sum(idsOf(l, 'OL').map((id) => ratingOf(sp[id], src))) / 5,
    recv: sum(recv),
    cov: sum(backs),
    rbYds: rb?.f[3] ?? 0,
    rbYpc: rb && rb.r[1] > 0 ? rb.f[3] / rb.r[1] : 4,
    runD: sum(stoppers),
  };
};

export interface Dist {
  sorted: Record<keyof Indices, number[]>;
  clubs: { abbr: string; lineup: NLineup; idx: Indices; score: NScore }[];
}
let distCache: { key: unknown; dist: Dist } | null = null;
/** The 32 clubs' real starting lineups scored and indexed once (memoised per data load). */
export const clubDistribution = (ctx: NflCtx, depth: DepthFile, lab: LabFile, injured: Map<string, InjuryCode>, src: RatingSource = 'szn'): Dist => {
  if (distCache && distCache.key === ctx) return distCache.dist;
  const clubs = Object.keys(depth.clubs)
    .map((abbr) => {
      const loaded = loadClub(ctx, depth, abbr, '11', null, injured);
      const idx = loaded && indicesOf(ctx, lab, loaded.lineup, src);
      const score = loaded && scoreN(ctx, loaded.lineup, src);
      return loaded && idx && score ? { abbr, lineup: loaded.lineup, idx, score } : null;
    })
    .filter((x): x is Dist['clubs'][number] => !!x);
  const sorted = Object.fromEntries(KEYS.map((k) => [k, clubs.map((c) => c.idx[k]).sort((a, b) => a - b)])) as Dist['sorted'];
  const dist = { sorted, clubs };
  distCache = { key: ctx, dist };
  return dist;
};
const pctIn = (dist: Dist, k: keyof Indices, v: number) => pctOf(dist.sorted[k], v);

export interface RealMatchup {
  id: string;
  label: string;
  /** the side this matchup is "ours" for */
  ours: number;
  theirs: number;
  edge: number;
  oursLine: string;
  theirsLine: string;
}
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
/** Pass rush vs protection, receivers vs coverage, run game vs run defense: attacker `a` against defender `b`. */
const attack = (dist: Dist, a: Indices, b: Indices, who: 'you' | 'them'): RealMatchup[] => {
  const prot = (i: Indices) => 0.5 * (100 - pctIn(dist, 'qbSk', i.qbSk)) + 0.5 * pctIn(dist, 'olQ', i.olQ);
  const run = (i: Indices) => 0.5 * pctIn(dist, 'rbYds', i.rbYds) + 0.5 * pctIn(dist, 'rbYpc', i.rbYpc);
  const mk = (id: string, label: string, att: number, def: number, aLine: string, dLine: string): RealMatchup => ({ id, label, ours: att, theirs: def, edge: att - def, oursLine: aLine, theirsLine: dLine });
  return [
    mk(`${who}-pass-pro`, who === 'you' ? 'Your protection vs their pass rush' : 'Their protection vs your pass rush', prot(a), pctIn(dist, 'rush', b.rush), `${f2(a.qbSk)} sacks taken/G, line ${Math.round(a.olQ)} OVR`, `${f1(b.rush)} sacks+hits/G from four rushers`),
    mk(`${who}-pass`, who === 'you' ? 'Your receivers vs their coverage' : 'Their receivers vs your coverage', pctIn(dist, 'recv', a.recv), pctIn(dist, 'cov', b.cov), `${Math.round(a.recv)} rec yds/G from the top four`, `${f1(b.cov)} PD+2·INT/G in the secondary`),
    mk(`${who}-run`, who === 'you' ? 'Your run game vs their front' : 'Their run game vs your front', run(a), pctIn(dist, 'runD', b.runD), `${Math.round(a.rbYds)} rush yds/G, ${f1(a.rbYpc)} Y/C`, `${f1(b.runD)} tackles+TFL/G from the front six`),
  ];
};
/** Both directions: each of our attacks (you), then theirs against us (them). Edges are from our side. */
export const realMatchups = (dist: Dist, ours: Indices, theirs: Indices): RealMatchup[] => {
  const a = attack(dist, ours, theirs, 'you');
  const b = attack(dist, theirs, ours, 'them').map((m) => ({ ...m, ours: m.theirs, theirs: m.ours, edge: -m.edge, oursLine: m.theirsLine, theirsLine: m.oursLine }));
  return [...a, ...b];
};

// ---------- Call sheet (rules over the grades and the real numbers) ----------

export interface CallItem {
  id: string;
  situation: string;
  title: string;
  why: string;
  tone: 'up' | 'down' | 'even';
}
const lastName = (n: string) => {
  const parts = n.split(' ');
  return /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1]) && parts.length > 1 ? parts[parts.length - 2] : parts[parts.length - 1];
};
export const identityOf = (s: NScore): { label: string; why: string } => {
  const u = s.units;
  const pass = u.passing.score;
  const run = u.run.score;
  const top = [...ALL_UNITS].filter((x) => x !== 'star').sort((a, b) => u[b].score - u[a].score);
  const bottom = [...top].reverse()[0];
  let label = 'Balanced contender';
  if (s.team.score >= 90) label = 'Juggernaut';
  else if (pass >= 75 && run < 55) label = 'Air raid';
  else if (run >= 75 && pass < 60) label = 'Ground and pound';
  else if (s.defense.score >= s.offense.score + 20) label = 'Defense wins championships';
  else if (s.offense.score >= s.defense.score + 20) label = 'Shootout team';
  else if (s.team.score < 40) label = 'Rebuilding';
  return { label, why: `Best ${u[top[0]].label.toLowerCase()} (${ordinal(u[top[0]].score)}), weakest ${u[bottom].label.toLowerCase()} (${ordinal(u[bottom].score)}).` };
};

export const callSheet = (ctx: NflCtx, l: NLineup, s: NScore, idx: Indices | null, dist: Dist | null, lab: LabFile | null): CallItem[] => {
  const sp = spOf(ctx, l);
  if (!sp) return [];
  const u = s.units;
  const out: CallItem[] = [];
  const rb = sp.rb1;
  const qb = sp.qb;
  const wrs = idsOf(l, 'WR').map((id) => sp[id]);
  const tes = idsOf(l, 'TE').map((id) => sp[id]);
  const deepWr = [...wrs, ...tes].sort((a, b) => (b.stats.ypr?.pct ?? 0) - (a.stats.ypr?.pct ?? 0))[0];
  const redWr = [...wrs, ...tes].sort((a, b) => (b.stats.tdPerRec?.pct ?? 0) - (a.stats.tdPerRec?.pct ?? 0))[0];
  const hit = (cond: boolean, item: CallItem, alt: CallItem) => out.push(cond ? item : alt);
  const lean = u.passing.score - u.run.score;
  hit(
    lean >= 12,
    { id: 'early', situation: 'Early downs', title: `Throw first: let ${lastName(qb.name)} work`, why: `Passing ${ordinal(u.passing.score)} percentile against a run game at ${ordinal(u.run.score)}; ${qb.name} throws for ${qb.stats.ya?.display ?? '—'} Y/A.`, tone: 'up' },
    lean <= -12
      ? { id: 'early', situation: 'Early downs', title: `Feed ${lastName(rb.name)} on first down`, why: `Run game ${ordinal(u.run.score)} percentile (${rb.stats.ypc?.display ?? '—'} Y/C) beats the passing game at ${ordinal(u.passing.score)}.`, tone: 'up' }
      : { id: 'early', situation: 'Early downs', title: 'Mix run and pass; stay on schedule', why: `Passing ${ordinal(u.passing.score)} and run ${ordinal(u.run.score)} are close: set up the play action off ${lastName(rb.name)}.`, tone: 'even' },
  );
  hit(
    u.protection.score >= 60,
    { id: 'third', situation: '3rd & long', title: 'Five- and seven-step drops: let routes develop', why: `Protection ${ordinal(u.protection.score)} percentile${idx ? `; ${lastName(qb.name)} takes ${idx.qbSk.toFixed(2)} sacks/G` : ''}.`, tone: 'up' },
    { id: 'third', situation: '3rd & long', title: 'Quick game, screens, draws', why: `Protection is only ${ordinal(u.protection.score)} percentile${idx ? `; ${lastName(qb.name)} takes ${idx.qbSk.toFixed(2)} sacks/G` : ''}: get the ball out.`, tone: 'down' },
  );
  hit(
    u.explosive.score >= 60 && !!deepWr,
    { id: 'deep', situation: 'Play action', title: `Shot to ${deepWr ? lastName(deepWr.name) : 'the best receiver'} off play action`, why: `Explosiveness ${ordinal(u.explosive.score)} percentile; ${deepWr?.name} averages ${deepWr?.stats.ypr?.display ?? '—'} yards a catch.`, tone: 'up' },
    { id: 'deep', situation: 'Play action', title: 'Take the underneath throws', why: `Explosiveness is ${ordinal(u.explosive.score)} percentile: win with ${tes[0] ? lastName(tes[0].name) : 'short routes'} and tempo.`, tone: 'down' },
  );
  hit(
    u.redzone.score >= 55,
    { id: 'rz', situation: 'Red zone', title: `Target ${redWr ? lastName(redWr.name) : 'the top receiver'} inside the 20`, why: `Red zone ${ordinal(u.redzone.score)} percentile; ${redWr?.name} scores on ${redWr?.stats.tdPerRec?.display ?? '—'} of his catches.`, tone: 'up' },
    { id: 'rz', situation: 'Red zone', title: `Pound it in with ${lastName(rb.name)}`, why: `Red zone is ${ordinal(u.redzone.score)} percentile through the air; lean on ${rb.name} (${rb.stats.td16?.display ?? '—'} TD per 16).`, tone: 'down' },
  );
  const rush = u.passRush.score;
  hit(
    rush >= 60,
    { id: 'rush', situation: 'Defense: pass rush', title: 'Four-man rush is enough; drop seven', why: `Pass rush ${ordinal(rush)} percentile${idx ? `: ${idx.rush.toFixed(1)} sacks+hits a game from the four best rushers` : ''}.`, tone: 'up' },
    { id: 'rush', situation: 'Defense: pass rush', title: 'Bring the blitz; four rushers will not get home', why: `Pass rush ${ordinal(rush)} percentile${idx ? `: ${idx.rush.toFixed(1)} sacks+hits a game from four` : ''}.`, tone: 'down' },
  );
  hit(
    u.coverage.score >= 60,
    { id: 'cov', situation: 'Defense: coverage', title: 'Play man; the secondary can hold it', why: `Coverage ${ordinal(u.coverage.score)} percentile${idx ? `; ${idx.cov.toFixed(1)} passes defended + 2×INT a game` : ''}.`, tone: 'up' },
    { id: 'cov', situation: 'Defense: coverage', title: 'Play zone with two deep safeties', why: `Coverage ${ordinal(u.coverage.score)} percentile: keep everything in front.`, tone: 'down' },
  );
  hit(
    u.runDef.score >= 55,
    { id: 'rd', situation: 'Defense: run', title: 'Load the box on early downs', why: `Run defense ${ordinal(u.runDef.score)} percentile${idx ? `; the front six make ${idx.runD.toFixed(1)} tackles+TFL a game` : ''}.`, tone: 'up' },
    { id: 'rd', situation: 'Defense: run', title: 'Light boxes; do not trust the front against the run', why: `Run defense ${ordinal(u.runDef.score)} percentile: dime and nickel looks keep the safeties deep.`, tone: 'down' },
  );
  const pol = s.defense.score < 40 ? 'aggressive' : s.defense.score >= 70 ? 'conservative' : 'standard';
  out.push({
    id: 'fourth',
    situation: '4th down',
    title: pol === 'aggressive' ? 'Go for it from the opposing 40 on 4th & 3 or less' : pol === 'conservative' ? 'Punt and trust the defense; kick inside the 35' : 'Go on 4th & 1 past midfield; kick inside the 30',
    why: `Defense ${ordinal(s.defense.score)} percentile: ${pol === 'aggressive' ? 'a stop is not a safe bet, so keep the ball' : pol === 'conservative' ? 'make them drive the length of the field' : 'a middling defense makes field position matter'}.`,
    tone: pol === 'conservative' ? 'up' : pol === 'aggressive' ? 'down' : 'even',
  });
  void dist;
  void lab;
  return out;
};

/** The player a call is about, for a field highlight: none needed today. */
export const leaderOf = (ctx: NflCtx, l: NLineup, id: string) => ctx.profiles.get(l.s[id]);

// ---------- Random, auto-draft, ranking ----------

export const randomN = (ctx: NflCtx, off: OffForm, def: DefForm, seed: number): NLineup => {
  const r = rng(seed);
  const l = emptyNLineup(off, def);
  const used = new Set<string>();
  activeSlots(l).forEach((s) => {
    const pool = s.positions.flatMap((pos) => ctx.regulars.get(pos) ?? []).filter((p) => !used.has(p.key));
    const pick = pickDistinct(pool, 1, r)[0];
    if (pick) {
      l.s[s.id] = pick.key;
      used.add(pick.key);
    }
  });
  return l;
};

/** Best rating at every slot, then swaps that raise the team score (bounded). */
export const autoDraftN = (ctx: NflCtx, off: OffForm, def: DefForm, src: RatingSource = 'szn'): NLineup => {
  let l = emptyNLineup(off, def);
  const used = new Set<string>();
  const slots = activeSlots(l);
  slots.forEach((s) => {
    const pick = s.positions.flatMap((pos) => ctx.byPos.get(pos) ?? []).filter((p) => !used.has(p.key)).sort((a, b) => ratingOf(b, src) - ratingOf(a, src))[0];
    if (pick) {
      l.s[s.id] = pick.key;
      used.add(pick.key);
    }
  });
  let best = scoreN(ctx, l, src)?.team.raw ?? 0;
  for (let round = 0; round < 2; round += 1) {
    let improved = false;
    for (const s of slots) {
      const cands = s.positions.flatMap((pos) => ctx.byPos.get(pos) ?? []).filter((p) => !keysOf(l).includes(p.key)).slice(0, 14);
      for (const c of cands) {
        const t = setSlotN(l, s.id, c.key);
        const v = scoreN(ctx, t, src)?.team.raw ?? -1;
        if (v > best + 1e-6) {
          best = v;
          l = t;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return l;
};

export const WIN_PROB_SCALE = 10;
export const winProbOf = (a: NScore, b: NScore, real: RealMatchup[]) => {
  const edge = real.length ? real.reduce((s, m) => s + m.edge, 0) / real.length : 0;
  return 1 / (1 + Math.exp(-((a.team.raw - b.team.raw) / WIN_PROB_SCALE + edge / 60)));
};

// ---------- Hash / storage form ----------

export const encodeN = (l: NLineup): string => `${l.off}${l.def}|${activeSlots(l).map((s) => l.s[s.id] ?? '').join('~')}`;
export const decodeN = (raw: string, known?: (k: string) => boolean): NLineup => {
  const [head, body = ''] = raw.split('|');
  const off = (['11', '12', '21'].includes(head.slice(0, 2)) ? head.slice(0, 2) : '11') as OffForm;
  const def = (head.slice(2) === '3-4' ? '3-4' : '4-3') as DefForm;
  const l = emptyNLineup(off, def);
  const parts = body.split('~');
  activeSlots(l).forEach((s, i) => {
    const k = parts[i];
    if (k && (!known || known(k)) && !Object.values(l.s).includes(k)) l.s[s.id] = k;
  });
  return l;
};

export const keyOfPlayer = playerKey;
