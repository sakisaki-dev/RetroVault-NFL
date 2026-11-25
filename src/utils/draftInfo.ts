import { useEffect, useState } from 'react';
import { dataJson } from '@/utils/dataStore';
import { IS_NFL } from '@/config/edition';

/** public/data/nfl/draft.json (scripts/nfl/draft.py): college and draft per player, "POS:Name" keyed. NFL edition only. */
export interface CollegeInfo { id?: number; s: string; c?: string | null; a?: string | null }
export interface DraftFile {
  colleges: Record<string, CollegeInfo>;
  /** [college, year, round, pick, club] when drafted, [college] when undrafted */
  p: Record<string, [string | null, number?, number?, number?, (string | null)?]>;
  /** earlier schools of a transfer */
  x?: Record<string, string[]>;
}
export interface DraftInfo {
  college: string | null;
  school: CollegeInfo | null;
  alsoAttended: string[];
  drafted: boolean;
  year?: number;
  round?: number;
  pick?: number;
  club?: string | null;
}

let job: Promise<DraftFile | null> | null = null;
let loaded: DraftFile | null | undefined;
const load = () => (job ??= dataJson<DraftFile>('data/nfl/draft.json').catch(() => null).then((d) => (loaded = d)));

export const draftInfoFor = (file: DraftFile | null | undefined, key: string): DraftInfo | null => {
  const r = file?.p[key];
  if (!file || !r) return null;
  const college = r[0] || null;
  const drafted = r.length > 1 && r[2] != null;
  return {
    college,
    school: college ? file.colleges[college] ?? { s: college } : null,
    alsoAttended: file.x?.[key] ?? [],
    drafted,
    year: r[1], round: r[2], pick: r[3], club: r[4],
  };
};

/** The player's college and draft line; null while loading, off the NFL edition or with no data (the tiles then stay out). */
export const useDraftInfo = (key: string | null | undefined): DraftInfo | null => {
  const [file, setFile] = useState(loaded);
  useEffect(() => {
    if (!IS_NFL || loaded !== undefined) return void setFile(loaded);
    let alive = true;
    load().then((d) => alive && setFile(d));
    return () => { alive = false; };
  }, []);
  return IS_NFL && key ? draftInfoFor(file, key) : null;
};
