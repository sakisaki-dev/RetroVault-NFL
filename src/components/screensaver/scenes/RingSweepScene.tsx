import { useEffect, useState, type CSSProperties } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { displayName } from '@/utils/displayName';
import type { BannerClub, BannerData } from '@/components/teams/banner/useBannerData';
import { Figure, plateOf, stars } from '@/components/teams/banner/parts';
import { pctText, recordLine, winPct, type AllTime } from '@/components/teams/nfl/allTime';
import { reducedMotion, type SaverDeps } from './nflSaverData';
import './saverScenes.css';

/**
 * Ring of honor sweep: the Teams banner's ring at full screen. All 32 clubs' plaques hang around the upper deck in
 * all-time power order; the camera pans along it, one club lights up at a time, its greatest player steps out onto the
 * turf in his kit, celebrating, and the jumbotron reads the franchise wall: record, win %, titles, Super Bowl trips,
 * playoff trips and Hall of Famers.
 */
const STEP = 3500;
const REACH = 6; // plaques either side that the camera sees
const DROP = 150; // px: how far the ring dips at its edges

const RingSweepScene = ({ data, allTime, picks, deps }: { data: BannerData; allTime: AllTime | null; picks: string[]; deps: SaverDeps }) => {
  const order = picks.map((n) => data.clubs.findIndex((c) => c.team.name === n)).filter((i) => i >= 0);
  const still = reducedMotion();
  const [step, setStep] = useState(0);
  const [cam, setCam] = useState(order[0] - 2.2);
  useEffect(() => {
    const first = window.setTimeout(() => setCam(order[0]), 80);
    if (still) return () => window.clearTimeout(first);
    const ts = order.slice(1).map((_, j) => window.setTimeout(() => {
      setStep(j + 1);
      setCam(order[j + 1]);
    }, (j + 1) * STEP));
    return () => [first, ...ts].forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const club: BannerClub = data.clubs[order[step]];
  const at = allTime?.byClub.get(club.team.name);
  const plate = plateOf(club);
  const { Stadium } = deps;
  const lead = data.clubs[order[0]].team.name;
  const chips: [string, string | number][] = [
    ['Super Bowl titles', club.titles],
    ['Super Bowl trips', club.rec.appearances],
    ...(at ? ([['Playoff trips', at.playoffs]] as [string, number][]) : []),
    ['Hall of Famers', club.rec.hof.length],
  ];
  return (
    <Stadium club={lead} roll={0.9} className="sv-rs__stadium">
      <div className="sv-rs" style={{ '--rs1': plate.fill, '--rs2': plate.edge } as CSSProperties}>
        <p className="sv-kick sv-rs__kick">Ring of honor · all-time power</p>
        <div className="sv-rs__ring" aria-hidden="true">
          {data.clubs.map((c, i) => {
            const d = i - cam;
            const t = Math.min(1, Math.abs(d) / REACH);
            const lit = c === club;
            const p = plateOf(c);
            return (
              <div
                key={c.s.key}
                className={`sv-rs__plaque ${lit ? 'is-lit' : ''}`}
                style={{
                  '--c1': c.team.name === 'Jets' ? '#f4f6f2' : p.fill,
                  '--c2': p.edge,
                  transform: `translateX(calc(${d} * var(--rs-step))) translateY(${Math.round(DROP * (1 - Math.sqrt(1 - t * t)))}px) scale(${lit ? 1.45 : 1 - t * 0.3})`,
                  zIndex: lit ? 5 : 3 - Math.round(t * 2),
                } as CSSProperties}
              >
                <TeamLogo team={c.team} size={44} decorative />
                <b>{stars(c.titles) || ' '}</b>
                <i>#{c.rank}</i>
              </div>
            );
          })}
        </div>
        <div className="sv-rs__jumbo" key={club.s.key}>
          <div className="sv-rs__who">
            <TeamLogo team={club.team} size={72} decorative />
            <div>
              <h2 className="sv-title sv-rs__name">{club.team.fullName}</h2>
              <p className="sv-sub sv-sub--dim">#{club.rank} all-time power{allTime ? ` · ${allTime.from}–${allTime.to}` : ''}</p>
            </div>
          </div>
          {at && (
            <p className="sv-rs__rec">
              <b>{recordLine(at)}</b>
              <span>{pctText(winPct(at))} win</span>
            </p>
          )}
          <dl className="sv-rs__chips">
            {chips.map(([k, n]) => (
              <div key={k}>
                <dd>{n}</dd>
                <dt>{k}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="sv-rs__star" key={`${club.s.key}-star`}>
          <span className="sv-rs__glow" aria-hidden="true" />
          <Figure club={club} action="celebrate" size="l" />
          {club.star && (
            <span className="sv-rs__nameplate">
              <TeamLogo team={club.team} size={18} decorative />
              <b>{displayName(club.star.name)}</b>
              <i>Greatest all time</i>
            </span>
          )}
        </div>
      </div>
    </Stadium>
  );
};
export default RingSweepScene;
