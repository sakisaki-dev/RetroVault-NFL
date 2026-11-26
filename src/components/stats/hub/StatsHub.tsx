import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Building2, ChartScatter, Hourglass, Radar, Swords, Users } from 'lucide-react';
import type { Player } from '@/types/player';
import { PageTabs } from '@/components/nav/PageTabs';
import PlayerSearchSelect from '../../PlayerSearchSelect';
import { openInCompFinder } from '../comps/compFinderLink';
import { usePrefersReducedMotion } from '../analytics/viz';
import { keyOf } from '../records';
import { buildHash, lastNavKind, useHubRoute, type StatsSub } from './hashRoute';

import { IS_NFL } from '@/config/edition';
import '@/styles/interact.css';

const ALL_SUB_TABS: { id: StatsSub; label: string; short: string; Icon: typeof Users; blurb: string }[] = [
  { id: 'players', label: 'Players', short: 'Players', Icon: Users, blurb: 'Records, full stat tables, advanced analytics and leaders' },
  { id: 'teams', label: 'Teams', short: 'Teams', Icon: Building2, blurb: 'Every franchise and its roster' },
  { id: 'graphs', label: 'Graphs', short: 'Graphs', Icon: ChartScatter, blurb: 'Graph Builder: any stat against any stat' },
  { id: 'h2h', label: 'Head-to-Head', short: 'H2H', Icon: Swords, blurb: 'Any two players, every stat' },
  { id: 'deepdive', label: 'Deep Dive', short: 'Dive', Icon: Radar, blurb: 'One player, every angle: style, comps and more' },
  { id: 'clock', label: 'The Clock', short: 'Clock', Icon: Hourglass, blurb: 'Farewell Tour, prospects and age curves from the live save' },
];

const SUB_TABS = ALL_SUB_TABS.filter((t) => !IS_NFL || t.id !== 'clock');

interface Props {
  sub: StatsSub;
  section?: string;
  onSubChange: (sub: StatsSub) => void;
  players: Player[];
  onOpenPlayer: (p: Player) => void;
  /** Warm a sub-tab's code chunk (hover / focus on its tab); see lazyViews.tsx */
  onPrefetch?: (sub: StatsSub) => void;
  children: ReactNode;
}

const px = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Stats hub shell: a sticky sub-nav (Players / Teams / Graphs / Head-to-Head / Deep Dive) with a global player
 * search, pinned right under the site header. Content below sees `--site-header-h` as header + sub-nav, so
 * sticky bars inside a sub-tab (e.g. the Head-to-Head scoreboard) sit under both.
 */
const StatsHub = ({ sub, section, onSubChange, players, onOpenPlayer, onPrefetch, children }: Props) => {
  const barRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState<{ header: number; bar: number }>({ header: 0, bar: 0 });
  const reduced = usePrefersReducedMotion();
  // The sub-tab being switched to lights up at once (the switch itself renders as a transition; see hashRoute)
  const { target } = useHubRoute();
  const litSub = target?.tab === 'career' && target.sub ? target.sub : sub;
  // a game opens from the Teams, Season and Deep Dive pages and sits under Teams
  const lit = litSub === 'game' ? 'teams' : litSub;
  const sorted = useMemo(() => [...players].sort((a, b) => b.careerLegacy - a.careerLegacy), [players]);

  // Track the site header height (published by Header on <html>) and our own bar height.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      // Header.tsx sets the variable inline on <html>: read it there (a computed-style read forces a full style recalc)
      const header = px(root.style.getPropertyValue('--site-header-h'));
      const bar = barRef.current?.offsetHeight ?? 0;
      setOffset((o) => (o.header === header && o.bar === bar ? o : { header, bar }));
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(root, { attributes: true, attributeFilter: ['style'] });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (barRef.current) ro?.observe(barRef.current);
    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, []);

  // In-page jumps (and other agents' scrollIntoView calls) land below both sticky bars.
  const total = offset.header + offset.bar;
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.scrollPaddingTop;
    root.style.scrollPaddingTop = `${total + 8}px`;
    return () => {
      root.style.scrollPaddingTop = prev;
    };
  }, [total]);

  // Sub-tab switch: the new panel opens at its top, in the same commit that shows it (no visible scroll travel), if we
  // had scrolled past it. Back / Forward leave the scroll to the router, which restores where the page was left
  // (hashRoute). Sections scroll to themselves (below).
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current || section || lastNavKind() === 'pop') return;
    const top = (rootRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - offset.header;
    if (window.scrollY > top + 4) window.scrollTo({ top: Math.max(0, top), behavior: 'instant' as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, section]);

  // Parts of a sub-tab load lazily (lazyViews.tsx), so a section may not exist yet, or may move when a chunk above it
  // lands: wait for it, then keep it aligned while the panel settles (until the user scrolls, or about 3 s).
  useEffect(() => {
    const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
    const cleanups: (() => void)[] = [];
    const id = window.requestAnimationFrame(() => {
      if (section && lastNavKind() !== 'pop') {
        const root = rootRef.current;
        let settled = false;
        const align = (b: ScrollBehavior) => document.getElementById(section)?.scrollIntoView({ behavior: b, block: 'start' });
        const stop = () => {
          settled = true;
          cleanups.forEach((f) => f());
        };
        let found = !!document.getElementById(section);
        if (found) align(behavior);
        let height = root?.offsetHeight ?? 0;
        const ro = typeof ResizeObserver !== 'undefined' && root ? new ResizeObserver(() => {
          if (settled || root.offsetHeight === height) return;
          height = root.offsetHeight;
          const now = !!document.getElementById(section);
          if (now) align(found ? 'auto' : behavior);
          found ||= now;
        }) : null;
        if (root) ro?.observe(root);
        const userScroll = () => stop();
        const opts = { passive: true } as const;
        window.addEventListener('wheel', userScroll, opts);
        window.addEventListener('touchmove', userScroll, opts);
        window.addEventListener('keydown', userScroll);
        const timer = window.setTimeout(stop, 3000);
        cleanups.push(() => {
          ro?.disconnect();
          window.removeEventListener('wheel', userScroll);
          window.removeEventListener('touchmove', userScroll);
          window.removeEventListener('keydown', userScroll);
          window.clearTimeout(timer);
        });
        return;
      }
    });
    first.current = false;
    return () => {
      window.cancelAnimationFrame(id);
      cleanups.forEach((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, section]);

  // Swiping (the strip or the page below it) is the site-wide interactive swipe (SwipeNav / utils/swipeSlide.ts): the
  // page follows the finger. The neighbouring sub-tabs' chunks are warmed once the current one is up, so a swipe lands
  // on code that is already there.
  useEffect(() => {
    const i = SUB_TABS.findIndex((t) => t.id === sub);
    const ids = [SUB_TABS[i - 1], SUB_TABS[i + 1]].filter(Boolean).map((t) => t.id);
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const run = () => ids.forEach((id) => onPrefetch?.(id));
    const h = idle ? idle(run) : window.setTimeout(run, 400);
    return () => {
      if (!idle) window.clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  const tabs = (
    <PageTabs<StatsSub>
      label="Stats sections"
      value={lit as StatsSub}
      onChange={onSubChange}
      onPrefetch={onPrefetch}
      tabs={SUB_TABS.map((t) => ({ value: t.id, label: t.label, short: t.short, Icon: t.Icon, title: t.blurb, href: buildHash({ tab: 'career', sub: t.id }) }))}
    />
  );

  // no search of its own: the site header's search is right above (owner: "remove the find a player search bar in the stats page")

  return (
    <div ref={rootRef} className="rv-stats" data-swipe-pending={litSub !== sub ? '' : undefined} style={{ ['--stats-bar-h' as string]: `${offset.bar}px` }}>
      <div
        ref={barRef}
        data-chrome-bar
        className="chrome-hide-bar sticky z-40 border-b border-line/70 bg-night"
        style={{ top: 'var(--site-header-h, 0px)' }}
      >
        <div className="container flex items-center gap-3 py-1.5">
          <span className="hidden shrink-0 font-pixel text-[10px] uppercase text-gold xl:inline" aria-hidden="true">
            Stats
          </span>
          {tabs}
        </div>
      </div>

      <div style={total ? { ['--site-header-h' as string]: `${total}px` } : undefined}>{children}</div>
    </div>
  );
};

export default StatsHub;
