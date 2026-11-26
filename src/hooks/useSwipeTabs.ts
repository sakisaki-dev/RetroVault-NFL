import { useEffect, useRef, type RefObject } from 'react';

/*
 * Swipe between a page's pill tabs (touch only). A horizontal-dominant drag on the content under the navigator (at
 * least 50px and |dx| > 1.5 |dy|) moves to the previous or next value. Listeners are passive and the area gets
 * `touch-action: pan-y`, so vertical scrolling is never blocked. A drag that starts inside something that scrolls or
 * drags sideways itself is left alone: [data-no-swipe], inputs, sliders, canvases, horizontally scrollable rows,
 * carousels, tickers, the rafters banners and the binder. The navigator's thumb already slides when `value` changes.
 */
const MIN_DX = 50;
const RATIO = 1.5;
const IGNORE = 'input, textarea, select, canvas, [role="slider"], [data-no-swipe], [data-no-swipe-x], .rf-banner, [class*="rafters"], [class*="binder"], [class*="carousel"], [class*="ticker"], [class*="marquee"], [role="tablist"], .ax-toggle, .ax-select__list';

const scrollsSideways = (el: Element | null, stop: Element): boolean => {
  for (let n: Element | null = el; n && n !== stop.parentElement; n = n.parentElement) {
    if (n instanceof HTMLElement && n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
};

export function useSwipeTabs<T extends string | number>({
  ref,
  values,
  value,
  onChange,
  enabled = true,
}: {
  ref: RefObject<HTMLElement | null>;
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
  enabled?: boolean;
}) {
  const live = useRef({ values, value, onChange });
  live.current = { values, value, onChange };
  const el = ref.current; // read during render: a page that mounts its area late re-renders and re-attaches
  useEffect(() => {
    if (!el || !enabled) return;
    if (typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches && !('ontouchstart' in window)) return;
    el.style.touchAction = 'pan-y';
    let sx = 0, sy = 0, ok = false;
    const start = (e: TouchEvent) => {
      ok = false;
      if (e.touches.length !== 1) return;
      const t = e.target as Element | null;
      if (!t || t.closest(IGNORE) || scrollsSideways(t, el)) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      ok = true;
    };
    const end = (e: TouchEvent) => {
      if (!ok) return;
      ok = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < RATIO * Math.abs(dy)) return;
      if (sx < 24 && dx > 0) return; // the system's edge swipe is Back
      const { values: vs, value: v, onChange: go } = live.current;
      const i = vs.indexOf(v);
      const next = vs[i + (dx < 0 ? 1 : -1)];
      if (i >= 0 && next !== undefined) {
        (e as TouchEvent & { rvSwiped?: boolean }).rvSwiped = true; // the site-wide SwipeNav leaves it
        go(next);
      }
    };
    const cancel = () => { ok = false; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', cancel);
      el.style.touchAction = '';
    };
  }, [el, enabled]);
}
