import { useEffect, useState } from 'react';
import type { Player } from '@/types/player';
import { loadGameSeason, type GameDetail, type GamePlayer } from '@/utils/nflGames';
import { findNFLTeam } from '@/utils/nflTeams';
import { atsOf, played, podiumOf, sitePos, v, winnerOf } from '@/components/game/gameModel';
import { reducedMotion } from '@/utils/motion';
export { reducedMotion };

/** Shared by the NFL screensaver scenes that read the per-game files (public/data/nfl/game/<year>.json). */

export interface SaverWeek {
  season: number;
  week: number;
  type: string;
  games: GameDetail[];
}

/** The latest two seasons' game files, loaded once (memoised in nflGames); undefined while loading, [] when none. */
export const useSaverGames = (season: number | null, on: boolean): GameDetail[] | undefined => {
  const [g, setG] = useState<GameDetail[] | undefined>(undefined);
  useEffect(() => {
    if (!on || !season) return;
    let live = true;
    void Promise.all([loadGameSeason(season), loadGameSeason(season - 1)]).then(([a, b]) => {
      if (!live) return;
      const all = [...(b ? [...b.values()] : []), ...(a ? [...a.values()] : [])].filter(played);
      setG(all);
    });
    return () => {
      live = false;
    };
  }, [season, on]);
  return g;
};

/** Completed weeks (8 or more games with a score), latest first */
export const weeksOf = (games: GameDetail[]): SaverWeek[] => {
  const m = new Map<string, SaverWeek>();
  games.forEach((g) => {
    const k = `${g.season}-${g.week}`;
    const w = m.get(k) ?? { season: g.season, week: g.week, type: g.type, games: [] };
    w.games.push(g);
    m.set(k, w);
  });
  return [...m.values()]
    .filter((w) => w.games.length >= 8 || w.type !== 'REG')
    .sort((a, b) => b.season - a.season || b.week - a.week);
};

export const nameOfWeek = (w: SaverWeek) => (w.type === 'REG' ? `Week ${w.week}` : { WC: 'Wild Card', DIV: 'Divisional round', CON: 'Conference championship', SB: 'Super Bowl' }[w.type] ?? `Week ${w.week}`);

/** The underdog that won by the biggest closing spread (3 points or more), else null */
export const upsetOf = (games: GameDetail[]): { g: GameDetail; points: number; winner: string; loser: string } | null => {
  let best: { g: GameDetail; points: number; winner: string; loser: string } | null = null;
  games.forEach((g) => {
    const ats = atsOf(g);
    const w = winnerOf(g);
    if (!ats || w === null || ats.points < 3) return;
    if ((ats.favorite === 0) === (w === 0)) return;
    if (!best || ats.points > best.points) best = { g, points: ats.points, winner: w === 0 ? g.away : g.home, loser: w === 0 ? g.home : g.away };
  });
  return best;
};
export const marginOf = (g: GameDetail) => Math.abs((g.homeScore ?? 0) - (g.awayScore ?? 0));
export const biggestMargin = (games: GameDetail[]) => [...games].sort((a, b) => marginOf(b) - marginOf(a))[0];

/** How much a game is worth a replay: close finishes, overtime, upsets, primetime, the postseason */
export const notability = (g: GameDetail): number => {
  let s = 0;
  const m = marginOf(g);
  if (m <= 3) s += 3;
  else if (m <= 7) s += 1;
  if (g.ot) s += 2;
  const up = upsetOf([g]);
  if (up) s += 3 + up.points / 7;
  const day = new Date(`${g.date}T12:00:00`).getDay();
  if (day === 4 || day === 1 || (g.time ?? '') >= '20:00') s += 1.5;
  if (g.type !== 'REG') s += 4 + (g.type === 'SB' ? 3 : 0);
  if ((g.homeScore ?? 0) + (g.awayScore ?? 0) >= 60) s += 1;
  return s;
};
export const primetimeLabel = (g: GameDetail): string | null => {
  const day = new Date(`${g.date}T12:00:00`).getDay();
  if (day === 4 && (g.time ?? '') >= '19:00') return 'Thursday night';
  if (day === 1 && (g.time ?? '') >= '19:00') return 'Monday night';
  if (day === 0 && (g.time ?? '') >= '20:00') return 'Sunday night';
  return null;
};
/** A game worth replaying has a team box score and a podium of three */
export const replayable = (g: GameDetail) => !!g.team && podiumOf(g).length >= 3;

/* ---- players: a game's name to the site's card player (for the sprite) ---- */
const norm = (s: string) => s.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
export type Lookup = (gp: GamePlayer) => Player | undefined;
export const makeLookup = (players: Player[]): Lookup => {
  const by = new Map<string, Player[]>();
  players.forEach((p) => {
    const k = norm(p.name);
    by.set(k, [...(by.get(k) ?? []), p]);
  });
  return (gp) => {
    const c = by.get(norm(gp.name));
    if (!c?.length) return undefined;
    return c.find((p) => p.position === sitePos(gp.pos)) ?? c[0];
  };
};
export const clubAbbr = (g: GameDetail, side: 0 | 1) => (side === 0 ? g.away : g.home);
export const clubName = (abbr: string) => findNFLTeam(abbr)?.name ?? abbr;
export { v };

/** A slice of arrays in random order (presentation only) */
export const sample = <T,>(xs: T[], n: number): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};
export type SaverDeps = {
  Stadium: React.ComponentType<{ club: string; roll: number; children?: React.ReactNode; className?: string; look?: 'day' | 'dusk' | 'night' | 'snow' | 'dome' }>;
  /** the weather effect over the show now (real or forced): 'snow', 'rain', 'storm' or null */
  fx?: string | null;
  lookFor: (club: string, roll: number) => 'day' | 'dusk' | 'night' | 'snow' | 'dome';
  sprites: boolean;
  lookup: Lookup;
};
