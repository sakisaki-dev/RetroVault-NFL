import { useEffect, useState } from 'react';
import { dataJson } from '@/utils/dataStore';

/**
 * NFL edition: playoff odds, clinch scenarios and next week's picks for the season in progress
 * (public/data/nfl/playoff_odds.json, built by scripts/nfl/playoff_odds.py; the model is described in that script's
 * docstring and summarised on the panel). One small file, loaded once and shared.
 */
export type Clinch = 'x' | 'y' | 'z' | 'e' | null;
export interface OddsClub {
  conf: 'AFC' | 'NFC';
  division: string;
  w: number;
  l: number;
  t: number;
  left: number;
  diff: number;
  rating: number;
  playoffs: number;
  divWin: number;
  bye: number;
  conference: number;
  superBowl: number;
  seeds: number[];
  expWins: number;
  tag: Clinch;
  /** final status only: the seed the club earned (1 to 7), null when out */
  seed?: number | null;
  /** the next draft's first-round slot over the simulations (playoff_odds.py draft_slot) */
  draft?: DraftSlot;
}
/** mode = most likely pick, lo..hi = the middle 90% of the simulated slots, dist = chance of each pick (1 first) */
export interface DraftSlot { mode: number; mean: number; lo: number; hi: number; dist: number[] }
export interface OddsScenario { club: string; kind: 'z' | 'y' | 'x' | 'e'; text: string }
export interface PickGame {
  id: string;
  week: number;
  away: string;
  home: string;
  day: string;
  date: string;
  time: string;
  line: number | null;
  pHome: number;
  basis: 'line' | 'rating';
  awayRec: string;
  homeRec: string;
  ratings: [number, number];
  gotw: boolean;
}
export interface Scorecard {
  lastWeek: null | { week: number; w: number; l: number; t: number; tossups: number; pct: number | null; upset: null | { id: string; winner: string; loser: string; chance: number; score: string; winnerHome: boolean } };
  season: { w: number; l: number; t: number; tossups: number; pct: number | null };
}
export interface PlayoffOdds {
  season: number;
  status: 'live' | 'final';
  week: number;
  weeksTotal: number;
  played: number;
  left: number;
  sims: number;
  method: { line: string; sigma: number; hfa: number; shrink: number };
  clubs: Record<string, OddsClub>;
  scenarios: OddsScenario[];
  picks: { week: number; games: PickGame[]; gameOfTheWeek: string | null; scorecard: Scorecard };
  /** the projected first round of the next draft: clubs (abbreviations) by average slot, and the rule in words */
  draft?: { year: number; rule: string; order: string[] };
}

let job: Promise<PlayoffOdds | null> | null = null;
export const usePlayoffOdds = (on = true): PlayoffOdds | null => {
  const [d, setD] = useState<PlayoffOdds | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    (job ??= dataJson<PlayoffOdds>('data/nfl/playoff_odds.json')).then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, [on]);
  return d;
};

/** A chance as the panel prints it: whole percent, "<1%" and ">99%" where the rounding would claim certainty. */
export const pctText = (p: number): string => (p <= 0 ? '0%' : p < 0.005 ? '<1%' : p >= 0.995 && p < 1 ? '>99%' : `${Math.round(p * 100)}%`);
