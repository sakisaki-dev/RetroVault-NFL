import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeague } from '@/context/LeagueContext';
import { useGamePool } from '@/utils/useOfficialOvr';
import { useInjuryList, type InjuryCode } from '@/utils/injuries';
import { useNflLabData } from '@/utils/nflLabData';
import { createNflCtx, withStarters, type NLineup, type NflCtx } from '@/utils/nflLab';
import { buildSched, type FLineup, type Scoring, type ScoringId } from '@/utils/nflFantasy';
import { NFL_TEAMS } from '@/utils/nflTeams';

/** Everything the NFL Team Lab reads: the profiles, the real data files, the injuries and the schedule. */
export const useNflLab = () => {
  const { careerData, getAllPlayers } = useLeague();
  const { ovrMap, careerOvrMap, seasonOvr, loaded } = useGamePool();
  const league = useMemo(() => getAllPlayers(), [getAllPlayers]);
  const ready = !!careerData && loaded && league.length > 0;
  const base = useMemo<NflCtx | null>(() => (ready ? createNflCtx(league, ovrMap, { car: careerOvrMap, szn: seasonOvr?.ovr ?? {} }) : null), [ready, league, ovrMap, careerOvrMap, seasonOvr]);
  const data = useNflLabData();
  const ctx = useMemo(() => (base && data?.depth ? withStarters(base, data.depth) : base), [base, data]);
  const list = useInjuryList();
  const injured = useMemo(() => new Map<string, InjuryCode>((list?.entries ?? []).map((e) => [e.key, e.code])), [list]);
  const sched = useMemo(() => (data ? buildSched(data.games, NFL_TEAMS.map((t) => t.abbreviation)) : null), [data]);
  return { ctx, data, injured, injuryWeek: list?.week ?? 0, sched };
};

export type NflLab = ReturnType<typeof useNflLab>;
/** The lab state once the league has loaded (ctx is there). */
export type NflLabReady = Omit<NflLab, 'ctx'> & { ctx: NflCtx };

// ---------- Per-viewer storage (the NFL edition's "nfl:" namespace is added by installNflStorage) ----------

const SAVED = 'retroVault:nflLab:saved';
const PREFS = 'retroVault:nflLab:prefs';

export type SavedLab =
  | { id: string; name: string; kind: 'team'; lineup: NLineup; savedAt: number }
  | { id: string; name: string; kind: 'fantasy'; lineup: FLineup; savedAt: number };

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage blocked or full: the list still works for this visit
  }
};

export const useSavedLabs = () => {
  const [list, setList] = useState<SavedLab[]>(() => read<SavedLab[]>(SAVED, []).filter((t) => t && t.id && t.lineup));
  const update = useCallback((fn: (p: SavedLab[]) => SavedLab[]) => {
    setList((p) => {
      const n = fn(p);
      write(SAVED, n);
      return n;
    });
  }, []);
  return {
    list,
    add: (s: Omit<SavedLab, 'id' | 'savedAt'>) => update((p) => [{ ...s, id: `n${Date.now().toString(36)}`, savedAt: Date.now() } as SavedLab, ...p]),
    rename: (id: string, name: string) => update((p) => p.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t))),
    remove: (id: string) => update((p) => p.filter((t) => t.id !== id)),
  };
};

export interface Prefs {
  mode: 'team' | 'fantasy';
  club: string;
  scoring: ScoringId;
  custom: Scoring | null;
  fmode: 'free' | 'cap' | 'draft';
}
const DEFAULT_PREFS: Prefs = { mode: 'team', club: 'BAL', scoring: 'ppr', custom: null, fmode: 'free' };
export const usePrefs = () => {
  const [p, setP] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...read<Partial<Prefs>>(PREFS, {}) }));
  useEffect(() => write(PREFS, p), [p]);
  return [p, (patch: Partial<Prefs>) => setP((x) => ({ ...x, ...patch }))] as const;
};
