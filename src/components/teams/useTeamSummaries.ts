import { useCallback, useMemo } from 'react';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import { overallRating } from '../brand/ProPlayerBanner.utils';
import { useLeagueContent } from '@/utils/leagueContent';
import { coachedByTeam } from '@/utils/frontOffice';
import { useOfficialOvr } from '@/utils/useOfficialOvr';
import { usePlayerExtras } from '@/utils/playerExtras';
import { buildFranchiseRecords, buildTeamSummaries } from './teamStats';

/** The last build, kept so the Teams page and the club sheet's Franchise tab (open together) share one pass */
let last: { league: Player[]; stints: unknown; sbs: unknown; out: ReturnType<typeof buildTeamSummaries> } | null = null;
const summariesOf = (league: Player[], stints: Parameters<typeof buildTeamSummaries>[1], sbs: Parameters<typeof buildTeamSummaries>[2]) => {
  if (last && last.league === league && last.stints === stints && last.sbs === sbs) return last.out;
  const out = buildTeamSummaries(league, stints, sbs);
  last = { league, stints, sbs, out };
  return out;
};

/**
 * Every franchise's all-time summary and record, plus what the franchise views need around them (the league's players,
 * the OVR shown, the seasons the coach had each club). Shared by Stats › Teams and the club sheet's Franchise tab.
 */
export const useTeamSummaries = () => {
  const { careerData, getAllPlayers, dataVersion } = useLeague();
  const { content } = useLeagueContent();
  const extras = usePlayerExtras();
  const officialOvr = useOfficialOvr();
  const coached = useMemo(() => coachedByTeam(content), [content]);
  const superBowls = useMemo(() => content?.superBowls ?? [], [content]);
  const league = useMemo(
    () => getAllPlayers().filter((p) => !p.isRealLegend),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [careerData, getAllPlayers, dataVersion],
  );
  const { teams, unassigned } = useMemo(() => summariesOf(league, extras.stints, superBowls), [league, extras.stints, superBowls]);
  const ovrFor = useCallback((p: Player) => overallRating(p, officialOvr), [officialOvr]);
  const records = useMemo(() => buildFranchiseRecords(teams, superBowls, ovrFor), [teams, superBowls, ovrFor]);
  return { careerData, league, teams, unassigned, records, coached, superBowls, ovrFor };
};
