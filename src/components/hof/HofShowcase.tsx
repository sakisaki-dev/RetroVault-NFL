import { useEffect, useMemo, useState } from 'react';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '../brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { RAFTERS_ANCHOR } from '@/utils/raftersLink';
import { reducedMotion } from '@/utils/motion';
import type { GalleryItem } from './HofGallery';
import { clubColors } from './hofUtils';

/**
 * The Hall's header showpiece: a steel truss with a row of gold-lit busts (the latest class first, then the top scores,
 * each in his banner club's kit) over a crowd silhouette, and a teaser that walks to The Rafters when the page has one
 * (else to the busts). Presentation only; busts open the same player card as the gallery.
 */
const COUNT = 7;

const HofShowcase = ({ items, onOpen }: { items: GalleryItem[]; onOpen: (item: GalleryItem) => void }) => {
  const picks = useMemo(() => {
    const latest = items.reduce((m, i) => Math.max(m, Number(i.member.classSeason) || 0), 0);
    const withPlayer = items.filter((i) => i.player);
    const first = withPlayer.filter((i) => Number(i.member.classSeason) === latest).sort((a, b) => b.member.score - a.member.score);
    const rest = withPlayer.filter((i) => !first.includes(i)).sort((a, b) => b.member.score - a.member.score || b.member.careerLegacy - a.member.careerLegacy);
    return [...first, ...rest].slice(0, COUNT);
  }, [items]);
  const [hasRafters, setHasRafters] = useState(false);
  useEffect(() => setHasRafters(!!document.getElementById(RAFTERS_ANCHOR)), []);
  if (!picks.length) return null;
  // the best in the middle, the rest outward
  const mid = (picks.length - 1) / 2;
  const slots = Array.from({ length: picks.length }, (_, i) => i).sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid) || x - y);
  const placed: (GalleryItem | undefined)[] = [];
  slots.forEach((slot, i) => (placed[slot] = picks[i]));
  const go = () => {
    const el = document.getElementById(hasRafters ? RAFTERS_ANCHOR : 'hof-canton');
    el?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <div className="hof-show">
      <button type="button" className="hof-teaser" onClick={go}>
        <span className="hof-teaser__k">{hasRafters ? 'The Rafters' : 'The busts'}</span>
        <span>{hasRafters ? 'Retired numbers hang above every club. See them' : 'Every enshrined player, newest class first'}</span>
      </button>
      <div className="hof-show__stage">
        <span className="hof-show__truss" aria-hidden="true" />
        <ul className="hof-show__row">
          {placed.map((it) => {
            if (!it) return null;
            const team = findNFLTeam(it.club);
            const ink = clubColors(team).ink;
            return (
              <li key={it.member.key}>
                <button type="button" className="hof-show__bust" onClick={() => onOpen(it)} aria-label={`${it.member.name}, Hall of Fame`}>
                  <span className="hof-show__cone" aria-hidden="true" />
                  <span className="hof-show__fig">
                    {it.player ? <GameSprite player={it.player} team={it.club} kind="bust" size="m" /> : <TeamLogo team={team ?? it.club} size={48} decorative />}
                  </span>
                  <span className="hof-show__plinth" />
                  <span className="hof-show__name" style={{ color: ink }}>{it.member.name.replace(/ \(.*\)$/, '').split(' ').slice(-1)[0]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <span className="hof-show__crowd" aria-hidden="true" />
      </div>
    </div>
  );
};

export default HofShowcase;
