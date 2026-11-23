import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Long lists in the page flow (a 2,500-row position table, a leaderboard opened to "all") render a first slice and add
 * more as the reader nears the end, so the DOM holds what is read, not the whole league (10,000 players: 50,000+ table
 * nodes). Order and sorting are the caller's; this only decides how many of the sorted rows are mounted.
 *
 *   const { shown, more, sentinelRef, showMore } = useProgressiveRows(rows.length);
 *   rows.slice(0, shown).map(...)  then  {more > 0 && <tr ref={sentinelRef}>… button onClick={showMore} …</tr>}
 *
 * `resetKey` (a sort, a filter, a search) puts the window back to the first slice. The sentinel loads the next slice when
 * it comes within 600px of the viewport; the button does the same for keyboard and screen-reader use.
 */
export const useProgressiveRows = (total: number, opts: { initial?: number; step?: number; resetKey?: unknown } = {}) => {
  const { initial = 120, step = 160, resetKey } = opts;
  const [shown, setShown] = useState(initial);
  const lastReset = useRef(resetKey);
  useEffect(() => {
    if (lastReset.current !== resetKey) {
      lastReset.current = resetKey;
      setShown(initial);
    }
  }, [resetKey, initial]);
  const showMore = useCallback(() => setShown((n) => n + step), [step]);
  const io = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (el: Element | null) => {
      io.current?.disconnect();
      io.current = null;
      if (!el || typeof IntersectionObserver === 'undefined') return;
      io.current = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShown((n) => n + step), { rootMargin: '600px 0px' });
      io.current.observe(el);
    },
    [step],
  );
  useEffect(() => () => io.current?.disconnect(), []);
  const visible = Math.min(total, shown);
  return { shown: visible, more: Math.max(0, total - visible), sentinelRef, showMore };
};
