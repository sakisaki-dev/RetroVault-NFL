import { useMemo } from 'react';
import { useLeague } from '@/context/LeagueContext';
import { careerSkillOveralls, type Overall } from '@/config/skillGrades';
import { advancedPcts, useAdvanced } from '@/utils/nflAdvanced';

/*
 * One computation per league load and advanced-data load: the Stats page, the player card, quick search and the Deep
 * Dive all mount this hook, and each tab switch remounts them, so the map is kept at module level.
 */
let cached: { data: unknown; version: number; adv: unknown; map: Map<string, Overall> } | null = null;

/**
 * Career skill rating for every league player (`POS:Name` → Overall): per-game skills graded against the position,
 * independent of career length and awards, folded with the advanced factors where he has them and ranked among players
 * with the same data coverage (config/skillGrades.ts careerSkillOveralls). The one number the table, search, cards and
 * the Deep Dive's Career scope all show.
 */
export const useSkillRatings = (): Map<string, Overall> => {
  const { getAllPlayers, dataVersion, careerData } = useLeague();
  const adv = useAdvanced();
  return useMemo(() => {
    if (cached && cached.data === careerData && cached.version === dataVersion && cached.adv === adv) return cached.map;
    const league = getAllPlayers().filter((p) => !(p as { isRealLegend?: boolean }).isRealLegend);
    const out = careerSkillOveralls(
      league,
      (key) => advancedPcts(adv, key, 'c'),
      // a position's rows have landed once any of its players is in the file
      (pos) => !!adv && Object.keys(adv.p).some((k) => k.startsWith(`${pos}:`)),
    );
    if (careerData) cached = { data: careerData, version: dataVersion, adv, map: out };
    return out;
    // dataVersion bumps when the league reloads or a player is edited
  }, [getAllPlayers, dataVersion, careerData, adv]);
};
