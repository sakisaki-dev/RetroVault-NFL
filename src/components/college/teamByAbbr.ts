import { NFL_TEAMS, type NFLTeam } from '@/utils/nflTeams';

const BY_ABBR = new Map<string, NFLTeam>(NFL_TEAMS.map((t) => [t.abbreviation, t]));
/** A club by the abbreviation the NFL data files use (playoff_odds.json, depth_charts.json: "MIN", "LAR", "WAS") */
export const getNFLTeamByAbbr = (abbr: string): NFLTeam | null => BY_ABBR.get(abbr) ?? null;
