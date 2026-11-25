import { isFantasyPos, leagueAllowedMean, MATCHUP_DAMP, type FanRaw, type FanRec, type FPos } from '@/utils/fantasy';

/**
 * Fantasy trade simulator engine (pure, no React). Every figure is a rule over public/data/nfl/fantasy.json
 * (scripts/nfl/fantasy.py): weekly nflverse lines, usage, league rates and the remaining schedule. Nothing is tuned per
 * player; the only constants are league-structure rules listed in TRADE_RULES (and shown in the page's (i)).
 *
 *   weekly projection   blend of last 3, season (shrunk to the league's points per player-game) and usage (opportunities a
 *                       game x the league's points per opportunity); the season and last-3 terms regress their TD points
 *                       toward the league TD rate per opportunity.
 *   ROS                 the projection x each remaining week's matchup factor (capped +-15%) x availability (bye 0, injury status).
 *   VOR                 weighted ROS minus the replacement level at the position (the last starter once the league's starting
 *                       slots, FLEX and superflex are filled from the pool by that same measure).
 *   side value          a convex "stud premium" of VOR (exponent STUD_EXP, in points) plus a roster-spot credit.
 *   verdict             the gap between the two sides' net, within 5% Fair, 5-15% Leans, over 15% Lopsided.
 */
export type ScoringKind = 'ppr' | 'half' | 'std';
export const SCORING_KINDS: ScoringKind[] = ['ppr', 'half', 'std'];
export const SCORING_LABEL: Record<ScoringKind, string> = { ppr: 'PPR', half: 'Half PPR', std: 'Standard' };
export const REC_POINTS: Record<ScoringKind, number> = { ppr: 1, half: 0.5, std: 0 };
export const TE_PREMIUM_POINTS = 0.5;

export interface TradeSettings {
  scoring: ScoringKind;
  teams: 10 | 12 | 14;
  superflex: boolean;
  tePremium: boolean;
  /** weight on fantasy playoff weeks 15-17 (1 = off) */
  playoffWeight: 1 | 1.5 | 2;
}
export const DEFAULT_SETTINGS: TradeSettings = { scoring: 'ppr', teams: 12, superflex: false, tePremium: false, playoffWeight: 1.5 };

export const TRADE_RULES = {
  /** games of prior weight when shrinking a small sample toward the bench tier (the regulars just below the starters) at his position */
  priorGames: 2,
  /** role: the club's last games he is counted against, and the share of them that makes a full-time role */
  roleGames: 4,
  roleFull: 0.75,
  /** weight of the recent share against the season share in his role */
  roleRecent: 0.6,
  /** a player's value never falls below 0 (a player below replacement is dropped, not paid for) */
  valueFloor: 0,
  /** games of prior weight for TD points (a TD rate takes far longer to settle than yards and catches) */
  tdPriorGames: 8,
  wRecent: 0.35,
  wSeason: 0.4,
  wUsage: 0.25,
  /** QB: a game's points swing widely (sd about 9) and points per opportunity vary by player (rushers), so the blend leans on the season: last 3 / season / usage, and TD points regress more slowly */
  wRecentQB: 0.1,
  wSeasonQB: 0.8,
  wUsageQB: 0.1,
  tdPriorGamesQB: 3,
  /** cap on the matchup factor either way */
  matchupCap: 0.15,
  playoffWeeks: [15, 16, 17],
  lastWeek: 18,
  benchPerTeam: 6,
  /** convex stud premium: value = s * (VOR / s)^exp, s = the mean VOR of the league's starters */
  studExp: 1.25,
  /** IR keeps a player out at least this many games */
  irGames: 4,
  /** small sample: fewer games than this, or fewer than half his club's */
  smallSample: 4,
} as const;

/** Method notes for the page's (i), kept next to the formulas they describe. */
export const TRADE_METHOD_NOTES = {
  projection: 'Per-game rate: last 3 games, the season (a small sample shrinks toward the bench tier, the regulars just below the starters) and usage (opportunities x the league rate), TD points regressed to the league rate. A QB leans on the season (last 3 and usage count less, TDs regress more slowly).',
  role: 'Scaled by his role: the share of his club\'s recent games he plays (3 of 4 is full-time; a player on the injury report counts only the games up to his last appearance). Backups and benched players project near zero.',
  rates: 'Start-worthy, boom and bust: weekly finishes at his position with every player\'s week rescored under the chosen scoring (top 12 QB/TE or 24 RB/WR start; top half of that booms; worse than 1.5x busts).',
  ros: 'Rest of season: the rate x each week\'s matchup (capped 15%) x availability (bye 0, IR out 4 games, Out 1, Doubtful 25%, Questionable 90%), playoff weeks weighted.',
  vor: 'VOR: weighted ROS minus the replacement level, the last starter at his position once the league\'s slots, FLEX and superflex are filled by that same measure.',
  value: 'Value: a convex stud premium of VOR, never below 0 (a player below replacement can be dropped), plus a roster-spot credit for each extra player given.',
  verdict: 'Verdict: the gap between the sides\' net as a share of the larger side (at least one average starter): under 5% Fair, 5-15% Leans, over 15% Lopsided.',
} as const;

/** Weekly-finish thresholds (as fantasy.py): start-worthy = top N at the position, boom = top N/2, bust = worse than 1.5 N. */
export const START_N: Record<FPos, number> = { QB: 12, TE: 12, RB: 24, WR: 24 };

export const STARTERS: Record<FPos, number> = { QB: 1, RB: 2, WR: 2, TE: 1 };

export type Status = 'IR' | 'Out' | 'Doubtful' | 'Questionable';
export const AVAIL_NOTE: Record<Status, string> = {
  IR: `misses his next ${TRADE_RULES.irGames} games (the IR minimum)`,
  Out: 'misses his next game',
  Doubtful: 'next game counted at 25%',
  Questionable: 'next game counted at 90%',
};

export interface WeekProj {
  week: number;
  opp: string | null;
  home: boolean;
  /** PPR his opponent allows a game to his position */
  allowed: number | null;
  /** opponent factor (1 = league average), capped */
  k: number;
  rank: number | null;
  avail: number;
  /** projected points, matchup and availability applied */
  proj: number;
  playoff: boolean;
}

export type FlagKind = 'injury' | 'sample' | 'td' | 'sched-hard' | 'sched-soft' | 'bye' | 'age';
export interface Flag { kind: FlagKind; text: string; tone: 'bad' | 'warn' | 'good' | 'info' }

export interface TradePlayer {
  key: string;
  name: string;
  pos: FPos;
  club: string;
  rec: FanRec;
  g: number;
  clubGames: number;
  /** season points per game, scored under the settings */
  ppg: number;
  l3: number | null;
  p3: number | null;
  /** weekly finish at his position under the settings (rescored with every player's week lines): games start-worthy / boom / bust and their rates */
  sw: number;
  bm: number;
  bu: number;
  startRate: number;
  boomRate: number;
  bustRate: number;
  /** floor / median / ceiling: 25th, 50th, 75th percentile of his scored weeks */
  fl: number | null;
  md: number | null;
  ce: number | null;
  /** shrunk season, usage-implied, TD-regressed pieces of the blend, and the blend */
  seasonShrunk: number;
  /** share of his club's recent games he plays (1 = full-time role); the projection is scaled by it */
  role: number;
  usage: number | null;
  tdObs: number;
  tdExp: number;
  tdReg: number;
  base: number;
  weeks: WeekProj[];
  /** points over the remaining weeks (raw) and the weeks 15-17 part (raw) */
  ros: number;
  po: number;
  /** ROS with the playoff weeks weighted, the measure VOR and ranks use */
  rosW: number;
  vor: number;
  /** stud-premium value of his VOR */
  value: number;
  posRank: number;
  status: Status | null;
  /** points per opportunity under the settings */
  ppo: number | null;
  flags: Flag[];
}

export interface TradeModel {
  settings: TradeSettings;
  week: number;
  season: number;
  players: Map<string, TradePlayer>;
  /** sorted best first by rosW */
  ranked: TradePlayer[];
  replacement: Record<FPos, number>;
  /** the last starter's rank at each position, and how many of them are flex / superflex fills */
  starters: Record<FPos, number>;
  scale: number;
  /** the best player outside every roster: his VOR (floored at 0) credits a roster spot */
  freeAgent: { key: string | null; vor: number; credit: number };
  weeks: number[];
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const pct = (xs: number[], q: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = (s.length - 1) * q;
  const lo = Math.floor(k);
  const hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (k - lo);
};

/** One week's points under the settings, from the PPR line and his receptions. */
export const scoreWeek = (ppr: number, rec: number, pos: FPos, s: TradeSettings) =>
  ppr + (REC_POINTS[s.scoring] - 1) * rec + (s.tePremium && pos === 'TE' ? TE_PREMIUM_POINTS * rec : 0);

const keyName = (key: string) => key.slice(key.indexOf(':') + 1);

/** Replacement level, the VOR scale and the free agent, from the pool already carrying rosW. */
const levelPool = (pool: TradePlayer[], s: TradeSettings) => {
  const T = s.teams;
  const byPos: Record<FPos, TradePlayer[]> = { QB: [], RB: [], WR: [], TE: [] };
  [...pool].sort((a, b) => b.rosW - a.rosW || a.key.localeCompare(b.key)).forEach((p) => byPos[p.pos].push(p));
  const taken: Record<FPos, number> = { QB: STARTERS.QB * T, RB: STARTERS.RB * T, WR: STARTERS.WR * T, TE: STARTERS.TE * T };
  const rest = () => (Object.keys(byPos) as FPos[]).flatMap((pos) => byPos[pos].slice(taken[pos]));
  const fill = (n: number, eligible: FPos[]) => {
    for (let i = 0; i < n; i++) {
      const best = rest().filter((p) => eligible.includes(p.pos)).sort((a, b) => b.rosW - a.rosW)[0];
      if (best) taken[best.pos]++;
    }
  };
  fill(T, ['RB', 'WR', 'TE']); // FLEX
  if (s.superflex) fill(T, ['QB', 'RB', 'WR', 'TE']);
  const replacement = {} as Record<FPos, number>;
  (Object.keys(byPos) as FPos[]).forEach((pos) => {
    const list = byPos[pos];
    replacement[pos] = list.length ? list[Math.min(Math.max(taken[pos], 1), list.length) - 1].rosW : 0;
  });
  const starters = { ...taken };
  // bench: the best remaining players fill TRADE_RULES.benchPerTeam spots a team (QBs only in superflex)
  fill(T * TRADE_RULES.benchPerTeam, s.superflex ? ['QB', 'RB', 'WR', 'TE'] : ['RB', 'WR', 'TE']);
  const fa = rest().filter((p) => (s.superflex ? true : p.pos !== 'QB')).sort((a, b) => b.rosW - a.rosW)[0];
  return { byPos, taken: starters, replacement, fa };
};

export const buildTradeModel = (raw: FanRaw, s: TradeSettings, statusOf: (key: string) => Status | undefined): TradeModel => {
  const lastWeek = raw.week;
  const R = TRADE_RULES;
  const clubGames = (club: string) => raw.d[club]?.QB?.[2] ?? lastWeek;
  const weeksAll = new Set<number>();

  // league points per player-game and per opportunity, rescored
  const lgPo = {} as Record<FPos, number>;
  const lgTd = {} as Record<FPos, number>;
  (['QB', 'RB', 'WR', 'TE'] as FPos[]).forEach((pos) => {
    const l = raw.lg[pos];
    lgPo[pos] = l.po + (REC_POINTS[s.scoring] - 1) * l.rpo + (s.tePremium && pos === 'TE' ? TE_PREMIUM_POINTS * l.rpo : 0);
    lgTd[pos] = l.tpo;
  });
  // role: the share of his club's last games he appears in (a player on the injury report: the share of the games he played up to his last appearance, his
  // availability is counted week by week below), 3 of 4 or more is a full-time role
  const played = (club: string) => {
    const bye = raw.n[club]?.bye ?? null;
    const ws: number[] = [];
    for (let w = 1; w <= lastWeek; w++) if (w !== bye) ws.push(w);
    return ws;
  };
  const roleOf = (rec: FanRec, st: Status | null) => {
    const cw = played(rec.c);
    if (!cw.length) return 1;
    const mine = new Set(rec.w.map((x) => x[0]));
    const last = cw.slice(-R.roleGames);
    const recent = last.filter((w) => mine.has(w)).length / last.length;
    const season = cw.filter((w) => mine.has(w)).length / cw.length;
    // on the injury report: the role is the share of games he played up to his last appearance (the healthy weeks); the
    // weeks he is out are the availability's job, so they are not counted twice
    const lastSeen = Math.max(0, ...mine);
    const healthy = cw.filter((w) => w <= lastSeen);
    const healthyShare = healthy.length ? healthy.filter((w) => mine.has(w)).length / healthy.length : 0;
    const share = st ? healthyShare : R.roleRecent * recent + (1 - R.roleRecent) * season;
    return clamp(share / R.roleFull, 0, 1);
  };
  const scored = new Map<string, number[]>();
  const roles = new Map<string, number>();
  const reg: Record<FPos, { key: string; ppg: number; og: number | null }[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const [key, rec] of Object.entries(raw.p)) {
    const pos = key.slice(0, key.indexOf(':'));
    if (!isFantasyPos(pos) || !rec.wr) continue;
    const pts = rec.w.map((w, i) => scoreWeek(w[1], rec.wr?.[i] ?? 0, pos, s));
    scored.set(key, pts);
    const role = roleOf(rec, statusOf(key) ?? null);
    roles.set(key, role);
    if (pts.length >= R.smallSample && role >= 1) reg[pos].push({ key, ppg: pts.reduce((a, b) => a + b, 0) / pts.length, og: rec.ot != null ? rec.ot / pts.length : null });
  }
  // weekly finishes under the chosen scoring: every player's line that week at the position, competition ranking (as fantasy.py)
  const pool = new Map<string, number[]>();
  for (const [key, pts] of scored) {
    const pos = key.slice(0, key.indexOf(':'));
    raw.p[key].w.forEach((w, i) => {
      const k = `${w[0]}|${pos}`;
      (pool.get(k) ?? pool.set(k, []).get(k)!).push(pts[i]);
    });
  }
  pool.forEach((v) => v.sort((a, b) => b - a));
  const finishOf = (week: number, pos: FPos, x: number) => {
    const v = pool.get(`${week}|${pos}`) ?? [];
    let lo = 0, hi = v.length; // first index with v <= x = the number of players who scored more
    while (lo < hi) { const mid = (lo + hi) >> 1; if (v[mid] > x) lo = mid + 1; else hi = mid; }
    return lo + 1;
  };
  // the prior: the bench tier, the regulars ranked just below the league's starters (points and opportunities a game)
  const prior = {} as Record<FPos, { ppg: number; og: number | null }>;
  (['QB', 'RB', 'WR', 'TE'] as FPos[]).forEach((pos) => {
    const sorted = reg[pos].sort((a, b) => b.ppg - a.ppg || a.key.localeCompare(b.key));
    const from = Math.min(STARTERS[pos] * s.teams, Math.max(0, sorted.length - 1));
    const tier = sorted.slice(from, from + s.teams);
    const ogs = tier.filter((t) => t.og != null).map((t) => t.og as number);
    prior[pos] = { ppg: tier.length ? tier.reduce((a, t) => a + t.ppg, 0) / tier.length : 0, og: ogs.length ? ogs.reduce((a, b) => a + b, 0) / ogs.length : null };
  });
  const lgAllowed = {} as Record<FPos, number>;
  (['QB', 'RB', 'WR', 'TE'] as FPos[]).forEach((p) => (lgAllowed[p] = leagueAllowedMean(raw, p)));

  const all: TradePlayer[] = [];
  for (const [key, rec] of Object.entries(raw.p)) {
    const pos = key.slice(0, key.indexOf(':'));
    const pts = scored.get(key);
    if (!isFantasyPos(pos) || !pts || !pts.length) continue;
    const g = pts.length;
    const tot = pts.reduce((a, b) => a + b, 0);
    const ppg = tot / g;
    const shrunk = (g * ppg + R.priorGames * prior[pos].ppg) / (g + R.priorGames);
    const ogRaw = rec.ot != null ? rec.ot / g : null;
    const ogPrior = prior[pos].og;
    // opportunities a game shrink the same way, so one busy game does not make a role
    const og = ogRaw != null && ogPrior != null ? (g * ogRaw + R.priorGames * ogPrior) / (g + R.priorGames) : ogRaw;
    const usage = og != null ? og * lgPo[pos] : null;
    // TD regression
    const tdObs = (rec.tp ?? 0) / g;
    const tdExp = (og ?? 0) * lgTd[pos];
    const lam = g / (g + (pos === 'QB' ? R.tdPriorGamesQB : R.tdPriorGames));
    const tdReg = lam * tdObs + (1 - lam) * tdExp;
    const adj = tdObs - tdReg;
    const l3raw = g >= 3 ? pts.slice(-3).reduce((a, b) => a + b, 0) / 3 : null;
    const p3raw = g >= 6 ? pts.slice(-6, -3).reduce((a, b) => a + b, 0) / 3 : null;
    const season = Math.max(0, shrunk - adj);
    const recent = l3raw != null ? Math.max(0, l3raw - adj) : null;
    const qb = pos === 'QB';
    const wR = recent != null ? (qb ? R.wRecentQB : R.wRecent) : 0;
    const wS = qb ? R.wSeasonQB : R.wSeason;
    const wU = usage != null ? (qb ? R.wUsageQB : R.wUsage) : 0;
    const role = roles.get(key) ?? 1;
    // a rate while he plays, times his role: a backup or a player not playing recently projects near zero
    const base = role * (wR * (recent ?? 0) + wS * season + wU * (usage ?? 0)) / (wR + wS + wU);
    // remaining schedule
    const slots = raw.n[rec.c]?.rm ?? [];
    const st = statusOf(key) ?? null;
    let gameIdx = 0;
    const weeks: WeekProj[] = slots.map(([week, opp, hm]) => {
      weeksAll.add(week);
      let avail = 1;
      if (opp) {
        if (st === 'IR') avail = gameIdx < R.irGames ? 0 : 1;
        else if (gameIdx === 0) avail = st === 'Out' ? 0 : st === 'Doubtful' ? 0.25 : st === 'Questionable' ? 0.9 : 1;
        gameIdx++;
      } else avail = 0;
      const dd = opp ? raw.d[opp]?.[pos] : undefined;
      const k = opp && dd && lgAllowed[pos] > 0 ? clamp(1 + MATCHUP_DAMP * (dd[0] / lgAllowed[pos] - 1), 1 - R.matchupCap, 1 + R.matchupCap) : 1;
      return { week, opp, home: hm === 1, allowed: dd ? dd[0] : null, k, rank: dd ? dd[1] : null, avail, proj: opp ? base * k * avail : 0, playoff: (R.playoffWeeks as readonly number[]).includes(week) };
    });
    const ros = weeks.reduce((a, w) => a + w.proj, 0);
    const po = weeks.filter((w) => w.playoff).reduce((a, w) => a + w.proj, 0);
    const rosW = weeks.reduce((a, w) => a + w.proj * (w.playoff ? s.playoffWeight : 1), 0);
    const opps = rec.ot ?? 0;
    const N = START_N[pos];
    const fin = rec.w.map((w, i) => finishOf(w[0], pos, pts[i]));
    const sw = fin.filter((x) => x <= N).length, bm = fin.filter((x) => x <= N / 2).length, bu = fin.filter((x) => x > 1.5 * N).length;
    all.push({
      sw, bm, bu, startRate: sw / g, boomRate: bm / g, bustRate: bu / g,
      key, name: keyName(key), pos, club: rec.c, rec, g, clubGames: clubGames(rec.c), ppg, l3: l3raw, p3: p3raw,
      fl: g >= 3 ? pct(pts, 0.25) : null, md: g >= 3 ? pct(pts, 0.5) : null, ce: g >= 3 ? pct(pts, 0.75) : null,
      seasonShrunk: season, role, usage, tdObs, tdExp, tdReg, base, weeks, ros, po, rosW, vor: 0, value: 0, posRank: 0,
      status: st, ppo: opps ? tot / opps : null, flags: [],
    });
  }

  const { byPos, taken, replacement, fa } = levelPool(all, s);
  all.forEach((p) => (p.vor = p.rosW - replacement[p.pos]));
  const starterVors = (Object.keys(byPos) as FPos[]).flatMap((pos) => byPos[pos].slice(0, taken[pos]).map((p) => p.vor)).filter((v) => v > 0);
  const scale = starterVors.length ? starterVors.reduce((a, b) => a + b, 0) / starterVors.length : 1;
  const stud = (v: number) => (v > 0 ? scale * Math.pow(v / scale, R.studExp) : R.valueFloor);
  all.forEach((p) => (p.value = stud(p.vor)));
  (Object.keys(byPos) as FPos[]).forEach((pos) => byPos[pos].forEach((p, i) => (p.posRank = i + 1)));
  const ranked = [...all].sort((a, b) => b.rosW - a.rosW || a.key.localeCompare(b.key));
  const faVor = fa ? Math.max(0, fa.rosW - replacement[fa.pos]) : 0;
  return {
    settings: s, week: lastWeek, season: raw.season, players: new Map(all.map((p) => [p.key, p])), ranked, replacement,
    starters: taken, scale, freeAgent: { key: fa?.key ?? null, vor: faVor, credit: faVor }, weeks: [...weeksAll].sort((a, b) => a - b),
  };
};

/** The context flags (display only, never in the score). `age` comes from bio.json. */
export const flagsFor = (p: TradePlayer, age: number | null): Flag[] => {
  const R = TRADE_RULES;
  const out: Flag[] = [];
  if (p.status) out.push({ kind: 'injury', text: p.status === 'IR' ? 'IR' : p.status, tone: p.status === 'Questionable' ? 'warn' : 'bad' });
  if (p.g < R.smallSample || p.g * 2 < p.clubGames) out.push({ kind: 'sample', text: `${p.g} game${p.g === 1 ? '' : 's'}`, tone: 'warn' });
  if (p.g >= R.smallSample && p.tdExp > 0 && p.tdObs - p.tdExp >= 1 && p.tdObs / p.tdExp >= 1.3) out.push({ kind: 'td', text: 'TD luck', tone: 'warn' });
  const pw = p.weeks.filter((w) => w.playoff && w.opp);
  if (pw.length) {
    const mean = pw.reduce((a, w) => a + w.k, 0) / pw.length;
    if (mean >= 1.04) out.push({ kind: 'sched-soft', text: 'Soft playoffs', tone: 'good' });
    else if (mean <= 0.96) out.push({ kind: 'sched-hard', text: 'Tough playoffs', tone: 'bad' });
  }
  const byeWeek = p.weeks.find((w) => w.playoff && !w.opp);
  if (byeWeek) out.push({ kind: 'bye', text: `Bye wk ${byeWeek.week}`, tone: 'bad' });
  if (age != null) out.push({ kind: 'age', text: `Age ${age}`, tone: 'info' });
  return out;
};

// ---- lineups (roster mode) ------------------------------------------------------------------------------------------------

const weekProj = (p: TradePlayer, week: number) => p.weeks.find((w) => w.week === week)?.proj ?? 0;
export const SLOT_NAMES = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'] as const;

/** The best lineup for one week: QB, 2 RB, 2 WR, TE, FLEX (RB/WR/TE), plus a superflex slot (any of the four) when on. */
export const bestLineup = (players: TradePlayer[], week: number, superflex: boolean) => {
  const used = new Set<string>();
  const picks: { slot: string; p: TradePlayer; pts: number }[] = [];
  const take = (slot: string, ok: (p: TradePlayer) => boolean) => {
    const c = players.filter((p) => !used.has(p.key) && ok(p)).sort((a, b) => weekProj(b, week) - weekProj(a, week) || a.key.localeCompare(b.key))[0];
    if (c) { used.add(c.key); picks.push({ slot, p: c, pts: weekProj(c, week) }); }
  };
  (Object.keys(STARTERS) as FPos[]).forEach((pos) => { for (let i = 0; i < STARTERS[pos]; i++) take(pos, (p) => p.pos === pos); });
  take('FLEX', (p) => p.pos !== 'QB');
  if (superflex) take('SF', () => true);
  return { total: picks.reduce((a, x) => a + x.pts, 0), picks };
};

export const lineupSeries = (players: TradePlayer[], weeks: number[], s: TradeSettings) =>
  weeks.map((w) => bestLineup(players, w, s.superflex).total);

/** Playoff-weighted total of a weekly series. */
export const weighted = (series: number[], weeks: number[], s: TradeSettings) =>
  series.reduce((a, v, i) => a + v * ((TRADE_RULES.playoffWeeks as readonly number[]).includes(weeks[i]) ? s.playoffWeight : 1), 0);

// ---- the trade ------------------------------------------------------------------------------------------------------------

export interface OutPlayer { key: string; /** index of the team receiving him */ to: number }
export interface TradeTeam { give: OutPlayer[]; /** rest of the roster, only in roster mode */ roster: string[] }

export type Verdict = 'Fair' | 'Leans' | 'Lopsided' | 'Empty';
export interface TeamResult {
  sent: TradePlayer[];
  received: TradePlayer[];
  sentValue: number;
  receivedValue: number;
  sentVor: number;
  receivedVor: number;
  sentRos: number;
  receivedRos: number;
  sentPo: number;
  receivedPo: number;
  /** roster-spot credit: players given beyond players received, each at the best unrostered player's VOR */
  spots: number;
  credit: number;
  /** net change: received value + credit - sent value, or in roster mode the lineup's weighted ROS change */
  net: number;
  /** roster mode */
  lineup?: { before: number[]; after: number[]; beforeW: number; afterW: number };
  /** weekly points of what he gives and gets (the drawer's lines when no roster is entered) */
  weeklyGive: number[];
  weeklyGet: number[];
}
export interface TradeResult {
  teams: TeamResult[];
  /** gap as a share, 0..1 */
  gap: number;
  verdict: Verdict;
  /** index of the team that comes out ahead (null when empty or level) */
  winner: number | null;
  rosterMode: boolean;
}

export const FAIR_PCT = 5;
export const LEAN_PCT = 15;
export const verdictOf = (gapPct: number, empty = false): Verdict => (empty ? 'Empty' : gapPct < FAIR_PCT ? 'Fair' : gapPct < LEAN_PCT ? 'Leans' : 'Lopsided');

/** The yardstick of a gap: the larger side's value, never below one average starter's VOR, so near-replacement swaps stay Fair. */
export const gapNorm = (scale: number, ...sides: number[]) => Math.max(scale, ...sides);

export const evaluateTrade = (m: TradeModel, teams: TradeTeam[], rosterMode: boolean): TradeResult => {
  const get = (k: string) => m.players.get(k);
  const sumW = (ps: TradePlayer[]) => m.weeks.map((w) => ps.reduce((a, p) => a + weekProj(p, w), 0));
  const results: TeamResult[] = teams.map((t, i) => {
    const sent = t.give.map((g) => get(g.key)).filter((p): p is TradePlayer => !!p);
    const received = teams.flatMap((o, j) => (j === i ? [] : o.give.filter((g) => g.to === i).map((g) => get(g.key)))).filter((p): p is TradePlayer => !!p);
    const sum = (ps: TradePlayer[], f: (p: TradePlayer) => number) => ps.reduce((a, p) => a + f(p), 0);
    const spots = Math.max(0, sent.length - received.length);
    const credit = spots * m.freeAgent.credit;
    const sentValue = sum(sent, (p) => p.value);
    const receivedValue = sum(received, (p) => p.value);
    const r: TeamResult = {
      sent, received, sentValue, receivedValue, sentVor: sum(sent, (p) => Math.max(0, p.vor)), receivedVor: sum(received, (p) => Math.max(0, p.vor)),
      sentRos: sum(sent, (p) => p.ros), receivedRos: sum(received, (p) => p.ros), sentPo: sum(sent, (p) => p.po), receivedPo: sum(received, (p) => p.po),
      spots, credit, net: receivedValue + credit - sentValue, weeklyGive: sumW(sent), weeklyGet: sumW(received),
    };
    if (rosterMode) {
      const rest = t.roster.map(get).filter((p): p is TradePlayer => !!p && !sent.some((s) => s.key === p.key));
      const before = lineupSeries([...rest, ...sent], m.weeks, m.settings);
      const after = lineupSeries([...rest, ...received], m.weeks, m.settings);
      const beforeW = weighted(before, m.weeks, m.settings);
      const afterW = weighted(after, m.weeks, m.settings);
      r.lineup = { before, after, beforeW, afterW };
      r.net = afterW - beforeW;
    }
    return r;
  });
  const moved = results.some((r) => r.sent.length || r.received.length);
  const nets = results.map((r) => r.net);
  const norm = gapNorm(m.scale, ...results.map((r) => (rosterMode ? Math.max(r.sentVor, r.receivedVor) : Math.max(r.sentValue, r.receivedValue))));
  const gap = moved ? (Math.max(...nets) - Math.min(...nets)) / (2 * norm) : 0;
  const top = nets.indexOf(Math.max(...nets));
  const level = Math.max(...nets) - Math.min(...nets) < 1e-9;
  return { teams: results, gap, verdict: verdictOf(gap * 100, !moved), winner: moved && !level ? top : null, rosterMode };
};

// ---- Suggest a partner ----------------------------------------------------------------------------------------------------

export interface Package { keys: string[]; value: number; credit: number; gap: number; lean: 'give' | 'get' | null }

/** The pool each package size draws from (best rest-of-season first): bigger packages search fewer candidates so the count of combinations stays bounded. */
export const OFFER_POOL: Record<number, number> = { 1: 90, 2: 70, 3: 60, 4: 50 };
/** The largest package the finder builds (any number of players can still be traded by hand; this only bounds the search). */
export const OFFER_MAX_SIZE = 4;

const offerMemo = new WeakMap<TradeModel, Map<string, Package[]>>();

/**
 * Fair packages for what one side gives, any size from 1 to OFFER_MAX_SIZE. For a package of k players the fair total
 * is v* = gv + (getter credit - giver credit) / 2, and its gap is |v - v*| / max(one average starter, both sides), so the
 * players within the band are found by a depth-first walk over the pool (sorted by value, with the running sum pruned
 * against the band using prefix sums) instead of by listing every combination. Results are memoised per model, so
 * flipping the toggles never searches twice. The partner's package is worth value + the roster-spot credit for the
 * side that sends more players.
 *
 * opts: pos (every player at that position), sizes (default [1, 2]), maxGap (share, default 0.25), exclude, limit
 * (default 12; Infinity for all), sort ('gap' fairest first, 'value' most value first), pool (players searched for 1-2).
 */
export const suggestPartner = (
  m: TradeModel,
  giveKeys: string[],
  opts: { pos?: FPos | null; exclude?: string[]; limit?: number; pool?: number; sizes?: number[]; maxGap?: number; sort?: 'gap' | 'value' } = {},
): Package[] => {
  const give = giveKeys.map((k) => m.players.get(k)).filter((p): p is TradePlayer => !!p);
  if (!give.length) return [];
  const maxGap = opts.maxGap ?? 0.25;
  const sizes = [...new Set(opts.sizes ?? [1, 2])].filter((k) => k >= 1 && k <= OFFER_MAX_SIZE).sort((a, b) => a - b);
  const memo = offerMemo.get(m) ?? offerMemo.set(m, new Map()).get(m)!;
  const base = `${[...giveKeys].sort().join(',')}|${[...(opts.exclude ?? [])].sort().join(',')}|${opts.pos ?? ''}|${maxGap}|${opts.pool ?? ''}`;
  const out: Package[] = [];
  for (const k of sizes) {
    const id = `${base}|${k}`;
    let found = memo.get(id);
    if (!found) memo.set(id, (found = packagesOfSize(m, give, k, { ...opts, maxGap })));
    out.push(...found);
  }
  const by = opts.sort === 'value' ? (a: Package, b: Package) => b.value - a.value || a.gap - b.gap : (a: Package, b: Package) => a.gap - b.gap || b.value - a.value;
  out.sort(by);
  return out.length > (opts.limit ?? 12) ? out.slice(0, opts.limit ?? 12) : out;
};

const packagesOfSize = (m: TradeModel, give: TradePlayer[], k: number, opts: { pos?: FPos | null; exclude?: string[]; pool?: number; maxGap: number }): Package[] => {
  const gv = give.reduce((a, p) => a + p.value, 0);
  const skip = new Set([...give.map((p) => p.key), ...(opts.exclude ?? [])]);
  const size = k <= 2 && opts.pool ? opts.pool : OFFER_POOL[k] ?? 50;
  const pool = m.ranked.filter((p) => !skip.has(p.key) && p.vor > 0 && p.status !== 'IR' && (!opts.pos || p.pos === opts.pos)).slice(0, size).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  if (pool.length < k) return [];
  const credit = m.freeAgent.credit;
  const giverCredit = Math.max(0, give.length - k) * credit;
  const getterCredit = Math.max(0, k - give.length) * credit;
  const vStar = gv + (getterCredit - giverCredit) / 2;
  const lo = vStar - opts.maxGap * Math.max(m.scale, gv, vStar);
  const hi = Math.max(vStar + opts.maxGap * Math.max(m.scale, gv), vStar / (1 - opts.maxGap));
  const vals = pool.map((p) => p.value);
  const n = vals.length;
  // prefix[i] = sum of vals[0..i-1]; the best r remaining from i are vals[i..i+r-1] (the pool is sorted down), the worst r are the last r
  const prefix = [0];
  vals.forEach((v) => prefix.push(prefix[prefix.length - 1] + v));
  const out: Package[] = [];
  const pick: number[] = [];
  const walk = (from: number, left: number, sum: number) => {
    if (left === 0) {
      if (sum < lo || sum > hi) return;
      const ps = pick.map((i) => pool[i]);
      const a = sum + giverCredit - gv; // the giver's net
      const b = gv + getterCredit - sum; // the partner's net
      const gap = Math.abs(a - b) / (2 * gapNorm(m.scale, gv, sum));
      if (gap < opts.maxGap) out.push({ keys: ps.map((p) => p.key), value: sum, credit: getterCredit - giverCredit, gap, lean: gap < 0.005 ? null : a > b ? 'give' : 'get' });
      return;
    }
    const worst = prefix[n] - prefix[n - left];
    if (sum + worst > hi) return; // even the cheapest finish overshoots, and so does every later start
    for (let i = from; i <= n - left; i++) {
      const best = prefix[i + left] - prefix[i];
      if (sum + best < lo) return; // the dearest finish from here is too cheap, so is every later start
      pick.push(i);
      walk(i + 1, left - 1, sum + vals[i]);
      pick.pop();
    }
  };
  walk(0, k, 0);
  return out;
};
