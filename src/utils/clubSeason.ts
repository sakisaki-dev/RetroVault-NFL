import { useEffect, useState } from 'react';
import { dataResponse } from '@/utils/dataStore';
import { findNFLTeam } from '@/utils/nflTeams';
import { loadScheduleSeason, type ScheduleSeason, type TableRow } from '@/utils/schedule';
import { loadGameSeason, type GameDetail } from '@/utils/nflGames';

/**
 * NFL edition: the club season page's data (scripts/nfl/club_season.py, scripts/nfl/cap.py) and the rules over it.
 * Everything loads per season and on demand; nothing is in a startup file.
 */

export const OPEN_CLUB_SEASON_EVENT = 'rv:open-club-season';
let pending: { club: string; season?: number } | null = null;

/** Opens a club's season sheet from anywhere (the Season page's standings and club wall). `season` defaults to the latest. */
export const openClubSeason = (club: string, season?: number) => {
  pending = { club, season };
  window.dispatchEvent(new CustomEvent(OPEN_CLUB_SEASON_EVENT, { detail: pending }));
};
/** A request made before the host mounted (read once) */
export const takePendingClubSeason = () => {
  const p = pending;
  pending = null;
  return p;
};
export const prefetchClubSeason = () => void import('@/components/clubseason/ClubSeasonSheet');

/** One player's season with one club */
export interface RosterRow {
  k: string;
  g: number;
  szn?: number;
  no?: number;
  aw?: string[];
  pyds?: number; ptd?: number; pint?: number; att?: number; cmp?: number;
  ryds?: number; rtd?: number; car?: number;
  rec?: number; recyds?: number; rectd?: number;
  tkl?: number; sck?: number; dint?: number; ff?: number; pd?: number;
}
export interface ClubRosterFile { season: number; clubs: Record<string, RosterRow[]> }

export interface CapFile {
  season: number;
  /** Derived league cap in $M (median of apy / cap share over deals signed that year); null when too few deals */
  cap: number | null;
  lastSigned: number;
  clubs: Record<string, { n: number; total: number; top: [name: string, pos: string, apy: number, signed: number, years: number][]; groups: Record<string, number> }>;
}

const memo = <T,>(path: string) => {
  const cache = new Map<number, Promise<T | null>>();
  return (year: number): Promise<T | null> => {
    let p = cache.get(year);
    if (!p) {
      p = dataResponse(`${path}/${year}.json`).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
      cache.set(year, p);
    }
    return p;
  };
};
export const loadClubRoster = memo<ClubRosterFile>('data/nfl/clubseason');
export const loadCap = memo<CapFile>('data/nfl/cap');

export interface ClubSeasonData {
  year: number;
  roster: RosterRow[] | null;
  cap: CapFile | null;
  cell: TableRow | null;
  schedule: ScheduleSeason | null;
  games: GameDetail[] | null;
}

/** undefined while loading; every piece may be null (a season with no file) */
export const useClubSeason = (abbr: string | undefined, year: number): ClubSeasonData | undefined => {
  const [v, setV] = useState<ClubSeasonData | undefined>();
  useEffect(() => {
    if (!abbr) return;
    let live = true;
    setV((cur) => (cur && cur.year === year ? cur : undefined));
    void Promise.all([loadClubRoster(year), loadCap(year), loadScheduleSeason(String(year)), loadGameSeason(year)]).then(([r, cap, schedule, gm]) => {
      if (!live) return;
      const all = gm ? [...gm.values()] : null;
      setV({
        year,
        roster: r?.clubs[abbr] ?? null,
        cap,
        schedule,
        cell: schedule?.table.find((t) => t.abbr === abbr) ?? null,
        games: all ? all.filter((g) => g.away === abbr || g.home === abbr).sort(gameOrder) : null,
      });
    });
    return () => {
      live = false;
    };
  }, [abbr, year]);
  return v && v.year === year ? v : undefined;
};

const ROUND_ORDER: Record<string, number> = { REG: 0, WC: 1, DIV: 2, CON: 3, SB: 4 };
export const gameOrder = (a: GameDetail, b: GameDetail) => (ROUND_ORDER[a.type] ?? 9) - (ROUND_ORDER[b.type] ?? 9) || a.week - b.week || a.date.localeCompare(b.date);
const played = (g: GameDetail) => g.homeScore != null && g.awayScore != null;

export interface Ticket {
  game?: GameDetail;
  week: number;
  bye?: boolean;
  type: string;
  opp?: string;
  home?: boolean;
  pf?: number;
  pa?: number;
  r?: 'W' | 'L' | 'T';
  ot?: boolean;
  /** Closing line: points the club was favoured by (negative = underdog) */
  fav?: number;
  upset?: 'win' | 'loss';
}

/** Upset threshold: the loser was favoured by at least this many points on the closing line */
export const UPSET_POINTS = 3;

/** Every regular-season and playoff game as a ticket, with the bye week; upsets judged by the closing line. */
export const ticketsOf = (games: GameDetail[], abbr: string): Ticket[] => {
  const out: Ticket[] = [];
  const reg = games.filter((g) => g.type === 'REG');
  const weeks = new Set(reg.map((g) => g.week));
  const last = Math.max(0, ...[...weeks]);
  const seasonWeeks = reg.length ? last : 0;
  for (let w = 1; w <= seasonWeeks; w += 1) {
    if (!weeks.has(w)) out.push({ week: w, bye: true, type: 'REG' });
    else {
      const g = reg.find((x) => x.week === w);
      if (g) out.push(ticketOf(g, abbr));
    }
  }
  games.filter((g) => g.type !== 'REG').forEach((g) => out.push(ticketOf(g, abbr)));
  return out;
};
const ticketOf = (g: GameDetail, abbr: string): Ticket => {
  const home = g.home === abbr;
  const done = played(g);
  const pf = done ? (home ? g.homeScore : g.awayScore) : undefined;
  const pa = done ? (home ? g.awayScore : g.homeScore) : undefined;
  const r = pf == null || pa == null ? undefined : pf > pa ? 'W' : pf < pa ? 'L' : 'T';
  // spread_line is the home club's closing margin: positive = the home club was favoured
  const fav = g.spread == null ? undefined : home ? g.spread : -g.spread;
  const upset = r === 'W' && fav != null && fav <= -UPSET_POINTS ? 'win' : r === 'L' && fav != null && fav >= UPSET_POINTS ? 'loss' : undefined;
  return { game: g, week: g.week, type: g.type, opp: home ? g.away : g.home, home, pf, pa, r, ot: g.ot, fav, upset };
};

const ROUND_NAME: Record<string, string> = { WC: 'Wild Card', DIV: 'Divisional', CON: 'Conference championship', SB: 'Super Bowl' };
export interface SeasonResult {
  /** "Won Super Bowl XLII", "Lost in the Divisional round", "Missed the playoffs", "Season in progress" */
  text: string;
  champion: boolean;
  playoffs: boolean;
  live: boolean;
}
export const resultOf = (games: GameDetail[] | null, abbr: string, sched: ScheduleSeason | null): SeasonResult => {
  if (!games?.length) return { text: '', champion: false, playoffs: false, live: false };
  const post = games.filter((g) => g.type !== 'REG');
  const live = games.some((g) => !played(g)) || (sched?.regularSeasonGames ? games.filter((g) => g.type === 'REG' && played(g)).length < Math.min(17, sched.regularSeasonGames) && !post.length : false);
  const lastPost = [...post].sort(gameOrder).filter(played).pop();
  if (!lastPost) return { text: live ? 'Season in progress' : 'Missed the playoffs', champion: false, playoffs: false, live };
  const t = ticketOf(lastPost, abbr);
  if (lastPost.type === 'SB') {
    const roman = sched?.superBowl?.roman;
    return t.r === 'W'
      ? { text: roman ? `Won Super Bowl ${roman}` : 'Won the Super Bowl', champion: true, playoffs: true, live: false }
      : { text: roman ? `Lost Super Bowl ${roman}` : 'Lost the Super Bowl', champion: false, playoffs: true, live: false };
  }
  return { text: `Lost in the ${ROUND_NAME[lastPost.type] ?? 'playoffs'}${lastPost.type === 'CON' ? '' : ' round'}`, champion: false, playoffs: true, live: false };
};

export const clubName = (abbr: string) => findNFLTeam(abbr)?.name ?? abbr;
