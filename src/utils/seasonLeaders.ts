import { useEffect, useState } from 'react';
import { dataResponse } from '@/utils/dataStore';

/**
 * NFL edition: this season's boards (public/data/league/season_leaders.json, scripts/nfl/season_leaders.py): stat
 * leaders, PPR leaders, the latest week's best games, the rookies and a projected award race. Read by the screensaver.
 */
export type LeaderRow = [key: string, value: number, line: string];
export interface WeekLine { 0: string; 1: string; 2: string; 3: number; 4: string }
export interface SeasonLeaders {
  season: number;
  through: number;
  leaders: Record<'passing' | 'rushing' | 'receiving' | 'sacks' | 'interceptions', LeaderRow[]>;
  fantasy: LeaderRow[];
  awards: Record<'MVP' | 'OPOY' | 'DPOY' | 'OROY' | 'DROY', LeaderRow[]>;
  rookies: { offense: LeaderRow[]; defense: LeaderRow[] };
  /** [key, team, opponent, PPR points, game line] */
  potw: { week: number; offense: [string, string, string, number, string][]; defense: [string, string, string, number, string][] };
  awardsAbout: string;
}

let req: Promise<SeasonLeaders | null> | null = null;
export const useSeasonLeaders = (): SeasonLeaders | null | undefined => {
  const [d, setD] = useState<SeasonLeaders | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (req ??= dataResponse('data/league/season_leaders.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)).then((x) => alive && setD(x));
    return () => {
      alive = false;
    };
  }, []);
  return d;
};
