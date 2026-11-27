import { findNFLTeam, type NFLTeam } from '@/utils/nflTeams';
import { searchTeams } from '@/utils/teamSearch';
import type { GameDetail, GameIds } from '@/utils/nflGames';

/**
 * NFL edition: finding a game. Everything here reads only ids.json (the "week-AWAY-HOME" → id index), so the header
 * search and the club sheet find games without loading a season's 1 MB file; the Scores browser adds the season file.
 */

/** Regular-season weeks: 17 until 2020, 18 from 2021. */
export const regWeeks = (season: number) => (season >= 2021 ? 18 : 17);
export const POST_ROUNDS = ['WC', 'DIV', 'CON', 'SB'] as const;
export const ROUND_LABEL: Record<string, string> = { WC: 'Wild Card', DIV: 'Divisional', CON: 'Conference', SB: 'Super Bowl' };

/** "Week 7" or "Wild Card" from a game id's week number. */
export const weekLabelOf = (season: number, week: number) => {
  const r = week - regWeeks(season);
  return r >= 1 && r <= 4 ? ROUND_LABEL[POST_ROUNDS[r - 1]] : `Week ${week}`;
};
export const parseGameId = (id: string) => {
  const [y, w, a, h] = id.split('_');
  return { season: Number(y), week: Number(w), away: a, home: h };
};

export interface Meeting {
  id: string;
  season: number;
  week: number;
  away: string;
  home: string;
  /** The first club the query named (search rows show its result) */
  first?: string;
}
/** Every game two clubs played against each other, newest first (abbreviations as ids.json keeps them). */
export const meetingsOf = (ids: GameIds, a: string, b: string, limit = 5): Meeting[] => {
  const out: Meeting[] = [];
  for (const y of Object.keys(ids).sort((x, z) => Number(z) - Number(x))) {
    const found: Meeting[] = [];
    for (const [k, id] of Object.entries(ids[y])) {
      if (k.startsWith('p-')) continue;
      const [, away, home] = k.split('-');
      if ((away === a && home === b) || (away === b && home === a)) found.push({ id, season: Number(y), week: Number(k.split('-')[0]), away, home });
    }
    found.sort((p, q) => q.week - p.week);
    out.push(...found);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
};
/** The games of one club in a season, in week order (from ids only). */
export const clubGamesOf = (ids: GameIds | null, season: number, abbr: string): Meeting[] => {
  const m = ids?.[String(season)];
  if (!m) return [];
  const out: Meeting[] = [];
  for (const [k, id] of Object.entries(m)) {
    if (k.startsWith('p-')) continue;
    const [w, away, home] = k.split('-');
    if (away === abbr || home === abbr) out.push({ id, season, week: Number(w), away, home });
  }
  return out.sort((p, q) => p.week - q.week);
};

const strip = /^(vs?\.?|@|at|-|–|—|and|&|\/)$/i;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** One club the words name: an exact name / abbreviation / city, a single match, or the one nickname the words start. */
const oneClub = (words: string[]) => {
  const q = fold(words.join(' '));
  const hits = searchTeams(q, 8);
  if (!hits.length) return null;
  const exact = hits.find((t) => [t.name, t.abbreviation, t.city, t.fullName].some((s) => fold(s) === q));
  if (exact) return exact;
  if (hits.length === 1) return hits[0];
  const byName = hits.filter((t) => fold(t.name).startsWith(q));
  return byName.length === 1 ? byName[0] : null;
};
/**
 * "bengals commanders", "cin was", "bengals at commanders", "bengals @ commanders", "chiefs-eagles", "kc/phi",
 * "bengals com" (a prefix on the last word): the two clubs a query names, else null. Splits on spaces, "vs", "v",
 * "at", "@", "-" and "/", then tries every split of the words into a left and a right club.
 */
export const clubPairOf = (query: string): [string, string] | null => {
  const words = query
    .replace(/[@/–—]|(?<=\S)-(?=\S)/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !strip.test(w));
  if (words.length < 2 || words.length > 6) return null;
  for (let k = 1; k < words.length; k++) {
    const l = oneClub(words.slice(0, k));
    const r = oneClub(words.slice(k));
    if (l && r && l.id !== r.id) return [l.abbreviation, r.abbreviation];
  }
  return null;
};

export interface GameQuery {
  /** The club the query leads with (abbreviation) */
  a: string;
  /** Opponents the rest of the query could mean (abbreviations); empty = every game of the club */
  bs: string[];
  /** The query reads like a game ("eagles v", "phi dal"), not just a club name */
  explicit: boolean;
}

/**
 * Partial game queries: "eagles v", "eagles vs cow", "phi dal", "eagles cowboys", or one club alone ("eagles" lists its
 * games). The left club must be clear; what follows may be a prefix that several clubs share ("eagles n"), which lists
 * the games against any of them. A complete pair still gives exactly that pair.
 */
export const parseGameQuery = (query: string): GameQuery | null => {
  const tokens = query.replace(/[@/–—]|(?<=\S)-(?=\S)/g, ' ').trim().split(/\s+/).filter(Boolean);
  const words = tokens.filter((w) => !strip.test(w));
  if (!words.length || query.trim().length < 2) return null;
  const connector = words.length < tokens.length;
  const pair = clubPairOf(query);
  if (pair) return { a: pair[0], bs: [pair[1]], explicit: true };
  for (let k = 1; k < words.length; k++) {
    const l = oneClub(words.slice(0, k));
    if (!l) continue;
    const rights = searchTeams(fold(words.slice(k).join(' ')), 8).filter((t) => t.id !== l.id);
    if (rights.length) return { a: l.abbreviation, bs: rights.map((t) => t.abbreviation), explicit: true };
  }
  const one = oneClub(words);
  return one ? { a: one.abbreviation, bs: [], explicit: connector } : null;
};

/**
 * Games of a club (against any of `bs`, else all) from ids.json only. Completed games come first, newest first (season,
 * then week); games not played yet (`unplayed`: ids whose score is missing) follow, soonest first.
 */
export const gamesOfQuery = (ids: GameIds, q: GameQuery, limit = 5, unplayed?: ReadonlySet<string>): Meeting[] => {
  const done: Meeting[] = [];
  const upcoming: Meeting[] = [];
  for (const y of Object.keys(ids).sort((x, z) => Number(z) - Number(x))) {
    for (const [k, id] of Object.entries(ids[y])) {
      if (k.startsWith('p-')) continue;
      const [w, away, home] = k.split('-');
      const other = away === q.a ? home : home === q.a ? away : null;
      if (!other || (q.bs.length && !q.bs.includes(other))) continue;
      const m: Meeting = { id, season: Number(y), week: Number(w), away, home, first: q.a };
      (unplayed?.has(id) ? upcoming : done).push(m);
    }
  }
  done.sort((p, r) => r.season - p.season || r.week - p.week);
  upcoming.sort((p, r) => p.season - r.season || p.week - r.week);
  return [...done, ...upcoming].slice(0, limit);
};

/** How well the clubs found match what was typed, on the scale the player scores use (exact 900, name start 700, abbreviation or city start 600, other 400). */
export const clubsScore = (query: string, clubs: NFLTeam[]): number => {
  const q = fold(query.replace(/[@/–—]|(?<=\S)-(?=\S)/g, ' ').trim().split(/\s+/).filter((w) => w && !strip.test(w)).join(' '));
  let best = 0;
  for (const t of clubs) {
    const exact = [t.name, t.abbreviation, t.city, t.fullName].some((x) => fold(x) === q);
    const s = exact || clubPairOf(query) ? 900 : fold(t.name).startsWith(q) ? 700 : fold(t.abbreviation).startsWith(q) || fold(t.city).startsWith(q) ? 600 : 400;
    best = Math.max(best, s);
  }
  return best;
};

/** A Games group's score: 950 when the query reads like a game (it leads), 500 for a bare club name (the Teams group wins). */
export const gamesScore = (q: GameQuery | null) => (q ? (q.explicit ? 950 : 500) : 0);

/**
 * The clubs a query names, for the Teams group: both clubs of a pair ("bengals commanders"), else the clubs the words
 * match, ignoring connectors ("bengals vs", "bengals at") and, when nothing matches, dropping trailing words.
 */
export const clubsOfQuery = (query: string, limit = 4): NFLTeam[] => {
  const pair = clubPairOf(query);
  if (pair) return pair.map((a) => findNFLTeam(a)).filter((t): t is NFLTeam => !!t);
  const words = query
    .replace(/[@/–—]|(?<=\S)-(?=\S)/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && !strip.test(w));
  for (let n = words.length; n >= 1; n--) {
    const hits = searchTeams(words.slice(0, n).join(' '), limit);
    if (hits.length) return hits;
    if (words.length > 3) break;
  }
  return [];
};

/** Kickoff in words: "Sun · Nov 8 · 1:00 PM ET" pieces, and the primetime tag. */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const kickoffOf = (g: Pick<GameDetail, 'date' | 'time'>) => {
  const d = new Date(`${g.date}T12:00:00`);
  const day = DAYS[d.getDay()];
  const [hh, mm] = (g.time ?? '').split(':').map(Number);
  const has = Number.isFinite(hh);
  const time = has ? `${((hh + 11) % 12) + 1}:${String(mm || 0).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}` : '';
  const night = has && hh >= 19;
  const tag = night ? (d.getDay() === 4 ? 'TNF' : d.getDay() === 0 ? 'SNF' : d.getDay() === 1 ? 'MNF' : 'Night') : null;
  return { day, date: `${MONTHS[d.getMonth()]} ${d.getDate()}`, time, night, tag };
};

export const abbrOfTeam = (t: string) => findNFLTeam(t)?.abbreviation ?? t;
