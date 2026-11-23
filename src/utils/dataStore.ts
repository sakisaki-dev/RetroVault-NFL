/**
 * How the site loads its data files (public/data/**, private-sprites/nfl/**).
 *
 * `data/manifest.json` (scripts/perf/build_core.py, run after every data rebuild: `npm run perf:core`) lists the
 * version (8 hex of the sha1) of every data file. A file is then fetched as `<path>?v=<version>` and kept in the
 * browser's Cache Storage under that URL: a revisit, or a second page that wants the same file, loads nothing and
 * parses straight from the stored response, and a new version is a new URL, so a data update shows at once and the
 * old copy is dropped. Without Cache Storage (private windows, old browsers), without a manifest or in dev, every
 * file is fetched the way it always was (no-cache revalidation), so nothing depends on this.
 *
 *   const json = await dataJson<Foo>('data/core/extras.json');   // null on a 404 / bad JSON
 *   const text = await dataText('data/initial-data.csv');
 *   const res  = await dataFetch('data/market.json');            // the Response (or null)
 */
const BASE = import.meta.env.BASE_URL;
const CACHE_NAME = 'rv-data-v1';
const CACHE_ON = !import.meta.env.DEV && typeof caches !== 'undefined';

let manifestJob: Promise<Record<string, string> | null> | null = null;
/** path (under the site, e.g. "data/market.json") → version; null when there is no manifest */
export const loadManifest = (): Promise<Record<string, string> | null> =>
  (manifestJob ??= fetch(`${BASE}data/manifest.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m: { files?: Record<string, string> } | null) => (m && typeof m.files === 'object' ? m.files : null))
    .catch(() => null));

let pruned = false;
/** Drops stored copies of files whose version changed (their URL is no longer in the manifest). */
const prune = async (cache: Cache, files: Record<string, string>) => {
  if (pruned) return;
  pruned = true;
  try {
    const live = new Set(Object.entries(files).map(([p, v]) => `${BASE}${p}?v=${v}`));
    for (const req of await cache.keys()) {
      const u = new URL(req.url);
      if (!live.has(`${u.pathname}${u.search}`)) await cache.delete(req);
    }
  } catch {
    // a failed prune only leaves old copies behind
  }
};

/** The file as a Response, or null (404, network error, bad status). Never throws. */
export const dataFetch = async (path: string): Promise<Response | null> => {
  try {
    const files = CACHE_ON ? await loadManifest() : null;
    const version = files?.[path];
    if (!CACHE_ON || !version) {
      const r = await fetch(`${BASE}${path}`, { cache: 'no-cache' });
      return r.ok ? r : null;
    }
    const url = `${BASE}${path}?v=${version}`;
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return hit;
    const r = await fetch(url);
    if (!r.ok) return null;
    // store a copy; a failure to store (quota) never costs the load
    cache.put(url, r.clone()).then(() => prune(cache, files!)).catch(() => undefined);
    return r;
  } catch {
    return null;
  }
};

/** Same as dataFetch but always a Response (a synthetic 404 on failure), a drop-in for `fetch(url)` call sites that read `.ok`. */
export const dataResponse = async (path: string): Promise<Response> => (await dataFetch(path)) ?? new Response(null, { status: 404 });
export const dataJson = async <T = unknown>(path: string): Promise<T | null> => {
  const r = await dataFetch(path);
  if (!r) return null;
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
};

export const dataText = async (path: string): Promise<string | null> => {
  const r = await dataFetch(path);
  if (!r) return null;
  try {
    return await r.text();
  } catch {
    return null;
  }
};
