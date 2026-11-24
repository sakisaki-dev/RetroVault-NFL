import { useMemo, type CSSProperties } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { displayName } from '@/utils/displayName';
import type { BannerData } from './useBannerData';
import { Counts, Figure, Flashes, plateOf, stars, Wordmark } from './parts';

/**
 * Banner 4, "Media wall": a press-day step-and-repeat of all 32 real club logos in staggered rows under truss lamps,
 * camera flashes popping across it, TEAMS in gold, and in front a stepped riser with the all-time top eight franchises'
 * greatest players in their kits (the No. 1 on the top step in the middle, the rest stepping down either side).
 */
const STEP_ORDER = [8, 6, 4, 2, 1, 3, 5, 7]; // rank left to right
const STEP_H: Record<number, number> = { 1: 40, 2: 30, 3: 30, 4: 21, 5: 21, 6: 12, 7: 12, 8: 4 };

const BannerMedia = ({ data }: { data: BannerData }) => {
  const rows = useMemo(() => {
    // four staggered rows, the 32 logos repeated so the wall runs past any width
    const all = data.clubs;
    return [0, 1, 2, 3].map((r) => {
      const shift = (r * 9) % all.length;
      return Array.from({ length: 24 }, (_, i) => all[(i + shift) % all.length]);
    });
  }, [data.clubs]);
  const top8 = useMemo(() => STEP_ORDER.map((rk) => data.clubs[rk - 1]).filter(Boolean), [data.clubs]);

  return (
    <div className="bn bn4" role="img" aria-label={`Teams: ${data.totals.franchises} franchises, ${data.totals.superBowls} Super Bowls`}>
      <div className="bn4-wall" aria-hidden="true">
        {rows.map((row, r) => (
          <div key={r} className="bn4-row" style={{ ['--off' as string]: r % 2 ? "42px" : "0px" } as CSSProperties}>
            {row.map((c, i) => (
              <span key={`${c.s.key}-${i}`} className="bn4-logo">
                <TeamLogo team={c.team} size={54} decorative />
              </span>
            ))}
          </div>
        ))}
      </div>
      <span className="bn4-light bn4-light--a" aria-hidden="true" />
      <span className="bn4-light bn4-light--b" aria-hidden="true" />
      <span className="bn4-light bn4-light--c" aria-hidden="true" />
      <div className="bn4-truss" aria-hidden="true">
        {[10, 30, 50, 70, 90].map((x) => (
          <i key={x} style={{ left: `${x}%` }} />
        ))}
      </div>
      <Flashes n={22} />
      <div className="bn4-plate">
        <Wordmark data={data} />
        <Counts data={data} />
      </div>
      <div className="bn4-stage" aria-hidden="true" />
      <div className="bn4-line">
        {top8.map((c) => {
          const p = plateOf(c);
          const rk = c.rank;
          return (
            <span key={c.s.key} className={rk === 1 ? 'bn4-fig is-first' : 'bn4-fig'} style={{ ['--step' as string]: `${STEP_H[rk] ?? 0}px`, ['--c1' as string]: p.fill, ['--c2' as string]: p.edge, ['--ink' as string]: p.ink } as CSSProperties}>
              <span className="bn4-fig__sp">
                <Figure club={c} action={rk === 1 ? 'celebrate' : 'idle'} size="m" />
              </span>
              <span className="bn4-step">
                <i>{rk}</i>
                <TeamLogo team={c.team} size={16} decorative />
                <b>{c.star ? displayName(c.star.name).split(' ').slice(-1)[0] : c.team.name}</b>
                <em>{stars(c.titles)}</em>
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default BannerMedia;
