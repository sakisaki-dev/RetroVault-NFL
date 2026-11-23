import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Player } from '@/types/player';
import { buildSearchIndex, keyOfPlayer, pooledIndex, readRecent, searchPlayers } from '@/utils/playerSearch';
import { usePlayerExtras } from '@/utils/playerExtras';
import { useGamePool, useOfficialOvr } from '@/utils/useOfficialOvr';

/**
 * THE fast path for every player search and picker (owner: "all searches like those in the Deep Dive and Head to Head
 * need the limiter"). One place for the rules the header search proved: the ranked matcher on a precomputed index
 * (utils/playerSearch.ts, cached per player array, so a keystroke never rebuilds it), the query deferred
 * (useDeferredValue: typing never waits for the list), at most `limit` rows rendered with "keep typing" for the rest, and
 * an empty query that shows recent picks and a short featured list instead of everyone. Callers render with
 * cmdk `shouldFilter={false}` and draw sprites only for the rows returned here.
 *
 *   const s = usePlayerSearch(players, { pos });
 *   <CommandInput value={s.query} onValueChange={s.setQuery} />   s.rows, s.more, s.recent, s.featured
 */
export const SEARCH_LIMIT = 40;
export const FEATURED_LIMIT = 24;

export const usePlayerSearch = (
  players: Player[],
  opts: { pos?: string; limit?: number; featuredLimit?: number; ovr?: Map<string, number> } = {},
) => {
  const { pos = 'ALL', limit = SEARCH_LIMIT, featuredLimit = FEATURED_LIMIT } = opts;
  const shownOvr = useOfficialOvr();
  const ovr = opts.ovr ?? shownOvr;
  const extras = usePlayerExtras();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const index = useMemo(() => buildSearchIndex(players, { ovr, formerNames: extras.formerNames }), [players, ovr, extras]);
  const inPos = (p: Player) => pos === 'ALL' || p.position === pos;

  const featured = useMemo(() => {
    const rank = (p: Player) => ovr.get(keyOfPlayer(p)) ?? 0;
    return players
      .filter(inPos)
      .sort((a, b) => rank(b) - rank(a) || (b.careerLegacy || 0) - (a.careerLegacy || 0) || a.name.localeCompare(b.name))
      .slice(0, featuredLimit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, ovr, pos, featuredLimit]);

  const recent = useMemo(
    () => (deferred.trim() ? [] : readRecent().map((k) => index.byKey.get(k)?.p).filter((p): p is Player => !!p && inPos(p))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferred, index, pos],
  );

  const { rows, more } = useMemo(() => {
    if (!deferred.trim()) return { rows: [] as Player[], more: false };
    const hits = searchPlayers(index, deferred, limit + 1, pos === 'ALL' ? undefined : inPos);
    return { rows: hits.slice(0, limit).map((e) => e.p), more: hits.length > limit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferred, index, pos, limit]);

  return { query, setQuery, searching: !!deferred.trim(), rows, more, recent, featured, index };
};

/**
 * Builds the search index once the page has settled (an idle slot after the league and the ratings are in), so the first
 * keystroke in the header search or any picker finds it ready (at 10,000 players building it is ~50 ms, which was the
 * slow first key). Mount once, in the header; the index is cached per player array and ratings map, so every
 * usePlayerSearch after it reuses the same one.
 */
export const useWarmPlayerSearch = () => {
  const { league, legends, ovrMap, loaded } = useGamePool();
  const extras = usePlayerExtras();
  useEffect(() => {
    if (!loaded || ovrMap.size === 0) return;
    const run = () => {
      pooledIndex(league, legends, { ovr: ovrMap, formerNames: extras.formerNames });
      buildSearchIndex(league, { ovr: ovrMap, formerNames: extras.formerNames });
    };
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(run, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(h);
    }
    const t = window.setTimeout(run, 600);
    return () => window.clearTimeout(t);
  }, [loaded, league, legends, ovrMap, extras.formerNames]);
};
