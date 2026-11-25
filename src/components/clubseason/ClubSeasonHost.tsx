import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import PixelLoader from '@/components/ui/PixelLoader';
import { OPEN_CLUB_SEASON_EVENT, takePendingClubSeason } from '@/utils/clubSeason';

// The sheet (and its CSS) loads only when a club is first opened
const ClubSeasonSheet = lazy(() => import('./ClubSeasonSheet'));

/**
 * Mount once (pages/Index.tsx). Answers openClubSeason(club, season?) from anywhere with the club season sheet; closing
 * keeps the last club mounted so the sheet plays its exit.
 */
const ClubSeasonHost = () => {
  const [state, setState] = useState<{ club: string; season?: number; open: boolean } | null>(null);
  useEffect(() => {
    const first = takePendingClubSeason();
    if (first) setState({ ...first, open: true });
    const on = (e: Event) => {
      takePendingClubSeason();
      setState({ ...(e as CustomEvent<{ club: string; season?: number }>).detail, open: true });
    };
    window.addEventListener(OPEN_CLUB_SEASON_EVENT, on);
    return () => window.removeEventListener(OPEN_CLUB_SEASON_EVENT, on);
  }, []);
  const close = useCallback(() => setState((s) => (s ? { ...s, open: false } : s)), []);
  if (!state) return null;
  return (
    <Suspense fallback={state.open ? <PixelLoader variant="overlay" label="Season" what="the club season" /> : null}>
      <ClubSeasonSheet club={state.club} season={state.season} open={state.open} onClose={close} />
    </Suspense>
  );
};

export default ClubSeasonHost;
