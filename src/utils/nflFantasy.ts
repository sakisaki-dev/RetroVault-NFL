import type { GameLog } from '@/utils/gameLogs';
import { rowsOf } from '@/utils/gameLogs';
import type { InjuryCode } from '@/utils/injuries';
import type { LabFile, UpcomingGame } from '@/utils/nflLabData';
import { rng } from '@/utils/teamLab';

/**
 * NFL edition fantasy engine (pure): scoring, rule-based weekly projections, the salary-cap builder and the snake draft.
 *
 * Projection (per player, per upcoming week): his recency-weighted per-game line (lab.json `f`: last 12 games, each
 * 0.9 times the one after) scored under the chosen rules, times the opponent factor (fantasy points the opponent
 * allowed to his position against the league mean, shrunk toward 1), times an injury factor from the latest report,
 * and zero on a bye (a club missing from the week in upcoming.json). The defence's line works the same way over its
 * last eight games, scaled by how well the opponent scores.
 */

export type FPos = 'QB' | 'RB' | 'WR' | 'TE';
export interface FSlot {
  id: string;
  label: string;
  positions: FPos[] | ['DST'];
}
export const F_SLOTS: FSlot[] = [
  { id: 'qb', label: 'QB', positions: ['QB'] },
  { id: 'rb1', label: 'RB', positions: ['RB'] },
  { id: 'rb2', label: 'RB', positions: ['RB'] },
  { id: 'wr1', label: 'WR', positions: ['WR'] },
  { id: 'wr2', label: 'WR', positions: ['WR'] },
  { id: 'te1', label: 'TE', positions: ['TE'] },
  { id: 'flex', label: 'FLEX', positions: ['RB', 'WR', 'TE'] },
  { id: 'dst', label: 'D/ST', positions: ['DST'] },
];
export type FLineup = Record<string, string>;
export const FANTASY_IDS = F_SLOTS.map((s) => s.id);
export const emptyF = (): FLineup => ({});
export const fFilled = (l: FLineup) => FANTASY_IDS.filter((id) => l[id]).length;
export const fPos = (key: string): FPos | 'DST' => (key.startsWith('DST:') ? 'DST' : (key.slice(0, key.indexOf(':')) as FPos));
export const canFill = (slot: FSlot, key: string) => (slot.positions as string[]).includes(fPos(key));
export const setF = (l: FLineup, id: string, key: string): FLineup => {
  const next = { ...l };
  if (key) Object.keys(next).forEach((k) => next[k] === key && (next[k] = ''));
  next[id] = key;
  return next;
};

// ---------- Scoring ----------

export interface Scoring {
  passYd: number;
  passTd: number;
  int: number;
  rushYd: number;
  rushTd: number;
  rec: number;
  recYd: number;
  recTd: number;
  fumble: number;
  twoPt: number;
}
export type ScoringId = 'ppr' | 'half' | 'std' | 'custom';
const BASE: Scoring = { passYd: 0.04, passTd: 4, int: -2, rushYd: 0.1, rushTd: 6, rec: 1, recYd: 0.1, recTd: 6, fumble: -2, twoPt: 2 };
export const SCORING: Record<Exclude<ScoringId, 'custom'>, Scoring> = {
  ppr: { ...BASE, rec: 1 },
  half: { ...BASE, rec: 0.5 },
  std: { ...BASE, rec: 0 },
};
export const SCORING_LABELS: Record<ScoringId, string> = { ppr: 'PPR', half: 'Half PPR', std: 'Standard', custom: 'Custom' };
export const SCORING_FIELDS: { id: keyof Scoring; label: string; step: number }[] = [
  { id: 'passYd', label: 'Pass yard', step: 0.01 },
  { id: 'passTd', label: 'Pass TD', step: 1 },
  { id: 'int', label: 'INT', step: 1 },
  { id: 'rushYd', label: 'Rush yard', step: 0.01 },
  { id: 'rushTd', label: 'Rush TD', step: 1 },
  { id: 'rec', label: 'Reception', step: 0.5 },
  { id: 'recYd', label: 'Rec yard', step: 0.01 },
  { id: 'recTd', label: 'Rec TD', step: 1 },
  { id: 'fumble', label: 'Fumble lost', step: 1 },
  { id: 'twoPt', label: '2-pt', step: 1 },
];
/** Points for a components array (lab.json `f` order). */
export const pointsOf = (f: number[], s: Scoring): number =>
  f[0] * s.passYd + f[1] * s.passTd + f[2] * s.int + f[3] * s.rushYd + f[4] * s.rushTd + f[5] * s.rec + f[6] * s.recYd + f[7] * s.recTd + f[8] * s.fumble + f[9] * s.twoPt;
/** The same for one game-log row (nflverse column names). */
export const rowPoints = (r: Record<string, number | string | null>, s: Scoring): number => {
  const n = (c: string) => Number(r[c] ?? 0) || 0;
  return pointsOf(
    [n('passing_yards'), n('passing_tds'), n('passing_interceptions'), n('rushing_yards'), n('rushing_tds'), n('receptions'), n('receiving_yards'), n('receiving_tds'), n('fumbles_lost_total'), n('passing_2pt_conversions') + n('rushing_2pt_conversions') + n('receiving_2pt_conversions')],
    s,
  );
};
const paBand = (pa: number) => (pa === 0 ? 10 : pa <= 6 ? 7 : pa <= 13 ? 4 : pa <= 20 ? 1 : pa <= 27 ? 0 : pa <= 34 ? -1 : -4);
/** A team defence's game: [week, sacks, INT, fumble recoveries, TDs, safeties, blocks, points allowed]. */
export const dstPoints = (r: number[]) => r[1] + 2 * r[2] + 2 * r[3] + 6 * r[4] + 2 * r[5] + 2 * r[6] + paBand(r[7]);

// ---------- Schedule ----------

export interface Sched {
  /** club → week → opponent */
  byClub: Map<string, Map<number, { opp: string; home: boolean }>>;
  /** weeks still to play, from the first week most clubs have not played */
  weeks: number[];
  next: number;
  clubs: string[];
}
export const buildSched = (games: UpcomingGame[], clubs: string[]): Sched => {
  const byClub = new Map<string, Map<number, { opp: string; home: boolean }>>();
  const per = new Map<number, number>();
  games.forEach((g) => {
    per.set(g.week, (per.get(g.week) ?? 0) + 1);
    if (!byClub.has(g.home)) byClub.set(g.home, new Map());
    if (!byClub.has(g.away)) byClub.set(g.away, new Map());
    byClub.get(g.home)!.set(g.week, { opp: g.away, home: true });
    byClub.get(g.away)!.set(g.week, { opp: g.home, home: false });
  });
  const weeks = [...per.entries()].filter(([, n]) => n >= 8).map(([w]) => w).sort((a, b) => a - b);
  return { byClub, weeks, next: weeks[0] ?? 0, clubs };
};
export const isBye = (s: Sched, club: string, week: number) => !s.byClub.get(club)?.has(week);

// ---------- Projections ----------

const injuryFactor = (code: InjuryCode | undefined, weekIndex: number) => {
  if (!code) return 1;
  if (code === 'IR') return 0;
  if (code === 'Out') return weekIndex === 0 ? 0 : 0.85;
  if (code === 'Doubtful') return weekIndex === 0 ? 0.3 : 0.95;
  return weekIndex === 0 ? 0.9 : 1;
};
export interface Ctx {
  lab: LabFile;
  sched: Sched;
  scoring: Scoring;
  injured: Map<string, InjuryCode>;
}
const leaguePf = (lab: LabFile) => {
  const v = Object.values(lab.teams).map((t) => t.pf);
  return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
};
/** Defence's per-game fantasy mean over its last 8 games. */
const dstBase = (lab: LabFile, club: string) => {
  const rows = (lab.dst[club] ?? []).slice(-8);
  return rows.length ? rows.reduce((s, r) => s + dstPoints(r), 0) / rows.length : 0;
};
export const projectWeek = (c: Ctx, key: string, week: number): number => {
  const weekIndex = Math.max(0, c.sched.weeks.indexOf(week));
  if (key.startsWith('DST:')) {
    const club = key.slice(4);
    const opp = c.sched.byClub.get(club)?.get(week)?.opp;
    if (!opp) return 0;
    const lg = leaguePf(c.lab);
    const f = Math.min(1.3, Math.max(0.75, Math.pow(lg / Math.max(8, c.lab.teams[opp]?.pf ?? lg), 0.6)));
    return dstBase(c.lab, club) * f;
  }
  const lp = c.lab.p[key];
  if (!lp) return 0;
  const g = c.sched.byClub.get(lp.t)?.get(week);
  if (!g) return 0;
  const vs = c.lab.teams[g.opp]?.vs?.[fPos(key) as string] ?? 1;
  // small samples drift toward the position's middling line: a rookie with 3 games is not a 25-point back
  const conf = lp.n / (lp.n + 2);
  return Math.max(0, pointsOf(lp.f, c.scoring)) * vs * injuryFactor(c.injured.get(key), weekIndex) * (0.6 + 0.4 * conf);
};
/** The next `k` weeks (default 4) summed: the auto-builder's value. */
export const projectRest = (c: Ctx, key: string, k = 4) => c.sched.weeks.slice(0, k).reduce((s, w) => s + projectWeek(c, key, w), 0);

// ---------- Salary ----------

/** The game's salary, or for a defence a price by points allowed (best defence 20, worst 5). */
export const salaryOf = (lab: LabFile, key: string): number => {
  if (key.startsWith('DST:')) {
    const pas = Object.entries(lab.teams).sort((a, b) => a[1].pa - b[1].pa).map(([t]) => t);
    const i = pas.indexOf(key.slice(4));
    return i < 0 ? 5 : Math.round(20 - (15 * i) / Math.max(1, pas.length - 1));
  }
  return lab.p[key]?.s ?? 0;
};

// ---------- Candidate pool ----------

export interface Cand {
  key: string;
  pos: FPos | 'DST';
  salary: number;
  value: number;
  club: string;
}
export const candidates = (c: Ctx): Cand[] => {
  const out: Cand[] = [];
  Object.entries(c.lab.p).forEach(([key, lp]) => {
    const pos = fPos(key);
    if (pos === 'DST' || !['QB', 'RB', 'WR', 'TE'].includes(pos) || lp.n < 3 || lp.s <= 0) return;
    const value = projectRest(c, key);
    if (value > 0) out.push({ key, pos, salary: lp.s, value, club: lp.t });
  });
  Object.keys(c.lab.teams).forEach((t) => {
    const key = `DST:${t}`;
    out.push({ key, pos: 'DST', salary: salaryOf(c.lab, key), value: projectRest(c, key), club: t });
  });
  return out;
};

// ---------- Salary-cap builder: beam search over the slots, then a swap pass ----------

export interface BuildOpts {
  cap: number;
  locks: FLineup;
  excludes: Set<string>;
}
const ORDER = ['dst', 'qb', 'te1', 'wr1', 'wr2', 'rb1', 'rb2', 'flex'];
export const buildBest = (cands: Cand[], { cap, locks, excludes }: BuildOpts): { lineup: FLineup; cost: number; value: number } | null => {
  const byKey = new Map(cands.map((x) => [x.key, x]));
  const slotCands = (slot: FSlot) => cands.filter((x) => canFill(slot, x.key) && !excludes.has(x.key));
  const minSal = (slot: FSlot) => Math.min(...slotCands(slot).map((x) => x.salary), 999);
  type St = { s: FLineup; cost: number; val: number };
  let states: St[] = [{ s: {}, cost: 0, val: 0 }];
  ORDER.forEach((id, i) => {
    const slot = F_SLOTS.find((x) => x.id === id)!;
    const rest = ORDER.slice(i + 1).reduce((a, r) => a + minSal(F_SLOTS.find((x) => x.id === r)!), 0);
    const lock = locks[id] ? byKey.get(locks[id]) : undefined;
    const pool = lock ? [lock] : slotCands(slot);
    const top = [...pool].sort((a, b) => b.value - a.value).slice(0, 16);
    const eff = [...pool].sort((a, b) => b.value / (b.salary + 4) - a.value / (a.salary + 4)).slice(0, 10);
    const bag = new Map<string, Cand>();
    [...top, ...eff, ...(lock ? [lock] : [])].forEach((x) => bag.set(x.key, x));
    const next: St[] = [];
    states.forEach((st) => {
      const used = new Set(Object.values(st.s));
      bag.forEach((x) => {
        if (used.has(x.key) || st.cost + x.salary + rest > cap) return;
        next.push({ s: { ...st.s, [id]: x.key }, cost: st.cost + x.salary, val: st.val + x.value });
      });
    });
    // keep the cost / value frontier plus the highest-value states
    next.sort((a, b) => a.cost - b.cost || b.val - a.val);
    const keep: St[] = [];
    let bestVal = -1;
    next.forEach((st) => {
      if (st.val > bestVal + 1e-9) {
        keep.push(st);
        bestVal = st.val;
      }
    });
    const topVal = [...next].sort((a, b) => b.val - a.val).slice(0, 120);
    const merged = new Map<string, St>();
    [...keep, ...topVal].forEach((st) => merged.set(Object.values(st.s).sort().join('|'), st));
    states = [...merged.values()];
  });
  let best = states.sort((a, b) => b.val - a.val)[0];
  if (!best) return null;
  // swap pass: replace one unlocked slot with anyone cheaper-or-equal in total that adds value
  let improved = true;
  while (improved) {
    improved = false;
    for (const slot of F_SLOTS) {
      if (locks[slot.id]) continue;
      const cur = byKey.get(best.s[slot.id]);
      if (!cur) continue;
      const used = new Set(Object.values(best.s));
      for (const x of slotCands(slot)) {
        if (used.has(x.key) && x.key !== cur.key) continue;
        const cost = best.cost - cur.salary + x.salary;
        if (cost <= cap && x.value > cur.value + 1e-6) {
          best = { s: { ...best.s, [slot.id]: x.key }, cost, val: best.val - cur.value + x.value };
          improved = true;
          break;
        }
      }
    }
  }
  return { lineup: best.s, cost: best.cost, value: best.val };
};

export const costOf = (lab: LabFile, l: FLineup) => FANTASY_IDS.reduce((s, id) => s + (l[id] ? salaryOf(lab, l[id]) : 0), 0);

// ---------- Snake draft ----------

export interface DraftPick {
  round: number;
  team: number;
  key: string;
}
export interface DraftState {
  teams: number;
  me: number;
  picks: DraftPick[];
  seed: number;
}
export const DRAFT_ROUNDS = 8;
export const draftOrder = (teams: number): number[] => Array.from({ length: DRAFT_ROUNDS }, (_, r) => (r % 2 === 0 ? [...Array(teams).keys()] : [...Array(teams).keys()].reverse())).flat();
export const onClock = (d: DraftState): number | null => (d.picks.length >= d.teams * DRAFT_ROUNDS ? null : draftOrder(d.teams)[d.picks.length]);
const CAP: Record<string, number> = { QB: 1, RB: 3, WR: 3, TE: 2, DST: 1 };
export const teamPicks = (d: DraftState, team: number) => d.picks.filter((p) => p.team === team).map((p) => p.key);
export const canDraft = (d: DraftState, team: number, key: string) => {
  const mine = teamPicks(d, team);
  const pos = fPos(key);
  if (mine.filter((k) => fPos(k) === pos).length >= CAP[pos]) return false;
  // flex: at most 3 RB + WR + TE beyond the required starters
  const flexOk = mine.filter((k) => ['RB', 'WR', 'TE'].includes(fPos(k))).length < 6;
  return pos === 'QB' || pos === 'DST' || flexOk;
};
/** Value over replacement: his rest-of-season projection minus the 10th best at the position (QB 12th), the CPU's board. */
export const boardOf = (cands: Cand[]) => {
  const rep: Record<string, number> = {};
  (['QB', 'RB', 'WR', 'TE', 'DST'] as const).forEach((pos) => {
    const v = cands.filter((c) => c.pos === pos).map((c) => c.value).sort((a, b) => b - a);
    rep[pos] = v[Math.min(v.length - 1, pos === 'QB' ? 11 : pos === 'DST' ? 9 : pos === 'TE' ? 9 : 17)] ?? 0;
  });
  return cands.map((c) => ({ ...c, vorp: c.value - rep[c.pos] })).sort((a, b) => b.vorp - a.vorp);
};
export const cpuPick = (d: DraftState, board: ReturnType<typeof boardOf>, team: number): string | null => {
  const taken = new Set(d.picks.map((p) => p.key));
  const r = rng(d.seed + d.picks.length * 7919);
  const open = board.filter((c) => !taken.has(c.key) && canDraft(d, team, c.key)).slice(0, 6);
  if (!open.length) return null;
  // mostly the best value, sometimes the next man (every owner has a taste)
  const i = r() < 0.62 ? 0 : r() < 0.6 ? 1 : r() < 0.6 ? 2 : Math.min(open.length - 1, 3);
  return open[Math.min(i, open.length - 1)].key;
};
/** Put a drafted squad into the lineup slots: the best back / receiver / end fill their slots, the next best the FLEX. */
export const lineupFromPicks = (keys: string[], value: (k: string) => number): FLineup => {
  const by = (pos: string) => keys.filter((k) => fPos(k) === pos).sort((a, b) => value(b) - value(a));
  const l: FLineup = {};
  const qb = by('QB')[0];
  const rbs = by('RB');
  const wrs = by('WR');
  const tes = by('TE');
  if (qb) l.qb = qb;
  if (rbs[0]) l.rb1 = rbs[0];
  if (rbs[1]) l.rb2 = rbs[1];
  if (wrs[0]) l.wr1 = wrs[0];
  if (wrs[1]) l.wr2 = wrs[1];
  if (tes[0]) l.te1 = tes[0];
  const flex = [rbs[2], wrs[2], tes[1]].filter(Boolean).sort((a, b) => value(b) - value(a))[0];
  if (flex) l.flex = flex;
  const dst = by('DST')[0];
  if (dst) l.dst = dst;
  return l;
};

// ---------- Replay: what the lineup actually scored this season ----------

export interface WeekLine {
  week: number;
  /** points by slot id */
  slots: Record<string, number>;
  total: number;
  bye: string[];
}
/** `logs`: key → his game log. A week where he has no game is 0 (bye, inactive). Season = lab.season. */
export const replay = (lab: LabFile, l: FLineup, logs: Map<string, GameLog | null | undefined>, scoring: Scoring, throughWeek: number): WeekLine[] => {
  const rows = new Map<string, Map<number, number>>();
  Object.values(l).filter((k) => k && !k.startsWith('DST:')).forEach((k) => {
    const m = new Map<number, number>();
    rowsOf(logs.get(k)).forEach((r) => {
      if (r.season === lab.season && r.type === 'REG') m.set(Number(r.week), rowPoints(r, scoring));
    });
    rows.set(k, m);
  });
  const out: WeekLine[] = [];
  for (let w = 1; w <= throughWeek; w += 1) {
    const slots: Record<string, number> = {};
    const bye: string[] = [];
    FANTASY_IDS.forEach((id) => {
      const k = l[id];
      if (!k) return;
      if (k.startsWith('DST:')) {
        const row = (lab.dst[k.slice(4)] ?? []).find((x) => x[0] === w);
        if (row) slots[id] = dstPoints(row);
        else bye.push(id);
      } else {
        const v = rows.get(k)?.get(w);
        if (v == null) bye.push(id);
        else slots[id] = v;
      }
    });
    out.push({ week: w, slots, total: Object.values(slots).reduce((a, b) => a + b, 0), bye });
  }
  return out;
};
