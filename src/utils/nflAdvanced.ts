import { useEffect, useState } from 'react';
import { IS_NFL } from '@/config/edition';

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

let job: Promise<AdvFile | null> | null = null;
let loaded: AdvFile | null = null;
const listeners = new Set<() => void>();
const load = () =>
  (job ??= fetch(`${import.meta.env.BASE_URL}data/nfl/advanced.json`)
    .then((r) => (r.ok ? (r.json() as Promise<AdvFile>) : null))
    .catch(() => null)
    .then((d) => {
      loaded = d;
      listeners.forEach((l) => l());
      return d;
    }));

export const useAdvanced = (): AdvFile | null => {
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
  return IS_NFL ? loaded : null;
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
