import { useEffect, useState } from 'react';
import { dataResponse } from '@/utils/dataStore';

/**
 * NFL edition: one full ESPN article for the reading sheet. The feed item's links.api.self.href
 * (content.core.api.espn.com/v1/sports/news/<id>) holds the story as HTML plus its photos and video. It is read through
 * the dev / preview server's /espn-content proxy (vite.config.ts), else straight from ESPN; the HTML is cut down to a
 * whitelist here and cached per article in sessionStorage. Nothing is stored in the repo.
 */

export interface ArticlePhoto { url: string; caption: string; credit: string }
export interface ArticleVideo { title: string; poster: string; mp4?: string; web?: string; duration?: number }
/** A sanitised block: `html` holds only whitelisted markup (p, a, em, strong, ul/ol/li, h2, h3, blockquote, br) */
export type ArticleBlock =
  | { t: 'html'; tag: 'p' | 'h2' | 'h3' | 'blockquote' | 'ul' | 'ol'; html: string }
  | { t: 'photo'; photo: ArticlePhoto }
  | { t: 'video'; video: ArticleVideo };
export interface Article {
  id: string;
  headline: string;
  byline: string;
  published: string;
  web: string;
  blocks: ArticleBlock[];
}

const CACHE = 'espn:article:v1:';
const PROXY = '/espn-content/';
const DIRECT = 'https://content.core.api.espn.com/';

const ALLOWED = new Set(['P', 'A', 'EM', 'I', 'STRONG', 'B', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'BR']);
const BLOCK_TAGS: Record<string, 'p' | 'h2' | 'h3' | 'blockquote' | 'ul' | 'ol'> = { P: 'p', H2: 'h2', H3: 'h3', H4: 'h3', BLOCKQUOTE: 'blockquote', UL: 'ul', OL: 'ol' };
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Serialise a node's children keeping only whitelisted tags; links keep an http(s) href and open in a new tab. */
const clean = (node: Node): string => {
  let out = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) return void (out += esc(c.textContent ?? ''));
    if (c.nodeType !== 1) return;
    const el = c as Element;
    const tag = el.tagName;
    if (!ALLOWED.has(tag)) {
      // unknown wrappers (spans, divs, ESPN's placeholders) keep their text, never their markup; scripts, styles and iframes go
      if (!/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|ALSOSEE|PHOTO\d*|VIDEO\d*|INLINE\d*)$/.test(tag)) out += clean(el);
      return;
    }
    const lc = tag.toLowerCase();
    if (lc === 'br') return void (out += '<br>');
    const inner = clean(el);
    if (lc === 'a') {
      const href = el.getAttribute('href') ?? '';
      out += /^https?:\/\//i.test(href) ? `<a href="${esc(href).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner;
    } else out += `<${lc}>${inner}</${lc}>`;
  });
  return out;
};

interface RawImage { type?: string; url?: string; caption?: string; credit?: string; width?: number }
interface RawVideo {
  headline?: string; title?: string; duration?: number; thumbnail?: string;
  posterImages?: { default?: { href?: string } };
  links?: { web?: { href?: string }; source?: { href?: string; HD?: { href?: string } }; mobile?: { source?: { href?: string } } };
}
interface RawArticle {
  id?: number | string; headline?: string; story?: string; byline?: string; published?: string;
  images?: RawImage[]; video?: RawVideo[]; links?: { web?: { href?: string } };
}

export const parseVideo = (v: RawVideo): ArticleVideo => ({
  title: v.headline ?? v.title ?? '',
  poster: v.posterImages?.default?.href ?? v.thumbnail ?? '',
  mp4: v.links?.source?.HD?.href ?? v.links?.source?.href ?? v.links?.mobile?.source?.href,
  web: v.links?.web?.href,
  duration: v.duration,
});

export const parseArticle = (raw: RawArticle): Article => {
  const photos: ArticlePhoto[] = (raw.images ?? [])
    .filter((i) => i.type !== 'Media' && i.url)
    .map((i) => ({ url: i.url!, caption: (i.caption ?? '').trim(), credit: (i.credit ?? '').trim() }));
  const videos = (raw.video ?? []).map(parseVideo);
  const doc = new DOMParser().parseFromString(`<body>${raw.story ?? ''}</body>`, 'text/html');
  const blocks: ArticleBlock[] = [];
  const usedPhoto = new Set<number>();
  const usedVideo = new Set<number>();
  doc.body.childNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const ph = /<(photo|video)(\d+)\b/i.exec(el.outerHTML);
    const plain = (el.textContent ?? '').trim() === '';
    if (plain && ph) {
      const i = Number(ph[2]) - 1;
      if (ph[1].toLowerCase() === 'photo' && photos[i]) {
        usedPhoto.add(i);
        blocks.push({ t: 'photo', photo: photos[i] });
      } else if (ph[1].toLowerCase() === 'video' && videos[i]) {
        usedVideo.add(i);
        blocks.push({ t: 'video', video: videos[i] });
      }
      return;
    }
    const tag = BLOCK_TAGS[el.tagName];
    if (!tag) return;
    const html = clean(el).trim();
    if (!html) return;
    // ESPN's "Also see" / "Related" teasers are a paragraph that is only a link to another story
    if (tag === 'p' && /^<a [^>]*>[^<]{0,140}<\/a>$/.test(html) && /^(also see|related|more|watch|read)/i.test(el.textContent ?? '')) return;
    blocks.push({ t: 'html', tag, html: tag === 'ul' || tag === 'ol' ? clean(el) : html });
  });
  // media the story never placed: photos after paragraph 2 (then 6, 10 ...), videos after paragraph 4 (then 8 ...);
  // one that finds no paragraph goes to the end, so no photo or clip is lost
  const paras = blocks.map((b, i) => (b.t === 'html' && b.tag === 'p' ? i : -1)).filter((i) => i >= 0);
  const inserts: [number, ArticleBlock][] = [];
  const tail: ArticleBlock[] = [];
  const place = (b: ArticleBlock, k: number) => (paras[k] !== undefined ? inserts.push([paras[k], b]) : tail.push(b));
  photos.filter((_, i) => !usedPhoto.has(i)).forEach((photo, n) => place({ t: 'photo', photo }, 1 + 4 * n));
  videos.filter((_, i) => !usedVideo.has(i)).forEach((video, n) => place({ t: 'video', video }, 3 + 4 * n));
  inserts.sort((x, y) => y[0] - x[0]).forEach(([at, b]) => blocks.splice(at + 1, 0, b));
  blocks.push(...tail);
  return {
    id: String(raw.id ?? ''),
    headline: raw.headline ?? '',
    byline: (raw.byline ?? '').trim(),
    published: raw.published ?? '',
    web: raw.links?.web?.href ?? '',
    blocks,
  };
};

const readCache = (id: string): Article | null => {
  try {
    const v = sessionStorage.getItem(CACHE + id);
    return v ? (JSON.parse(v) as Article) : null;
  } catch {
    return null;
  }
};

const getJson = async (url: string): Promise<unknown> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

/** The article from its ESPN content URL (items' `api`): the proxy first, else ESPN directly. Throws when both fail. */
export const fetchArticle = async (api: string, id: string): Promise<Article> => {
  const hit = readCache(id);
  if (hit) return hit;
  const path = api.replace(/^https?:\/\/content\.core\.api\.espn\.com\//, '');
  let raw: { headlines?: RawArticle[] };
  try {
    raw = (await getJson(PROXY + path)) as typeof raw; // a static host answers with its index page: not JSON, so it falls through
  } catch {
    raw = (await getJson(DIRECT + path)) as typeof raw;
  }
  const first = raw.headlines?.[0];
  if (!first) throw new Error('no article');
  const art = parseArticle(first);
  try {
    sessionStorage.setItem(CACHE + id, JSON.stringify(art));
  } catch {
    /* storage unavailable or full */
  }
  return art;
};

/** A video clip's record (a Media item) as an article with just that clip. */
export const fetchClipArticle = async (api: string, id: string, fallback: { headline: string; published: string; web: string }): Promise<Article> => {
  const hit = readCache(id);
  if (hit) return hit;
  const path = api.replace(/^https?:\/\/content\.core\.api\.espn\.com\//, '');
  let raw: { videos?: RawVideo[] };
  try {
    raw = (await getJson(PROXY + path)) as typeof raw;
  } catch {
    raw = (await getJson(DIRECT + path)) as typeof raw;
  }
  const v = raw.videos?.[0];
  if (!v) throw new Error('no clip');
  const art: Article = { id, ...fallback, byline: 'ESPN', blocks: [{ t: 'video', video: { ...parseVideo(v), web: parseVideo(v).web ?? fallback.web } }] };
  try {
    sessionStorage.setItem(CACHE + id, JSON.stringify(art));
  } catch {
    /* storage unavailable or full */
  }
  return art;
};

/** The article for an item, with loading / error / retry. */
export const useArticle = (item: { id: string; api?: string; type: string; headline: string; published: string; href: string; clipApi?: string } | null) => {
  const [state, setState] = useState<{ id: string | null; article: Article | null; error: boolean }>({ id: null, article: null, error: false });
  const [tries, setTries] = useState(0);
  const id = item?.id ?? null;
  useEffect(() => {
    if (!item) return;
    let alive = true;
    const job = item.clipApi
      ? fetchClipArticle(item.clipApi, item.id, { headline: item.headline, published: item.published, web: item.href })
      : item.api
        ? fetchArticle(item.api, item.id)
        : Promise.reject(new Error('no api'));
    job.then((article) => alive && setState({ id: item.id, article, error: false })).catch(() => alive && setState({ id: item.id, article: null, error: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tries]);
  const current = state.id === id;
  return {
    article: current ? state.article : null,
    loading: !!item && (!current || (!state.article && !state.error)),
    error: current && state.error,
    retry: () => {
      setState({ id: null, article: null, error: false });
      setTries((n) => n + 1);
    },
  };
};

let idsJob: Promise<Record<string, string>> | null = null;
let idsLoaded: Record<string, string> | null = null;
/** ESPN athlete id -> our player key ("QB:Josh Allen"): public/data/nfl/espn_ids.json (scripts/nfl/espn_ids.py). */
export const useEspnIds = (): Record<string, string> | null => {
  const [ids, setIds] = useState(idsLoaded);
  useEffect(() => {
    if (idsLoaded) return;
    let alive = true;
    (idsJob ??= dataResponse('data/nfl/espn_ids.json')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((d) => (idsLoaded = d))).then((d) => alive && setIds(d));
    return () => {
      alive = false;
    };
  }, []);
  return ids;
};
