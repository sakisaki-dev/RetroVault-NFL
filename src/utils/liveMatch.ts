import { findNFLTeam } from '@/utils/nflTeams';
import type { LiveGame } from '@/utils/liveGames';

/**
 * Pairing ESPN's live games with the site's own: the site keys a game by season, week and the two clubs (nflverse id
 * `2026_12_DEN_PIT`, odds `picks.games`), ESPN keys it by its own event id, so a live game is found by the two clubs'
 * abbreviations (both normalised, WSH/WAS, LA/LAR) and a kickoff within 36 hours of the site's date. A club pair does
 * not meet twice in a week, so that is unique.
 */
const ET = 'America/New_York';

/** an Eastern wall-clock date ("2026-11-29") and time ("13:00") as the instant it is */
export const etInstant = (date: string, time = '13:00'): number => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi || 0);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ET, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess));
  const p = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const asEt = Date.UTC(p('year'), p('month') - 1, p('day'), p('hour'), p('minute'));
  return guess - (asEt - guess);
};

const norm = (a: string) => findNFLTeam(a)?.abbreviation ?? a;

/** The ESPN game for a site game (clubs as the site names them, kickoff as an instant), or undefined */
export const matchLive = (games: LiveGame[], away: string, home: string, kick: number): LiveGame | undefined =>
  games.find((x) => norm(x.home.abbr) === norm(home) && norm(x.away.abbr) === norm(away) && Math.abs(x.kick - kick) < 36 * 3600_000);
