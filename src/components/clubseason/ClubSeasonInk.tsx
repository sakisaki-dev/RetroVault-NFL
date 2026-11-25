import { PixelIcon } from '@/components/arcade';
import { StarSprite } from '@/components/season/NflSeasonExtras';
import { Reveal, stag } from '@/components/motion/Reveal';
import { findNFLTeam } from '@/utils/nflTeams';
import { Section } from './ClubSeasonSection';
import { INK_LABEL, leadersForClubSeason, streaksForClubSeason, useSeasonBoard, useStreaks } from '@/utils/seasonBoards';

/**
 * The club season's black ink (players on the club who led the whole league in a headline stat that season) and the
 * streaks (3+ straight seasons over a mark) running through it, from the season boards (season_boards.py). Renders
 * nothing when the season has neither; the live season never counts toward ink or streaks.
 */
export interface ClubSeasonInkProps {
  /** Club abbreviation ("NE") */
  club: string;
  season: number;
  onPick?: (key: string) => void;
}

const ClubSeasonInk = ({ club, season, onPick }: ClubSeasonInkProps) => {
  const board = useSeasonBoard(season);
  const streakFile = useStreaks();
  const led = board ? leadersForClubSeason(club, season) : [];
  const runs = streakFile ? streaksForClubSeason(club, season) : [];
  if (!led.length && !runs.length) return null;
  const clubName = findNFLTeam(club)?.name ?? club;
  const sprite = (k: string | null, n: string, size: 's' | 'm' = 's') => {
    const pos = k ? k.split(':')[0] : '';
    return <span className="cs-ink__sp" aria-hidden="true"><StarSprite name={n} pos={pos} team={clubName} size={size} kind="bust" season={season} /></span>;
  };
  const name = (k: string | null, n: string) =>
    k && onPick ? (
      <button type="button" className="cs-ink__n" onClick={() => onPick(k)}>{n}</button>
    ) : (
      <span className="cs-ink__n">{n}</span>
    );
  return (
    <Section kicker="Black ink and streaks" title="Led the league" club={clubName}>
      <Reveal as="ul" className="cs-ink">
        {led.map(({ stat, row }, i) => (
          <li key={`l-${stat}`} className="cs-ink__i is-ink mo-pop" style={stag(i, 50)}>
            {sprite(row[0], row[1])}
            <span className="cs-ink__body">
              <span className="cs-ink__tag"><PixelIcon name="star" size={10} />Black ink</span>
              {name(row[0], row[1])}
              <span className="cs-ink__d">Led the league in {(INK_LABEL[stat] ?? stat).replace(/^\w/, (c) => c.toLowerCase())}</span>
            </span>
            <b className="cs-ink__v num">{row[4].toLocaleString()}</b>
          </li>
        ))}
        {runs.map((r, i) => (
          <li key={`s-${r.id}-${r.key}`} className={`cs-ink__i is-run mo-pop${r.alive ? ' is-alive' : ''}`} style={stag(led.length + i, 50)}>
            {sprite(r.key, r.name)}
            <span className="cs-ink__body">
              <span className="cs-ink__tag"><PixelIcon name="fire" size={10} />{r.alive ? 'Streak alive' : 'Streak'}</span>
              {name(r.key, r.name)}
              <span className="cs-ink__d">{r.label} seasons, {r.from} to {season}</span>
            </span>
            <b className="cs-ink__v num">{r.len}<small>straight</small></b>
          </li>
        ))}
      </Reveal>
    </Section>
  );
};

export default ClubSeasonInk;
