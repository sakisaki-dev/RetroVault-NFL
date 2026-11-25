import { findNFLTeam } from '@/utils/nflTeams';

/**
 * The one way into a club's page (NFL edition): the club season sheet (components/clubseason), with its two tabs:
 * "This season" (the programme) and "Franchise" (the all-time history). Kept free of imports from the sheet so callers
 * can stay in the entry bundle; ClubSeasonHost answers the event and loads the sheet on demand.
 *
 * Route (mirrored into the hash while the sheet is open): #season/club?c=<Club>&tab=season|franchise&y=<season>
 */
export type ClubTab = 'season' | 'franchise';

export interface OpenClubOpts {
  /** Which tab: "season" (default) or "franchise" (history: rafters, leaders, Super Bowls) */
  tab?: ClubTab;
  /** A season for the This season tab (default: the latest) */
  season?: number;
  /** Scroll to a part of the Franchise tab once it shows */
  section?: 'rafters';
}

export interface ClubRequest extends OpenClubOpts {
  club: string;
}

export const OPEN_CLUB_SEASON_EVENT = 'rv:open-club-season';
let pending: ClubRequest | null = null;

/** Opens a club's page from anywhere. `name` may be the nickname ("Vikings") or the full name. */
export const openClub = (name: string, opts: OpenClubOpts = {}) => {
  const club = findNFLTeam(name)?.name ?? name;
  pending = { club, ...opts };
  window.dispatchEvent(new CustomEvent(OPEN_CLUB_SEASON_EVENT, { detail: pending }));
};
/** A request made before the host mounted (read once) */
export const takePendingClub = () => {
  const p = pending;
  pending = null;
  return p;
};

/* ---- the route ---- */

export const parseClubHash = (hash: string): ClubRequest | null => {
  const m = hash.match(/^#season\/club\?(.*)$/);
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const c = q.get('c');
  if (!c) return null;
  const y = Number(q.get('y'));
  return { club: c, tab: q.get('tab') === 'franchise' ? 'franchise' : 'season', ...(y > 1900 ? { season: y } : {}) };
};
export const clubHash = (club: string, tab: ClubTab, season?: number) =>
  `#season/club?c=${encodeURIComponent(club)}&tab=${tab}${tab === 'season' && season ? `&y=${season}` : ''}`;
/** The old Stats > Teams sheet route, which now lands on the Franchise tab */
export const parseLegacyTeamHash = (hash: string): string | null => {
  const m = hash.match(/^#stats\/teams\?p=([^&]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
};
