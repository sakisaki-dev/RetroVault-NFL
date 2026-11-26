import { useEffect, useState } from 'react';
import { dataJson } from '@/utils/dataStore';
import { findNFLTeam } from '@/utils/nflTeams';

/**
 * NFL edition: league leaders, awards, black ink and streaks (scripts/nfl/season_boards.py, public/data/nfl/).
 * Real nflverse regular-season lines 1999-2026 and the AP awards. Everything loads lazily and is memoised.
 *
 * BLACK INK: the number of seasons a player led the league in a headline stat (ties share the lead; the season in
 * progress never counts). The headline stats (INK_STATS, one list for the whole site):
 *   pyds passing yards, ptd passing TD, ryds rushing yards, rtd rushing TD, rec receptions, recyds receiving yards,
 *   rectd receiving TD, tkl tackles (solo + assists), sack sacks (id "sck"), int interceptions.
 * League-wide, any position, 1999 on. Use `blackInk(key)` (after `loadInk()` / `useInk()`), `blackInkYears(key)` for the
 * seasons, `inkFor(key)` for the per-stat breakdown.
 *
 * STREAKS: runs of straight completed seasons over a mark, and seasons over it (MARKS in the build script: 4,000 pass
 * yds, 30 pass TD, 1,000 rush yds, 1,000 rec yds, 100 rec, 10 sacks, 100 tackles, 5 INT). A run is "alive" when it
 * reaches the latest completed season. `streaksForClubSeason(club, season)` is the helper for a club-season sheet.
 */

export const INK_STATS: { id: string; label: string; short: string; group: 'pass' | 'rush' | 'rec' | 'def' | 'kick' }[] = [
  { id: 'pyds', label: 'Passing yards', short: 'Pass yds', group: 'pass' },
  { id: 'ptd', label: 'Passing TD', short: 'Pass TD', group: 'pass' },
  { id: 'ryds', label: 'Rushing yards', short: 'Rush yds', group: 'rush' },
  { id: 'rtd', label: 'Rushing TD', short: 'Rush TD', group: 'rush' },
  { id: 'rec', label: 'Receptions', short: 'Rec', group: 'rec' },
  { id: 'recyds', label: 'Receiving yards', short: 'Rec yds', group: 'rec' },
  { id: 'rectd', label: 'Receiving TD', short: 'Rec TD', group: 'rec' },
  { id: 'tkl', label: 'Tackles', short: 'Tackles', group: 'def' },
  { id: 'sck', label: 'Sacks', short: 'Sacks', group: 'def' },
  { id: 'int', label: 'Interceptions', short: 'INT', group: 'def' },
  { id: 'fgm', label: 'Field goals made', short: 'FG', group: 'kick' },
  { id: 'fg50', label: 'Field goals from 50+', short: 'FG 50+', group: 'kick' },
];
export const INK_LABEL: Record<string, string> = Object.fromEntries(INK_STATS.map((s) => [s.id, s.label]));

/** [key|null, name, position, club abbr, value, games] */
export type LeaderRow = [key: string | null, name: string, pos: string, club: string, value: number, games: number];
export interface AwardWin {
  n: string;
  k: string | null;
  pos: string;
  team: string;
}
export interface SeasonBoard {
  season: number;
  complete: boolean;
  leaders: Record<string, LeaderRow[]>;
  awards: Record<string, AwardWin[]>;
}
export interface Honours {
  kinds: string[];
  awards: Record<string, Record<string, AwardWin[]>>;
}
export type InkFile = { stats: Record<string, string>; last: number; players: Record<string, Record<string, number[]>> };
export interface Threshold {
  id: string;
  stat: string;
  mark: number;
  label: string;
}
export interface RunRow {
  k: string;
  n: string;
  from: number;
  to: number;
  len: number;
  alive: boolean;
  clubs: string[];
}
export interface MostRow {
  k: string;
  n: string;
  seasons: number;
  from: number;
  to: number;
  alive: boolean;
}
export interface StreakFile {
  last: number;
  thresholds: Threshold[];
  longest: Record<string, RunRow[]>;
  most: Record<string, MostRow[]>;
  /** [mark id, key, first season, last season, club abbreviation per season] */
  runs: [string, string, number, number, string[]][];
}

/** One memoised loader and a hook per file (undefined while loading, null when missing). */
const make = <T>(path: string) => {
  let job: Promise<T | null> | null = null;
  let done: T | null | undefined;
  const load = () => (job ??= dataJson<T>(path).then((d) => (done = d)));
  const use = (): T | null | undefined => {
    const [v, set] = useState<T | null | undefined>(done);
    useEffect(() => {
      if (done !== undefined) return void set(done);
      let live = true;
      void load().then((d) => live && set(d));
      return () => {
        live = false;
      };
    }, []);
    return v;
  };
  return { load, use, get: () => done };
};

const ink = make<InkFile>('data/nfl/ink.json');
const streaks = make<StreakFile>('data/nfl/streaks.json');
const honours = make<Honours>('data/nfl/honours.json');
export const loadInk = ink.load;
export const useInk = ink.use;
export const loadStreaks = streaks.load;
export const useStreaks = streaks.use;
export const loadHonours = honours.load;
export const useHonours = honours.use;

const boards = new Map<number, Promise<SeasonBoard | null>>();
const boardDone = new Map<number, SeasonBoard | null>();
export const loadSeasonBoard = (year: number) => {
  let j = boards.get(year);
  if (!j) {
    j = dataJson<SeasonBoard>(`data/nfl/seasons/${year}.json`).then((d) => {
      boardDone.set(year, d);
      return d;
    });
    boards.set(year, j);
  }
  return j;
};
/** undefined while loading, null when the season has no file (before 1999). */
export const useSeasonBoard = (year: number | null): SeasonBoard | null | undefined => {
  const [v, set] = useState<{ year: number; b: SeasonBoard | null } | null>(null);
  useEffect(() => {
    if (year == null) return;
    let live = true;
    void loadSeasonBoard(year).then((b) => live && set({ year, b }));
    return () => {
      live = false;
    };
  }, [year]);
  return year == null ? null : v && v.year === year ? v.b : undefined;
};

/* ---------------- Black ink ---------------- */

/** His seasons led, by stat id ({} when none or before the file is loaded). */
export const inkFor = (key: string): Record<string, number[]> => ink.get()?.players[key] ?? {};
/** The number of seasons he led the league in a headline stat (a season leading two stats counts twice, as black ink always has). */
export const blackInk = (key: string): number => Object.values(inkFor(key)).reduce((a, ys) => a + ys.length, 0);
/** Every season he led in anything, ascending. */
export const blackInkYears = (key: string): number[] => [...new Set(Object.values(inkFor(key)).flat())].sort((a, b) => a - b);
/** Hook: black ink for one player (0 until the file is in). */
export const useBlackInk = (key: string | undefined): number => {
  const f = useInk();
  return key && f ? Object.values(f.players[key] ?? {}).reduce((a, ys) => a + ys.length, 0) : 0;
};

/* ---------------- Streaks ---------------- */

const club = (a: string) => findNFLTeam(a)?.id ?? a;
export interface ClubStreak {
  /** threshold id and label ("1,000 rush yds") */
  id: string;
  label: string;
  key: string;
  name: string;
  /** his club abbreviation that season */
  club: string;
  /** straight seasons through the asked season, and the run's first season */
  len: number;
  from: number;
  /** the run reached the latest completed season, so it is still going */
  alive: boolean;
}
/**
 * The streaks (3+ straight seasons over a mark) running through `season` for players who were on `club` (name,
 * nickname or abbreviation) that season, longest first. Needs `loadStreaks()` to have resolved (empty before).
 * Pass `clubOf: false` to ignore the club and list the whole league.
 */
export const streaksForClubSeason = (clubName: string | null, season: number, min = 3): ClubStreak[] => {
  const f = streaks.get();
  if (!f) return [];
  const want = clubName ? club(clubName) : null;
  const label = new Map(f.thresholds.map((t) => [t.id, t.label]));
  const name = new Map<string, string>();
  Object.values(f.longest).forEach((l) => l.forEach((r) => name.set(r.k, r.n)));
  const out: ClubStreak[] = [];
  for (const [id, key, from, to, clubs] of f.runs) {
    if (from > season || to < season || season - from + 1 < min) continue;
    if (want && club(clubs[season - from]) !== want) continue;
    out.push({ id, label: label.get(id) ?? id, key, name: name.get(key) ?? key.slice(key.indexOf(':') + 1), club: clubs[season - from], len: season - from + 1, from, alive: to === f.last });
  }
  return out.sort((a, b) => b.len - a.len || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
};

/** The league leaders (every headline stat) who led for `club` that season, from a loaded season board. */
export const leadersForClubSeason = (clubName: string, season: number): { stat: string; row: LeaderRow }[] => {
  const b = boardDone.get(season);
  if (!b) return [];
  const want = club(clubName);
  return Object.entries(b.leaders).flatMap(([stat, rows]) => (rows[0] && club(rows[0][3]) === want ? [{ stat, row: rows[0] }] : []));
};
