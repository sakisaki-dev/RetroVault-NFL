import { useEffect, useState } from 'react';
import { dataJson } from '@/utils/dataStore';
import { IS_NFL } from '@/config/edition';

/** public/data/nfl/thisseason.json (scripts/nfl/this_season.py): the live season for the Deep Dive's This season header. */
export interface SeasonStat { label: string; value: number; rank: number | null; of: number | null }
export interface NextGame { opp: string; home: boolean; week: number; date: string; time: string; p?: number }
export interface SeasonLine {
  club: string;
  games: number;
  stats: SeasonStat[];
  pace: Array<{ label: string; value: number }>;
  /** fantasy PPR: total, per game, position rank, of */
  ppr: { total: number; perGame: number; rank: number; of: number } | null;
}
export interface SeasonData { season: number; week: number; line: SeasonLine; next: NextGame | null }

interface Raw {
  season: number; week: number;
  clubs: Record<string, NextGame>;
  p: Record<string, { c: string; g: number; s: Array<[string, number, number | null, number | null]>; pace?: Array<[string, number]>; ppr?: [number, number, number, number] }>;
}
let job: Promise<Raw | null> | null = null;
let loaded: Raw | null | undefined;
const load = () => (job ??= dataJson<Raw>('data/nfl/thisseason.json').catch(() => null).then((d) => (loaded = d)));

export const seasonFor = (raw: Raw | null | undefined, key: string): SeasonData | null => {
  const r = raw?.p[key];
  if (!raw || !r) return null;
  return {
    season: raw.season, week: raw.week,
    line: {
      club: r.c, games: r.g,
      stats: r.s.map(([label, value, rank, of]) => ({ label, value, rank, of })),
      pace: (r.pace ?? []).map(([label, value]) => ({ label, value })),
      ppr: r.ppr ? { total: r.ppr[0], perGame: r.ppr[1], rank: r.ppr[2], of: r.ppr[3] } : null,
    },
    next: raw.clubs[r.c] ?? null,
  };
};

/** The player's live-season line; null while loading, off the NFL edition or when he has no game this season. */
export const useThisSeason = (key: string | null | undefined): SeasonData | null => {
  const [raw, setRaw] = useState(loaded);
  useEffect(() => {
    if (!IS_NFL || loaded !== undefined) return void setRaw(loaded);
    let alive = true;
    load().then((d) => alive && setRaw(d));
    return () => { alive = false; };
  }, []);
  return IS_NFL && key ? seasonFor(raw, key) : null;
};

/** The whole live-season file (every player's line), for pages that rank a club's players; null while loading. */
export const useThisSeasonAll = (): Raw | null => {
  const [raw, setRaw] = useState<Raw | null>(loaded ?? null);
  useEffect(() => {
    if (!IS_NFL) return;
    let alive = true;
    load().then((d) => alive && setRaw(d));
    return () => { alive = false; };
  }, []);
  return raw;
};
