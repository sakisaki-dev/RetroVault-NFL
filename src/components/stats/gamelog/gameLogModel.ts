import type { GameLog, GameRow } from '@/utils/gameLogs';
import { rowsOf } from '@/utils/gameLogs';
import { findNFLTeam } from '@/utils/nflTeams';
import type { Position } from '@/types/player';
import { kickPoints, rowFg } from '@/utils/kicking';

/** Everything the Game log section computes from a per-player log: one parsed game, position rules, splits, streaks, consistency. */
export interface Game {
  i: number;
  season: number;
  week: number;
  post: boolean;
  round: string;
  team: string;
  opp: string;
  date: string;
  month: number;
  home: boolean;
  pf: number;
  pa: number;
  win: boolean | null; // null = tie
  r: GameRow;
  key: number; // the position's key stat
  score: number; // game score (fantasy PPR when present)
}

const ABBR: Record<string, string> = { LA: 'LAR', STL: 'LAR', OAK: 'LV', SD: 'LAC' };
export const teamOf = (abbr: string) => findNFLTeam(ABBR[abbr] ?? abbr);
export const abbrOf = (abbr: string) => ABBR[abbr] ?? abbr;
export const teamHue = (abbr: string) => {
  const t = teamOf(abbr);
  return t ? `hsl(${t.primaryColor})` : 'hsl(var(--line))';
};

const num = (r: GameRow, k: string) => {
  const v = r[k];
  return typeof v === 'number' ? v : 0;
};
export const n = num;

const ROUND = ['Wild Card', 'Divisional', 'Conference', 'Super Bowl'];
export const ROUND_SHORT = ['WC', 'DIV', 'CONF', 'SB'];
export const roundShort = (r: string) => ROUND_SHORT[ROUND.indexOf(r)] ?? r;
const roundOf = (week: number) => ROUND[Math.min(3, Math.max(0, week - 19))];

export interface Col {
  id: string;
  label: string;
  get: (r: GameRow) => number;
  fmt?: (r: GameRow) => string;
}
const tds = (r: GameRow) => num(r, 'passing_tds') + num(r, 'rushing_tds') + num(r, 'receiving_tds');
const tackles = (r: GameRow) => num(r, 'def_tackles_solo') + num(r, 'def_tackle_assists');
const scrim = (r: GameRow) => num(r, 'rushing_yards') + num(r, 'receiving_yards');

export interface Streak {
  id: string;
  label: string;
  test: (g: Game) => boolean;
  skip?: (g: Game) => boolean; // games that don't break the run (e.g. no pass attempts)
}
export interface PosRule {
  keyLabel: string;
  keyShort: string;
  unit: string;
  line: Col[];
  splitCols: Col[];
  streaks: Streak[];
  hasLine: boolean;
}

const C = (id: string, label: string, get: (r: GameRow) => number, fmt?: (r: GameRow) => string): Col => ({ id, label, get, fmt });

export const RULES: Record<Position, PosRule> = {
  QB: {
    keyLabel: 'Fantasy PPR', keyShort: 'PPR', unit: 'pts', hasLine: true,
    line: [
      C('ca', 'C/A', (r) => num(r, 'completions'), (r) => `${num(r, 'completions')}/${num(r, 'attempts')}`),
      C('py', 'PASS YD', (r) => num(r, 'passing_yards')), C('ptd', 'TD', (r) => num(r, 'passing_tds')), C('int', 'INT', (r) => num(r, 'passing_interceptions')),
      C('ry', 'RUSH YD', (r) => num(r, 'rushing_yards')),
    ],
    splitCols: [C('py', 'Pass yd', (r) => num(r, 'passing_yards')), C('td', 'TD', tds), C('ry', 'Rush yd', (r) => num(r, 'rushing_yards'))],
    streaks: [
      { id: 'ptd', label: 'Games with a passing TD', test: (g) => n(g.r, 'passing_tds') > 0, skip: (g) => n(g.r, 'attempts') === 0 },
      { id: 'noint', label: 'Games without an interception', test: (g) => n(g.r, 'passing_interceptions') === 0, skip: (g) => n(g.r, 'attempts') === 0 },
      { id: '250', label: 'Games with 250+ passing yards', test: (g) => n(g.r, 'passing_yards') >= 250, skip: (g) => n(g.r, 'attempts') === 0 },
      { id: 'rtd', label: 'Games with a rushing TD', test: (g) => n(g.r, 'rushing_tds') > 0, skip: (g) => n(g.r, 'attempts') === 0 },
    ],
  },
  RB: {
    keyLabel: 'Fantasy PPR', keyShort: 'PPR', unit: 'pts', hasLine: true,
    line: [
      C('car', 'CAR', (r) => num(r, 'carries')), C('ry', 'RUSH YD', (r) => num(r, 'rushing_yards')), C('td', 'TD', tds),
      C('rec', 'REC', (r) => num(r, 'receptions')), C('cy', 'REC YD', (r) => num(r, 'receiving_yards')),
    ],
    splitCols: [C('ry', 'Rush yd', (r) => num(r, 'rushing_yards')), C('sy', 'Scrim yd', scrim), C('td', 'TD', tds)],
    streaks: [
      { id: 'td', label: 'Games with a touchdown', test: (g) => tds(g.r) > 0 },
      { id: '100r', label: 'Games with 100+ rushing yards', test: (g) => n(g.r, 'rushing_yards') >= 100 },
      { id: '100s', label: 'Games with 100+ scrimmage yards', test: (g) => scrim(g.r) >= 100 },
      { id: '10c', label: 'Games with 10+ carries', test: (g) => n(g.r, 'carries') >= 10 },
    ],
  },
  WR: {
    keyLabel: 'Fantasy PPR', keyShort: 'PPR', unit: 'pts', hasLine: true,
    line: [C('rt', 'REC/TGT', (r) => num(r, 'receptions'), (r) => `${num(r, 'receptions')}/${num(r, 'targets')}`), C('yd', 'YD', (r) => num(r, 'receiving_yards')), C('td', 'TD', tds)],
    splitCols: [C('rec', 'Rec', (r) => num(r, 'receptions')), C('yd', 'Rec yd', (r) => num(r, 'receiving_yards')), C('td', 'TD', tds)],
    streaks: [
      { id: 'rec', label: 'Games with a catch', test: (g) => n(g.r, 'receptions') > 0 },
      { id: 'td', label: 'Games with a touchdown', test: (g) => tds(g.r) > 0 },
      { id: '100', label: 'Games with 100+ receiving yards', test: (g) => n(g.r, 'receiving_yards') >= 100 },
      { id: '5r', label: 'Games with 5+ catches', test: (g) => n(g.r, 'receptions') >= 5 },
    ],
  },
  TE: {} as PosRule,
  OL: {
    keyLabel: 'Team points', keyShort: 'PF', unit: 'pts', hasLine: false,
    line: [],
    splitCols: [C('pf', 'Pts for', (r) => num(r, 'pf')), C('pa', 'Pts against', (r) => num(r, 'pa'))],
    streaks: [
      { id: 'w', label: 'Wins in a row', test: (g) => g.win === true },
      { id: '24', label: 'Games with 24+ points for', test: (g) => g.pf >= 24 },
      { id: '20a', label: 'Games holding the opponent under 20', test: (g) => g.pa < 20 },
    ],
  },
  DL: {
    keyLabel: 'Impact score', keyShort: 'IMP', unit: 'pts', hasLine: true,
    line: [
      C('tkl', 'TKL', tackles), C('tfl', 'TFL', (r) => num(r, 'def_tackles_for_loss')),
      C('sck', 'SACK', (r) => num(r, 'def_sacks')), C('hit', 'QB HIT', (r) => num(r, 'def_qb_hits')), C('int', 'INT', (r) => num(r, 'def_interceptions')), C('pd', 'PD', (r) => num(r, 'def_pass_defended')),
    ],
    splitCols: [C('tkl', 'Tkl', tackles), C('sck', 'Sacks', (r) => num(r, 'def_sacks')), C('tfl', 'TFL', (r) => num(r, 'def_tackles_for_loss'))],
    streaks: [
      { id: 'tkl', label: 'Games with a tackle', test: (g) => tackles(g.r) > 0 },
      { id: 'sck', label: 'Games with a sack', test: (g) => n(g.r, 'def_sacks') > 0 },
      { id: '5t', label: 'Games with 5+ tackles', test: (g) => tackles(g.r) >= 5 },
      { id: 'tfl', label: 'Games with a tackle for loss', test: (g) => n(g.r, 'def_tackles_for_loss') > 0 },
      { id: 'tk', label: 'Games with a takeaway', test: (g) => n(g.r, 'def_interceptions') + n(g.r, 'def_fumbles_forced') > 0 },
    ],
  },
  LB: {} as PosRule,
  DB: {} as PosRule,
  K: {
    keyLabel: 'Fantasy points', keyShort: 'FPTS', unit: 'pts', hasLine: true,
    line: [
      C('fg', 'FG', (r) => rowFg(r).m39 + rowFg(r).m49 + rowFg(r).m50, (r) => `${rowFg(r).m39 + rowFg(r).m49 + rowFg(r).m50}/${rowFg(r).m39 + rowFg(r).m49 + rowFg(r).m50 + rowFg(r).missed}`),
      C('lng', 'LONG', (r) => num(r, 'fg_long')),
      C('xp', 'XP', (r) => num(r, 'pat_made'), (r) => `${num(r, 'pat_made')}/${num(r, 'pat_att')}`),
    ],
    splitCols: [C('fg', 'FG', (r) => rowFg(r).m39 + rowFg(r).m49 + rowFg(r).m50), C('xp', 'XP', (r) => num(r, 'pat_made')), C('pts', 'Pts', kickPoints)],
    streaks: [
      { id: 'fg', label: 'Games with a field goal', test: (g) => rowFg(g.r).m39 + rowFg(g.r).m49 + rowFg(g.r).m50 > 0 },
      { id: 'perfect', label: 'Games without a miss', test: (g) => rowFg(g.r).missed === 0 && num(g.r, 'pat_att') === num(g.r, 'pat_made'), skip: (g) => rowFg(g.r).m39 + rowFg(g.r).m49 + rowFg(g.r).m50 + rowFg(g.r).missed + num(g.r, 'pat_att') === 0 },
      { id: '40', label: 'Games with a 40+ yard field goal', test: (g) => rowFg(g.r).m49 + rowFg(g.r).m50 > 0 },
      { id: '10p', label: 'Games with 10+ points', test: (g) => kickPoints(g.r) >= 10 },
    ],
  },
};
RULES.TE = { ...RULES.WR };
RULES.LB = RULES.DL;
RULES.DB = {
  ...RULES.DL,
  splitCols: [C('tkl', 'Tkl', tackles), C('int', 'INT', (r) => num(r, 'def_interceptions')), C('pd', 'PD', (r) => num(r, 'def_pass_defended'))],
  streaks: [
    { id: 'tkl', label: 'Games with a tackle', test: (g) => tackles(g.r) > 0 },
    { id: 'pd', label: 'Games with a pass defended', test: (g) => n(g.r, 'def_pass_defended') > 0 },
    { id: 'int', label: 'Games with an interception', test: (g) => n(g.r, 'def_interceptions') > 0 },
    { id: '5t', label: 'Games with 5+ tackles', test: (g) => tackles(g.r) >= 5 },
  ],
};

const defScore = (r: GameRow) =>
  num(r, 'def_tackles_solo') + 0.5 * num(r, 'def_tackle_assists') + 4 * num(r, 'def_sacks') + 1.5 * num(r, 'def_tackles_for_loss') + 0.8 * num(r, 'def_qb_hits') +
  6 * num(r, 'def_interceptions') + 1.5 * num(r, 'def_pass_defended') + 3 * num(r, 'def_fumbles_forced') + 6 * num(r, 'def_tds');

export const scoreOf = (pos: Position, r: GameRow): number => {
  if (pos === 'OL') return num(r, 'pf') - num(r, 'pa');
  if (pos === 'DL' || pos === 'LB' || pos === 'DB') return Math.round(defScore(r) * 10) / 10;
  if (pos === 'K') return kickPoints(r);
  const f = r['fantasy_points_ppr'];
  return typeof f === 'number' ? f : 0;
};

export const parseGames = (log: GameLog | null | undefined, pos: Position): Game[] =>
  rowsOf(log).map((r, i) => {
    const season = num(r, 'season');
    const week = num(r, 'week');
    const pf = num(r, 'pf');
    const pa = num(r, 'pa');
    const date = String(r.date ?? '');
    const score = scoreOf(pos, r);
    return {
      i, season, week, post: r.type === 'POST', round: r.type === 'POST' ? roundOf(week) : '', team: String(r.team ?? ''), opp: String(r.opp ?? ''), date,
      month: Number(date.slice(5, 7)) || 0, home: r.home === 1, pf, pa, win: pf === pa ? null : pf > pa, r,
      key: pos === 'OL' ? pf : score, score: pos === 'OL' ? pf : score,
    };
  });

export const fmtN = (v: number, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d));
export const fmtDate = (s: string) => {
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export interface Dist { n: number; mean: number; sd: number; floor: number; ceil: number; min: number; max: number }
export const dist = (vals: number[]): Dist | null => {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const q = (p: number) => {
    const x = (s.length - 1) * p;
    const lo = Math.floor(x);
    return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (x - lo);
  };
  return { n: vals.length, mean, sd, floor: q(0.2), ceil: q(0.8), min: s[0], max: s[s.length - 1] };
};
export const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);

export interface StreakResult { id: string; label: string; best: number; bestFrom: Game | null; bestTo: Game | null; current: number }
/** Longest and current runs (games are oldest first; a `skip` game neither breaks nor extends a run). */
export const streaksOf = (games: Game[], rule: Streak[]): StreakResult[] =>
  rule.map((s) => {
    let run = 0, best = 0, runStart: Game | null = null, bf: Game | null = null, bt: Game | null = null, last: Game | null = null;
    for (const g of games) {
      if (s.skip?.(g)) continue;
      if (s.test(g)) {
        if (!run) runStart = g;
        run++;
        last = g;
        if (run > best) { best = run; bf = runStart; bt = g; }
      } else run = 0;
    }
    return { id: s.id, label: s.label, best, bestFrom: bf, bestTo: bt, current: run && last ? run : 0 };
  });
