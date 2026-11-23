import { useEffect, useState } from 'react';
import { dataResponse } from '@/utils/dataStore';

/**
 * NFL edition Team Lab data, each file loaded once on demand:
 *   depth_charts.json (scripts/nfl/depth_charts.py): every club's real depth chart, latest snapshot
 *   lab.json (scripts/nfl/lab_data.py): recency-weighted per-game numbers, salaries, team numbers, DST lines
 *   league/upcoming.json: the remaining schedule (weeks, clubs; byes are the clubs missing from a week)
 */
export interface DepthClub {
  base: '3-4' | '4-3';
  /** QB RB WR TE LT LG C RG RT → player keys, best first */
  o: Record<string, string[]>;
  /** The base defence's slots (LDE NT RDE WLB LILB RILB SLB LCB RCB SS FS, or the 4-3 set) → keys */
  d: Record<string, string[]>;
}
export interface DepthFile {
  season: number;
  at: string;
  clubs: Record<string, DepthClub>;
}
export interface LabPlayer {
  /** club abbreviation */
  t: string;
  /** the game's salary, millions */
  s: number;
  /** games in the sample (≤ 12) */
  n: number;
  /** weighted per game: pass yds, pass TD, INT, rush yds, rush TD, rec, rec yds, rec TD, fumbles lost, 2-pt */
  f: number[];
  /** defenders per game: sacks, QB hits, passes defended, INT, tackles, TFL, forced fumbles */
  d?: number[];
  /** targets, carries, sacks taken per game */
  r: number[];
}
export interface LabTeam {
  g: number;
  pf: number;
  pa: number;
  pyA: number;
  ryA: number;
  sk: number;
  skA: number;
  int: number;
  vs?: Record<string, number>;
}
export interface LabFile {
  season: number;
  cap: number;
  teams: Record<string, LabTeam>;
  /** per played game: week, sacks, INT, fumble recoveries, TDs, safeties, blocks, points allowed */
  dst: Record<string, number[][]>;
  p: Record<string, LabPlayer>;
}
export interface UpcomingGame {
  week: number;
  day: string;
  date: string;
  time: string;
  away: string;
  home: string;
}
export interface NflLabData {
  depth: DepthFile | null;
  lab: LabFile | null;
  games: UpcomingGame[];
}

const get = <T,>(path: string): Promise<T | null> =>
  dataResponse(`data/${path}`)
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);

let job: Promise<NflLabData> | null = null;
export const loadNflLabData = (): Promise<NflLabData> =>
  (job ??= Promise.all([get<DepthFile>('nfl/depth_charts.json'), get<LabFile>('nfl/lab.json'), get<{ games: UpcomingGame[] }>('league/upcoming.json')]).then(
    ([depth, lab, up]) => ({ depth, lab, games: up?.games ?? [] }),
  ));

/** null while loading. */
export const useNflLabData = (): NflLabData | null => {
  const [d, setD] = useState<NflLabData | null>(null);
  useEffect(() => {
    let live = true;
    void loadNflLabData().then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, []);
  return d;
};
