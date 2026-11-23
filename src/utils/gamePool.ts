import type { GamePlayer } from '@/config/ovr';
import { getStints, type IndexedExtras } from '@/utils/playerExtras';

/**
 * The Arcade's player pool across eras (NFL edition: every season from 1999).
 *
 *  - `loadGamePool(mode, era)` is the ONE place the games ask for players beyond the core league load. CAR mode wants
 *    the retirees too, SZN mode (this season, actives) wants none. Today the retirees already arrive with the core
 *    league (initial-data.csv), so this resolves to []; when the history players are split out into their own file
 *    (nfl-perf's core / history load) only this function changes: fetch that file here, lazily, and return its players
 *    (already normalised like the league's). Nothing else in the Arcade knows where players come from.
 *  - `inEra(p, era, extras)` filters by career span: a player belongs to a decade when any season of his stints falls
 *    in it (a 2008-2022 career is in the 2000s, 2010s and 2020s). No stints: an active player is in the current
 *    decade, anyone else is only in "All".
 */

export type GameMode = 'car' | 'szn';
export type Era = 'all' | '2020s' | '2010s' | '2000s' | '1970s-90s';
export const ERAS: { id: Era; label: string; from: number; to: number }[] = [
  { id: 'all', label: 'All eras', from: 1970, to: 9999 },
  { id: '2020s', label: '2020s', from: 2020, to: 2029 },
  { id: '2010s', label: '2010s', from: 2010, to: 2019 },
  { id: '2000s', label: '2000s', from: 2000, to: 2009 },
  { id: '1970s-90s', label: '1970s–90s', from: 1970, to: 1999 },
];
export const eraById = (id: string): (typeof ERAS)[number] => ERAS.find((e) => e.id === id) ?? ERAS[0];

const CURRENT = new Date().getFullYear();

/** First and last season of a player's career from his stints (null when none are on file). */
export const careerSpan = (p: { name: string }, extras: IndexedExtras): [number, number] | null => {
  const st = getStints(extras, p.name)?.stints;
  if (!st?.length) return null;
  return [Math.min(...st.map((s) => s.from)), Math.max(...st.map((s) => s.to))];
};

export const inEra = (p: GamePlayer, era: Era, extras: IndexedExtras): boolean => {
  if (era === 'all') return true;
  const e = eraById(era);
  const span = careerSpan(p, extras);
  if (!span) return p.status !== 'Retired' && CURRENT >= e.from && CURRENT <= e.to;
  return span[0] <= e.to && span[1] >= e.from;
};

let retireesRequest: Promise<GamePlayer[]> | null = null;
/** Retired players that are not in the core league load. Swap point for the history split (see the header). */
const loadRetirees = (): Promise<GamePlayer[]> => (retireesRequest ??= Promise.resolve([]));

/** Players a game needs beyond the core league for this mode and era; lazy, memoized, and empty in SZN mode. */
export const loadGamePool = async (mode: GameMode, era: Era): Promise<GamePlayer[]> => {
  void era; // the history file is one piece today; a per-decade split would pick its pieces by era here
  return mode === 'szn' ? [] : loadRetirees();
};
