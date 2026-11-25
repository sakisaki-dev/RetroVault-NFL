import { useEffect, useState } from 'react';
import { dataJson } from '@/utils/dataStore';
import type { CollegeInfo, DraftInfo } from '@/utils/draftInfo';

/**
 * The College tab's data (scripts/nfl/college.py -> public/data/nfl/college/): the draft boards per year, the schools
 * and the needs behind the needs-based mock. Each file loads once and is kept (memoised per path).
 */

/** [slug, name, short, espn id, colour, alt colour, white puck, drafted, first-rounders, No. 1 picks, site players, active, eras, Hall of Famers, best alumnus [key, OVR]] */
export type SchoolRow = [
  string,
  string,
  string,
  number | null,
  string | null,
  string | null,
  0 | 1,
  number,
  number,
  number,
  number,
  number,
  Record<string, [number, number, number, number]>,
  number?,
  ([string, number] | null)?,
];
export interface CollegeIndex {
  latest: number;
  judgeAfter: number;
  stealBar: number;
  bustBar: number;
  /** [year, picks, rounds, site players among them] */
  years: [number, number, number, number][];
  schools: SchoolRow[];
}
/** [round, pick, club, name, pos, school id, site key, career OVR, Pro Bowls, All-Pro, HOF (2 site, 1 draft file), games, last season] */
export type PickRow = [number, number, string, string, string, string | null, string | null, number | null, number, number, 0 | 1 | 2, number | null, number | null];
export interface SchoolInfo { name: string; s: string; id?: number; c?: string | null; a?: string | null; w?: 1 }
export interface DraftYear {
  y: number;
  judged: boolean;
  rated: number;
  picks: PickRow[];
  steals: number[];
  busts: number[];
  schools: Record<string, SchoolInfo>;
}
/** players: [key, OVR, SZN, active, club now, HOF, [year, round, pick, club] | null, first season] */
export interface SchoolFile extends SchoolInfo {
  slug: string;
  players: [string, number | null, number | null, 0 | 1, string | null, 0 | 1, [number, number, number, string | null] | null, number | null][];
  rounds: number[];
  /** [year, pick, name, pos, club, key] */
  firsts: [number, number, string, string, string, string | null][];
  /** [year, name, club, key] */
  no1: [number, string, string, string | null][];
  /** [year, round, pick, club, name, pos, key, OVR, Pro Bowls, All-Pro, HOF] */
  picks: [number, number, number, string, string, string, string | null, number | null, number, number, number][];
}
export interface NeedRow { g: string; need: string; szn: number; lg: number; old: number | null; oldK: string | null; st: string[]; score: number }
export interface NeedsFile {
  season: number;
  at?: string;
  ageFrom: number;
  league: Record<string, number>;
  groups: [string, string][];
  unrated: string[];
  clubs: Record<string, NeedRow[]>;
}

const cache = new Map<string, Promise<unknown>>();
const load = <T,>(path: string): Promise<T | null> => {
  let p = cache.get(path) as Promise<T | null> | undefined;
  if (!p) {
    p = dataJson<T>(path);
    cache.set(path, p);
  }
  return p;
};

/** undefined while loading, null when the file is missing */
const useFile = <T,>(path: string | null): T | null | undefined => {
  const [state, setState] = useState<{ path: string | null; d: T | null | undefined }>({ path, d: undefined });
  useEffect(() => {
    if (!path) return;
    let live = true;
    load<T>(path).then((d) => live && setState({ path, d }));
    return () => {
      live = false;
    };
  }, [path]);
  return state.path === path ? state.d : undefined;
};

export const useCollegeIndex = () => useFile<CollegeIndex>('data/nfl/college/index.json');
export const useDraftYear = (y: number | null) => useFile<DraftYear>(y ? `data/nfl/college/draft/${y}.json` : null);
export const useSchool = (slug: string | null) => useFile<SchoolFile>(slug ? `data/nfl/college/schools/${slug}.json` : null);
export const useNeeds = () => useFile<NeedsFile>('data/nfl/college/needs.json');

/** A school as CollegeMark reads it (CollegeMark takes a DraftInfo) */
export const markInfo = (s: SchoolInfo | null | undefined): DraftInfo | null =>
  s ? { college: s.name, school: { id: s.id, s: s.s, c: s.c, a: s.a, w: s.w } as CollegeInfo, alsoAttended: [], drafted: false } : null;

export const schoolOfRow = (r: SchoolRow): SchoolInfo => ({ name: r[1], s: r[2], id: r[3] ?? undefined, c: r[4], a: r[5], w: r[6] ? 1 : undefined });

/** The draft decades the leaderboard filters by */
export const ERAS = [
  { id: 'all', label: 'All time' },
  { id: '1980', label: '1980s' },
  { id: '1990', label: '1990s' },
  { id: '2000', label: '2000s' },
  { id: '2010', label: '2010s' },
  { id: '2020', label: '2020s' },
] as const;
export type EraId = (typeof ERAS)[number]['id'];

/** A school's totals for an era: [drafted, first-rounders, total career OVR, rated players] */
export const eraTotals = (r: SchoolRow, era: EraId): [number, number, number, number] => {
  const e = r[12];
  if (era !== 'all') return e[era] ?? [0, 0, 0, 0];
  return Object.values(e).reduce<[number, number, number, number]>((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2], a[3] + v[3]], [0, 0, 0, 0]);
};

/**
 * The College tab's sections (the route's section). The war room merged the old projected order and needs mock: their
 * routes (#college/order, #college/mock) still open it (CollegeTab redirects them).
 */
export type CollegeSection = 'draft' | 'schools' | 'warroom';

/** Opens the College tab at a section from anywhere (the club season sheet's Draft outlook) */
export const collegeHash = (section: CollegeSection, q?: Record<string, string>) => {
  const qs = q ? new URLSearchParams(q).toString() : '';
  return `#college/${section}${qs ? `?${qs}` : ''}`;
};
export const openCollege = (section: CollegeSection, q?: Record<string, string>) => {
  const h = collegeHash(section, q);
  if (window.location.hash !== h) window.location.hash = h;
};

/** "4th", "21st" */
export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
