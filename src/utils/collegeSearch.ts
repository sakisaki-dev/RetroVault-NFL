import { useEffect, useState } from 'react';
import { IS_NFL } from '@/config/edition';
import { dataJson } from '@/utils/dataStore';
import { openCollege, schoolOfRow, type CollegeIndex, type SchoolInfo } from '@/utils/collegeData';

/**
 * Colleges in the header's quick search (owner: "allow me to search by college"): a school matches when every typed
 * word starts a word of its name or short name ("ohio st", "lsu", "notre"). Name starts rank first, then the schools
 * that sent the most players to the league; at most `limit`. A pick opens its school page (College › Colleges).
 */
export interface CollegeHit extends SchoolInfo { slug: string; drafted: number; active: number }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let job: Promise<CollegeHit[]> | null = null;
let cached: CollegeHit[] | null = null;
const load = () =>
  (job ??= dataJson<CollegeIndex>('data/nfl/college/index.json')
    .then((d) => (cached = d.schools.map((r) => ({ ...schoolOfRow(r), slug: r[0], drafted: r[7], active: r[11] }))))
    .catch(() => (cached = [])));

export const searchColleges = (all: CollegeHit[], query: string, limit = 4): CollegeHit[] => {
  const q = fold(query).trim();
  if (q.length < 2) return [];
  const words = q.split(/\s+/);
  return all
    .map((c) => {
      const tokens = fold(`${c.name} ${c.s}`).split(/[\s.&()'-]+/).filter(Boolean);
      if (!words.every((w) => tokens.some((x) => x.startsWith(w)))) return null;
      const score = fold(c.name).startsWith(q) || fold(c.s).startsWith(q) ? 2 : 1;
      return { c, score };
    })
    .filter((x): x is { c: CollegeHit; score: number } => !!x)
    .sort((a, b) => b.score - a.score || b.c.drafted - a.c.drafted || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c);
};

/** The schools matching the query; the index loads the first time a query is typed (NFL edition only). */
export const useCollegeSearch = (query: string, on = true): CollegeHit[] => {
  const [all, setAll] = useState(cached);
  const want = IS_NFL && on && query.trim().length >= 2;
  useEffect(() => {
    if (!want || all) return;
    let alive = true;
    load().then((d) => alive && setAll(d));
    return () => { alive = false; };
  }, [want, all]);
  return want && all ? searchColleges(all, query) : [];
};

export const openSchoolPage = (slug: string) => openCollege('schools', { s: slug });
