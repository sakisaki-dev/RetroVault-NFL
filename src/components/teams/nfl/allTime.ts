import { useEffect, useState } from 'react';
import { loadScheduleSeason, useSchedule } from '@/utils/schedule';

export interface AllTimeRecord {
  w: number;
  l: number;
  t: number;
  /** Seasons that club reached the postseason (from each season file's playoff games) */
  playoffs: number;
  /** Seasons counted */
  seasons: number;
}
/** One club's one season, for the dynasty runs */
export interface ClubSeason {
  season: number;
  w: number;
  l: number;
  t: number;
  playoff: boolean;
  champion: boolean;
}
export interface AllTime {
  /** Club (nickname) → regular-season record over every completed season */
  byClub: Map<string, AllTimeRecord>;
  /** Club (nickname) → every completed season, oldest first */
  seasons: Map<string, ClubSeason[]>;
  from: number;
  to: number;
}

let job: Promise<AllTime | null> | null = null;

/**
 * Every franchise's all-time regular-season record and playoff trips, summed from each completed season's file (a season
 * counts once its Super Bowl is played; the one in progress does not). Loaded once, from the same per-season files the
 * Season page uses. A club made the playoffs when it appears in one of the season's postseason games.
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
      const seasons = new Map<string, ClubSeason[]>();
      files.forEach((f) => {
        if (!f) return;
        const made = new Set<string>();
        (f.playoffs ?? []).forEach((r) => r.games.forEach((g) => (made.add(g.away), made.add(g.home))));
        const hasPlayoffs = made.size > 0;
        f.table.forEach((r) => {
          const c = byClub.get(r.team) ?? { w: 0, l: 0, t: 0, playoffs: 0, seasons: 0 };
          c.w += r.w;
          c.l += r.l;
          c.t += r.t;
          c.seasons += 1;
          const playoff = hasPlayoffs && made.has(r.abbr);
          if (playoff) c.playoffs += 1;
          byClub.set(r.team, c);
          const list = seasons.get(r.team) ?? [];
          list.push({ season: Number(f.season), w: r.w, l: r.l, t: r.t, playoff, champion: f.superBowl?.winner === r.team });
          seasons.set(r.team, list);
        });
      });
      seasons.forEach((l) => l.sort((a, b) => a.season - b.season));
      const years = ids.map(Number).filter(Number.isFinite);
      return years.length ? { byClub, seasons, from: Math.min(...years), to: Math.max(...years) } : null;
    })();
    void job.then((x) => live && setV(x));
    return () => {
      live = false;
    };
  }, [schedule]);
  return v;
};

export const recordLine = (r: { w: number; l: number; t: number }) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;
export const winPct = (r: { w: number; l: number; t: number }) => (r.w + r.t / 2) / Math.max(1, r.w + r.l + r.t);
export const pctText = (p: number) => `.${String(Math.round(p * 1000)).padStart(3, '0')}`;
