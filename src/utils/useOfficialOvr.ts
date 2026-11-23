import { useEffect, useMemo, useState } from 'react';
import { useLeague } from '@/context/LeagueContext';
import type { Position } from '@/types/player';
import { normalizeLeague } from '@/config/stats';
import { buildGamePool, displayOvr, officialOvrMap, setCareerRatings, type CareerRatingFile, type GamePlayer, type LegendPhoto, type OvrBasis, type SeasonOvrFile } from '@/config/ovr';
import { dataResponse } from '@/utils/dataStore';
import { IS_NFL } from '@/config/edition';

// ---------- Loaders (one request per page load; 404 / bad JSON resolve to empty) ----------

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'];
const BASE_NUMBERS = ['games', 'rings', 'mvp', 'opoy', 'sbmvp', 'roty', 'trueTalent', 'dominance', 'careerLegacy', 'tpg'] as const;

const normalizePhoto = (raw: unknown): LegendPhoto | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== 'string' || !/^https:\/\//.test(r.url)) return undefined;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const page = str(r.page);
  return { url: r.url, page: page && /^https:\/\//.test(page) ? page : undefined, author: str(r.author), license: str(r.license) };
};

const normalizeLegend = (raw: unknown): GamePlayer | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name.trim() || !POSITIONS.includes(r.position as Position)) return null;
  const out: Record<string, unknown> = {
    ...r,
    name: r.name.trim(),
    isRealLegend: true,
    status: r.status === 'Active' ? 'Active' : 'Retired',
    photo: normalizePhoto(r.photo),
  };
  BASE_NUMBERS.forEach((k) => {
    const v = Number(r[k]);
    out[k] = Number.isFinite(v) ? v : 0;
  });
  return out as unknown as GamePlayer;
};

let seasonOvrRequest: Promise<SeasonOvrFile | null> | null = null;
let careerRatingRequest: Promise<unknown> | null = null;
let legendsRequest: Promise<GamePlayer[]> | null = null;
let exclusionsRequest: Promise<Set<string>> | null = null;

const fetchJson = (path: string): Promise<unknown> =>
  dataResponse(path)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

/** Fetches data/league/season_ovr.json once per page load (null when missing: every rating is then the career one). */
let seasonOvrLoaded: SeasonOvrFile | null = null;
/**
 * The label of the rating the site SHOWS for a player: SZN when it is his season OVR (an active player with a season
 * line), else CAR (retired, or no games this season). Read after the season file has loaded (ratings are empty before).
 */
export const ovrLabelOf = (p: { position: string; name: string; status?: string }): 'SZN' | 'CAR' =>
  p.status !== 'Retired' && seasonOvrLoaded?.ovr[`${p.position}:${p.name}`] != null ? 'SZN' : 'CAR';

export const loadSeasonOvr = (): Promise<SeasonOvrFile | null> => {
  seasonOvrRequest ??= fetchJson('data/league/season_ovr.json').then((d) =>
    (seasonOvrLoaded = d && typeof d === 'object' && (d as SeasonOvrFile).ovr ? (d as SeasonOvrFile) : null),
  );
  return seasonOvrRequest;
};

/** NFL edition: the precomputed career ratings (scripts/nfl/career_rating.py), registered before any rating is computed. */
export const loadCareerRatings = (): Promise<unknown> => {
  if (!IS_NFL) return Promise.resolve(null);
  careerRatingRequest ??= fetchJson('data/nfl/career_rating.json').then((d) => {
    setCareerRatings(d as CareerRatingFile | null);
    return d;
  });
  return careerRatingRequest;
};

/** Fetches /data/legends.json once per page load. Missing file, 404 or bad JSON all resolve to []. */
export const loadLegends = (): Promise<GamePlayer[]> => {
  legendsRequest ??= fetchJson('data/legends.json').then((data) =>
    Array.isArray(data) ? data.map(normalizeLegend).filter((p): p is GamePlayer => !!p) : [],
  );
  return legendsRequest;
};

/** Fetches /data/game-exclusions.json ({ excludeFromGames: ["RB:Name", ...] }); missing file resolves to an empty set. */
export const loadExclusions = (): Promise<Set<string>> => {
  exclusionsRequest ??= fetchJson('data/game-exclusions.json').then((data) => {
    const list = (data as { excludeFromGames?: unknown } | null)?.excludeFromGames;
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : []);
  });
  return exclusionsRequest;
};

// ---------- Hooks ----------

/**
 * The derived pool, computed once per set of inputs (identity): legends on the league's factors, the game pool, the career
 * OVR map and the displayed one. Every useGamePool() caller shares it (a component mounting later gets it for free).
 */
let poolMemo: { args: unknown[]; value: ReturnType<typeof computePool> } | null = null;
const computePool = (allLeague: GamePlayer[], allLegends: GamePlayer[], excluded: Set<string>, loaded: boolean, seasonOvr: SeasonOvrFile | null) => {
  // Legends arrive with raw True Talent only: put them on the league's position factors and derive Dominance,
  // Career Legacy and TPG the same way as league players (legends never influence the factors)
  const scaledLegends = allLegends.length ? (normalizeLeague([...allLeague, ...allLegends]).slice(allLeague.length) as GamePlayer[]) : allLegends;
  const { league, legends } = buildGamePool(allLeague, scaledLegends, excluded);
  /** The CAREER rating (card market, collectible tiers) */
  const careerOvrMap = loaded ? officialOvrMap(allLeague, scaledLegends, excluded) : new Map<string, number>();
  /** The DISPLAYED rating: season OVR for active players, career for retirees (config/ovr.ts displayOvr) */
  const shown = displayOvr([...allLeague, ...scaledLegends], careerOvrMap, seasonOvr);
  return { scaledLegends, league, legends, careerOvrMap, shown };
};
const sharedPool = (allLeague: GamePlayer[], allLegends: GamePlayer[], excluded: Set<string>, loaded: boolean, seasonOvr: SeasonOvrFile | null) => {
  const args = [allLeague, allLegends, excluded, loaded, seasonOvr];
  if (poolMemo && poolMemo.args.every((a, i) => a === args[i])) return poolMemo.value;
  const value = computePool(allLeague, allLegends, excluded, loaded, seasonOvr);
  poolMemo = { args, value };
  return value;
};

/**
 * The game pool from context + legends.json − game-exclusions.json, plus the official OVR map over it.
 * `loaded` turns true once both files have resolved (OVRs before that would shift, so the map is empty).
 */
const NO_LEGENDS: GamePlayer[] = [];
const NO_EXCLUSIONS = new Set<string>();
/** The three small files once they have all resolved (a component mounting later starts from them, no empty first render) */
let resolvedInputs: { legends: GamePlayer[]; excluded: Set<string>; seasonOvr: SeasonOvrFile | null } | null = null;

export const useGamePool = () => {
  const { getAllPlayers, dataVersion } = useLeague();
  const [allLegends, setAllLegends] = useState<GamePlayer[]>(resolvedInputs?.legends ?? NO_LEGENDS);
  const [excluded, setExcluded] = useState<Set<string>>(resolvedInputs?.excluded ?? NO_EXCLUSIONS);
  const [seasonOvr, setSeasonOvr] = useState<SeasonOvrFile | null>(resolvedInputs?.seasonOvr ?? null);
  const [loaded, setLoaded] = useState(!!resolvedInputs);

  useEffect(() => {
    let alive = true;
    Promise.all([loadLegends(), loadExclusions(), loadSeasonOvr(), loadCareerRatings()]).then(([list, ex, so]) => {
      resolvedInputs = { legends: list, excluded: ex, seasonOvr: so };
      if (!alive) return;
      setAllLegends(list);
      setExcluded(ex);
      setSeasonOvr(so);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const allLeague = useMemo<GamePlayer[]>(() => getAllPlayers(), [getAllPlayers]);
  // One computation for every caller (42 components read this hook): the inputs are the same objects everywhere, so a
  // single-slot memo at module level turns 42 pool builds into one
  const { league, legends, careerOvrMap, shown } = sharedPool(allLeague, allLegends, excluded, loaded, seasonOvr);
  return { league, legends, ovrMap: shown.ovr, careerOvrMap, ovrBasis: shown.basis as Map<string, OvrBasis>, seasonOvr, loaded, dataVersion };
};

/**
 * Displayed OVR for stats pages (season for active players, career for retirees; see config/ovr.ts displayOvr): Map keyed by "POS:Name" (see playerKey). Same numbers as the arcade.
 * Empty until legends.json / game-exclusions.json resolve (both tolerate 404s).
 */
export const useOfficialOvr = (): Map<string, number> => useGamePool().ovrMap;
