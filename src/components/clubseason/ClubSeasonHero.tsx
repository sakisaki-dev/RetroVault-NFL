import { useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';
import { HelmetShape } from '@/components/collection/art/HelmetArt';
import JerseyGarment from '@/components/collection/art/JerseyGarment';
import { paletteFor, surnameOf } from '@/components/collection/art/shared';
import { logoFor, teamStyleFor } from '@/components/collection/art/teamStyle';
import { homeUniform, kitsOf, type Uniform } from '@/components/collection/art/sprite/uniforms';
import type { GamePlayer } from '@/config/ovr';
import { eraKitSeason } from '@/config/eraKits';
import { PixelIcon } from '@/components/arcade';
import { clubPlate } from '@/components/arcade/clubInk';
import TeamLogo from '@/components/brand/TeamLogo';
import { peekKeyProps } from '@/components/peek/peekProps';
import { findNFLTeam } from '@/utils/nflTeams';
import type { SeasonResult } from '@/utils/clubSeason';

export interface HeroPlayer {
  key: string;
  name: string;
  number?: number;
  szn?: number;
}
interface Props {
  club: string;
  year: number;
  /** The starting QB first (he takes the middle stall), then the season's best by SZN */
  players: HeroPlayer[];
  record: string;
  pf?: number;
  pa?: number;
  power?: number;
  division?: string | null;
  divisionRank?: number | null;
  result: SeasonResult;
  onPick: (key: string) => void;
}

const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`;
};

/** The kit the club wore that season: its era kit while that was in use, else home */
export const seasonKit = (club: string, year: number): Uniform => {
  const era = kitsOf(club).era;
  return era && eraKitSeason(club, year) ? era : homeUniform(club);
};

/** The best in the middle, the rest outward by rank: [2, 4, 1, 5, 3] */
const arrange = <T,>(best: T[]): T[] => {
  const out: T[] = [];
  best.forEach((p, i) => (i % 2 === 0 ? out.push(p) : out.unshift(p)));
  return out;
};

/**
 * One stall (the Locker card's, tall): wood back, club-colour side walls with a trim line, a nameplate, the helmet on the
 * shelf, the jersey on a hanger, cleats, a warm downlight (brighter for the best). Helmet and jersey are the season's kit.
 */
const Stall = ({ club, uniform, name, number, best }: { club: string; uniform: Uniform; name: string; number?: number; best: boolean }) => {
  const id = `s${useId().replace(/:/g, '')}`;
  const team = { team: club } as GamePlayer;
  const pal = useMemo(() => paletteFor(team, uniform), [club, uniform]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useMemo(() => teamStyleFor(team, uniform), [club, uniform]); // eslint-disable-line react-hooks/exhaustive-deps
  const logo = logoFor(team);
  const plate = clubPlate(club);
  const wall = `color-mix(in srgb, ${plate.fill} 72%, #000)`;
  const label = surnameOf(name).toUpperCase();
  const fs = Math.min(8.5, 52 / ((label.length + (number != null ? 3 : 0)) * 0.56));
  return (
    <svg className="cs-stall__art" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#24180f" />
          <stop offset="0.5" stopColor="#4a3423" />
          <stop offset="1" stopColor="#24180f" />
        </linearGradient>
        <radialGradient id={`${id}-lamp`} cx="0.5" cy="0.06" r="0.8">
          <stop offset="0" stopColor="#ffe9b8" stopOpacity={best ? 0.7 : 0.38} />
          <stop offset="1" stopColor="#ffe9b8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`color-mix(in srgb, ${plate.fill} 82%, #fff)`} />
          <stop offset="1" stopColor={plate.fill} />
        </linearGradient>
      </defs>
      <rect width="100" height="140" fill={`url(#${id}-wood)`} />
      {[20, 32, 44, 56, 68, 80].map((x) => (
        <rect key={x} x={x} y="0" width="0.6" height="140" fill="#000" opacity="0.28" />
      ))}
      <path d="M0 0 L10 7 L10 140 L0 140 Z" fill={wall} />
      <path d="M100 0 L90 7 L90 140 L100 140 Z" fill={wall} />
      <path d="M10 7 L10 140 M90 7 L90 140" stroke={plate.edge} strokeWidth="1" opacity="0.85" />
      <rect x="18" y="2.5" width="64" height="12" rx="2" fill={`url(#${id}-plate)`} stroke={plate.edge} strokeWidth="1" />
      <text x="50" y="11.2" textAnchor="middle" className="cs-plate" fontSize={fs} fill={plate.ink} letterSpacing="0.6">
        {label}
        {number != null ? ` ${number}` : ''}
      </text>
      <rect x="10" y="46" width="80" height="3.4" fill="#2b1d12" />
      <rect x="10" y="49.4" width="80" height="1.2" fill="#000" opacity="0.4" />
      <g transform="translate(34 19) scale(0.25)">
        <HelmetShape pal={pal} number={number} id={id} style={style} logo={logo} />
      </g>
      <rect x="10" y="55" width="80" height="1.6" rx="0.8" fill="#9aa1ab" />
      <path d="M50 55 c2.4 -3.4 -2.4 -4.6 -2.4 -1.8" fill="none" stroke="#c4c9d1" strokeWidth="0.9" />
      <g transform="translate(10.5 58) scale(0.66)">
        <path d="M14 18 L60 2 L106 18" fill="none" stroke="#6b4a2b" strokeWidth="4" strokeLinecap="round" />
        <JerseyGarment pal={pal} style={style} number={number} logo={logo} id={`${id}-g`} uniform={uniform} />
      </g>
      <g transform="translate(70 130)">
        <path d="M0 4 C0 1 3 0 6 0 L12 2 C15 3 16 5 16 6 L0 6 Z" fill={uniform.cleats} stroke="#000" strokeOpacity="0.45" strokeWidth="0.5" />
        <path d="M0 6 L16 6" stroke="#000" strokeOpacity="0.6" strokeWidth="1" />
      </g>
      <rect width="100" height="140" fill={`url(#${id}-lamp)`} />
    </svg>
  );
};

const ClubSeasonHero = ({ club, year, players, record, pf, pa, power, division, divisionRank, result, onPick }: Props) => {
  const team = findNFLTeam(club);
  const plate = clubPlate(club);
  const uniform = useMemo(() => seasonKit(club, year), [club, year]);
  const order = useMemo(() => arrange(players.slice(0, 5)), [players]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // a phone opens on the best player: centre his stall in the row (never scrolls the page)
    const el = scroller.current;
    const best = el?.querySelector<HTMLElement>('[data-best="1"]');
    if (el && best) el.scrollLeft = best.offsetLeft - (el.clientWidth - best.offsetWidth) / 2;
  }, [players, club, year]);
  const vars = {
    '--cs-fill': plate.fill,
    '--cs-edge': plate.edge,
    '--cs-ink': plate.ink,
    '--cs-wall': `color-mix(in srgb, ${plate.fill} 72%, #000)`,
  } as CSSProperties;
  const diff = pf != null && pa != null ? pf - pa : null;
  return (
    <section className="cs-hero" style={vars} aria-label={`${year} ${team?.fullName ?? club} locker room`}>
      <span aria-hidden="true" className="cs-hero__logo cs-hero__logo--l"><TeamLogo team={club} size={420} decorative /></span>
      <span aria-hidden="true" className="cs-hero__logo cs-hero__logo--r"><TeamLogo team={club} size={420} decorative /></span>
      <div className={`cs-board${result.champion ? ' is-champ' : ''}`}>
        {result.champion && (
          <span className="cs-confetti" aria-hidden="true">
            {Array.from({ length: 22 }, (_, i) => (
              <i key={i} style={{ ['--i' as string]: i }} />
            ))}
          </span>
        )}
        <span className="cs-board__rail" aria-hidden="true" />
        <div className="cs-pennant" aria-hidden="true">
          <i className="cs-pennant__strap cs-pennant__strap--l" />
          <i className="cs-pennant__strap cs-pennant__strap--r" />
          <div className="cs-pennant__cloth">
            <TeamLogo team={club} size={64} decorative className="cs-pennant__logo" />
            <b className="num">{year}</b>
            <small>{team?.name ?? club}</small>
          </div>
        </div>
        <div className="cs-board__main">
          <span className="cs-kick">{team?.fullName ?? club}</span>
          <b className="cs-rec num" aria-label={`Record ${record}`}>{record}</b>
          {result.text && (
            <span className="cs-ribbon">
              {result.champion && <PixelIcon name="trophy" size={14} color="hsl(var(--gold))" />}
              {result.text}
            </span>
          )}
        </div>
        <dl className="cs-tiles num">
          {pf != null && <div><dt>Points for</dt><dd>{pf}</dd></div>}
          {pa != null && <div><dt>Against</dt><dd>{pa}</dd></div>}
          {diff != null && <div><dt>Diff</dt><dd className={diff > 0 ? 'is-up' : diff < 0 ? 'is-dn' : ''}>{diff > 0 ? '+' : ''}{diff}</dd></div>}
          {power ? <div><dt>Power</dt><dd>No. {power}</dd></div> : null}
          {division && divisionRank ? <div className="cs-tiles__div"><dt>{division}</dt><dd>{ordinal(divisionRank)}</dd></div> : null}
        </dl>
      </div>
      <div className="cs-stalls" ref={scroller} role="list">
        {order.map((p) => {
          const best = p.key === players[0]?.key;
          return (
            <button
              key={p.key}
              type="button"
              role="listitem"
              data-best={best ? '1' : undefined}
              data-peek-ok
              {...peekKeyProps(p.key)}
              onClick={() => onPick(p.key)}
              aria-label={`${p.name}${p.number != null ? `, number ${p.number}` : ''}${p.szn != null ? `, season rating ${p.szn}` : ''}. Open player card`}
              className={`cs-stall${best ? ' is-best' : ''}`}
            >
              <Stall club={club} uniform={uniform} name={p.name} number={p.number} best={best} />
            </button>
          );
        })}
        {!order.length && <p className="cs-empty">No player lines for this season.</p>}
      </div>
      <div className="cs-floor" aria-hidden="true">
        <span className="cs-bench" />
      </div>
    </section>
  );
};

export default ClubSeasonHero;
