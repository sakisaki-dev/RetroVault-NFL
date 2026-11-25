/**
 * Opening a club's rafters from anywhere (the player card's retired-number strip and hanging banner): the Hall of Fame
 * tab's Rafters section with that club picked. openRafters(clubId) keeps the request pending until the section takes it
 * (so it survives the tab mounting after the event) and dispatches a window event; pages/Index.tsx answers by switching
 * to the Hall of Fame tab, and a mounted section by picking the club and scrolling to itself.
 */
export const RAFTERS_EVENT = 'rv:open-rafters';
/** The section's anchor (BottomNav's Hall of Fame sections use it too) */
export const RAFTERS_ANCHOR = 'hof-rafters-title';

let pending: string | null = null;

/** Open the rafters of a club (NFL team id, "eagles") */
export const openRafters = (clubId: string) => {
  pending = clubId;
  window.dispatchEvent(new CustomEvent(RAFTERS_EVENT, { detail: clubId }));
};

/** The pending request, if any (read once) */
export const takeRaftersRequest = (): string | null => {
  const id = pending;
  pending = null;
  return id;
};

/** Listen for requests (Index switches tabs); returns the unsubscribe */
export const onRaftersRequest = (cb: (clubId: string) => void) => {
  const on = (e: Event) => cb(String((e as CustomEvent).detail));
  window.addEventListener(RAFTERS_EVENT, on);
  return () => window.removeEventListener(RAFTERS_EVENT, on);
};

/**
 * The NFL edition opens a club's own page for its rafters (pages/Index.tsx, openTeamPage): once the team sheet shows
 * its rafters (RetiredRafters' heading, id "retired-numbers"), scroll them into view. Gives up after 4 s.
 */
export const scrollToTeamRafters = () => {
  const t0 = performance.now();
  let found = 0;
  const tick = () => {
    const el = document.getElementById('retired-numbers');
    const now = performance.now();
    if (!el) {
      if (now - t0 < 4000) requestAnimationFrame(tick);
      return;
    }
    // the sheet's content above it keeps laying out for a moment (logos, lazy parts): re-aim until it settles
    // stop below the sheet's sticky tab bar
    el.style.scrollMarginTop = '64px';
    const top = el.getBoundingClientRect().top;
    if (Math.abs(top - 64) > 24) el.scrollIntoView({ block: 'start', behavior: 'auto' });
    if (!found) found = now;
    if (now - found < 1500) window.setTimeout(() => requestAnimationFrame(tick), 150);
  };
  window.setTimeout(() => requestAnimationFrame(tick), 250);
};
