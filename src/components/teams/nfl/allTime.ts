import { useEffect, useState } from 'react';
import { loadScheduleSeason, useSchedule } from '@/utils/schedule';

export interface AllTimeRecord {
  w: number;
  l: number;
  t: number;
}
export interface AllTime {
  /** Club (nickname) → regular-season record over every completed season */
  byClub: Map<string, AllTimeRecord>;
  from: number;
  to: number;
}

let job: Promise<AllTime | null> | null = null;

/**
 * Every franchise's all-time regular-season record, summed from each completed season's table (a season counts once its
 * Super Bowl is played; the one in progress does not). Loaded once, from the same per-season files the Season page uses.
 */
export const useAllTimeRecords = (): AllTime | null => {
  const schedule = useSchedule();
  const [v, setV] = useState<AllTime | null>(null);
  useEffect(() => {
    if (!schedule?.seasonIndex) return;
    let live = true;
    job ??= (async () => {
      const ids = schedule.seasonIndex!.filter((s) => s.superBowl).map((s) => s.season);
      const files = await Promise.all(ids.map((id) => loadScheduleSeason(id)));
      const byClub = new Map<string, AllTimeRecord>();
      files.forEach((f) =>
        f?.table.forEach((r) => {
          const c = byClub.get(r.team) ?? { w: 0, l: 0, t: 0 };
          c.w += r.w;
          c.l += r.l;
          c.t += r.t;
          byClub.set(r.team, c);
        }),
      );
      const years = ids.map(Number).filter(Number.isFinite);
      return years.length ? { byClub, from: Math.min(...years), to: Math.max(...years) } : null;
    })();
    void job.then((x) => live && setV(x));
    return () => {
      live = false;
    };
  }, [schedule]);
  return v;
};

export const recordLine = (r: AllTimeRecord) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;
