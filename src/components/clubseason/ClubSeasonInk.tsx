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
  const name = (k: string | null, n: string) =>
    k && onPick ? (
      <button type="button" className="cs-ink__n" onClick={() => onPick(k)}>{n}</button>
    ) : (
      <span className="cs-ink__n">{n}</span>
    );
  return (
    <section className="cs-block">
      <header className="cs-block__h"><span>Black ink and streaks</span><h3>Led the league</h3></header>
      <ul className="cs-ink">
        {led.map(({ stat, row }) => (
          <li key={`l-${stat}`} className="cs-ink__i is-ink">
            <span className="cs-ink__tag">Black ink</span>
            {name(row[0], row[1])}
            <span className="cs-ink__d">led the league in {(INK_LABEL[stat] ?? stat).replace(/^\w/, (c) => c.toLowerCase())} · <b className="num">{row[4].toLocaleString()}</b></span>
          </li>
        ))}
        {runs.map((r) => (
          <li key={`s-${r.id}-${r.key}`} className="cs-ink__i">
            <span className="cs-ink__tag">{r.alive ? 'Streak alive' : 'Streak'}</span>
            {name(r.key, r.name)}
            <span className="cs-ink__d"><b className="num">{r.len}</b> straight {r.label} seasons ({r.from}–{season})</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default ClubSeasonInk;
