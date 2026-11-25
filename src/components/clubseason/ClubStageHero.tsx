import { useMemo, type ReactNode } from 'react';
import type { Player } from '@/types/player';
import CountUp from '@/components/brand/CountUp';
import TeamLogo from '@/components/brand/TeamLogo';
import { ClubStrip, LedBoard, PixelIcon, StadiumHeader, type StagePlayer } from '@/components/arcade';
import { peekProps } from '@/components/peek/peekProps';
import { Reveal, stag } from '@/components/motion/Reveal';
import { displayName } from '@/utils/displayName';
import '@/components/season/sx.css';

export interface HeroTile {
  /** A number counts up (prefix/suffix around it); a string shows as is */
  value: number | string;
  prefix?: string;
  suffix?: string;
  label: string;
  gold?: boolean;
}
export interface HeroPlayer {
  player: Player;
  /** The figure beside his name in the ticker (SZN, Career Legacy) */
  badge?: string | number;
}
interface Props {
  club: string;
  kicker: ReactNode;
  title: string;
  /** Best first: the stage stands the first one in the middle (the quarterback where there is one), the rest outward */
  players: HeroPlayer[];
  /** The jumbotron: the record or the titles */
  led?: { label: string; value: string; sub?: string };
  tiles: HeroTile[];
  /** A gold line under the tiles (how the season ended) */
  ribbon?: ReactNode;
  champion?: boolean;
  /** SB chips, the coached line … */
  children?: ReactNode;
  onPlayer: (p: Player) => void;
}

/**
 * The club sheet's hero, shared by both tabs and built like the Season page's banner: the club's stadium painted in its
 * colours (the game's crowd and turf), its stars standing on the turf (tap: the player card, hold: the quick look), the
 * headline number on a jumbotron, the roster scrolling by on the ticker and a row of club-colour tiles that count up.
 */
const ClubStageHero = ({ club, kicker, title, players, led, tiles, ribbon, champion, children, onPlayer }: Props) => {
  const stage = useMemo<StagePlayer[]>(() => {
    const [lead, ...rest] = players.slice(0, 5).map((h) => h.player);
    if (!lead) return [];
    const left = rest.filter((_, i) => i % 2 === 1).reverse();
    const right = rest.filter((_, i) => i % 2 === 0);
    return [...left, lead, ...right].map((p) => ({ player: p, club, action: p === lead ? ('celebrate' as const) : undefined }));
  }, [players, club]);
  const tape = players.slice(0, 22);
  return (
    <section className={`ch${champion ? ' is-champ' : ''}`} aria-label={`${title}, ${typeof kicker === 'string' ? kicker : 'club'}`}>
      <StadiumHeader
        club={club}
        players={stage}
        size="m"
        height={240}
        kicker={kicker}
        title={title}
        onPlayer={onPlayer}
        right={led ? <LedBoard label={led.label} value={led.value} sub={led.sub} dot={3} /> : undefined}
      />
      {tape.length > 0 && (
        <div className="sx-tape ch-tape" aria-label={`${title} players`}>
          {[0, 1].map((copy) => (
            <div key={copy} className={`sx-tape__track${copy === 1 ? ' sx-tape__track--dup' : ''}`} aria-hidden={copy === 1 || undefined}>
              {tape.map(({ player, badge }) => (
                <button
                  key={`${player.position}:${player.name}`}
                  type="button"
                  className="sx-tape__item ch-tape__btn"
                  tabIndex={copy === 1 ? -1 : undefined}
                  {...peekProps(player)}
                  onClick={() => onPlayer(player)}
                  aria-label={`Open ${displayName(player.name)}`}
                >
                  <ClubStrip club={club} size="sm">
                    <span className="sx-tape__pos">{player.position}</span> {displayName(player.name)}
                    {badge != null && <b className="sx-tape__szn">{badge}</b>}
                  </ClubStrip>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {tiles.length + (led ? 1 : 0) > 0 && (
        <Reveal as="ul" className="ch-tiles">
          {led && (
            <li className="ch-tile ch-tile--led mo-pop">
              <span className="ch-tile__wm" aria-hidden="true"><TeamLogo team={club} size={64} decorative /></span>
              <b className="num is-gold">{led.value}</b>
              <span>{led.label}{led.sub ? ` · ${led.sub}` : ''}</span>
            </li>
          )}
          {tiles.map((t, i) => (
            <li key={t.label} className="ch-tile mo-pop" style={stag(i, 60)}>
              <span className="ch-tile__wm" aria-hidden="true"><TeamLogo team={club} size={64} decorative /></span>
              <b className={`num${t.gold ? ' is-gold' : ''}`}>
                {typeof t.value === 'number' ? <>{t.prefix}<CountUp value={t.value} />{t.suffix}</> : t.value}
              </b>
              <span>{t.label}</span>
            </li>
          ))}
        </Reveal>
      )}
      {children}
      {ribbon && (
        <p className="ch-ribbon">
          {champion && <PixelIcon name="trophy" size={12} />}
          {ribbon}
        </p>
      )}
    </section>
  );
};

export default ClubStageHero;
