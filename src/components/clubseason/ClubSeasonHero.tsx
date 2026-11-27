import ClubStrip from '@/components/brand/ClubStrip';
import { useMemo, type CSSProperties } from 'react';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { PixelIcon } from '@/components/arcade';
import { peekKeyProps } from '@/components/peek/peekProps';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import { sitePos } from '@/components/season/NflSeasonExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { useGameSprites } from '@/utils/gameSprites';
import type { SeasonResult, Ticket } from '@/utils/clubSeason';
import type { TableRow } from '@/utils/schedule';
import type { RosterEntry } from './ClubSeasonParts';

const nf = (n: number) => n.toLocaleString('en-US');
export const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`;
};
export const surname = (name: string) => {
  const w = name.replace(/\s+(Jr\.|Sr\.|II|III|IV|V)$/, '').split(' ');
  const i = w.findIndex((x, j) => j > 0 && /^(Van|Von|De|Del|Da|St\.)$/.test(x));
  return (i > 0 ? w.slice(i) : w.slice(-1)).join(' ');
};

/** The face of the season: the best SZN off the line (OL has no rating), then awards, the skill positions, games */
export const coverStar = (rows: RosterEntry[]): RosterEntry | null =>
  [...rows]
    .filter((r) => r.szn != null && r.pos !== 'OL' && r.g > 0)
    .sort(
      (a, b) =>
        (b.szn ?? 0) - (a.szn ?? 0) ||
        (b.aw?.length ?? 0) - (a.aw?.length ?? 0) ||
        Number(['QB', 'RB', 'WR', 'TE'].includes(b.pos)) - Number(['QB', 'RB', 'WR', 'TE'].includes(a.pos)) ||
        b.g - a.g ||
        a.k.localeCompare(b.k),
    )[0] ?? null;

interface Line {
  big: string;
  text: string;
}
/** Up to three coverlines, every figure from the season's lines and table row */
const coverLines = (rows: RosterEntry[], cell: TableRow | null): Line[] => {
  const out: Line[] = [];
  const qb = rows.filter((r) => r.pos === 'QB' && (r.pyds ?? 0) > 0).sort((a, b) => (b.att ?? 0) - (a.att ?? 0))[0];
  if (qb?.pyds) out.push({ big: nf(qb.pyds), text: `${surname(qb.name)}'s passing yards` });
  const skill = rows
    .filter((r) => r.pos !== 'QB')
    .flatMap((r) => [
      { r, v: r.ryds ?? 0, what: 'rushing yards' },
      { r, v: r.recyds ?? 0, what: 'receiving yards' },
    ])
    .sort((a, b) => b.v - a.v)[0];
  if (skill && skill.v > 0) out.push({ big: nf(skill.v), text: `${surname(skill.r.name)}'s ${skill.what}` });
  if (out.length < 2) {
    const tk = [...rows].sort((a, b) => (b.tkl ?? 0) - (a.tkl ?? 0))[0];
    if (tk?.tkl) out.push({ big: nf(tk.tkl), text: `${surname(tk.name)}'s tackles` });
  }
  if (cell) {
    const d = cell.diff;
    out.push({ big: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}`, text: `point differential${cell.oneScore ? `, ${cell.oneScore} in one-score games` : ''}` });
  }
  return out.slice(0, 3);
};

interface Props {
  club: string;
  year: number;
  record: string;
  cell: TableRow | null;
  result: SeasonResult;
  /** The last playoff game (the footer ribbon's score) */
  lastPost: Ticket | null;
  rows: RosterEntry[];
  onPick: (key: string) => void;
}

/**
 * The programme cover (concept C): the club's flat colour, its name as a huge masthead, the game's crowd and stand front
 * painted in its colours, the season's best player celebrating big on the turf, the record as a badge, three coverlines
 * with real figures and a footer ribbon with how the season ended. The public build (no private sprites) shows the club
 * logo where the player stands.
 */
const ClubSeasonHero = ({ club, year, record, cell, result, lastPost, rows, onPick }: Props) => {
  const team = findNFLTeam(club);
  const art = useFieldArt(club, 'day');
  const sprites = useGameSprites();
  const star = useMemo(() => coverStar(rows), [rows]);
  const lines = useMemo(() => coverLines(rows, cell), [rows, cell]);
  const name = (team?.name ?? club).toUpperCase();
  const place = cell?.division && cell.divisionRank ? `${ordinal(cell.divisionRank)} ${cell.division}` : '';
  const foot = [
    result.text || (record ? `Record ${record}` : ''),
    lastPost?.r ? `${lastPost.home ? 'vs' : '@'} ${lastPost.opp} ${lastPost.pf}-${lastPost.pa}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <section className={`pg-cover${result.champion ? ' is-champ' : ''}`} style={{ ['--n' as string]: Math.max(5, name.length) } as CSSProperties} aria-label={`${year} ${team?.fullName ?? club} season programme`}>
      <div className={`pg-cover__crowd${art.crowd ? ' is-art' : ''}`} style={art.crowd ? { backgroundImage: `url(${art.crowd})` } : undefined} aria-hidden="true" />
      {art.stands && <div className="pg-cover__stands" style={{ backgroundImage: `url(${art.stands})` }} aria-hidden="true" />}
      <span className="pg-cover__wm" aria-hidden="true"><TeamLogo team={club} size={360} decorative /></span>
      <div className={`pg-cover__turf${art.turf ? ' is-art' : ''}`} style={art.turf ? { backgroundImage: `url(${art.turf})` } : undefined} aria-hidden="true" />
      <div className="pg-mast mo-fade">
        <span className="pg-vol">{year} · Season programme</span>
        <h2>{name}</h2>
      </div>
      {star && (
        <button
          type="button"
          className={`pg-cover__hero${sprites ? '' : ' is-logo'}`}
          data-peek-ok
          {...peekKeyProps(star.k)}
          onClick={() => onPick(star.k)}
          aria-label={`${star.name}, the cover star${star.szn != null ? `, season rating ${star.szn}` : ''}. Open player card`}
        >
          {sprites ? (
            <span className="pg-cover__sp">
              <GameSprite player={{ name: star.name, position: sitePos(star.pos) as never, team: club, bannerTeam: club }} team={club} kind="figure" size="m" season={year} action="celebrate" />
            </span>
          ) : (
            <TeamLogo team={club} size={220} decorative />
          )}
          <span className="pg-cover__who"><ClubStrip team={club} label={star.name} size="sm" />{star.szn != null && <i className="num">SZN {star.szn}</i>}</span>
        </button>
      )}
      <div className="pg-badge mo-pop" aria-label={`Record ${record}${place ? `, ${place}` : ''}`}>
        {result.champion && <PixelIcon name="trophy" size={16} />}
        <b className="num">{record || '–'}</b>
        {place && <span>{place}</span>}
      </div>
      {lines.length > 0 && (
        <ul className="pg-lines">
          {lines.map((l) => (
            <li key={l.text}><b className="num">{l.big}</b>{l.text}</li>
          ))}
        </ul>
      )}
      {foot && <div className="pg-cover__foot">{result.champion && <PixelIcon name="trophy" size={11} />}{foot}</div>}
    </section>
  );
};

export default ClubSeasonHero;
