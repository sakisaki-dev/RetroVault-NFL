import { findNFLTeam, type NFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn } from '@/utils/teamColors';

/**
 * Flat club colours for the arcade kit. `fill` is the club's primary, `edge` its secondary, `ink` readable text on fill.
 * A near-black primary (Bengals, Panthers, Browns) would vanish on the night page, so the secondary leads and the
 * primary becomes the hard border. A club that can't be resolved gets the neutral gold-on-navy plate.
 */
export interface ClubPlate {
  team: NFLTeam | null;
  fill: string;
  edge: string;
  ink: string;
}
const lightness = (hsl: string) => Number(hsl.match(/(\d+(?:\.\d+)?)%\s*$/)?.[1] ?? 50);
const NEAR_BLACK_L = 12;

export const clubPlate = (club?: string | NFLTeam | null): ClubPlate => {
  const team = !club ? null : typeof club === 'string' ? findNFLTeam(club) : club;
  if (!team) return { team: null, fill: 'hsl(228 40% 16%)', edge: 'hsl(43 100% 62%)', ink: 'hsl(0 0% 100%)' };
  const dark = lightness(team.primaryColor) <= NEAR_BLACK_L;
  const fillT = dark ? team.secondaryColor : team.primaryColor;
  const edgeT = dark ? team.primaryColor : team.secondaryColor;
  return { team, fill: `hsl(${fillT})`, edge: `hsl(${edgeT})`, ink: getReadableTextOn(fillT) };
};

/** CSS variables a club plate sets (--ax-c1 fill, --ax-c2 edge, --ax-ink text) */
export const clubVars = (club?: string | NFLTeam | null) => {
  const p = clubPlate(club);
  return { '--ax-c1': p.fill, '--ax-c2': p.edge, '--ax-ink': p.ink } as React.CSSProperties;
};
