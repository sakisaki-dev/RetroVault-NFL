import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import GameSprite, { type SpriteSize } from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { useGameSprites, type SpriteAction } from '@/utils/gameSprites';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import { seasonLabel } from '@/config/edition';
import { clubPlate } from '@/components/arcade/clubInk';
import type { BannerClub, BannerData } from './useBannerData';
import './banner.css';

/** CSS variables for the game's stadium art (crowd, stand front, turf) painted to a club; unset in the public build. */
export const useStadiumVars = (club: string, time: 'day' | 'night' = 'night'): CSSProperties => {
  const art = useFieldArt(club, time);
  return useMemo(
    () =>
      ({
        ...(art.crowd ? { '--bn-crowd': `url(${art.crowd})` } : {}),
        ...(art.turf ? { '--bn-turf': `url(${art.turf})` } : {}),
        ...(art.stands ? { '--bn-stands': `url(${art.stands})` } : {}),
      }) as CSSProperties,
    [art.crowd, art.turf, art.stands],
  );
};

/** A club's greatest player in its kit, or its logo where the private sprites aren't in the build. */
export const Figure = ({ club, action = 'idle', size = 's', kind = 'figure', flip }: { club: BannerClub; action?: SpriteAction; size?: SpriteSize; kind?: 'figure' | 'bust'; flip?: boolean }) => {
  const sprites = useGameSprites();
  if (!sprites || !club.star) return <TeamLogo team={club.team} size={size === 's' ? 44 : size === 'm' ? 72 : 96} decorative />;
  return <GameSprite player={club.star} team={club.team.name} kind={kind} size={size} action={action} flip={flip} />;
};

export const stars = (n: number) => (n <= 0 ? '' : n <= 3 ? '★'.repeat(n) : `★${n}`);

/** The page's three counts, as quiet chips. */
export const Counts = ({ data, className }: { data: BannerData; className?: string }) => (
  <dl className={cn('bn-counts', className)}>
    {(
      [
        ['Franchises', data.totals.franchises],
        ['Super Bowls', data.totals.superBowls],
        ['Champions', data.totals.champions],
      ] as const
    ).map(([k, v]) => (
      <div key={k} className="bn-count">
        <dd>{v}</dd>
        <dt>{k}</dt>
      </div>
    ))}
  </dl>
);

/** Gold TEAMS lettering with its kicker. */
export const Wordmark = ({ data, children, className }: { data: BannerData; children?: ReactNode; className?: string }) => (
  <div className={cn('bn-word', className)}>
    <span className="bn-kicker">League Hub · all time since {seasonLabel(data.totals.since)}</span>
    <h2 className="bn-title">Teams</h2>
    {children}
  </div>
);

/** Confetti in club colours: single elements with their own place, size, fall time and drift (CSS only). */
export const Confetti = ({ colors, n = 40, className }: { colors: string[]; n?: number; className?: string }) => {
  const bits = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const r = (k: number) => ((i * 9301 + k * 49297) % 233280) / 233280;
        return { left: r(1) * 100, delay: -r(2) * 7, dur: 5 + r(3) * 4, w: 3 + Math.round(r(4) * 3), drift: (r(5) - 0.5) * 60, c: colors[i % colors.length] };
      }),
    [n, colors],
  );
  return (
    <div className={cn('bn-confetti', className)} aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, width: b.w, height: b.w * 1.6, background: b.c, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, ['--dx' as string]: `${b.drift}px` }} />
      ))}
    </div>
  );
};

/** Camera flashes popping at fixed places, staggered (CSS only; none with reduced motion or in lite mode). */
export const Flashes = ({ n = 14, className }: { n?: number; className?: string }) => {
  const spots = useMemo(
    () => Array.from({ length: n }, (_, i) => ({ x: 4 + ((i * 37 + 11) % 92), y: 6 + ((i * 53 + 7) % 78), d: ((i * 29) % 40) / 10, big: i % 4 === 0 })),
    [n],
  );
  return (
    <div className={cn('bn-flashes', className)} aria-hidden="true">
      {spots.map((s, i) => (
        <i key={i} className={s.big ? 'is-big' : undefined} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${s.d}s` }} />
      ))}
    </div>
  );
};

/** Two floodlight beams from the top corners. */
export const Beams = () => (
  <>
    <span className="bn-beam bn-beam--l" aria-hidden="true" />
    <span className="bn-beam bn-beam--r" aria-hidden="true" />
  </>
);

/** A club's flat colour pair for a plate (a near-black primary hands over to its secondary). */
export const plateOf = (c: BannerClub) => clubPlate(c.team);
