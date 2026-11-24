import type { CSSProperties, ReactNode } from 'react';
import { Plus } from 'lucide-react';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn } from '@/utils/teamColors';
import { bannerTeamOf } from '@/utils/playerExtras';
import { useJerseyNumbers } from '@/utils/jerseys';
import type { PlayerProfile } from '@/utils/teamLab';
import type { InjuryCode } from '@/utils/injuries';
import { FIELD_ART, type FieldArt, type Turf } from '../fieldArt';
import { PixelPlayer } from '../labArt';
import PixelLoader from '@/components/ui/PixelLoader';
import { peekProps } from '@/components/peek/peekProps';
import { displayName, surnameOf } from '@/utils/displayName';

/**
 * The NFL Team Lab field: the same turf, line of scrimmage and spots as the Retro Bowl lab's, for any set of spots
 * (22 starters in formation, or the fantasy lineup). A spot is a button that opens that slot's picker.
 */
export interface FieldItem {
  id: string;
  x: number;
  y: number;
  /** slot label shown on an empty spot / above the name ("QB", "LT") */
  label: string;
  profile?: PlayerProfile;
  /** a team defence stands as its logo plaque */
  dst?: string;
  /** replaces the grade chip (a projection, a salary) */
  badge?: ReactNode;
  injury?: InjuryCode;
  /** the kit he wears: his own club's, or the whole lineup's */
  kit?: string;
}

const YARDS = [10, 20, 30, 40, 50, 40, 30, 20, 10];
const INJ_COLOR: Record<InjuryCode, string> = { IR: '#ef4444', Out: '#ef4444', Doubtful: '#f97316', Questionable: '#facc15' };

interface Props {
  items: FieldItem[];
  kitClub: string;
  turf: Turf;
  art: FieldArt;
  tall: boolean;
  size: 's' | 'm' | 'l';
  onPick: (id: string) => void;
  overlay?: ReactNode;
  /** show the Offense / Defense captions (team lab) */
  sides?: boolean;
  className?: string;
}

const NflField = ({ items, kitClub, turf, art, tall, size, onPick, overlay, sides = true, className = '' }: Props) => {
  const { numberFor } = useJerseyNumbers();
  const team = findNFLTeam(kitClub);
  const vars = {
    '--lf-c1': team ? `hsl(${team.primaryColor})` : 'hsl(var(--turf))',
    '--lf-c2': team ? `hsl(${team.secondaryColor})` : 'hsl(var(--gold))',
    ...(art.turf ? { '--lf-turf': `url("${art.turf}")` } : {}),
  } as CSSProperties;
  const big = size !== 's';
  const pixelUnit = size === 'l' ? 4 : size === 'm' ? 3 : 2;
  return (
    <div
      className={`lab-field nfl-field ${tall ? 'lab-field--tall' : 'lab-field--wide'} ${art.turf ? 'lab-field--art' : art.pending ? 'lab-field--pending' : 'lab-field--css'} lab-field--${turf} ${className}`}
      style={vars}
      role="group"
      aria-label="Lineup on the field"
    >
      {art.turf && <span className="lab-field-veil" aria-hidden="true" />}
      {art.pending && <PixelLoader size="sm" label="Field" what="the field" className="lab-field-loader" />}
      {!art.turf && !art.pending && <span className="lab-field-lines" aria-hidden="true" />}
      {!art.turf && !art.pending &&
        YARDS.map((n, i) =>
          [0, 1].map((side) => (
            <span key={`${i}-${side}`} className="lab-yard" aria-hidden="true" style={tall ? { top: `${(i + 1) * 10}%`, [side ? 'right' : 'left']: '7%' } : { left: `${(i + 1) * 10}%`, [side ? 'bottom' : 'top']: side ? '17%' : '15%' }}>
              {n}
            </span>
          )),
        )}
      <span className="lab-field-logo" aria-hidden="true">
        <TeamLogo team={kitClub} size={size === 'l' ? 190 : big ? 150 : 96} decorative />
      </span>
      {sides && (
        <>
          <span className="lab-los" aria-hidden="true" />
          <span className="lab-side lab-side--o" aria-hidden="true">Offense</span>
          <span className="lab-side lab-side--d" aria-hidden="true">Defense</span>
        </>
      )}
      {items.map((it) => {
        const style = { left: `${it.x}%`, top: `${it.y}%` } as CSSProperties;
        if (it.dst) {
          const t = findNFLTeam(it.dst);
          return (
            <button key={it.id} type="button" className="lab-spot nfl-dst" style={style} onClick={() => onPick(it.id)} aria-label={`${t?.name ?? it.dst} defense. Change`}>
              <span className="nfl-dst-plate" style={{ '--tg-c': t ? `hsl(${t.primaryColor})` : '#333' } as CSSProperties}>
                <TeamLogo team={it.dst} size={size === 's' ? 46 : 64} decorative />
              </span>
              <span className="lab-tag" style={{ '--tg-c': t ? `hsl(${t.primaryColor})` : 'hsl(var(--line))', '--tg-fg': t ? getReadableTextOn(t.primaryColor) : '#fff' } as CSSProperties}>
                <b>D/ST</b>
                <span className="lab-tag-name">{t?.name ?? it.dst}</span>
                {it.badge && <i className="lab-tag-grade nfl-badge">{it.badge}</i>}
              </span>
            </button>
          );
        }
        const p = it.profile;
        if (!p)
          return (
            <button key={it.id} type="button" className="lab-spot lab-spot--empty" style={style} onClick={() => onPick(it.id)} aria-label={`Pick a player for ${it.label}`}>
              <span className="lab-ghost"><Plus aria-hidden="true" /></span>
              <span className="lab-tag lab-tag--empty">{it.label}</span>
            </button>
          );
        const c = findNFLTeam(bannerTeamOf(p.player));
        const tagVars = { '--tg-c': c ? `hsl(${c.primaryColor})` : 'hsl(var(--line))', '--tg-fg': c ? getReadableTextOn(c.primaryColor) : '#fff' } as CSSProperties;
        const kit = it.kit ?? kitClub;
        return (
          <button key={it.id} type="button" className="lab-spot" style={style} {...peekProps(p.player)} onClick={() => onPick(it.id)} aria-label={`${it.label} ${displayName(p.name)}. Change`}>
            <span className="lab-fig">
              {FIELD_ART ? <GameSprite player={p.player} team={kit} kind="figure" size={size} /> : <PixelPlayer club={kit} number={numberFor(p.player)} unit={pixelUnit} />}
              {it.injury && (
                <span className="nfl-inj" style={{ background: INJ_COLOR[it.injury] }} title={it.injury} aria-label={`Injury: ${it.injury}`}>
                  {it.injury === 'IR' ? 'IR' : it.injury[0]}
                </span>
              )}
            </span>
            <span className="lab-tag" style={tagVars}>
              <b>{it.label}</b>
              <span className="lab-tag-name">{surnameOf(p.name)}</span>
              {it.badge ? (
                <i className="lab-tag-grade nfl-badge">{it.badge}</i>
              ) : (
                p.grade && <i className="lab-tag-grade" style={{ background: p.grade.color }}>{p.grade.grade}</i>
              )}
            </span>
          </button>
        );
      })}
      {overlay && <div className="lab-field-overlay">{overlay}</div>}
    </div>
  );
};

export default NflField;
