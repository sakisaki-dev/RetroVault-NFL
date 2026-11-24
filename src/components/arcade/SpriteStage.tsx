import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Player } from '@/types/player';
import { cn } from '@/lib/utils';
import { useGameSprites, type SpriteAction } from '@/utils/gameSprites';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import GameSprite, { type SpriteSize } from '../GameSprite';
import TeamLogo from '../brand/TeamLogo';
import { bannerTeamOf } from '@/utils/playerExtras';
import { clubVars } from './clubInk';
import './arcade.css';

/**
 * SpriteStage: a strip of the game's own stadium (the crowd on top, the turf below, painted to a club's colours with
 * useFieldArt; flat CSS crowd and turf in the public build) with N GameSprite figures standing on it. The section
 * hero for pages that want a stadium and sprites rather than a plain header.
 * Props: club (colours and kit; the stadium), players ({player, action?}[] or Player[]; the middle one is the star),
 * time? 'day' | 'night' (default night), kind? 'figure' | 'bust', size? 's' | 'm' | 'l' (default m), action? (the default
 * pose), maxMobile? (how many stand at 400px, default 3, outermost hidden first), height? (px, default from size),
 * children? (overlay, e.g. a title block), className?. Without private sprites each player shows his club's logo.
 *
 * StadiumHeader: the same stage with a title over the crowd. Props: title, kicker?, right?, plus all SpriteStage props.
 * The text sits on a flat plate for contrast, the sprites stand on the turf below it.
 *
 * CrowdDivider (re-exported from stats/visual): a thin crowd strip between sections.
 */
export interface StagePlayer {
  player: Player;
  action?: SpriteAction;
  club?: string;
}
export interface SpriteStageProps {
  club: string;
  players?: (StagePlayer | Player)[];
  time?: 'day' | 'night';
  kind?: 'figure' | 'bust';
  size?: SpriteSize;
  action?: SpriteAction;
  maxMobile?: number;
  height?: number;
  children?: ReactNode;
  className?: string;
}
const isStage = (p: StagePlayer | Player): p is StagePlayer => 'player' in p;
const SIZE_H: Record<SpriteSize, number> = { s: 150, m: 220, l: 290 };

export const SpriteStage = ({ club, players = [], time = 'night', kind = 'figure', size = 'm', action = 'idle', maxMobile = 3, height, children, className }: SpriteStageProps) => {
  const art = useFieldArt(club, time);
  const sprites = useGameSprites();
  const list = useMemo(() => players.map((p) => (isStage(p) ? p : { player: p })), [players]);
  const hidden = useMemo(() => {
    const mid = (list.length - 1) / 2;
    const byDist = list.map((_, i) => i).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    return new Set(byDist.slice(maxMobile));
  }, [list, maxMobile]);
  const h = height ?? (kind === 'bust' ? Math.round(SIZE_H[size] * 0.72) : SIZE_H[size]);
  const style = {
    ...clubVars(club),
    '--ax-stage-h': `${h}px`,
    ...(art.crowd ? { '--ax-crowd': `url(${art.crowd})` } : {}),
    ...(art.turf ? { '--ax-turf': `url(${art.turf})` } : {}),
    ...(art.stands ? { '--ax-stands': `url(${art.stands})` } : {}),
  } as CSSProperties;
  const mid = (list.length - 1) / 2;
  return (
    <div className={cn('ax-stage', `ax-stage--${time}`, art.turf && 'ax-stage--art', className)} style={style}>
      <div className="ax-stage__stands" aria-hidden="true" />
      <div className="ax-stage__crowd" aria-hidden="true" />
      <div className="ax-stage__turf" aria-hidden="true" />
      <div className="ax-stage__rail" aria-hidden="true" />
      {list.length > 0 && (
        <div className="ax-stage__line" aria-hidden="true">
          {list.map((p, i) => {
            const c = p.club ?? bannerTeamOf(p.player) ?? club;
            const star = i === Math.round(mid);
            return (
              <span key={`${p.player.name}-${i}`} className={cn('ax-stage__fig', hidden.has(i) && 'ax-stage__fig--extra')} style={{ zIndex: star ? 2 : 1 }}>
                {sprites && !p.player.isRealLegend ? (
                  <GameSprite player={p.player} team={c} kind={kind} size={size} action={p.action ?? (star && action === 'idle' && list.length > 1 ? 'idle' : action)} />
                ) : (
                  <TeamLogo team={c} size={size === 's' ? 44 : size === 'm' ? 72 : 96} decorative />
                )}
              </span>
            );
          })}
        </div>
      )}
      {children && <div className="ax-stage__over">{children}</div>}
    </div>
  );
};

export const StadiumHeader = ({ title, kicker, right, children, ...stage }: { title: ReactNode; kicker?: ReactNode; right?: ReactNode } & SpriteStageProps) => (
  <SpriteStage {...stage}>
    <div className="ax-stadium__plate">
      <div className="ax-stadium__text">
        {kicker && <span className="ax-kicker">{kicker}</span>}
        <h2 className="ax-stadium__title">{title}</h2>
      </div>
      {right && <div className="ax-stadium__right">{right}</div>}
    </div>
    {children}
  </SpriteStage>
);

export { default as CrowdDivider } from '../stats/visual/CrowdDivider';
export default SpriteStage;
