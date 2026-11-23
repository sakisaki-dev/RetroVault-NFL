import { useCallback, useEffect, useState } from 'react';
import { findNFLTeam } from '@/utils/nflTeams';

/**
 * NFL edition: real news from ESPN's public feed (site.api.espn.com, CORS open, no key), fetched in the browser when the
 * News page opens and cached in sessionStorage for 5 minutes. Nothing is stored in the repo.
 */

const FEED = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50';
const CACHE_KEY = 'espn:news:v1';
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
}

interface RawCat { type: string; description?: string; athlete?: { description?: string }; team?: { description?: string } }
interface RawItem {
  id: number | string;
  type: string;
  headline?: string;
  description?: string;
  published?: string;
  images?: { url: string; caption?: string; credit?: string; width?: number }[];
  categories?: RawCat[];
  links?: { web?: { href?: string }; api?: { self?: { href?: string } } };
}

export const parseNews = (raw: { articles?: RawItem[] }): NewsItem[] =>
  (raw.articles ?? [])
    .filter((a) => a.headline)
    .map((a) => {
      const img = [...(a.images ?? [])].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0];
      const cats = a.categories ?? [];
      const teams = cats
        .filter((c) => c.type === 'team')
        .map((c) => findNFLTeam(c.team?.description ?? c.description ?? '')?.name)
        .filter((t): t is string => !!t);
      return {
        id: String(a.id),
        type: a.type,
        headline: a.headline!,
        description: a.description ?? '',
        published: a.published ?? '',
        image: img ? { url: img.url, caption: img.caption ?? '', credit: img.credit ?? '' } : undefined,
        href: a.links?.web?.href ?? 'https://www.espn.com/nfl/',
        clipApi: a.type === 'Media' ? a.links?.api?.self?.href : undefined,
        athletes: [...new Set(cats.filter((c) => c.type === 'athlete').map((c) => c.athlete?.description ?? c.description ?? '').filter(Boolean))],
        teams: [...new Set(teams)],
      };
    });

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
