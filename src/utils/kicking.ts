/**
 * Kickers (NFL edition, owner 2026-11-25): shared constants and maths for a kicker's game rows (the K_LOG columns of
 * scripts/nfl/build_players.py: fg_made_<band>, fg_missed_<band>, pat_made, pat_att, fg_long) and his career fields.
 * Standard kicker fantasy scoring: a field goal 3 / 4 / 5 points (0-39, 40-49, 50+), an extra point 1, a miss -1.
 */
export const K_BANDS = ['0_19', '20_29', '30_39', '40_49', '50_59', '60_'] as const;
export const K_SCORING = { fg39: 3, fg49: 4, fg50: 5, xp: 1, miss: -1 } as const;

type Row = Record<string, unknown>;
const num = (r: Row, k: string) => {
  const v = r[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/** Field goals made on a game row, by scoring band (0-39, 40-49, 50+), and the misses. */
export const rowFg = (r: Row) => {
  const made = (bs: readonly string[]) => bs.reduce((s, b) => s + num(r, `fg_made_${b}`), 0);
  const missed = K_BANDS.reduce((s, b) => s + num(r, `fg_missed_${b}`), 0);
  return { m39: made(['0_19', '20_29', '30_39']), m49: made(['40_49']), m50: made(['50_59', '60_']), missed };
};

/** Fantasy points of one kicker game row (nflverse scores none for kickers). */
export const kickPoints = (r: Row): number => {
  const f = rowFg(r);
  const xpMiss = Math.max(0, num(r, 'pat_att') - num(r, 'pat_made'));
  return (
    K_SCORING.fg39 * f.m39 + K_SCORING.fg49 * f.m49 + K_SCORING.fg50 * f.m50 + K_SCORING.xp * num(r, 'pat_made') + K_SCORING.miss * (f.missed + xpMiss)
  );
};

/** Percent made, or null with no attempts (never a zero). */
export const pct = (made: number | undefined, att: number | undefined): number | null =>
  typeof made === 'number' && typeof att === 'number' && att > 0 ? (made / att) * 100 : null;

/** The three distance bands of a kicker's career fields (0-39, 40-49, 50+). */
export const kickBands = (p: { fgMade39?: number; fgAtt39?: number; fgMade49?: number; fgAtt49?: number; fgMade50?: number; fgAtt50?: number }) => [
  { label: '0-39', made: p.fgMade39, att: p.fgAtt39 },
  { label: '40-49', made: p.fgMade49, att: p.fgAtt49 },
  { label: '50+', made: p.fgMade50, att: p.fgAtt50 },
];
