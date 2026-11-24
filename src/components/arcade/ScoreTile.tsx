import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '../brand/TeamLogo';
import { clubPlate, clubVars } from './clubInk';
import './arcade.css';

/**
 * ScoreTile: a compact game tile for the Scores browser, a club's schedule, search rows and "More from week".
 * Two club rows (logo, abbreviation, score; the winner lit, the loser dim), a footer, and a prime-time tag. Props:
 * away and home ({club, score?, record?}), status? 'final' | 'ot' | 'live' | 'scheduled' (default: final when both
 * scores exist), kickoff? (footer text for a scheduled game, e.g. "SUN 1:00"), footer? (overrides the footer text),
 * slot? ('TNF' | 'SNF' | 'MNF' or any short tag), focus? (a club name: its row gets a club-colour edge, for a club's own
 * schedule), selected?, onClick? (then it is a button that opens the game), className?.
 */
export interface ScoreSide {
  club: string;
  score?: number | null;
  record?: string;
}
export const ScoreTile = ({
  away,
  home,
  status,
  kickoff,
  footer,
  slot,
  focus,
  selected,
  onClick,
  className,
}: {
  away: ScoreSide;
  home: ScoreSide;
  status?: 'final' | 'ot' | 'live' | 'scheduled';
  kickoff?: string;
  footer?: string;
  slot?: string;
  focus?: string | null;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) => {
  const played = away.score != null && home.score != null;
  const st = status ?? (played ? 'final' : 'scheduled');
  const win = played && away.score !== home.score ? (away.score! > home.score! ? 'away' : 'home') : null;
  const foot = footer ?? (st === 'final' ? 'FINAL' : st === 'ot' ? 'FINAL/OT' : st === 'live' ? 'LIVE' : (kickoff ?? 'KICKOFF'));
  const row = (s: ScoreSide, side: 'away' | 'home') => {
    const p = clubPlate(s.club);
    const isFocus = !!focus && clubPlate(focus).team?.id === p.team?.id && !!p.team;
    return (
      <div className={cn('ax-tile__row', win === side && 'is-win', win && win !== side && 'is-lose', isFocus && 'is-focus')} style={clubVars(s.club) as CSSProperties}>
        <TeamLogo team={p.team} size={22} decorative backed />
        <b className="ax-tile__abbr">{p.team?.abbreviation ?? s.club}</b>
        {s.record && <span className="ax-tile__rec">{s.record}</span>}
        <span className="ax-tile__score">{s.score ?? '–'}</span>
      </div>
    );
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      aria-label={`${away.club} at ${home.club}${played ? `, ${away.score} to ${home.score}` : ''}`}
      className={cn('ax-tile', onClick && 'ax-tile--btn', selected && 'is-selected', className)}
    >
      {slot && <span className="ax-tile__slot">{slot}</span>}
      {row(away, 'away')}
      {row(home, 'home')}
      <span className={cn('ax-tile__foot', st === 'live' && 'is-live')}>{foot}</span>
    </Tag>
  );
};
export default ScoreTile;
