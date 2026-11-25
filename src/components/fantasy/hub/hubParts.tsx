import type { CSSProperties, ReactNode } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import { peekKeyProps } from '@/components/peek/peekProps';
import { useOpenCard } from './cardContext';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { findNFLTeam } from '@/utils/nflTeams';
import { clubPlate } from '@/components/arcade/clubInk';
import { bannerTeamOf } from '@/utils/playerExtras';
import { useGameSprites } from '@/utils/gameSprites';
import { NextLogos, teamOf } from '../parts';
import type { Slot } from '@/utils/fantasy';

/** Anything that shows a player: a tap opens his player card, a hold the quick look. */
export const PlayerHit = ({ pkey, className, children, label }: { pkey: string; className?: string; children: ReactNode; label?: string }) => {
  const open = useOpenCard();
  if (!pkey || pkey.startsWith('DST:')) return <span className={className}>{children}</span>;
  return (
    <button type="button" className={cn('fh-hit', className)} {...peekKeyProps(pkey)} onClick={() => open(pkey)} aria-label={label ?? `Open ${pkey.slice(pkey.indexOf(':') + 1)}'s card`}>
      {children}
    </button>
  );
};

/** Flat club-colour variables: --hc (fill), --hc2 (edge), --hink (text on fill). */
export const hcVars = (club?: string | null): CSSProperties => {
  const p = clubPlate(club ?? null);
  return { '--hc': p.fill, '--hc2': p.edge, '--hink': p.ink, '--tc': p.fill } as CSSProperties;
};

/** His game sprite in his club's kit (a bust or the whole figure); the club logo where the build has no sprites. */
export const Sprite = ({ player, club, kind = 'bust', size = 's' }: { player?: Player; club?: string; kind?: 'bust' | 'figure'; size?: 's' | 'm' | 'l' }) => {
  const sprites = useGameSprites();
  const kit = club ?? (player ? bannerTeamOf(player) : undefined);
  if (sprites && player && !player.isRealLegend) return <GameSprite player={player} team={kit} kind={kind} size={size} />;
  return <TeamLogo team={teamOf(kit ?? '') ?? kit} size={size === 's' ? 34 : size === 'm' ? 56 : 80} decorative backed />;
};

/** The name as a tappable flat strip: club colour, logo, name. Tap: his player card. Hold: the quick look. */
export const NameStrip = ({ pkey, name, club, extra, className }: { pkey: string; name: string; club?: string; extra?: ReactNode; className?: string }) => {
  const t = club ? teamOf(club) ?? findNFLTeam(club) : null;
  const open = useOpenCard();
  return (
    <button type="button" className={cn('fh-name', className)} style={hcVars(club)} {...peekKeyProps(pkey)} onClick={() => open(pkey)}>
      {t && <TeamLogo team={t} size={16} decorative backed />}
      <b>{name}</b>
      {extra}
    </button>
  );
};

/** The next opponent as a logo chip ringed by matchup difficulty (green soft, red tough). */
export const OppChip = ({ slots, size = 24, label = true }: { slots?: Slot[]; size?: number; label?: boolean }) =>
  slots && slots.length ? <NextLogos slots={slots.slice(0, 1)} size={size} label={label} /> : null;

/** Floor, projection and ceiling on one bar. */
export const RangeBar = ({ lo, mid, hi, max }: { lo: number | null; mid: number; hi: number | null; max: number }) => {
  const m = Math.max(1, max);
  const l = Math.max(0, ((lo ?? mid) / m) * 100);
  const h = Math.min(100, ((hi ?? mid) / m) * 100);
  return (
    <span className="fh-range" role="img" aria-label={`Floor ${lo?.toFixed(1) ?? '—'}, projection ${mid.toFixed(1)}, ceiling ${hi?.toFixed(1) ?? '—'}`}>
      <i className="fh-range__band" style={{ left: `${l}%`, width: `${Math.max(2, h - l)}%` }} />
      <i className="fh-range__mid" style={{ left: `${Math.min(99, (mid / m) * 100)}%` }} />
    </span>
  );
};

export const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'DST'] as const;
