import { useMemo, type CSSProperties } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import PixelCup from '@/components/frontoffice/PixelCup';
import { displayName } from '@/utils/displayName';
import type { BannerClub, BannerData } from './useBannerData';
import { Beams, Confetti, Counts, Figure, plateOf, stars, useStadiumVars, Wordmark } from './parts';

/**
 * Banner 2, "Champions' night": the night stadium (the game's stand front, crowd and turf painted to the club with the
 * most titles), the 13 Super Bowl champions' logos running along an LED ribbon board between stands and crowd, and at
 * midfield a podium with the pixel cup in a gold light under floodlights and confetti. The most decorated champion's
 * greatest player stands in front of it; the other twelve clubs' greatest players (in their kits, a title count under
 * each) make a semicircle around it, the older titles' kits nearest the podium.
 */
// slot u in [-1, 1] across the width; 0 = the podium. Left and right, nearest the podium first. `m` marks the slots kept on a phone.
const SLOTS: { u: number; m: boolean }[] = [0.2, 0.36, 0.52, 0.68, 0.84, 1].map((u) => ({ u, m: [0.36, 0.68, 1].includes(u) }));

const Tag = ({ c }: { c: BannerClub }) => (
  <span className="bn2-tag" title={`${c.team.city} ${c.team.name}${c.star ? ` · ${displayName(c.star.name)}` : ''}`}>
    <TeamLogo team={c.team} size={14} decorative />
    <b>{stars(c.titles)}</b>
  </span>
);

const BannerChampions = ({ data }: { data: BannerData }) => {
  const [lead, ...rest] = data.champions;
  const vars = useStadiumVars(lead.team.name, 'night');
  const colors = useMemo(() => data.champions.map((c) => plateOf(c).fill).concat(['#ffd75a', '#ffffff']), [data.champions]);
  const ribbon = useMemo(() => [...data.champions, ...data.champions], [data.champions]);
  // alternate the rest left, right, left ... starting nearest the podium
  const placed = useMemo(() => {
    const out: { c: BannerClub; u: number; m: boolean }[] = [];
    rest.forEach((c, i) => {
      const slot = SLOTS[Math.floor(i / 2)];
      if (!slot) return;
      out.push({ c, u: (i % 2 === 0 ? -1 : 1) * slot.u, m: slot.m });
    });
    return out;
  }, [rest]);

  return (
    <div className="bn bn2" style={vars} role="img" aria-label={`Teams: ${data.totals.champions} champion clubs, ${data.totals.superBowls} Super Bowls`}>
      <span className="bn2-stands" />
      <span className="bn2-crowd" />
      <span className="bn2-turf" />
      <Beams />
      <div className="bn2-ribbon" aria-hidden="true">
        <div className="bn2-ribbon__run">
          {ribbon.map((c, i) => {
            const p = plateOf(c);
            return (
              <span key={`${c.s.key}-${i}`} className="bn2-led" style={{ ['--c1' as string]: p.fill, ['--c2' as string]: p.edge } as CSSProperties}>
                <TeamLogo team={c.team} size={20} decorative />
                <b>{stars(c.titles)}</b>
              </span>
            );
          })}
        </div>
      </div>
      <div className="bn2-plate">
        <Wordmark data={data} />
        <Counts data={data} />
      </div>
      <span className="bn2-cone" aria-hidden="true" />
      <span className="bn2-pool" aria-hidden="true" />
      <div className="bn2-podium">
        <span className="bn2-cup">
          <PixelCup band="43 100% 55%" spark={1} />
        </span>
        <span className="bn2-block">
          <TeamLogo team={lead.team} size={26} decorative />
          <small>{data.totals.superBowls} Super Bowls</small>
        </span>
      </div>
      <div className="bn2-arc">
        {placed.map(({ c, u, m }) => (
          <span key={c.s.key} className={m ? 'bn2-fig' : 'bn2-fig bn2-fig--extra'} style={{ ['--u' as string]: u } as CSSProperties}>
            <Figure club={c} action="celebrate" size="s" />
            <Tag c={c} />
          </span>
        ))}
      </div>
      <div className="bn2-lead">
        <Figure club={lead} action="celebrate" size="m" />
        <Tag c={lead} />
      </div>
      <Confetti colors={colors} n={44} />
    </div>
  );
};

export default BannerChampions;
