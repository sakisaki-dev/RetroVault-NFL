import { noteWriters } from '@/utils/newsMentions';
import { useCallback, useEffect, useState } from 'react';
import { findNFLTeam } from '@/utils/nflTeams';

/**
 * NFL edition: real news from ESPN's public feed (site.api.espn.com, CORS open, no key), fetched in the browser when the
 * News page opens and cached in sessionStorage for 5 minutes. Nothing is stored in the repo.
 */

const FEED = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50';
const CACHE_KEY = 'espn:news:v2';
const FRESH_MS = 5 * 60 * 1000;

export interface NewsItem {
  id: string;
  type: 'Story' | 'Media' | 'HeadlineNews' | 'Recap' | string;
  headline: string;
  description: string;
  published: string;
  image?: { url: string; caption: string; credit: string };
  /** ESPN's page for the item */
  href: string;
  /** The clip's API record (Media items), asked for its mp4 only when played */
  clipApi?: string;
  /** Names of the athletes ESPN tagged */
  athletes: string[];
  /** Our club names for the teams ESPN tagged */
  teams: string[];
  /** ESPN athlete ids ESPN tagged (public/data/nfl/espn_ids.json maps them to our players) */
  athleteIds: string[];
  /** ESPN's content record for the whole article (headline, story HTML, photos, video) */
  api?: string;
  /** The writer's byline when the feed gives one (per-athlete items do) */
  byline?: string;
}

interface RawCat { type: string; description?: string; athleteId?: number; athlete?: { id?: number; description?: string }; team?: { description?: string } }
interface RawItem {
  id: number | string;
  type: string;
  headline?: string;
  description?: string;
  published?: string;
  images?: { url: string; caption?: string; credit?: string; width?: number }[];
  categories?: RawCat[];
  byline?: string;
  links?: { web?: { href?: string }; api?: { self?: { href?: string } } };
}

export const parseNews = (raw: { articles?: RawItem[] }): NewsItem[] => {
  noteWriters((raw.articles ?? []).map((a) => a.byline));
  return (raw.articles ?? [])
    .filter((a) => a.headline)
    .map((a) => {
      const img = [...(a.images ?? [])].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0];
      const cats = a.categories ?? [];
      const teams = cats
        .filter((c) => c.type === 'team')
        .map((c) => findNFLTeam(c.team?.description ?? c.description ?? '')?.name)
        .filter((t): t is string => !!t);
      const aths: { id: string; name: string }[] = [];
      cats.filter((c) => c.type === 'athlete').forEach((c) => {
        const id = String(c.athleteId ?? c.athlete?.id ?? '');
        if (id && !aths.some((x) => x.id === id)) aths.push({ id, name: c.athlete?.description ?? c.description ?? '' });
      });
      return {
        id: String(a.id),
        type: a.type,
        headline: a.headline!,
        description: a.description ?? '',
        published: a.published ?? '',
        image: img ? { url: img.url, caption: img.caption ?? '', credit: img.credit ?? '' } : undefined,
        href: a.links?.web?.href ?? 'https://www.espn.com/nfl/',
        clipApi: a.type === 'Media' ? a.links?.api?.self?.href : undefined,
        athletes: aths.map((x) => x.name),
        teams: [...new Set(teams)],
        athleteIds: aths.map((x) => x.id),
        api: a.type === 'Media' ? undefined : a.links?.api?.self?.href,
        byline: a.byline || undefined,
      };
    });
};

const readCache = (): { at: number; items: NewsItem[] } | null => {
  try {
    const d = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null');
    return d && Array.isArray(d.items) ? d : null;
  } catch {
    return null;
  }
};

/** The feed's items (newest first), `error` when the fetch failed and nothing is cached, `refresh` to fetch again. */
export const useEspnNews = () => {
  const [state, setState] = useState<{ items: NewsItem[]; at: number | null; loading: boolean; error: boolean }>(() => {
    const c = readCache();
    return { items: c?.items ?? [], at: c?.at ?? null, loading: !c, error: false };
  });
  const load = useCallback((force: boolean) => {
    const c = readCache();
    if (!force && c && Date.now() - c.at < FRESH_MS) return () => undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    fetch(FEED)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => {
        const items = parseNews(raw).sort((a, b) => b.published.localeCompare(a.published));
        const at = Date.now();
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at, items }));
        } catch {
          /* storage unavailable */
        }
        if (alive) setState({ items, at, loading: false, error: false });
      })
      .catch(() => alive && setState((s) => ({ ...s, loading: false, error: s.items.length === 0 })));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => load(false), [load]);
  return { ...state, refresh: () => load(true) };
};

/** A clip's mp4 (or HLS) from ESPN's clip API, fetched when a video is played. */
export const fetchClip = async (api: string): Promise<{ mp4?: string; hls?: string } | null> => {
  try {
    const r = await fetch(api);
    if (!r.ok) return null;
    const v = (await r.json()).videos?.[0];
    const src = v?.links?.source;
    return { mp4: src?.HD?.href ?? src?.href, hls: src?.HLS?.href };
  } catch {
    return null;
  }
};

export const timeAgo = (iso: string, now = Date.now()): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

/** ESPN's team ids (their news feeds take ?team=<id>), by our club name */
export const ESPN_TEAM_ID: Record<string, number> = {
  Falcons: 1, Bills: 2, Bears: 3, Bengals: 4, Browns: 5, Cowboys: 6, Broncos: 7, Lions: 8, Packers: 9, Titans: 10, Colts: 11,
  Chiefs: 12, Raiders: 13, Rams: 14, Dolphins: 15, Vikings: 16, Patriots: 17, Saints: 18, Giants: 19, Jets: 20, Eagles: 21,
  Cardinals: 22, Steelers: 23, Chargers: 24, '49ers': 25, Seahawks: 26, Buccaneers: 27, Commanders: 28, Panthers: 29,
  Jaguars: 30, Ravens: 33, Texans: 34,
};

const teamFeedCache = new Map<number, Promise<NewsItem[]>>();
/** One club's latest ESPN items (up to 50, back about two weeks), memoized for the session. */
export const fetchTeamNews = (club: string): Promise<NewsItem[]> => {
  const id = ESPN_TEAM_ID[club];
  if (!id) return Promise.resolve([]);
  let job = teamFeedCache.get(id);
  if (!job) {
    job = fetch(`${FEED}&team=${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => parseNews(raw).sort((a, b) => b.published.localeCompare(a.published)))
      .catch(() => {
        teamFeedCache.delete(id);
        return [] as NewsItem[];
      });
    teamFeedCache.set(id, job);
  }
  return job;
};

/** What the headline is about, by rule over ESPN's type and the words: drives the kind label and the scene. */
export type NewsKind = 'recap' | 'trade' | 'injury' | 'video' | 'betting' | 'fantasy' | 'feature' | 'headline' | 'analysis';
export const newsKind = (it: Pick<NewsItem, 'type' | 'headline' | 'description'>): NewsKind => {
  const t = `${it.headline} ${it.description}`.toLowerCase();
  if (it.type === 'Media') return 'video';
  if (/\b(odds|betting|best bets|lines and totals|spread|picks?)\b/.test(t)) return 'betting';
  if (/\b(fantasy|waiver|free agent pickups|start 'em|sit 'em|depth charts?)\b/.test(t)) return 'fantasy';
  if (/\b(trade[sd]?|acquire[sd]?|releas\w+|waive[sd]?|extension|contract|signs?|agree[sd]?|cut|re-sign\w*)\b/.test(t)) return 'trade';
  if (/\b(injur\w+|season-ending|out for|ruled out|surgery|torn|sidelined|questionable|doubtful)\b/.test(t)) return 'injury';
  if (it.type === 'Recap' || /\b(week \d+|takeaways|recap|highlights|blowout|beat|beats|loss to|win over|snap)\b/.test(t)) return 'recap';
  if (it.type === 'HeadlineNews') return 'headline';
  if (/\b(inside|how|why|what|rank|power rankings|history|lore|journey|story)\b/.test(t)) return 'feature';
  return 'analysis';
};
export const NEWS_KIND_LABEL: Record<NewsKind, string> = {
  recap: 'Recap', trade: 'Transactions', injury: 'Injury', video: 'Video', betting: 'Betting', fantasy: 'Fantasy',
  feature: 'Feature', headline: 'Headline', analysis: 'Analysis',
};
