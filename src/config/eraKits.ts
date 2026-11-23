import { findNFLTeam } from '@/utils/nflTeams';

/**
 * NFL edition: the seasons each club's famous era kit (components/collection/art/sprite/uniforms.ts ERAS) was worn, as
 * the real clubs wore the look (owner, 2026-11-23: players of the 1999-2010 seasons wear the kit of their time). Only
 * the clubs whose era kit really was the club's uniform in 1999-2010, plus the older ones kept for completeness
 * (a span before the first season of the data draws nothing). The Steelers', Raiders', Bears', Browns', Packers',
 * Chiefs', Colts' and Dolphins' era kits are older looks, or close to today's, so they have no span.
 *
 * scripts/nfl/era_palettes.ts writes these spans with each era kit's palette into data/nfl/era_palettes.json, which
 * scripts/nfl/silhouettes.py and era_sprites.py paint era sprites from (index.json `eraKits`, a player's `eras`).
 */
export const ERA_SPANS: Record<string, [number, number]> = {
  patriots: [2000, 2010], // 2001 Patriots: navy, red and silver, silver pants
  lions: [1990, 2002], // 1990s Lions: Honolulu blue, silver pants
  broncos: [1997, 2002], // 1998 Broncos: navy jerseys, orange shoulders
  rams: [1999, 2009], // 1999 Rams: navy and gold
  giants: [1980, 1999], // 1986 Giants
  commanders: [1982, 2001], // 1980s Washington: burgundy and gold
  '49ers': [1980, 1995], // 1980s 49ers
};

/** True when `team`'s era kit was in use in `season` (a club name, city or abbreviation as findNFLTeam reads it). */
export const eraKitSeason = (team: string | undefined, season: number | undefined): boolean => {
  if (!team || season === undefined || !Number.isFinite(season)) return false;
  const id = findNFLTeam(team)?.id;
  const span = id ? ERA_SPANS[id] : undefined;
  return !!span && season >= span[0] && season <= span[1];
};
