import { overlayHistoryOn } from '@/utils/overlayHistory';
import { clubHash, parseClubHash, type ClubTab } from '@/utils/openClub';

/*
 * The club page's URL: #season/club?c=<Club>&tab=<season|franchise>&y=<season>, mirrored while the sheet is open so the
 * page is linkable. On a phone the sheet already owns a history entry (utils/overlayHistory), so the URL of that entry is
 * rewritten and Back pops it as before. On a desktop, opening pushes one entry (Back closes the sheet and the page under
 * it stays); tab and season changes replace it.
 */
let pushed = false;
let base = '';

/** Remember the page under the sheet (its hash) the first time a club opens */
export const rememberBase = () => {
  if (!parseClubHash(window.location.hash)) base = window.location.hash;
};

export const mirrorClubHash = (club: string, tab: ClubTab, season?: number) => {
  const h = clubHash(club, tab, season);
  if (window.location.hash === h) return;
  try {
    if (overlayHistoryOn() || pushed) window.history.replaceState(window.history.state, '', h);
    else {
      window.history.pushState(window.history.state, '', h);
      pushed = true;
    }
  } catch {
    /* a sandboxed frame: the route just isn't mirrored */
  }
};

/** The sheet closed: put the page's own hash back (Back from a desktop push, a replace otherwise) */
export const releaseClubHash = () => {
  const wasPushed = pushed;
  pushed = false;
  if (!parseClubHash(window.location.hash)) return; // Back (or a route change) already took it away
  try {
    if (wasPushed) window.history.back();
    else if (!overlayHistoryOn()) window.history.replaceState(window.history.state, '', base || `${window.location.pathname}${window.location.search}`);
  } catch {
    /* ignore */
  }
};
