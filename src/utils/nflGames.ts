import { useEffect, useState } from 'react';
import { dataResponse } from '@/utils/dataStore';

/**
 * NFL edition: the Game page's data. Everything is lazy and per season (public/data/nfl/game/<year>.json, built by
 * scripts/nfl/game_detail.py, about 1 MB a season): a season's file loads when a game of that season is opened or
 * previewed, the id index (ids.json, 230 KB) when a page needs to link a game, sb.json (every Super Bowl's id) for
 * the team page's strips. Nothing here is in a startup file.
 */

export interface RawSeason {
  v: number;
  season: number;
  pc: string[];
  tc: string[];
  p: [name: string, gsis: string][];
  g: RawGame[];
}
interface RawGame {
  id: string;
  w: number;
  t: string;
  d: string;
  tm?: string;
  a: string;
  h: string;
  as?: number;
  hs?: number;
  ot?: number;
  sp?: number;
  tl?: number;
  ml?: [number, number];
  roof?: string;
  surf?: string;
  temp?: number;
  wind?: number;
  ac?: string;
  hc?: string;
  aq?: string;
  hq?: string;
  ref?: string;
  sd?: string;
  ar?: number;
  hr?: number;
  ts?: ([] | (number | null)[] | null)[];
  r?: [number, 0 | 1, string, number[]][];
}

export type Stat = Record<string, number>;
export interface GamePlayer {
  name: string;
  gsis: string;
  /** nflverse position (OT, DE, FS...) */
  pos: string;
  /** 0 = away, 1 = home */
  side: 0 | 1;
  s: Stat;
}
export interface GameDetail {
  id: string;
  season: number;
  week: number;
  /** REG, WC, DIV, CON, SB */
  type: string;
  date: string;
  time?: string;
  away: string;
  home: string;
  awayScore?: number;
  homeScore?: number;
  ot: boolean;
  spread?: number;
  total?: number;
  moneyline?: [number, number];
  roof?: string;
  surface?: string;
  temp?: number;
  wind?: number;
  awayCoach?: string;
  homeCoach?: string;
  awayQb?: string;
  homeQb?: string;
  referee?: string;
  stadium?: string;
  rest: [number | undefined, number | undefined];
  /** team stat lines, [away, home] (null when the year has none) */
  team: [Stat, Stat] | null;
  players: GamePlayer[];
}

const decode = (raw: RawSeason, g: RawGame): GameDetail => {
  const team = g.ts && g.ts[0] && g.ts[1] ? ([0, 1].map((i) => Object.fromEntries(raw.tc.map((c, k) => [c, (g.ts![i] as number[])[k] ?? 0]))) as [Stat, Stat]) : null;
  return {
    id: g.id,
    season: raw.season,
    week: g.w,
    type: g.t,
    date: g.d,
    time: g.tm,
    away: g.a,
    home: g.h,
    awayScore: g.as,
    homeScore: g.hs,
    ot: !!g.ot,
    spread: g.sp,
    total: g.tl,
    moneyline: g.ml,
    roof: g.roof,
    surface: g.surf,
    temp: g.temp,
    wind: g.wind,
    awayCoach: g.ac,
    homeCoach: g.hc,
    awayQb: g.aq,
    homeQb: g.hq,
    referee: g.ref,
    stadium: g.sd,
    rest: [g.ar, g.hr],
    team,
    players: (g.r ?? []).map(([pi, side, pos, pairs]) => {
      const s: Stat = {};
      for (let i = 0; i < pairs.length; i += 2) s[raw.pc[pairs[i]]] = pairs[i + 1];
      return { name: raw.p[pi][0], gsis: raw.p[pi][1], pos, side, s };
    }),
  };
};

const base = () => `${import.meta.env.BASE_URL}data/nfl/game/`;
const seasons = new Map<number, Promise<Map<string, GameDetail> | null>>();
/** A season's games by id (memoised). */
export const loadGameSeason = (year: number): Promise<Map<string, GameDetail> | null> => {
  let p = seasons.get(year);
  if (!p) {
    p = dataResponse(`data/nfl/game/${year}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<RawSeason>) : null))
      .then((raw) => (raw ? new Map(raw.g.map((g) => [g.id, decode(raw, g)])) : null))
      .catch(() => null);
    seasons.set(year, p);
  }
  return p;
};

/** A game id is "<season>_<week>_<away>_<home>" */
export const yearOfGame = (id: string): number => Number(id.slice(0, 4));

/** undefined while loading, null when the game isn't in the data. */
export const useGameDetail = (id: string | undefined): GameDetail | null | undefined => {
  const [v, setV] = useState<{ id: string; g: GameDetail | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    void loadGameSeason(yearOfGame(id)).then((m) => live && setV({ id, g: m?.get(id) ?? null }));
    return () => {
      live = false;
    };
  }, [id]);
  return !id ? null : v && v.id === id ? v.g : undefined;
};

/** Every game of one season, in date order (undefined while loading). */
export const useSeasonGames = (year: number | undefined): GameDetail[] | null | undefined => {
  const [v, setV] = useState<{ year: number; g: GameDetail[] | null } | null>(null);
  useEffect(() => {
    if (!year) return;
    let live = true;
    void loadGameSeason(year).then((m) => live && setV({ year, g: m ? [...m.values()] : null }));
    return () => {
      live = false;
    };
  }, [year]);
  return !year ? null : v && v.year === year ? v.g : undefined;
};

/* ---------- ids: the Season page's cards and the team page's strips find a game's id ---------- */

export type GameIds = Record<string, Record<string, string>>;
let idsJob: Promise<GameIds | null> | null = null;
export const loadGameIds = (): Promise<GameIds | null> => {
  idsJob ??= dataResponse('data/nfl/game/ids.json')
    .then((r) => (r.ok ? (r.json() as Promise<GameIds>) : null))
    .catch(() => null);
  return idsJob;
};
export const useGameIds = (on = true): GameIds | null => {
  const [ids, setIds] = useState<GameIds | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    void loadGameIds().then((v) => live && setIds(v));
    return () => {
      live = false;
    };
  }, [on]);
  return ids;
};
/** A regular-season game's id (abbreviations as schedule.json). */
export const regularGameId = (ids: GameIds | null, year: string | number, week: number, away: string, home: string) => ids?.[String(year)]?.[`${week}-${away}-${home}`];
/** A playoff game's id (the pair is unique in a postseason). */
export const playoffGameId = (ids: GameIds | null, year: string | number, away: string, home: string) => ids?.[String(year)]?.[`p-${away}-${home}`];
/** The last game a club played in a season: its playoff exit, else its final regular-season week. */
export const lastGameIdOf = (ids: GameIds | null, year: string | number, abbr: string): string | undefined => {
  const m = ids?.[String(year)];
  if (!m) return undefined;
  let best: { w: number; id: string } | undefined;
  for (const [k, id] of Object.entries(m)) {
    if (k.startsWith('p-')) continue;
    const [w, a, h] = k.split('-');
    if (a !== abbr && h !== abbr) continue;
    if (!best || Number(w) > best.w) best = { w: Number(w), id };
  }
  return best?.id;
};

let sbJob: Promise<Record<string, string>> | null = null;
export const loadSuperBowlIds = (): Promise<Record<string, string>> => {
  sbJob ??= dataResponse('data/nfl/game/sb.json')
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
    .catch(() => ({}));
  return sbJob;
};
export const useSuperBowlIds = (): Record<string, string> | null => {
  const [v, setV] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let live = true;
    void loadSuperBowlIds().then((x) => live && setV(x));
    return () => {
      live = false;
    };
  }, []);
  return v;
};

/** The hash that opens a game (Stats › Game). */
export const gameHash = (id: string) => `#stats/game?id=${encodeURIComponent(id)}`;
/** Opens the Game page from anywhere. */
export const openGame = (id: string) => {
  window.location.hash = gameHash(id);
};

export const ROUND_NAME: Record<string, string> = { REG: 'Regular season', WC: 'Wild Card', DIV: 'Divisional round', CON: 'Conference championship', SB: 'Super Bowl' };
