import type { CSSProperties } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { clubPlate } from '@/components/arcade/clubInk';
import { findNFLTeam } from '@/utils/nflTeams';
import { teamOf } from '@/components/fantasy/parts';
import './fxLogos.css';

/** The club's flat colour as --tc (primary, or the secondary where the primary is near-black), for an `fx-flat` card. */
export const fxTone = (club?: string | null): CSSProperties => ({ '--tc': clubPlate(club ?? null).fill }) as CSSProperties;

/** The big cropped club logo behind a toned card (the Record Book plaques' watermark); pair with `fx-flat`. */
export const ClubMark = ({ club, size = 130 }: { club?: string | null; size?: number }) => {
  const t = club ? teamOf(club) ?? findNFLTeam(club) : null;
  if (!t) return null;
  return (
    <span className="fx-wm" aria-hidden="true">
      <TeamLogo team={t} size={size} decorative />
    </span>
  );
};

/** Several clubs at once (a side with players from different clubs): their logos in a row, overlapping. */
export const ClubChips = ({ clubs, size = 34 }: { clubs: string[]; size?: number }) => {
  const ts = clubs.map((c) => teamOf(c) ?? findNFLTeam(c)).filter(Boolean).slice(0, 4);
  if (!ts.length) return null;
  return (
    <span className="fx-chips" aria-hidden="true">
      {ts.map((t, i) => <TeamLogo key={i} team={t!} size={size} decorative />)}
    </span>
  );
};
