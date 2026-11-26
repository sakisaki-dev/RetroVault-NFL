import { useEffect, useState } from 'react';
import { IS_NFL } from '@/config/edition';
import { dataResponse } from '@/utils/dataStore';

/**
 * NFL edition: the advanced-stat factors (public/data/nfl/advanced.json, scripts/nfl/advanced.py), one file loaded once.
 * Per player key and scope (a season "2026", or "c" the career 2018-2026) each metric is [value, percentile, rank,
 * pool size], ranked only within his position among players with the metric's minimum sample, and only for the seasons
 * its source covers.
 */
export interface AdvMetric {
  label: string;
  pos: string[];
  src: string;
  /** high: more is better; low: less is better; style: a trait ranked by size, not good or bad */
  dir: 'high' | 'low' | 'style';
  unit: string;
  dec: number;
  min: number;
  desc: string;
}
export type AdvValue = [value: number, pct: number, rank: number, pool: number];
export interface AdvFile {
  v: number;
  first: number;
  season: number;
  careerMin: number;
  metrics: Record<string, AdvMetric>;
  p: Record<string, Record<string, Record<string, AdvValue>>>;
}

/*
 * Loading: data/nfl/advanced.meta.json (the metric table) plus one file per position (data/nfl/advanced/<POS>.json,
 * scripts/perf/build_core.py), so a Deep Dive on a quarterback loads the quarterbacks (55 KB) and not every player in the
 * league (1.7 MB, 3 MB at 10,000 players). `useAdvanced('QB')` returns the file with `p` holding that position (and any
 * other already loaded); with no position it loads them all. Falls back to the old whole file when the split is absent.
 */
let metaJob: Promise<AdvFile | null> | null = null;
let metaValue: AdvFile | null = null;
const metaLoaded = () => metaValue;
const rows: Record<string, AdvFile['p']> = {};
const posJobs = new Map<string, Promise<void>>();
let version = 0;
let merged: { at: number; file: AdvFile } | null = null;
const listeners = new Set<() => void>();
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const loadMeta = () =>
  (metaJob ??= dataResponse('data/nfl/advanced.meta.json')
    .then(async (r) => {
      if (r.ok) return { ...((await r.json()) as AdvFile), p: {} } as AdvFile;
      // no split: the whole file
      const whole = await dataResponse('data/nfl/advanced.json');
      if (!whole.ok) return null;
      const f = (await whole.json()) as AdvFile;
      Object.entries(f.p).forEach(([k, v]) => ((rows[k.split(':')[0]] ??= {})[k] = v));
      return { ...f, p: {} } as AdvFile;
    })
    .catch(() => null)
    .then((m) => {
      metaValue = m;
      bump();
      return m;
    }));
const loadPos = (pos: string) => {
  if (!posJobs.has(pos))
    posJobs.set(
      pos,
      loadMeta().then(async () => {
        if (!rows[pos]) {
          const r = await dataResponse(`data/nfl/advanced/${pos}.json`);
          // a position with no advanced metrics (kickers) has no file: the host may answer with its index page, which is not JSON
          rows[pos] = r.ok ? ((await r.json().catch(() => ({}))) as AdvFile['p']) : {};
        }
        bump();
      }),
    );
  return posJobs.get(pos)!;
};
const ALL_POS = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL', 'K'];

export const useAdvanced = (pos?: string): AdvFile | null => {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!IS_NFL) return;
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    void loadMeta();
    (pos ? [pos] : ALL_POS).forEach((x) => void loadPos(x));
    return () => {
      listeners.delete(l);
    };
  }, [pos]);
  if (!IS_NFL) return null;
  // the meta table with every loaded position's rows, rebuilt only when something landed
  if (merged && merged.at === version) return merged.file;
  const meta = metaLoaded();
  if (!meta) return null;
  merged = { at: version, file: { ...meta, p: Object.assign({}, ...Object.values(rows)) } };
  return merged.file;
};

export const fmtAdv = (m: AdvMetric, v: number) => `${v.toFixed(m.dec)}${m.unit}`;

/** Every ranked player for one metric in a scope at a position, best first (direction-aware). */
export const advLeaders = (f: AdvFile, scope: string, metric: string, pos: string) => {
  const m = f.metrics[metric];
  return Object.entries(f.p)
    .flatMap(([key, scopes]) => {
      const v = scopes[scope]?.[metric];
      return v && key.startsWith(`${pos}:`) ? [{ key, v }] : [];
    })
    .sort((a, b) => a.v[2] - b.v[2] || a.key.localeCompare(b.key))
    .map((e) => ({ ...e, display: fmtAdv(m, e.v[0]) }));
};

/** His graded (non-style) advanced percentiles in a scope ("2026" or "c"), for the skill grade (skillGrades.ts foldAdvanced). */
export const advancedPcts = (f: AdvFile | null, key: string, scope: string): number[] =>
  Object.entries(f?.p[key]?.[scope] ?? {}).flatMap(([id, v]) => (f!.metrics[id]?.dir === 'style' ? [] : [v[1]]));
