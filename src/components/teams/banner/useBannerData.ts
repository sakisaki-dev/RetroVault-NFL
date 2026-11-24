import { useCallback, useMemo } from 'react';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import type { NFLTeam } from '@/utils/nflTeams';
import { useLeagueContent } from '@/utils/leagueContent';
import { useOfficialOvr } from '@/utils/useOfficialOvr';
import { bannerTeamOf, usePlayerExtras } from '@/utils/playerExtras';
import { isHallOfFamer } from '@/config/stats';
import { overallRating } from '@/components/brand/ProPlayerBanner.utils';
import { buildFranchiseRecords, buildTeamSummaries, type FranchiseRecord, type TeamSummary } from '../teamStats';

/** One franchise as the banners draw it: club, record, rank by all-time power and its greatest players. */
export interface BannerClub {
  s: TeamSummary;
  rec: FranchiseRecord;
  team: NFLTeam;
  /** 1-based all-time power rank */
  rank: number;
  titles: number;
  /** Greatest players by Career Legacy among everyone with a stint here */
  top: Player[];
  star: Player | null;
}

export interface BannerData {
  /** All 32 franchises, all-time power No. 1 first */
  clubs: BannerClub[];
  /** The clubs with a Super Bowl title, most titles first */
  champions: BannerClub[];
  totals: { franchises: number; superBowls: number; champions: number; hof: number; since: number };
}

/**
 * The all-time franchise numbers the Teams hero draws (the same ones the franchise wall uses: teamStats.ts
 * buildTeamSummaries / buildFranchiseRecords, greatest player = first of franchisePlayers).
 */
export const useBannerData = (): BannerData | null => {
  const { careerData, getAllPlayers, dataVersion } = useLeague();
  const { content } = useLeagueContent();
  const extras = usePlayerExtras();
  const officialOvr = useOfficialOvr();
  const superBowls = useMemo(() => content?.superBowls ?? [], [content]);
  const league = useMemo(
    () => getAllPlayers().filter((p) => !p.isRealLegend),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [careerData, getAllPlayers, dataVersion],
  );
  const { teams } = useMemo(() => buildTeamSummaries(league, extras.stints, superBowls), [league, extras.stints, superBowls]);
  const ovrFor = useCallback((p: Player) => overallRating(p, officialOvr), [officialOvr]);
  const records = useMemo(() => buildFranchiseRecords(teams, superBowls, ovrFor), [teams, superBowls, ovrFor]);
  return useMemo(() => {
    if (!teams.length || !superBowls.length) return null;
    const clubs = teams
      .filter((s) => s.team)
      .map<BannerClub>((s) => {
        const rec = records.get(s.key)!;
        return { s, rec, team: s.team!, rank: rec.powerRank, titles: rec.titles, top: s.franchisePlayers.slice(0, 5), star: s.franchisePlayers[0] ?? null };
      })
      .sort((a, b) => a.rank - b.rank);
    // One face per player: a club's greatest is skipped when he is better known for another club that has him on its roster
    const used = new Set<string>();
    const keyOf = (p: Player) => `${p.position}:${p.name}`;
    const lastYear = Math.max(0, ...Object.values(extras.stints).flatMap((v) => v.stints.map((x) => x.to)));
    /** The club he is best known for: the card's signature club, else (retired) where he spent the most seasons, rings breaking ties, else his banner club */
    const homeOf = (p: Player): string => {
      const sig = extras.signatureTeams[p.name];
      if (sig) return sig;
      const st = extras.stints[p.name]?.stints ?? [];
      if (!st.length || Math.max(...st.map((x) => x.to)) >= lastYear) return bannerTeamOf(p);
      return [...st].sort((a, b) => b.to - b.from + b.rings.length * 0.5 - (a.to - a.from + a.rings.length * 0.5))[0].team;
    };
    clubs.forEach((c) => {
      const ok = (p: Player) => {
        if (used.has(keyOf(p))) return false;
        const home = homeOf(p);
        const isClub = (x: BannerClub) => home === x.team.name || home.endsWith(` ${x.team.name}`);
        if (!home || isClub(c)) return true;
        const homeClub = clubs.find(isClub);
        return !homeClub || !homeClub.s.franchisePlayers.includes(p);
      };
      const pick = c.s.franchisePlayers.filter(ok).slice(0, 5);
      c.top = pick;
      c.star = pick[0] ?? null;
      if (c.star) used.add(keyOf(c.star));
    });
    const champions = clubs.filter((c) => c.titles > 0).sort((a, b) => b.titles - a.titles || a.rank - b.rank);
    const since = superBowls.length ? Math.min(...superBowls.map((sb) => sb.year)) : 1999;
    return {
      clubs,
      champions,
      totals: { franchises: clubs.length, superBowls: superBowls.length, champions: new Set(superBowls.map((sb) => sb.winner).filter(Boolean)).size, hof: league.filter(isHallOfFamer).length, since },
    };
  }, [teams, records, superBowls, league, extras]);
};
