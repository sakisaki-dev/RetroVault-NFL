import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { formatDecimal } from '@/utils/metricColors';
import type { RecordBoardData } from '../records';
import { getTeamColors, liftForDarkBg } from '@/utils/teamColors';
import { VIZ } from '../analytics/viz';

/**
 * Small shared kit for the Stats page's hand-built charts: container width, roving keyboard focus over
 * chart points, a floating tooltip and team-coloured marks. Module-level only (never declare components
 * inside components: it remounts them on every render).
 */

export const GOLD = 'hsl(43 100% 62%)';

/** A team's primary colour lifted so it reads as a mark on the dark surface; muted grey when unknown. */
export const teamMark = (team?: string | null, minLightness = 52) => {
  const c = getTeamColors(team);
  return c ? liftForDarkBg(c.primary, minLightness) : VIZ.muted;
};

/** Width of an element, kept current with a ResizeObserver. Works across mount / unmount (callback ref). */
export const useWidth = () => {
  const [width, setWidth] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    setWidth(Math.round(el.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    ro.current = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.current.observe(el);
  }, []);
  return [ref, width] as const;
};

/**
 * Keyboard support for a chart's points: every point is a Tab stop (tabIndex 0, as the owner asked), and arrows /
 * Home / End also jump between points in `keys` order; Enter / Space activates. Points carry `data-rk={key}`.
 */
export const useRoving = (keys: string[]) => {
  const container = useRef<HTMLDivElement | null>(null);
  const [, setActive] = useState<string | null>(null);
  const index = useMemo(() => new Map(keys.map((k, i) => [k, i])), [keys]);

  const tabIndex = (_k: string) => 0;

  const onKeyDown = (k: string, e: KeyboardEvent, activate: () => void) => {
    const i = index.get(k) ?? 0;
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(i + 1, keys.length - 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(i - 1, 0);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = keys.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
      return;
    }
    if (j < 0) return;
    e.preventDefault();
    const next = keys[j];
    setActive(next);
    const el = container.current?.querySelector<SVGElement | HTMLElement>(`[data-rk="${CSS.escape(next)}"]`);
    el?.focus();
  };

  return { container, tabIndex, onKeyDown, setActive };
};

/** Nice tick step for a span (1, 2, 2.5, 5 × 10^n), aiming for about `count` ticks. */
export const niceStep = (span: number, count = 5) => {
  if (!(span > 0)) return 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const f = norm < 1.5 ? 1 : norm < 2.25 ? 2 : norm < 3.5 ? 2.5 : norm < 7.5 ? 5 : 10;
  return f * mag;
};

/** Ticks covering [lo, hi] on a nice step; returns the padded domain too. */
export const niceTicks = (lo: number, hi: number, count = 5) => {
  const step = niceStep(hi - lo || Math.abs(hi) || 1, count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) ticks.push(Number(t.toFixed(6)));
  return { ticks, domain: [start, end] as [number, number] };
};

/** Compact axis number: 12,500 → 12.5k. */
export const fmtShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return `${Number((v / 1000).toFixed(1))}k`;
  return String(Number(v.toFixed(a < 1 ? 2 : 1)));
};


/** "+1,234 over #2", or null when the board has a single entry. */
export const marginText = (b: RecordBoardData) => {
  const [a, c] = b.entries;
  if (!a || !c) return null;
  const gap = a.value - c.value;
  return gap <= 0 ? 'Tied for the lead' : `+${formatDecimal(gap, b.decimals)} over #2`;
};

/**
 * At most `max` of `sorted` (already in value order): every item `keep` names plus an even stride through the rest, so
 * the drawn distribution keeps its shape. A swarm of thousands of dots is unreadable and slow (SVG nodes, collision
 * search); today's boards are below the cap and draw every player.
 */
export const thinForSwarm = <T,>(sorted: T[], max: number, keep: (item: T) => boolean): T[] => {
  if (sorted.length <= max) return sorted;
  const must = new Set(sorted.filter(keep));
  const room = Math.max(1, max - must.size);
  const rest = sorted.filter((it) => !must.has(it));
  const step = rest.length / room;
  const pick = new Set<T>(must);
  for (let i = 0; i < room && Math.floor(i * step) < rest.length; i += 1) pick.add(rest[Math.floor(i * step)]);
  return sorted.filter((it) => pick.has(it));
};

/**
 * Deterministic beeswarm: place dots in value order at the smallest vertical offset that doesn't collide.
 * Dots arrive sorted by cx (value order), so only the placed dots within one diameter to the left can collide: a
 * sliding window keeps it O(n x window) instead of O(n^2) (10,000 players took 10 s). Unsorted input falls back to
 * scanning every placed dot, which gives the same answer.
 */
export const swarm = (xs: { cx: number }[], r: number) => {
  const placed: { cx: number; dy: number }[] = [];
  const d = r * 2 + 1;
  let from = 0; // placed[from..] are the only dots that can be within d to the left of the next one
  let sorted = true;
  return xs.map(({ cx }, i) => {
    if (sorted && i > 0 && cx < xs[i - 1].cx) sorted = false;
    let near: { cx: number; dy: number }[];
    if (sorted) {
      while (from < placed.length && cx - placed[from].cx >= d) from += 1;
      near = placed.slice(from);
    } else near = placed.filter((p) => Math.abs(p.cx - cx) < d);
    for (let k = 0; ; k += 1) {
      const dy = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * r;
      if (near.every((p) => (p.cx - cx) ** 2 + (p.dy - dy) ** 2 >= d * d)) {
        placed.push({ cx, dy });
        return dy;
      }
    }
  });
};
