import { useEffect, useState } from 'react';
import { IS_NFL } from '@/config/edition';

/**
 * NFL edition: who is hurt (public/data/nfl/injuries.json, scripts/nfl/injuries.py): IR from the club's reserve /
 * injured list, Out / Doubtful / Questionable from the latest week's report. [code, body part]; the part shows only in
 * the tag's tooltip. Loaded once, on demand.
 */
export type InjuryCode = 'IR' | 'Out' | 'Doubtful' | 'Questionable';
interface InjuryFile {
  season: number;
  week: number;
  p: Record<string, [InjuryCode, string]>;
}

let job: Promise<InjuryFile | null> | null = null;
let loaded: InjuryFile | null = null;
const listeners = new Set<() => void>();

const load = () =>
  (job ??= fetch(`${import.meta.env.BASE_URL}data/nfl/injuries.json`)
    .then((r) => (r.ok ? (r.json() as Promise<InjuryFile>) : null))
    .catch(() => null)
    .then((d) => {
      loaded = d;
      listeners.forEach((l) => l());
      return d;
    }));

/** His injury now, or undefined; NFL edition only (the hook loads the file the first time it is used). */
export const useInjury = (key: string | undefined): { code: InjuryCode; part: string; week: number } | undefined => {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!IS_NFL) return;
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    void load();
    return () => {
      listeners.delete(l);
    };
  }, []);
  const e = IS_NFL && key ? loaded?.p[key] : undefined;
  return e ? { code: e[0], part: e[1], week: loaded!.week } : undefined;
};

/** Everyone listed, for the Season page's injury report. */
export const useInjuryList = (): { season: number; week: number; entries: Array<{ key: string; code: InjuryCode; part: string }> } | null => {
  useInjury(undefined);
  if (!IS_NFL || !loaded) return null;
  return { season: loaded.season, week: loaded.week, entries: Object.entries(loaded.p).map(([key, [code, part]]) => ({ key, code, part })) };
};
