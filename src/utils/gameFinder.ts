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
