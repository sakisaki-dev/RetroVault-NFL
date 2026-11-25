import { Fragment, type ReactNode } from 'react';
import { PixelIcon } from '@/components/arcade';
import { Reveal } from '@/components/motion/Reveal';
import { INK_LABEL, leadersForClubSeason, streaksForClubSeason, useSeasonBoard, useStreaks } from '@/utils/seasonBoards';

/**
 * The club season's black ink (players on the club who led the whole league in a headline stat that season) and the
 * streaks (3+ straight seasons over a mark) running through it, from the season boards (season_boards.py), set as the
 * programme's pull quote. Renders nothing when the season has neither; the live season never counts.
 */
export interface ClubSeasonInkProps {
  /** Club abbreviation ("NE") */
  club: string;
  season: number;
  onPick?: (key: string) => void;
}

const nf = (n: number) => n.toLocaleString('en-US');
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const ClubSeasonInk = ({ club, season, onPick }: ClubSeasonInkProps) => {
  const board = useSeasonBoard(season);
  const streakFile = useStreaks();
  const led = board ? leadersForClubSeason(club, season) : [];
  const runs = streakFile ? streaksForClubSeason(club, season) : [];
  if (!led.length && !runs.length) return null;
  const name = (k: string | null, n: string) =>
    k && onPick ? (
      <button type="button" className="pg-name" data-peek-ok data-player-key={k} onClick={() => onPick(k)}>{n}</button>
    ) : (
      <span className="pg-name">{n}</span>
    );
  const lines: ReactNode[] = [
    ...led.slice(0, 3).map(({ stat, row }) => (
      <Fragment key={`l-${stat}`}>
        {name(row[0], row[1])} led the league in {(INK_LABEL[stat] ?? stat).replace(/^\w/, (c) => c.toLowerCase())}: <b className="num">{nf(row[4])}</b>.
      </Fragment>
    )),
    ...runs.slice(0, 3).map((r) => (
      <Fragment key={`s-${r.id}-${r.key}`}>
        {name(r.key, r.name)}{r.alive ? <>&rsquo;s streak is alive:</> : ':'} <b>{WORDS[r.len] ?? r.len} straight</b> {r.label.replace(/^\w/, (c) => c.toLowerCase())} seasons, {r.from} to {season}.
      </Fragment>
    )),
  ];
  return (
    <Reveal as="section" className="pg-sec" aria-label="Black ink and streaks">
      <blockquote className="pg-pull mo-rise">
        <span className="pg-kick"><PixelIcon name="star" size={10} />{led.length ? 'Black ink' : 'Streaks'}{led.length && runs.length ? ' and streaks' : ''}</span>
        {lines.map((l, i) => <p key={i}>{l}</p>)}
      </blockquote>
    </Reveal>
  );
};

export default ClubSeasonInk;
