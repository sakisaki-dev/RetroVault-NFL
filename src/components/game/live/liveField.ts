import { findNFLTeam } from '@/utils/nflTeams';
import { liftForDarkBg } from '@/utils/teamColors';
import type { FieldSpot, LiveGame } from '@/utils/liveGames';

/**
 * The live field's geometry. Everything is in yards from the AWAY club's goal line (0) to the home club's (100); the end
 * zones sit outside that (-10 and 110). The away club's end zone is on the left, so a club "heads right" when it is the
 * away club on offence.
 */
const norm = (a: string) => findNFLTeam(a)?.abbreviation ?? a;
export const sameClub = (a?: string | null, b?: string | null) => !!a && !!b && norm(a) === norm(b);

/** CSS left for an absolute yard (0-100 plays between the end zones, each a twelfth of the field) */
export const fx = (yd: number) => `calc(100% / 12 + (100% - 100% / 6) * ${(yd / 100).toFixed(4)})`;

/** A spot as an absolute yard, or null when it can't be placed */
export const absOf = (s: FieldSpot | null | undefined, away: string, home: string): number | null => {
  if (!s) return null;
  if (!s.side) return s.yd;
  if (sameClub(s.side, away)) return s.yd;
  if (sameClub(s.side, home)) return 100 - s.yd;
  return null;
};

export interface Situation {
  /** +1 the offence heads toward the home end zone (right), -1 toward the away end zone (left) */
  dir: 1 | -1;
  /** the offence's club */
  poss: string;
  /** the ball, the first-down line (null when it can't be known) */
  ball: number;
  first: number | null;
}

/** Where the ball is and which way the offence heads; null while nobody has it (a kickoff, the break) */
export const situationOf = (g: LiveGame): Situation | null => {
  const s = g.sit;
  if (!s?.poss) return null;
  const dir: 1 | -1 = sameClub(s.poss, g.away.abbr) ? 1 : -1;
  const spot = absOf(s.spot, g.away.abbr, g.home.abbr);
  const ball = s.toGoal != null ? (dir === 1 ? 100 - s.toGoal : s.toGoal) : spot;
  if (ball == null) return null;
  const first = s.down > 0 && s.dist > 0 ? Math.max(0, Math.min(100, ball + dir * s.dist)) : null;
  return { dir, poss: s.poss, ball, first };
};

/** "PIT 18", "50": the ball's spot as the broadcast says it */
export const spotLabel = (g: LiveGame): string => {
  const sp = g.sit?.spot;
  if (!sp) return '';
  return sp.yd === 50 ? '50' : `${sp.side} ${sp.yd}`;
};

export interface Man {
  /** the club kit he wears: 'o' offence, 'd' defence */
  side: 'o' | 'd';
  pos: 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB';
  /** yards from the line (behind it for the offence, in front for the defence) and the field's width, 0 top to 1 bottom */
  depth: number;
  y: number;
}

/** Eleven a side: a pro set against a 4-3, lined up on the ball (decorative: no play is known, so none is drawn) */
export const FORMATION: Man[] = [
  { side: 'o', pos: 'OL', depth: 1.2, y: 0.38 }, { side: 'o', pos: 'OL', depth: 1.2, y: 0.45 }, { side: 'o', pos: 'OL', depth: 1.2, y: 0.52 },
  { side: 'o', pos: 'OL', depth: 1.2, y: 0.59 }, { side: 'o', pos: 'OL', depth: 1.2, y: 0.66 },
  { side: 'o', pos: 'TE', depth: 1.2, y: 0.74 }, { side: 'o', pos: 'WR', depth: 1.2, y: 0.1 }, { side: 'o', pos: 'WR', depth: 1.2, y: 0.9 },
  { side: 'o', pos: 'WR', depth: 2.4, y: 0.24 }, { side: 'o', pos: 'QB', depth: 4.6, y: 0.52 }, { side: 'o', pos: 'RB', depth: 7.4, y: 0.52 },
  { side: 'd', pos: 'DL', depth: 1.6, y: 0.4 }, { side: 'd', pos: 'DL', depth: 1.6, y: 0.48 }, { side: 'd', pos: 'DL', depth: 1.6, y: 0.56 },
  { side: 'd', pos: 'DL', depth: 1.6, y: 0.64 }, { side: 'd', pos: 'LB', depth: 4.4, y: 0.34 }, { side: 'd', pos: 'LB', depth: 4.4, y: 0.52 },
  { side: 'd', pos: 'LB', depth: 4.4, y: 0.7 }, { side: 'd', pos: 'DB', depth: 3.4, y: 0.1 }, { side: 'd', pos: 'DB', depth: 3.4, y: 0.9 },
  { side: 'd', pos: 'DB', depth: 11, y: 0.3 }, { side: 'd', pos: 'DB', depth: 11, y: 0.72 },
];

/** A man's absolute yard for a situation, kept inside the end zones */
export const manX = (m: Man, s: Situation): number => {
  const x = m.side === 'o' ? s.ball - s.dir * m.depth : s.ball + s.dir * m.depth;
  return Math.max(-8, Math.min(108, x));
};

/** A club's colour as a lamp and a tint: its primary, or its secondary when the primary is near-black; lifted for the dark page, never neon */
export const lampOf = (abbr: string): string => {
  const t = findNFLTeam(abbr);
  if (!t) return 'hsl(0 0% 70%)';
  return liftForDarkBg(parseFloat(t.primaryColor.split(/\s+/)[2]) < 20 ? t.secondaryColor : t.primaryColor, 58);
};

/** a field fraction (0 top .. 1 bottom) as the share of the field's height a man stands at: the sidelines keep a margin so heads aren't clipped */
export const fy = (y: number) => 0.2 + y * 0.72;
