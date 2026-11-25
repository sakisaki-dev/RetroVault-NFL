import { useEffect, useState } from 'react';
import { dataJson } from '@/utils/dataStore';
import { IS_NFL } from '@/config/edition';

/** public/data/nfl/bio.json (scripts/nfl/bio.py): [height in, weight lb, birth date] per "POS:Name". NFL edition only. */
export interface BioFile { p: Record<string, [number | null, number | null, string | null]> }
export interface BioInfo {
  heightIn: number | null;
  weight: number | null;
  born: string | null;
  /** 6' 5" */
  height: string | null;
  /** age today, from the birth date */
  age: number | null;
  /** May 21, 1996 */
  bornLabel: string | null;
}

let job: Promise<BioFile | null> | null = null;
let loaded: BioFile | null | undefined;
const load = () => (job ??= dataJson<BioFile>('data/nfl/bio.json').catch(() => null).then((d) => (loaded = d)));

export const ageOn = (born: string, now = new Date()): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(born);
  if (!m) return null;
  let a = now.getFullYear() - +m[1];
  if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) a--;
  return a >= 15 && a < 80 ? a : null;
};

export const bioInfoFor = (file: BioFile | null | undefined, key: string): BioInfo | null => {
  const r = file?.p[key];
  if (!r) return null;
  const [h, w, b] = r;
  const m = b ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(b) : null;
  return {
    heightIn: h, weight: w, born: b,
    height: h ? `${Math.floor(h / 12)}' ${h % 12}"` : null,
    age: b ? ageOn(b) : null,
    bornLabel: m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null,
  };
};

/** Height, weight, age and birth date; null while loading, off the NFL edition or with no record. */
export const useBioInfo = (key: string | null | undefined): BioInfo | null => {
  const [file, setFile] = useState(loaded);
  useEffect(() => {
    if (!IS_NFL || loaded !== undefined) return void setFile(loaded);
    let alive = true;
    load().then((d) => alive && setFile(d));
    return () => { alive = false; };
  }, []);
  return IS_NFL && key ? bioInfoFor(file, key) : null;
};
