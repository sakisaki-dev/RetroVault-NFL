import { useEffect, useState } from 'react';
import { dataResponse } from '@/utils/dataStore';
import { parseNews, type NewsItem } from '@/utils/espnNews';

/**
 * NFL edition, the Deep Dive News section's data. Live from ESPN in the browser (CORS open, no key, nothing stored in the
 * repo): the athlete overview, https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/<id>/overview,
 * carries his latest articles, the Rotowire player note, the next game and the fantasy line. (The athlete /news endpoints
 * 404 or ignore the athlete.) Memoised per session and cached in sessionStorage for 10 minutes, fetched only when the
 * section scrolls into view. Beside it, our own rule data: public/data/nfl/pnews.json (scripts/nfl/player_news.py) and
 * league/upcoming.json.
 */
const OVERVIEW = (id: string) => `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/overview`;
const FRESH_MS = 10 * 60 * 1000;

export interface PlayerNote {
  headline: string;
  story: string;
  published: string;
}
export interface NextEvent {
  id: string;
  date: string;
  name: string;
  location: string;
  weekText: string;
  home: string;
  away: string;
  homeAbbr: string;
  awayAbbr: string;
  detail: string;
  tv: string;
  href: string;
}
export interface Overview {
  news: NewsItem[];
  note: PlayerNote | null;
  next: NextEvent | null;
  fantasy: { positionRank?: string; percentOwned?: string; last7Days?: string } | null;
  at: number;
}

interface RawOverview {
  news?: unknown[];
  rotowire?: { headline?: string; story?: string; description?: string; published?: string };
  nextGame?: { league?: { events?: Array<Record<string, unknown>> } };
  fantasy?: { positionRank?: string; percentOwned?: string; last7Days?: string };
}
interface RawComp { homeAway?: string; displayName?: string; abbreviation?: string }

export const parseOverview = (raw: RawOverview): Overview => {
  const ev = raw.nextGame?.league?.events?.[0] as Record<string, unknown> | undefined;
  let next: NextEvent | null = null;
  if (ev) {
    const comps = (ev.competitors as RawComp[] | undefined) ?? [];
    const h = comps.find((c) => c.homeAway === 'home');
    const a = comps.find((c) => c.homeAway === 'away');
    const links = (ev.links as Array<{ rel?: string[]; href?: string }> | undefined) ?? [];
    const web = links.find((l) => l.rel?.includes('summary') && l.rel.includes('desktop'))?.href ?? links.find((l) => l.href?.startsWith('https://'))?.href ?? '';
    const full = ev.fullStatus as { type?: { detail?: string } } | undefined;
    const bc = (ev.broadcasts as Array<{ shortName?: string }> | undefined)?.[0];
    next = {
      id: String(ev.id ?? ''),
      date: String(ev.date ?? ''),
      name: String(ev.name ?? ''),
      location: String(ev.location ?? ''),
      weekText: String(ev.weekText ?? ''),
      home: h?.displayName ?? '',
      away: a?.displayName ?? '',
      homeAbbr: h?.abbreviation ?? '',
      awayAbbr: a?.abbreviation ?? '',
      detail: full?.type?.detail ?? '',
      tv: bc?.shortName ?? '',
      href: web,
    };
  }
  const r = raw.rotowire;
  return {
    news: parseNews({ articles: (raw.news ?? []) as never }).sort((x, y) => y.published.localeCompare(x.published)),
    note: r?.headline ? { headline: r.headline, story: r.story ?? r.description ?? '', published: r.published ?? '' } : null,
    next,
    fantasy: raw.fantasy ? { positionRank: raw.fantasy.positionRank, percentOwned: raw.fantasy.percentOwned, last7Days: raw.fantasy.last7Days } : null,
    at: Date.now(),
  };
};

const jobs = new Map<string, Promise<Overview | null>>();
const ckey = (id: string) => `espn:overview:v1:${id}`;
export const fetchOverview = (id: string): Promise<Overview | null> => {
  let j = jobs.get(id);
  if (!j) {
    try {
      const c = JSON.parse(sessionStorage.getItem(ckey(id)) ?? 'null') as Overview | null;
      if (c && Date.now() - c.at < FRESH_MS) j = Promise.resolve(c);
    } catch {
      /* no storage */
    }
  }
  if (!j) {
    j = fetch(OVERVIEW(id))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => {
        const o = parseOverview(raw as RawOverview);
        try {
          sessionStorage.setItem(ckey(id), JSON.stringify(o));
        } catch {
          /* storage full */
        }
        return o;
      })
      .catch(() => {
        jobs.delete(id);
        return null;
      });
  }
  jobs.set(id, j);
  return j;
};

/** undefined while loading (or off), null when ESPN could not be reached or he has no id. */
export const useOverview = (espnId: string | undefined, on: boolean): Overview | null | undefined => {
  const [state, setState] = useState<{ id: string; o: Overview | null } | null>(null);
  useEffect(() => {
    if (!on || !espnId) return;
    let alive = true;
    void fetchOverview(espnId).then((o) => alive && setState({ id: espnId, o }));
    return () => {
      alive = false;
    };
  }, [espnId, on]);
  if (!on) return undefined;
  if (!espnId) return null;
  return state && state.id === espnId ? state.o : undefined;
};

// ---------- our own rule data ----------

export interface Pnews {
  season: number;
  week: number;
  teams: number;
  /** [rank, factor]: rank 1 = the club allows the most fantasy points to the position */
  vs: Record<string, Record<string, [number, number]>>;
  /** [rank, total, games, per game] this season's PPR among his position */
  ppr: Record<string, [number, number, number, number]>;
  /** [label, have, target, per game, games to go] */
  m: Record<string, Array<[string, number, number, number, number]>>;
}
export interface Upcoming {
  week: number;
  day: string;
  date: string;
  time: string;
  away: string;
  home: string;
}
let pjob: Promise<{ pn: Pnews | null; up: Upcoming[] }> | null = null;
const loadRules = () =>
  (pjob ??= Promise.all([
    dataResponse('data/nfl/pnews.json').then((r) => (r.ok ? (r.json() as Promise<Pnews>) : null)).catch(() => null),
    dataResponse('data/league/upcoming.json').then((r) => (r.ok ? (r.json() as Promise<{ games: Upcoming[] }>) : null)).catch(() => null),
  ]).then(([pn, up]) => ({ pn, up: up?.games ?? [] })));

export const useNewsRules = (on: boolean) => {
  const [d, setD] = useState<{ pn: Pnews | null; up: Upcoming[] } | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void loadRules().then((x) => alive && setD(x));
    return () => {
      alive = false;
    };
  }, [on]);
  return d;
};

/** Rotowire's "Sun Nov 22 13:19:09 PST 2026" as an ISO string (a US zone abbreviation becomes its offset). */
export const noteTime = (s: string): string => {
  const z: Record<string, string> = { EST: '-05:00', EDT: '-04:00', CST: '-06:00', CDT: '-05:00', MST: '-07:00', MDT: '-06:00', PST: '-08:00', PDT: '-07:00', UTC: 'Z', GMT: 'Z' };
  const m = s.match(/^\w{3} (\w{3}) (\d{1,2}) (\d{2}:\d{2}:\d{2}) (\w{3,4}) (\d{4})$/);
  if (!m) return '';
  const t = Date.parse(`${m[1]} ${m[2]} ${m[5]} ${m[3]} GMT${z[m[4]] === 'Z' ? '' : (z[m[4]] ?? '').replace(':', '')}`);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
};
