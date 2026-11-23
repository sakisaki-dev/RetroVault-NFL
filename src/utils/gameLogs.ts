import { useEffect, useState } from 'react';

/**
 * NFL edition: a player's game log (public/data/nfl/games/<slug>.json, scripts/nfl/games_public.py), one small file per
 * player loaded on demand and memoised. `cols` lists the columns kept (zero-only ones dropped); a row is one game.
 */
export interface GameLog {
  key: string;
  cols: string[];
  games: Array<Array<number | string | null>>;
}
export type GameRow = Record<string, number | string | null>;

export const logSlug = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const jobs = new Map<string, Promise<GameLog | null>>();
export const loadGameLog = (key: string): Promise<GameLog | null> => {
  let j = jobs.get(key);
  if (!j) {
    j = fetch(`${import.meta.env.BASE_URL}data/nfl/games/${logSlug(key)}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<GameLog>) : null))
      .catch(() => null);
    jobs.set(key, j);
  }
  return j;
};

/** The rows of a log as objects, oldest first. */
export const rowsOf = (log: GameLog | null | undefined): GameRow[] => (log ? log.games.map((g) => Object.fromEntries(log.cols.map((c, i) => [c, g[i]]))) : []);

/** undefined while loading, null when he has no log. */
export const useGameLog = (key: string | undefined, on = true): GameLog | null | undefined => {
  const [log, setLog] = useState<{ key: string; log: GameLog | null } | null>(null);
  useEffect(() => {
    if (!on || !key) return;
    let live = true;
    void loadGameLog(key).then((l) => live && setLog({ key, log: l }));
    return () => {
      live = false;
    };
  }, [key, on]);
  return !on || !key ? null : log && log.key === key ? log.log : undefined;
};
