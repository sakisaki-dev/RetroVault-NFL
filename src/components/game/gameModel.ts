import type { GameDetail, GamePlayer, Stat } from '@/utils/nflGames';
import { findNFLTeam } from '@/utils/nflTeams';

/**
 * The Game page's rules over one game (scripts/nfl/game_detail.py data): units, leaders, players of the game, team
 * comparison rows, what a year's data can't show, and the one-paragraph recap. Rules only; every number is the data's.
 */

export type Side = 0 | 1;
export const v = (s: Stat | undefined, k: string) => s?.[k] ?? 0;

export const SITE_POS: Record<string, string> = {
  QB: 'QB', RB: 'RB', FB: 'RB', HB: 'RB', WR: 'WR', TE: 'TE', T: 'OL', G: 'OL', C: 'OL', OT: 'OL', OG: 'OL', OL: 'OL', LS: 'OL',
  DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', EDGE: 'DL', LB: 'LB', ILB: 'LB', OLB: 'LB', MLB: 'LB',
  CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', DB: 'DB', SAF: 'DB', K: 'WR', P: 'WR',
};
export const sitePos = (pos: string): string => SITE_POS[pos] ?? 'WR';
/** Only these have a card in the pool (a K or P links nowhere). */
export const hasCardPos = (pos: string) => !['K', 'P', 'LS', ''].includes(pos);

export type UnitId = 'qb' | 'bf' | 'rec' | 'ol' | 'dl' | 'lb' | 'db' | 'st';
export interface UnitDef {
  id: UnitId;
  label: string;
  side: 'off' | 'def' | 'st';
  /** How many stand in the formation (the rest are listed) */
  show: number;
}
export const UNITS: UnitDef[] = [
  { id: 'qb', label: 'Quarterbacks', side: 'off', show: 2 },
  { id: 'bf', label: 'Backfield', side: 'off', show: 4 },
  { id: 'rec', label: 'Receivers', side: 'off', show: 7 },
  { id: 'ol', label: 'Offensive line', side: 'off', show: 7 },
  { id: 'dl', label: 'Defensive line', side: 'def', show: 6 },
  { id: 'lb', label: 'Linebackers', side: 'def', show: 5 },
  { id: 'db', label: 'Secondary', side: 'def', show: 6 },
  { id: 'st', label: 'Kickers and specialists', side: 'st', show: 3 },
];
const UNIT_OF: Record<string, UnitId> = {
  QB: 'qb', RB: 'bf', FB: 'bf', HB: 'bf', WR: 'rec', TE: 'rec', T: 'ol', G: 'ol', C: 'ol', OT: 'ol', OG: 'ol', OL: 'ol',
  DE: 'dl', DT: 'dl', NT: 'dl', DL: 'dl', EDGE: 'dl', LB: 'lb', ILB: 'lb', OLB: 'lb', MLB: 'lb',
  CB: 'db', S: 'db', FS: 'db', SS: 'db', DB: 'db', SAF: 'db', K: 'st', P: 'st', LS: 'st',
};
export const unitOf = (p: GamePlayer): UnitId => {
  const u = UNIT_OF[p.pos];
  if (u) return u;
  // no position on the row: read it from the lines
  if (v(p.s, 'attempts') > 0) return 'qb';
  if (v(p.s, 'carries') > 0) return 'bf';
  if (v(p.s, 'targets') > 0 || v(p.s, 'receptions') > 0) return 'rec';
  if (v(p.s, 'defense_snaps') > 0 || v(p.s, 'def_tackles_solo') > 0) return 'lb';
  return 'st';
};

export const tackles = (s: Stat) => v(s, 'def_tackles_solo') + v(s, 'def_tackle_assists');
export const impact = (s: Stat) =>
  v(s, 'def_tackles_solo') + 0.5 * v(s, 'def_tackle_assists') + 4 * v(s, 'def_sacks') + 1.5 * v(s, 'def_tackles_for_loss') + 0.8 * v(s, 'def_qb_hits') +
  6 * v(s, 'def_interceptions') + 1.5 * v(s, 'def_pass_defended') + 3 * v(s, 'def_fumbles_forced') + 6 * v(s, 'def_tds') + 2 * v(s, 'fumble_recovery_opp');
export const kickScore = (s: Stat) => 3 * v(s, 'fg_made') + v(s, 'pat_made');
/** One number for how much a player mattered: offense by PPR points, defense by impact, kickers by points. */
export const score = (p: GamePlayer): number => Math.max(v(p.s, 'fantasy_points_ppr'), impact(p.s), kickScore(p.s));
/** How much he was on the field, then how much he did (the order of a formation) */
export const snaps = (p: GamePlayer) => v(p.s, 'offense_snaps') + v(p.s, 'defense_snaps');
export const rank = (p: GamePlayer) => snaps(p) * 1000 + score(p);

export interface Unit {
  def: UnitDef;
  players: GamePlayer[];
}
/** A club's players grouped by unit, each unit ordered by snaps then by what he did. */
export const unitsOf = (g: GameDetail, side: Side): Unit[] => {
  const mine = g.players.filter((p) => p.side === side);
  return UNITS.map((def) => ({ def, players: mine.filter((p) => unitOf(p) === def.id).sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name)) })).filter((u) => u.players.length);
};

export const hasSnaps = (g: GameDetail) => g.players.some((p) => snaps(p) > 0);
export const hasPfr = (g: GameDetail) => g.players.some((p) => 'times_pressured' in p.s || 'def_missed_tackles' in p.s || 'rushing_yards_before_contact' in p.s || 'def_targets' in p.s);
export const hasNgs = (g: GameDetail) => g.players.some((p) => 'avg_time_to_throw' in p.s || 'avg_separation' in p.s || 'efficiency' in p.s || 'avg_cushion' in p.s);
export const played = (g: GameDetail) => g.awayScore !== undefined && g.homeScore !== undefined;

export interface Missing {
  id: string;
  label: string;
  note: string;
}
/** What this game's year can't show, stated plainly. */
export const missingFor = (g: GameDetail): Missing[] => {
  // (no play-by-play note: no game has it, so it said nothing about this one; owner: "remove this warning")
  const out: Missing[] = [];
  if (!g.team) out.push({ id: 'team', label: 'Team totals', note: 'Not recorded.' });
  if (!hasSnaps(g)) out.push({ id: 'snaps', label: 'Snap counts', note: g.season < 2013 ? 'From 2013 on.' : 'Not recorded yet.' });
  const advanced = hasPfr(g) || hasNgs(g);
  if (!advanced) out.push({ id: 'pfr', label: 'Advanced box score (pressures, drops, broken tackles, coverage)', note: g.season < 2018 ? 'From 2018 on.' : 'Not recorded yet.' });
  if (!advanced) out.push({ id: 'ngs', label: 'Next Gen Stats (time to throw, separation, rush yards over expected)', note: g.season < 2016 ? 'From 2016 on.' : 'Not recorded yet.' });
  return out;
};

/* ---------- headline facts ---------- */

const ROMAN: [number, string][] = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export const roman = (n: number) => {
  let s = '';
  for (const [k, r] of ROMAN) while (n >= k) ((s += r), (n -= k));
  return s;
};
/** Super Bowl number of a season (1999 → XXXIV) */
export const superBowlNumber = (season: number) => season - 1965;

export const roundLabel = (g: GameDetail): string => {
  switch (g.type) {
    case 'SB': return `Super Bowl ${roman(superBowlNumber(g.season))}`;
    case 'CON': return `${g.season} Conference championship`;
    case 'DIV': return `${g.season} Divisional round`;
    case 'WC': return `${g.season} Wild Card`;
    default: return `${g.season} · Week ${g.week}`;
  }
};
export const isPost = (g: GameDetail) => g.type !== 'REG';

export const teamName = (abbr: string) => findNFLTeam(abbr)?.name ?? abbr;
export const winnerOf = (g: GameDetail): 0 | 1 | null =>
  !played(g) || g.awayScore === g.homeScore ? null : g.awayScore! > g.homeScore! ? 0 : 1;

/** Against the closing line (home spread: negative = home favoured in nflverse's convention? no: spread_line is the away club's spread). */
export const atsOf = (g: GameDetail): { favorite: 0 | 1; points: number; covered: boolean | null; push: boolean } | null => {
  if (g.spread === undefined || !played(g)) return null;
  // nflverse spread_line: positive = the home club is favoured by that many points
  const favorite: 0 | 1 = g.spread >= 0 ? 1 : 0;
  const margin = g.homeScore! - g.awayScore!; // home margin
  const need = g.spread;
  const diff = margin - need;
  return { favorite: g.spread === 0 ? 1 : favorite, points: Math.abs(g.spread), covered: diff === 0 ? null : (favorite === 1 ? diff > 0 : diff < 0), push: diff === 0 };
};

/* ---------- leaders and players of the game ---------- */

export interface Leader {
  label: string;
  player: GamePlayer;
  line: string;
}
const n0 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const top = (g: GameDetail, side: Side, key: (p: GamePlayer) => number, min = 1) => {
  const c = g.players.filter((p) => p.side === side).sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name))[0];
  return c && key(c) >= min ? c : null;
};
export const leadersFor = (g: GameDetail, side: Side): Leader[] => {
  const out: Leader[] = [];
  const qb = top(g, side, (p) => v(p.s, 'passing_yards'), 1);
  if (qb) out.push({ label: 'Passing', player: qb, line: `${v(qb.s, 'completions')}/${v(qb.s, 'attempts')}, ${v(qb.s, 'passing_yards')} yds${v(qb.s, 'passing_tds') ? `, ${v(qb.s, 'passing_tds')} TD` : ''}${v(qb.s, 'passing_interceptions') ? `, ${v(qb.s, 'passing_interceptions')} INT` : ''}` });
  const rb = top(g, side, (p) => v(p.s, 'rushing_yards'), 1);
  if (rb) out.push({ label: 'Rushing', player: rb, line: `${v(rb.s, 'carries')} car, ${v(rb.s, 'rushing_yards')} yds${v(rb.s, 'rushing_tds') ? `, ${v(rb.s, 'rushing_tds')} TD` : ''}` });
  const wr = top(g, side, (p) => v(p.s, 'receiving_yards'), 1);
  if (wr) out.push({ label: 'Receiving', player: wr, line: `${v(wr.s, 'receptions')} rec, ${v(wr.s, 'receiving_yards')} yds${v(wr.s, 'receiving_tds') ? `, ${v(wr.s, 'receiving_tds')} TD` : ''}` });
  const tk = top(g, side, (p) => tackles(p.s) + 3 * v(p.s, 'def_sacks'), 1);
  if (tk) out.push({ label: 'Defense', player: tk, line: [`${n0(tackles(tk.s))} tkl`, v(tk.s, 'def_sacks') ? `${n0(v(tk.s, 'def_sacks'))} sck` : '', v(tk.s, 'def_interceptions') ? `${v(tk.s, 'def_interceptions')} INT` : '', v(tk.s, 'def_tackles_for_loss') ? `${n0(v(tk.s, 'def_tackles_for_loss'))} TFL` : ''].filter(Boolean).join(', ') });
  return out;
};

export interface Star {
  player: GamePlayer;
  kicker: string;
  line: string;
}
export const lineOf = (p: GamePlayer): string => {
  const s = p.s;
  const bits: string[] = [];
  if (v(s, 'attempts') >= 5) bits.push(`${v(s, 'completions')}/${v(s, 'attempts')}, ${v(s, 'passing_yards')} yds`, ...(v(s, 'passing_tds') ? [`${v(s, 'passing_tds')} TD`] : []), ...(v(s, 'passing_interceptions') ? [`${v(s, 'passing_interceptions')} INT`] : []));
  if (v(s, 'carries') >= 3 || (!bits.length && v(s, 'carries'))) bits.push(`${v(s, 'carries')} car, ${v(s, 'rushing_yards')} yds${v(s, 'rushing_tds') ? `, ${v(s, 'rushing_tds')} TD` : ''}`);
  if (v(s, 'receptions') || v(s, 'targets') >= 3) bits.push(`${v(s, 'receptions')} rec, ${v(s, 'receiving_yards')} yds${v(s, 'receiving_tds') ? `, ${v(s, 'receiving_tds')} TD` : ''}`);
  if (impact(s) >= 4 || tackles(s) >= 4) bits.push([`${n0(tackles(s))} tkl`, v(s, 'def_sacks') ? `${n0(v(s, 'def_sacks'))} sck` : '', v(s, 'def_interceptions') ? `${v(s, 'def_interceptions')} INT` : '', v(s, 'def_tackles_for_loss') ? `${n0(v(s, 'def_tackles_for_loss'))} TFL` : '', v(s, 'def_pass_defended') ? `${v(s, 'def_pass_defended')} PD` : '', v(s, 'def_fumbles_forced') ? `${v(s, 'def_fumbles_forced')} FF` : '', v(s, 'def_tds') ? `${v(s, 'def_tds')} TD` : ''].filter(Boolean).join(', '));
  if (v(s, 'fg_att') || v(s, 'pat_att')) bits.push(`${v(s, 'fg_made')}/${v(s, 'fg_att')} FG, ${v(s, 'pat_made')}/${v(s, 'pat_att')} XP`);
  return bits.slice(0, 2).join(' · ');
};
/** A player's headline in plain words for prose ("7 catches for 86 yards and a touchdown"), no stat abbreviations. */
export const proseOf = (p: GamePlayer): string => {
  const s = p.s;
  const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const tds = (n: number) => (n ? ` and ${n === 1 ? 'a touchdown' : `${n} touchdowns`}` : '');
  const ry = v(s, 'rushing_yards');
  const cy = v(s, 'receiving_yards');
  if (v(s, 'attempts') >= 5) {
    const ints = v(s, 'passing_interceptions');
    return `${v(s, 'completions')} of ${v(s, 'attempts')} passing for ${pl(v(s, 'passing_yards'), 'yard', 'yards')}${tds(v(s, 'passing_tds'))}${ints ? `, with ${pl(ints, 'interception', 'interceptions')}` : ''}`;
  }
  if (v(s, 'carries') >= 3 && ry >= cy) return `${pl(v(s, 'carries'), 'carry', 'carries')} for ${pl(ry, 'yard', 'yards')}${tds(v(s, 'rushing_tds'))}`;
  if (v(s, 'receptions')) return `${pl(v(s, 'receptions'), 'catch', 'catches')} for ${pl(cy, 'yard', 'yards')}${tds(v(s, 'receiving_tds'))}`;
  if (v(s, 'carries')) return `${pl(v(s, 'carries'), 'carry', 'carries')} for ${pl(ry, 'yard', 'yards')}${tds(v(s, 'rushing_tds'))}`;
  if (v(s, 'fg_att')) return `${v(s, 'fg_made')} of ${v(s, 'fg_att')} on field goals`;
  const tk = tackles(s);
  const bits = [`${pl(tk, 'tackle', 'tackles')}`, v(s, 'def_sacks') ? pl(v(s, 'def_sacks'), 'sack', 'sacks') : '', v(s, 'def_interceptions') ? pl(v(s, 'def_interceptions'), 'interception', 'interceptions') : ''].filter(Boolean);
  return bits.join(' and ');
};
/** A player's line in plain words for a card ("7 catches for 86 yards and a touchdown · 2 tackles"), up to two parts, no abbreviations. */
export const readableOf = (p: GamePlayer): string => {
  const s = p.s;
  const pl = (n: number | string, one: string, many: string) => `${n} ${Number(n) === 1 ? one : many}`;
  const tds = (n: number) => (n ? ` and ${n === 1 ? 'a touchdown' : `${n} touchdowns`}` : '');
  const bits: string[] = [];
  if (v(s, 'attempts') >= 5) {
    const ints = v(s, 'passing_interceptions');
    bits.push(`${v(s, 'completions')} of ${v(s, 'attempts')} passing for ${pl(v(s, 'passing_yards'), 'yard', 'yards')}${tds(v(s, 'passing_tds'))}${ints ? `, ${pl(ints, 'interception', 'interceptions')}` : ''}`);
  }
  if (v(s, 'carries') >= 3 || (!bits.length && v(s, 'carries'))) bits.push(`${pl(v(s, 'carries'), 'carry', 'carries')} for ${pl(v(s, 'rushing_yards'), 'yard', 'yards')}${tds(v(s, 'rushing_tds'))}`);
  if (v(s, 'receptions') || v(s, 'targets') >= 3) bits.push(`${pl(v(s, 'receptions'), 'catch', 'catches')} for ${pl(v(s, 'receiving_yards'), 'yard', 'yards')}${tds(v(s, 'receiving_tds'))}`);
  if (impact(s) >= 4 || tackles(s) >= 4) {
    const d = [pl(n0(tackles(s)), 'tackle', 'tackles'), v(s, 'def_sacks') ? pl(n0(v(s, 'def_sacks')), 'sack', 'sacks') : '', v(s, 'def_interceptions') ? pl(v(s, 'def_interceptions'), 'interception', 'interceptions') : '', v(s, 'def_tackles_for_loss') ? pl(n0(v(s, 'def_tackles_for_loss')), 'tackle for loss', 'tackles for loss') : '', v(s, 'def_pass_defended') ? pl(v(s, 'def_pass_defended'), 'pass defended', 'passes defended') : '', v(s, 'def_fumbles_forced') ? pl(v(s, 'def_fumbles_forced'), 'forced fumble', 'forced fumbles') : '', v(s, 'def_tds') ? pl(v(s, 'def_tds'), 'defensive touchdown', 'defensive touchdowns') : ''].filter(Boolean);
    bits.push(d.join(', '));
  }
  if (v(s, 'fg_att') || v(s, 'pat_att')) bits.push(`${v(s, 'fg_made')} of ${v(s, 'fg_att')} on field goals, ${v(s, 'pat_made')} of ${v(s, 'pat_att')} on extra points`);
  return bits.slice(0, 2).join(' · ');
};
/** The stars of the game: the top three by score (kickers excluded), the podium and the game ball share this order. */
export const podiumOf = (g: GameDetail): GamePlayer[] => g.players.filter((p) => score(p) > 0 && unitOf(p) !== 'st').sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 3);
/** The game ball, then each club's best on each side of the ball. */
export const starsOf = (g: GameDetail): { ball: Star | null; others: Star[] } => {
  const all = g.players.filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  if (!all.length) return { ball: null, others: [] };
  const mk = (p: GamePlayer, kicker: string): Star => ({ player: p, kicker, line: lineOf(p) });
  const top = podiumOf(g)[0] ?? all[0];
  const ball = mk(top, 'Game ball');
  const others: Star[] = [];
  for (const side of [0, 1] as Side[]) {
    const mine = all.filter((p) => p.side === side && p !== top);
    const off = mine.find((p) => v(p.s, 'fantasy_points_ppr') >= impact(p.s) && unitOf(p) !== 'st' && ['qb', 'bf', 'rec'].includes(unitOf(p)));
    const def = mine.find((p) => ['dl', 'lb', 'db'].includes(unitOf(p)) && impact(p.s) > 0);
    if (off) others.push(mk(off, side === 0 ? g.away : g.home));
    if (def) others.push(mk(def, side === 0 ? g.away : g.home));
  }
  return { ball, others };
};

/* ---------- team comparison ---------- */

export interface CompareRow {
  id: string;
  label: string;
  a: number;
  h: number;
  /** show as "a-b" attempts */
  fmt?: (a: Stat, h: Stat) => [string, string];
  /** which way is better (default higher) */
  lowerBetter?: boolean;
  dec?: number;
}
const sackYards = (s: Stat) => Math.abs(v(s, 'sack_yards_lost'));
export const netPass = (s: Stat) => v(s, 'passing_yards') - sackYards(s);
export const totalYards = (s: Stat) => netPass(s) + v(s, 'rushing_yards');
export const compareRows = (g: GameDetail): CompareRow[] => {
  if (!g.team) return [];
  const [A, H] = g.team;
  const plays = (s: Stat) => v(s, 'attempts') + v(s, 'sacks_suffered') + v(s, 'carries');
  const rows: CompareRow[] = [
    { id: 'tot', label: 'Total yards', a: totalYards(A), h: totalYards(H) },
    { id: 'pass', label: 'Net passing', a: netPass(A), h: netPass(H) },
    { id: 'rush', label: 'Rushing', a: v(A, 'rushing_yards'), h: v(H, 'rushing_yards') },
    { id: 'ypp', label: 'Yards per play', a: plays(A) ? totalYards(A) / plays(A) : 0, h: plays(H) ? totalYards(H) / plays(H) : 0, dec: 1 },
    { id: 'fd', label: 'First downs', a: v(A, 'passing_first_downs') + v(A, 'rushing_first_downs'), h: v(H, 'passing_first_downs') + v(H, 'rushing_first_downs') },
    { id: 'epa', label: 'EPA (pass + rush)', a: v(A, 'passing_epa') + v(A, 'rushing_epa'), h: v(H, 'passing_epa') + v(H, 'rushing_epa'), dec: 1 },
    { id: 'to', label: 'Turnovers', a: v(A, 'passing_interceptions') + v(A, 'fumbles_lost_total'), h: v(H, 'passing_interceptions') + v(H, 'fumbles_lost_total'), lowerBetter: true },
    { id: 'sk', label: 'Sacks taken', a: v(A, 'sacks_suffered'), h: v(H, 'sacks_suffered'), lowerBetter: true },
    { id: 'pen', label: 'Penalty yards', a: v(A, 'penalty_yards'), h: v(H, 'penalty_yards'), lowerBetter: true },
    { id: 'ret', label: 'Return yards', a: v(A, 'punt_return_yards') + v(A, 'kickoff_return_yards'), h: v(H, 'punt_return_yards') + v(H, 'kickoff_return_yards') },
  ];
  return rows.filter((r) => r.a || r.h);
};

/* ---------- the recap ---------- */

const ord = (n: number) => `${n}`;
export const recapOf = (g: GameDetail): string[] => {
  if (!played(g)) return [];
  const w = winnerOf(g);
  const as = g.awayScore!;
  const hs = g.homeScore!;
  const aN = teamName(g.away);
  const hN = teamName(g.home);
  const lines: string[] = [];
  const where = g.stadium ? ` at ${g.stadium}` : '';
  if (w === null) lines.push(`The ${aN} and ${hN} finished level at ${as}-${hs}${g.ot ? ' after overtime' : ''}${where}.`);
  else {
    const win = w === 0 ? aN : hN;
    const lose = w === 0 ? hN : aN;
    const ws = Math.max(as, hs);
    const ls = Math.min(as, hs);
    const margin = ws - ls;
    const kind = margin <= 3 ? 'edged' : margin >= 21 ? 'routed' : 'beat';
    const adv = margin >= 14 && margin < 21 ? ' comfortably' : '';
    lines.push(`${g.type === 'SB' ? `In ${roundLabel(g)}, the` : 'The'} ${win} ${kind} the ${lose}${adv} ${ws}-${ls}${g.ot ? ' in overtime' : ''}${where}.`);
    const ats = atsOf(g);
    if (ats && !ats.push && ats.points >= 0.5) {
      const fav = ats.favorite === 0 ? aN : hN;
      const favWon = (ats.favorite === 0) === (w === 0);
      if (!favWon && ats.points >= 3) lines.push(`It was an upset: the ${fav} closed as ${ats.points}-point favourites.`);
      else if (favWon && ats.covered === false) lines.push(`The ${fav} won as ${ats.points}-point favourites but did not cover.`);
    }
  }
  const star = starsOf(g).ball;
  if (star) {
    const club = star.player.side === 0 ? aN : hN;
    const best = (side: 0 | 1) => g.players.filter((p) => p.side === side && score(p) > 0 && unitOf(p) !== 'st' && lineOf(p)).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
    const lead = w === null ? star.player : (best(w) ?? star.player);
    const other = w === null ? undefined : best(w === 0 ? 1 : 0);
    const leadClub = lead.side === 0 ? aN : hN;
    if (other && other !== lead) lines.push(`${lead.name} (${leadClub}) led the way with ${proseOf(lead)}, while ${other.name} answered for the ${other.side === 0 ? aN : hN} with ${proseOf(other)}.`);
    else lines.push(`${star.player.name} (${club}) led the way with ${proseOf(star.player)}.`);
  }
  if (g.team) {
    const [A, H] = g.team;
    const toA = v(A, 'passing_interceptions') + v(A, 'fumbles_lost_total');
    const toH = v(H, 'passing_interceptions') + v(H, 'fumbles_lost_total');
    const ya = totalYards(A);
    const yh = totalYards(H);
    if (Math.abs(toA - toH) >= 2) lines.push(`The turnover margin was ${ord(Math.abs(toA - toH))}, in favour of the ${toA < toH ? aN : hN} (${toA < toH ? toA : toH} to ${toA < toH ? toH : toA}).`);
    else if (Math.abs(ya - yh) >= 80) lines.push(`The ${ya > yh ? aN : hN} out-gained them by ${Math.abs(ya - yh)} yards (${Math.max(ya, yh)} to ${Math.min(ya, yh)}).`);
    const sa = v(H, 'sacks_suffered');
    const sh = v(A, 'sacks_suffered');
    if (Math.max(sa, sh) >= 5) lines.push(`The ${sa > sh ? aN : hN} defense sacked the quarterback ${Math.max(sa, sh)} times.`);
  }
  return lines;
};

/** A line's date as "Sun, Feb 8, 2026" */
export const fmtDate = (d: string) => {
  const t = new Date(`${d}T12:00:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
export const roofLabel = (r?: string) => (r === 'dome' ? 'Dome' : r === 'closed' ? 'Roof closed' : r === 'open' ? 'Roof open' : r === 'outdoors' ? 'Outdoors' : r);
