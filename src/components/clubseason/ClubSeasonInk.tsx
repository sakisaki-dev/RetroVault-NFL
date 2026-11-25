/**
 * Slot for the season's black ink (who led the league in a stat) and streaks, which the nfl-seasons branch builds
 * (blackInk / streaksForClubSeason). Renders nothing until that lands: wire it by importing the helpers here and
 * returning their list for (club, season). Kept as its own component so the rest of the sheet never depends on it.
 */
export interface ClubSeasonInkProps {
  /** Club abbreviation ("NE") */
  club: string;
  season: number;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ClubSeasonInk = (_props: ClubSeasonInkProps): null => null;

export default ClubSeasonInk;
