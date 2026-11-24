import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '../brand/TeamLogo';
import { clubPlate, clubVars } from './clubInk';
import './arcade.css';

/**
 * ClubBadge: the club logo plus its abbreviation on a flat club-colour plate (primary fill, secondary hard border; a
 * near-black primary swaps to the secondary). Props: club (name, nickname or abbreviation), size? 'sm' | 'md' | 'lg',
 * abbr? (show the abbreviation, default true), className?. Unknown clubs get the neutral plate.
 *
 * ClubStrip: a club-colour banner strip carrying a name (a team, a player, a link), with the logo on the left. Props:
 * club, children (the text, default the club's name), onClick? (then it is a button, never underlined text), logo?
 * (default true), size? 'sm' | 'md', className?. Hold the same colours as ClubBadge, so a name and its badge match.
 */
export const ClubBadge = ({ club, size = 'md', abbr = true, className }: { club?: string | null; size?: 'sm' | 'md' | 'lg'; abbr?: boolean; className?: string }) => {
  const p = clubPlate(club);
  const px = size === 'sm' ? 18 : size === 'lg' ? 34 : 24;
  return (
    <span className={cn('ax-badge', `ax-badge--${size}`, className)} style={clubVars(club) as CSSProperties}>
      {p.team && <TeamLogo team={p.team} size={px} decorative backed />}
      {abbr && <b>{p.team?.abbreviation ?? club ?? '—'}</b>}
    </span>
  );
};

export const ClubStrip = ({ club, children, onClick, logo = true, size = 'md', className, ...rest }: { club?: string | null; children?: ReactNode; onClick?: () => void; logo?: boolean; size?: 'sm' | 'md'; className?: string; [k: string]: unknown }) => {
  const p = clubPlate(club);
  const body = (
    <>
      {logo && p.team && <TeamLogo team={p.team} size={size === 'sm' ? 16 : 20} decorative backed />}
      <span className="ax-strip__txt">{children ?? p.team?.fullName ?? club}</span>
    </>
  );
  const cls = cn('ax-strip', `ax-strip--${size}`, onClick && 'ax-strip--btn', className);
  return onClick ? (
    <button type="button" {...rest} className={cls} style={clubVars(club)} onClick={onClick}>
      {body}
    </button>
  ) : (
    <span {...rest} className={cls} style={clubVars(club)}>
      {body}
    </span>
  );
};
export default ClubBadge;
