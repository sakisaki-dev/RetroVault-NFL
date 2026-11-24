import { useEffect, useRef, useState } from 'react';
import type { Player } from '@/types/player';
import { ClubBadge } from '@/components/arcade';
import { clubVars } from '@/components/arcade/clubInk';
import GameSprite from '../../GameSprite';
import { displayName } from '@/utils/displayName';

/**
 * Slim sticky bar under the site header once the hero has scrolled away: his bust, name, position and club badge on his
 * club's flat colour. A zero-height sentinel sits right after the hero; the bar shows while the sentinel is above the
 * viewport. Tap: back to the top of the Deep Dive.
 */
const DdMiniHero = ({ player, club, ovr, ovrLabel, onTop }: { player: Player; club: string | null; ovr?: number; ovrLabel?: string; onTop: () => void }) => {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-56px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [player]);
  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <div className="dd-mini chrome-follow" data-on={stuck || undefined} style={clubVars(club)} aria-hidden={!stuck}>
        <button type="button" tabIndex={stuck ? 0 : -1} onClick={onTop} className="dd-mini__in" aria-label={`${displayName(player.name)}, back to the top`}>
          <span className="dd-mini__spr">
            <GameSprite player={player} team={club ?? undefined} kind="bust" size="s" />
          </span>
          <span className="dd-mini__name">{displayName(player.name)}</span>
          <span className="dd-mini__pos">{player.position}</span>
          {ovr != null && (
            <span className="dd-mini__ovr">
              {ovrLabel} <b>{ovr}</b>
            </span>
          )}
          <span className="dd-mini__club">
            <ClubBadge club={club} size="sm" />
          </span>
        </button>
      </div>
    </>
  );
};
export default DdMiniHero;
