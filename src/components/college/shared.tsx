import { useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Player } from '@/types/player';
import { useLeague } from '@/context/LeagueContext';
import { useGameSprites } from '@/utils/gameSprites';
import { bannerTeamOf, legacyTeamOf, usePlayerExtras } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn } from '@/utils/teamColors';
import GameSprite, { type SpriteSize } from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { PlayerStrip } from '@/components/brand/ClubStrip';
import { CollegeMark } from '@/components/player/DraftTiles';
import { clubPlate } from '@/components/arcade/clubInk';
import { openInCompFinder } from '@/components/stats/comps/compFinderLink';
import type { FieldArt } from '@/components/teamlab/fieldArt';
import { markInfo, type SchoolInfo } from '@/utils/collegeData';
import type { SpriteAction } from '@/utils/gameSprites';

/** Site players by "POS:Name" */
export const usePlayerMap = () => {
  const { getAllPlayers, dataVersion } = useLeague();
  return useMemo(() => {
    const m = new Map<string, Player>();
    getAllPlayers().forEach((p) => {
      if (!p.isRealLegend) m.set(`${p.position}:${p.name}`, p);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAllPlayers, dataVersion]);
};

/**
 * The club a player is drawn in when no draft club applies (the all-time XI, alumni, the index's best alumnus): the
 * site's own rule, legacyTeamOf (where he is best known, his current club while he plays), else his banner club.
 */
export const useBestKnownClub = () => {
  const extras = usePlayerExtras();
  return (p: Player | null | undefined, fallback?: string | null): string => {
    const c = p ? legacyTeamOf(extras, p) || bannerTeamOf(p) : '';
    return [c, fallback].find((x) => x && findNFLTeam(x)) ?? '';
  };
};

/** A club's flat colours as CSS variables (--cl-c club primary, --cl-e secondary, --cl-ink readable text on it) */
export const clubColors = (club: string | null | undefined): CSSProperties => {
  const t = findNFLTeam(club ?? '');
  if (!t) return {};
  return { '--cl-c': `hsl(${t.primaryColor})`, '--cl-e': `hsl(${t.secondaryColor})`, '--cl-ink': getReadableTextOn(t.primaryColor) } as CSSProperties;
};

const isLight = (ink: string) => !ink.includes('100%');

/**
 * A club-colour card's variables (the pick cards, plaques, war-room slots): --c the fill (the club's primary, its
 * secondary when the primary is near black), --a the top rim, --ink and --sub readable text, --wm the watermark's opacity.
 */
export const cardVars = (club: string | null | undefined): CSSProperties => {
  const p = clubPlate(club);
  const light = isLight(p.ink);
  return {
    '--c': p.fill,
    '--a': p.edge,
    '--ink': p.ink,
    '--sub': light ? 'rgb(11 16 32 / 0.72)' : 'rgb(255 255 255 / 0.74)',
    '--wm': light ? '0.16' : '0.2',
  } as CSSProperties;
};

/** A school's flat colours (ESPN's hex) */
const lumOf = (hex: string) => {
  const h = hex.padEnd(6, '0');
  return parseInt(h.slice(0, 2), 16) * 0.3 + parseInt(h.slice(2, 4), 16) * 0.59 + parseInt(h.slice(4, 6), 16) * 0.11;
};
/**
 * A school's flat colours (ESPN's hex): --cl-sc the colour, --cl-sa the alternate, --cl-sink readable text on the colour,
 * and --cl-sl an accent that reads on the night panels (the colour itself, else its alternate when that is lighter,
 * else the colour lifted toward white), for bars and rules: a black school (Eastern Illinois) would vanish otherwise.
 * The card variables (--c, --a, --ink, --sub, --wm) follow cardVars.
 */
export const schoolColors = (s: SchoolInfo | null | undefined): CSSProperties => {
  const ch = s?.c || '2a3556';
  const c = `#${ch}`;
  const a = s?.a ? `#${s.a}` : '#ffffff';
  const lum = lumOf(ch);
  const lift = lum >= 45 ? c : s?.a && lumOf(s.a) >= 70 ? a : `color-mix(in srgb, ${c} 45%, #fff)`;
  const light = lum > 150;
  return {
    '--cl-sc': c,
    '--cl-sa': a,
    '--cl-sl': lift,
    '--cl-sink': light ? '#10131f' : '#fff',
    '--c': c,
    '--a': a,
    '--ink': light ? '#0b1020' : '#fff',
    '--sub': light ? 'rgb(11 16 32 / 0.72)' : 'rgb(255 255 255 / 0.74)',
    '--wm': light ? '0.16' : '0.22',
  } as CSSProperties;
};

/** A school's palette for the painted crowd and stands (its colour, its alternate, white trim) */
export const schoolPalette = (s: SchoolInfo | null | undefined) =>
  s?.c ? { primary: `#${s.c}`, secondary: s.a ? `#${s.a}` : '#ffffff', trim: '#f0f0f0' } : null;

/** "Brady" from "Tom Brady", "Beckham" from "Odell Beckham Jr." */
export const surname = (name: string) => {
  const w = name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').split(/\s+/);
  return w[w.length - 1] ?? name;
};
export const nameOfKey = (k: string) => k.split(':').slice(1).join(':');
export const posOfKey = (k: string) => k.split(':')[0];

/** The player's name as a club-colour strip (his Deep Dive) when he has a card, else plain text */
export const PickName = ({ name, siteKey, club, size = 'sm' }: { name: string; siteKey: string | null; club: string; size?: 'sm' | 'md' }) => {
  if (!siteKey) return <span className="cl-plainname">{name}</span>;
  const [pos, ...rest] = siteKey.split(':');
  return <PlayerStrip name={rest.join(':')} position={pos} team={club} size={size} />;
};

/**
 * A name set in the card's own ink (on a club-colour card a club strip would vanish): a button to his Deep Dive when he
 * has a card, plain text when not. Never underlined.
 */
/** A tap anywhere on a player card opens him, through the card's name button; buttons and links inside keep their own tap */
export const cardTap = (e: { target: EventTarget; currentTarget: HTMLElement }) => {
  if ((e.target as HTMLElement).closest('button, a')) return;
  e.currentTarget.querySelector<HTMLButtonElement>('button.cl-cname')?.click();
};

export const CardName = ({ name, siteKey, className }: { name: string; siteKey: string | null; className?: string }) =>
  siteKey ? (
    <button
      type="button"
      className={`cl-cname ${className ?? ''}`}
      onClick={() => openInCompFinder({ position: posOfKey(siteKey), name: nameOfKey(siteKey) } as Pick<Player, 'position' | 'name'> as Player)}
      aria-label={`${name}: open in the Deep Dive`}
      data-player-key={siteKey}
    >
      {name}
    </button>
  ) : (
    <span className={`cl-cname ${className ?? ''}`}>{name}</span>
  );

/** A school's mark and short name as a button to its page */
export const SchoolLink = ({ school, onOpen, size = 18, full, className = 'cl-school' }: { school: SchoolInfo & { slug?: string }; onOpen?: (slug: string) => void; size?: number; full?: boolean; className?: string }) => {
  const info = markInfo(school);
  const body = (
    <>
      {info && <CollegeMark info={info} size={size} />}
      <span className="cl-school__n">{full ? school.name : school.s}</span>
    </>
  );
  return onOpen && school.slug ? (
    <button type="button" className={className} onClick={() => onOpen(school.slug!)} aria-label={`${school.name}: open the school page`}>
      {body}
    </button>
  ) : (
    <span className={className}>{body}</span>
  );
};

/**
 * His game sprite in a club's kit. A pick with no card gets a greyed jersey tile with his position (no stand-in face);
 * in the public build (no private sprites) the club's logo stands in.
 */
export const Figure = ({
  player,
  club,
  kind = 'figure',
  size = 's',
  action = 'idle',
  logo = 44,
  pos,
}: {
  player: Player | null | undefined;
  club: string;
  kind?: 'figure' | 'bust';
  size?: SpriteSize;
  action?: SpriteAction;
  logo?: number;
  /** shown on the greyed jersey of a pick with no card */
  pos?: string;
}) => {
  const sprites = useGameSprites();
  if (sprites && player) return <GameSprite player={player} team={club || bannerTeamOf(player)} kind={kind} size={size} action={action} />;
  if (!player && pos !== undefined) return <NoCardJersey pos={pos} size={logo} />;
  return <TeamLogo team={club} size={logo} decorative />;
};

/** The greyed jersey a pick without a card shows in place of a sprite */
export const NoCardJersey = ({ pos, size = 44 }: { pos: string; size?: number }) => (
  <svg className="cl-nojersey" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <path d="M13 4 L8 6 L2 13 L6 19 L10 16 L10 37 L30 37 L30 16 L34 19 L38 13 L32 6 L27 4 C25 7 15 7 13 4 Z" />
    <text x="20" y="28" textAnchor="middle">{pos.slice(0, 4)}</text>
  </svg>
);

/** What became of a pick, as small badges: the site's career OVR, Hall of Fame, All-Pro, Pro Bowls, else games */
export const Outcome = ({ hof, ap, pb, ovr, g, max = 3, showOvr = true, showGames = true }: { hof: number; ap: number; pb: number; ovr: number | null; g: number | null; max?: number; showOvr?: boolean; showGames?: boolean }) => {
  const out: ReactNode[] = [];
  if (showOvr)
    out.push(
      <span key="o" className={`cl-ovr${ovr == null ? ' is-none' : ''}`} title={ovr == null ? 'No career OVR on the site' : 'Career OVR on the site'}>
        <b>{ovr ?? '–'}</b>
        <small>OVR</small>
      </span>,
    );
  if (hof > 0) out.push(<span key="h" className="cl-bd cl-bd--hof" title={hof === 2 ? 'Hall of Famer (on the site)' : 'Hall of Famer (draft file)'}>HOF</span>);
  if (ap > 0) out.push(<span key="a" className="cl-bd cl-bd--ap" title={`${ap} first-team All-Pro`}>{ap}× AP</span>);
  if (pb > 0) out.push(<span key="p" className="cl-bd cl-bd--pb" title={`${pb} Pro Bowls`}>{pb}× PB</span>);
  if (showGames && hof === 0 && ap === 0 && pb === 0) {
    if (g != null && g > 0) out.push(<span key="g" className="cl-bd" title="Career games (draft file)">{g} G</span>);
    else out.push(<span key="n" className="cl-bd cl-bd--none">No NFL games</span>);
  }
  return <span className="cl-out">{out.slice(0, max)}</span>;
};

/**
 * The game's stadium painted to a club or a school: the stand front and the crowd across the top, then the turf (its
 * sideline row, then the field further down). Flat CSS stands, crowd and stripes in the public build.
 */
export const Scene = ({ art, className, style, children }: { art: FieldArt; className?: string; style?: CSSProperties; children?: ReactNode }) => {
  const vars = {
    ...style,
    ...(art.stands ? { '--sc-stands': `url(${art.stands})` } : {}),
    ...(art.crowd ? { '--sc-crowd': `url(${art.crowd})` } : {}),
    ...(art.turf ? { '--sc-turf': `url(${art.turf})` } : {}),
  } as CSSProperties;
  return (
    <div className={`cl-scene${art.turf ? ' cl-scene--art' : ''} ${className ?? ''}`} style={vars}>
      <div className="cl-scene__stands" aria-hidden="true" />
      <div className="cl-scene__crowd" aria-hidden="true" />
      <div className="cl-scene__turf" aria-hidden="true" />
      <div className="cl-scene__field" aria-hidden="true" />
      {children}
    </div>
  );
};
