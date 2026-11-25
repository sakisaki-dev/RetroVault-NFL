import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import PixelLoader from '@/components/ui/PixelLoader';
import { OPEN_CLUB_SEASON_EVENT, parseClubHash, parseLegacyTeamHash, takePendingClub, type ClubRequest } from '@/utils/openClub';
import { releaseClubHash, rememberBase } from './clubRoute';

// The sheet (and its CSS) loads only when a club is first opened
const ClubSeasonSheet = lazy(() => import('./ClubSeasonSheet'));

type State = ClubRequest & { open: boolean; n: number };

/**
 * Mount once (pages/Index.tsx). Answers openClub(club, { tab, season }) from anywhere with the club page, the club
 * season sheet with its This season and Franchise tabs; closing keeps the last club mounted so the sheet plays its exit.
 * The route #season/club?c=…&tab=… opens it too (a shared link, Back and Forward), and the old Stats › Teams sheet
 * route (#stats/teams?p=<club>) is rewritten to the Teams page with this sheet on its Franchise tab.
 */
const ClubSeasonHost = () => {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    const show = (r: ClubRequest) => {
      rememberBase();
      setState((s) => ({ ...r, open: true, n: (s?.n ?? 0) + 1 }));
    };
    // the old route: put the Teams page's own hash back, then open the club as a new entry over it
    const legacy = () => {
      const club = parseLegacyTeamHash(window.location.hash);
      if (!club) return false;
      window.history.replaceState(window.history.state, '', '#stats/teams');
      show({ club, tab: 'franchise' });
      return true;
    };
    const first = takePendingClub();
    if (first) show(first);
    else if (!legacy()) {
      const r = parseClubHash(window.location.hash);
      if (r) show(r);
    }
    const on = (e: Event) => {
      takePendingClub();
      show((e as CustomEvent<ClubRequest>).detail);
    };
    // Back, Forward and edited hashes: the URL decides
    const sync = () => {
      if (legacy()) return;
      const r = parseClubHash(window.location.hash);
      if (r) setState((s) => (s && s.open && s.club === r.club && (s.tab ?? 'season') === (r.tab ?? 'season') ? s : { ...r, open: true, n: (s?.n ?? 0) + 1 }));
      else setState((s) => (s && s.open ? { ...s, open: false } : s));
    };
    window.addEventListener(OPEN_CLUB_SEASON_EVENT, on);
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener(OPEN_CLUB_SEASON_EVENT, on);
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);
  const close = useCallback(() => {
    setState((s) => (s ? { ...s, open: false } : s));
    releaseClubHash();
  }, []);
  if (!state) return null;
  return (
    <Suspense fallback={state.open ? <PixelLoader variant="overlay" label="Club" what="the club page" /> : null}>
      <ClubSeasonSheet club={state.club} season={state.season} tab={state.tab ?? 'season'} section={state.section} nonce={state.n} open={state.open} onClose={close} />
    </Suspense>
  );
};

export default ClubSeasonHost;
