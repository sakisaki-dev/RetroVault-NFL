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
  (manifestJob ??= ((window as { __rvManifest?: Promise<unknown> }).__rvManifest as Promise<{ files?: Record<string, string> } | null> | undefined ??
    // index.html starts this request (vite.config.ts preloadData) before the JS has loaded; without it, ask now
    fetch(`${BASE}data/manifest.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)))
    .then((m) => (m && typeof m.files === 'object' ? m.files : null))
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

/*
 * Which files wait their turn. The line is the bottleneck on a phone (a Season cold start asks for about 40 data files,
 * 2 MB, all at once, so the league sheet every tab blocks on shared the line with files nothing on screen needs yet).
 * Network requests therefore go through a small scheduler: at most SLOTS at a time, files named by `urgent` first, the
 * `background` ones (data for sections below the fold, other positions' advanced stats, season game logs, history files)
 * only in a slot nothing else wants. Everything is still fetched and every caller still gets its Response.
 */
const SLOTS = 4;
const URGENT = /^(data\/initial-data\.csv|data\/core\/extras\.json|private-sprites\/nfl\/core\.json|data\/sprites\.json|private-sprites\/index\.json)/;
const BACKGROUND =
  /^(data\/nfl\/(draft\.json|advanced\/|advanced\.json|game\/|streaks\.json|injuries\.json|ink\.json|games\/)|data\/history\/|data\/league\/(stars|schedule)\/|data\/player-extras\.json)/;
const rank = (path: string) => (URGENT.test(path) ? 0 : BACKGROUND.test(path) ? 2 : 1);
let running = 0;
const waiting: { rank: number; start: () => void }[] = [];
const pump = () => {
  while (running < SLOTS && waiting.length) {
    // the best rank first, first come first served within it
    let best = 0;
    for (let i = 1; i < waiting.length; i++) if (waiting[i].rank < waiting[best].rank) best = i;
    const [next] = waiting.splice(best, 1);
    running += 1;
    next.start();
  }
};
/** Runs a fetch in a slot, held until the whole body is in (the headers alone arrive long before the bytes do). */
const scheduledFetch = (path: string, url: string, init?: RequestInit): Promise<Response> =>
  scheduled(path, async () => {
    const r = await fetch(url, init);
    if (!r.ok) return r;
    return new Response(await r.arrayBuffer(), { status: r.status, statusText: r.statusText, headers: r.headers });
  });
const scheduled = <T,>(path: string, run: () => Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    waiting.push({
      rank: rank(path),
      start: () =>
        run().then(resolve, reject).finally(() => {
          running -= 1;
          pump();
        }),
    });
    pump();
  });

const flights = new Map<string, Promise<Response | null>>();

const fetchOnce = async (path: string): Promise<Response | null> => {
  try {
    const files = CACHE_ON ? await loadManifest() : null;
    const version = files?.[path];
    if (!CACHE_ON || !version) {
      const r = await scheduledFetch(path, `${BASE}${path}`, { cache: 'no-cache' });
      return r.ok ? r : null;
    }
    const url = `${BASE}${path}?v=${version}`;
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return hit;
    const r = await scheduledFetch(path, url);
    if (!r.ok) return null;
    // store a copy; a failure to store (quota) never costs the load
    cache.put(url, r.clone()).then(() => prune(cache, files!)).catch(() => undefined);
    return r;
  } catch {
    return null;
  }
};

/**
 * The file as a Response, or null (404, network error, bad status). Never throws. Callers asking for the same file
 * while it is on its way share one request (each gets its own clone), so a prewarm (main.tsx) and the first reader
 * never fetch it twice.
 */
export const dataFetch = async (path: string): Promise<Response | null> => {
  let job = flights.get(path);
  if (!job) {
    job = fetchOnce(path);
    flights.set(path, job);
    // keep the entry only while the request is in flight; later calls hit Cache Storage (or the network again)
    void job.finally(() => flights.delete(path));
  }
  const r = await job;
  return r ? r.clone() : null;
};

/**
 * Starts the files the first screen of any tab needs, once the entry module runs. Only paths the manifest lists are
 * fetched (an edition or build that lacks one asks for nothing), most urgent first.
 */
export const prewarmData = (paths: string[]) => {
  void loadManifest().then((files) => {
    if (!files) return;
    paths.filter((p) => files[p]).forEach((p) => void dataFetch(p));
  });
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
