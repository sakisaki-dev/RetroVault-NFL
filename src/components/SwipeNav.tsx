import { useEffect } from 'react';

/*
 * Swipe between pills, everywhere (owner: "anything with a pill or submenus should allow me to swipe between, this includes
 * the stats page ... unless another interaction takes it over"). One touch listener on the document: a horizontal swipe
 * (50px+, |dx| > 1.5 |dy|) presses the previous or next option of the pill navigator that governs where the finger was:
 * the nearest one above it inside the innermost section that has one (a card's own toggle for that card, the page's
 * tabs elsewhere), never across a dialog's edge. Pages that wire useSwipeTabs themselves mark the event and are skipped.
 * Left alone: anything that drags or scrolls sideways itself (the same list as useSwipeTabs), the system Back edge, and
 * long pickers (more than 7 options: weeks, seasons).
 */
const NAV = '.ax-toggle:not(.ax-toggle--wrap), [role="tablist"], [data-swipe-nav]';
const OPT = 'button, [role="tab"], a[href]';
const ON = '.is-on, [aria-selected="true"], [aria-pressed="true"], [aria-current="page"], [aria-current="true"], [data-state="active"], [data-state="on"]';
const IGNORE = 'input, textarea, select, canvas, [role="slider"], [data-no-swipe], [data-no-swipe-x], .rf-banner, [class*="rafters"], [class*="binder"], [class*="carousel"], [class*="ticker"], [class*="marquee"], [class*="tape"], .ax-select__list, ' + NAV;

const scrollsSideways = (el: Element | null): boolean => {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (n instanceof HTMLElement && n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
};
const visible = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const options = (nav: Element) => [...nav.querySelectorAll<HTMLElement>(OPT)].filter((o) => o.closest(NAV) === nav && visible(o) && !(o as HTMLButtonElement).disabled);

/** The navigator that governs a point in the page: innermost section first, the last one above the target */
const governing = (target: Element): Element | null => {
  const box = target.closest('[role="dialog"]');
  for (let a: Element | null = target.parentElement; a; a = a.parentElement) {
    const found = [...a.querySelectorAll(NAV)].filter((nav) => {
      if (nav.contains(target) || !visible(nav)) return false;
      if (nav.closest('[role="dialog"]') !== box) return false;
      if (!(nav.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
      const n = options(nav).length;
      return n >= 2 && n <= 7;
    });
    if (found.length) return found[found.length - 1];
    if (a === box) break;
  }
  return null;
};

const SwipeNav = () => {
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches && !('ontouchstart' in window)) return;
    let sx = 0, sy = 0, target: Element | null = null;
    const start = (e: TouchEvent) => {
      target = null;
      if (e.touches.length !== 1) return;
      const t = e.target as Element | null;
      if (!t || t.closest(IGNORE) || scrollsSideways(t)) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      target = t;
    };
    const end = (e: TouchEvent) => {
      const t0 = target;
      target = null;
      if (!t0 || (e as TouchEvent & { rvSwiped?: boolean }).rvSwiped) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 50 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
      if (sx < 24 && dx > 0) return; // the system's edge swipe is Back
      const nav = governing(t0);
      if (!nav) return;
      const opts = options(nav);
      const i = opts.findIndex((o) => o.matches(ON));
      if (i < 0) return;
      const next = opts[i + (dx < 0 ? 1 : -1)];
      if (next) next.click();
    };
    const cancel = () => { target = null; };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
    };
  }, []);
  return null;
};

export default SwipeNav;
