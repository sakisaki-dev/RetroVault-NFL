import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import TeamLogo from '@/components/brand/TeamLogo';
import { StarSprite } from '@/components/season/NflSeasonExtras';
import { getReadableTextOn } from '@/utils/teamColors';
import { useGameSprites } from '@/utils/gameSprites';
import { seasonLabel } from '@/config/edition';
import { displayName } from '@/utils/displayName';
import { divisionKey, type FranchiseRecord, type TeamSummary } from '../teamStats';
import { ArcadeToggle, SectionHeader } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { pctText, recordLine, useAllTimeRecords, winPct, type AllTime, type AllTimeRecord } from './allTime';
import './clubWall.css';
import './franchise.css';

type Conf = 'all' | 'AFC' | 'NFC';
type Sort = 'power' | 'titles' | 'winpct' | 'playoffs' | 'name' | 'division';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'power', label: 'All-time power' },
  { value: 'titles', label: 'Titles' },
  { value: 'winpct', label: 'Win %' },
  { value: 'playoffs', label: 'Playoff trips' },
  { value: 'name', label: 'A–Z' },
  { value: 'division', label: 'Division' },
];
const CONFS: { value: Conf; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'AFC', label: 'AFC' },
  { value: 'NFC', label: 'NFC' },
];

const stars = (n: number) => (n <= 0 ? '' : n <= 3 ? '★'.repeat(n) : `★×${n}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Club {
  s: TeamSummary;
  rec?: FranchiseRecord;
  at?: AllTimeRecord;
  /** greatest players by Career Legacy among everyone with a stint here */
  top: Player[];
}

const factsOf = (c: Club) => {
  const parts: string[] = [];
  if (c.at) parts.push(`${recordLine(c.at)} · ${pctText(winPct(c.at))}`);
  return parts.join(' · ');
};
/** The compact second line: playoff trips and Hall of Famers, each only when there is one */
const extrasOf = (c: Club) => [c.at && c.at.playoffs > 0 ? `PO ${c.at.playoffs}` : '', c.rec && c.rec.hof.length > 0 ? `HOF ${c.rec.hof.length}` : ''].filter(Boolean).join(' · ');

const chipFor = (c: Club, sort: Sort): string | null => {
  const titles = c.rec?.titles ?? 0;
  const apps = c.rec?.appearances ?? 0;
  if (sort === 'titles') return titles > 0 ? plural(titles, 'title') : apps > 0 ? plural(apps, 'SB trip') : null;
  if (sort === 'winpct') return c.at ? pctText(winPct(c.at)) : null;
  if (sort === 'playoffs') return c.at && c.at.playoffs > 0 ? plural(c.at.playoffs, 'trip') : null;
  return null;
};

const aria = (c: Club) => {
  const { s, rec, at, top } = c;
  return `${s.label}${s.team ? `, ${s.team.conference} ${s.team.division}` : ''}. ${at ? `All-time record ${recordLine(at)}, ${pctText(winPct(at))}. ` : ''}${rec ? `${plural(rec.titles, 'Super Bowl title')}, ${plural(rec.appearances, 'appearance')}. ` : ''}${at?.playoffs ? `${plural(at.playoffs, 'playoff trip')}. ` : ''}${rec?.hof.length ? `${plural(rec.hof.length, 'Hall of Famer')}. ` : ''}${top[0] ? `Greatest player ${displayName(top[0].name)}. ` : ''}Open club page`;
};

interface TileProps {
  club: Club;
  place?: number;
  lead?: boolean;
  sort: Sort;
  hasSprites: boolean;
  allTime: AllTime | null;
  onOpen: (key: string) => void;
  at?: number;
}

const Tile = ({ club, place, lead, sort, hasSprites, allTime, onOpen, at = 0 }: TileProps) => {
  const { s, rec, top } = club;
  const t = s.team!;
  const primary = t.primaryColor;
  const secondary = t.secondaryColor !== t.primaryColor ? t.secondaryColor : '226 33% 18%';
  const titles = rec?.titles ?? 0;
  const apps = rec?.appearances ?? 0;
  const chip = chipFor(club, sort);
  const sprites = lead ? (top.length === 3 ? [top[1], top[0], top[2]] : top) : top.slice(0, 1);
  const last = rec?.titleYears.length ? Math.max(...rec.titleYears) : null;
  const span = allTime ? `${allTime.from}–${allTime.to}` : '';
  const stat = (label: string, value: string | number) => (
    <span className="fw-stat">
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
  return (
    <div
      className={cn('cw-tile mo-rise', lead ? 'cw-tile--lead fw-lead' : 'cw-tile--thin', titles > 0 && 'cw-tile--champ', place && !lead && 'cw-tile--rank')}
      style={{
        ...stag(at, 40),
        ['--p' as string]: `hsl(${primary})`,
        ['--s' as string]: `hsl(${secondary})`,
        background: `linear-gradient(155deg, hsl(${primary}) 0%, hsl(${primary}) 55%, hsl(${secondary}) 150%)`,
        color: getReadableTextOn(primary),
      }}
    >
      <button type="button" className="cw-hit" onClick={() => onOpen(s.key)} aria-label={aria(club)} title={`${t.city} ${t.name}${span ? ` · ${span}` : ''}`} />
      <span aria-hidden="true" className="cw-bglogo">
        <TeamLogo team={t} size={lead ? 340 : 170} decorative />
      </span>
      {place ? (
        <span aria-hidden="true" className={cn('cw-rank', 'cw-rank--big', lead && 'fw-lead__rank')}>
          #{place}
        </span>
      ) : null}
      <span className="cw-text">
        {lead ? (
          <span className="cw-city">
            <TeamLogo team={t} size={20} decorative />
            {t.city} · who runs the league
          </span>
        ) : (
          <TeamLogo team={t} size={26} decorative className="cw-mini" />
        )}
        <span className="cw-id">
          <span className="cw-name">
            {t.name}
            {!lead && titles > 0 && <span className="cw-ttl fw-ttl" title={plural(titles, 'Super Bowl title')}>{stars(titles)}</span>}
          </span>
          {!lead && (
            <span className="cw-facts">
              {factsOf(club)}
              {!chip && extrasOf(club) ? ` · ${extrasOf(club)}` : ''}
            </span>
          )}
        </span>
        {lead ? (
          <span className="fw-stats">
            {club.at && stat(`${span} record`, recordLine(club.at))}
            {club.at && stat('win %', pctText(winPct(club.at)))}
            {titles > 0 && stat(titles === 1 ? 'title' : 'titles', titles)}
            {apps > 0 && stat('SB trips', apps)}
            {club.at && club.at.playoffs > 0 && stat('playoff trips', club.at.playoffs)}
            {rec && rec.hof.length > 0 && stat(rec.hof.length === 1 ? 'Hall of Famer' : 'Hall of Famers', rec.hof.length)}
          </span>
        ) : (
          <span className="cw-row">
            {chip && <span className="cw-rec">{chip}</span>}
          </span>
        )}
        {lead && last && <span className="cw-last">Last title {seasonLabel(last)}</span>}
      </span>
      {hasSprites && sprites.length > 0 && (
        <span className={cn('cw-sprites', lead && 'cw-sprites--lead')} aria-hidden="true">
          {sprites.map((p, i) => (
            <span key={p.name + p.position} className="cw-fig mo-rise" style={stag(at + i + 2, 70)}>
              <StarSprite name={p.name} pos={p.position} team={t.name} size="s" kind={lead ? 'figure' : 'bust'} celebrate={lead ? i === (sprites.length === 3 ? 1 : 0) : false} />
            </span>
          ))}
        </span>
      )}
    </div>
  );
};

interface Props {
  teams: TeamSummary[];
  records: Map<string, FranchiseRecord>;
  onOpen: (key: string) => void;
}

/**
 * Stats → Teams, NFL edition: the franchise wall, all time. Every card is the club's 1999–2025 record and win %, its
 * Super Bowl titles and trips, playoff trips and Hall of Famers, with its greatest player (Career Legacy, among everyone
 * with a stint there) in the club's kit. The all-time power No. 1 gets the big card with its three greatest players.
 */
const FranchiseWall = ({ teams, records, onOpen }: Props) => {
  const [sort, setSort] = useState<Sort>('power');
  const [conf, setConf] = useState<Conf>('all');
  const sprites = useGameSprites();
  const allTime = useAllTimeRecords();

  const clubs = useMemo(() => {
    const all = teams
      .filter((t) => t.team)
      .map<Club>((s) => ({ s, rec: records.get(s.key), at: allTime?.byClub.get(s.team!.name), top: s.franchisePlayers.slice(0, 3) }));
    const byPower = (a: Club, b: Club) => (a.rec?.powerRank ?? 99) - (b.rec?.powerRank ?? 99);
    const rank = new Map([...all].sort(byPower).map((c, i) => [c.s.key, i + 1]));
    const num = (c: Club, f: (c: Club) => number) => f(c);
    const sorted = all.filter((c) => conf === 'all' || c.s.team!.conference === conf);
    const by = (f: (c: Club) => number) => sorted.sort((a, b) => num(b, f) - num(a, f) || byPower(a, b));
    switch (sort) {
      case 'titles':
        by((c) => (c.rec?.titles ?? 0) * 100 + (c.rec?.appearances ?? 0));
        break;
      case 'winpct':
        by((c) => (c.at ? winPct(c.at) : 0));
        break;
      case 'playoffs':
        by((c) => (c.at?.playoffs ?? 0) * 100 + (c.at ? winPct(c.at) : 0));
        break;
      case 'name':
        sorted.sort((a, b) => a.s.team!.name.localeCompare(b.s.team!.name));
        break;
      case 'division':
        sorted.sort((a, b) => divisionKey(a.s).localeCompare(divisionKey(b.s)) || byPower(a, b));
        break;
      default:
        sorted.sort(byPower);
    }
    return { sorted, rank };
  }, [teams, records, allTime, conf, sort]);

  const boards = useMemo(() => {
    if (sort !== 'division') return null;
    const out: { label: string; clubs: Club[] }[] = [];
    clubs.sorted.forEach((c) => {
      const lab = `${c.s.team!.conference} ${c.s.team!.division}`;
      const last = out.at(-1);
      if (last?.label === lab) last.clubs.push(c);
      else out.push({ label: lab, clubs: [c] });
    });
    return out;
  }, [clubs, sort]);

  const showRank = sort === 'power' || sort === 'titles' || sort === 'winpct' || sort === 'playoffs';
  const tile = (c: Club, i: number) => (
    <Tile
      key={c.s.key}
      club={c}
      lead={sort === 'power' && conf === 'all' && i === 0}
      place={sort === 'power' ? clubs.rank.get(c.s.key) : showRank ? i + 1 : undefined}
      sort={sort}
      hasSprites={!!sprites}
      allTime={allTime}
      onOpen={onOpen}
      at={i % 12}
    />
  );

  return (
    <section aria-label="Franchise wall" className="cw fw space-y-3">
      <div className="cw-bar">
        <SectionHeader title="Franchise wall" kicker={`${clubs.sorted.length} clubs${allTime ? ` · ${allTime.from}–${allTime.to}` : ''}`} className="cw-head" />
        <div className="cw-controls">
          <ArcadeToggle<Sort> label="Sort" size="sm" value={sort} onChange={setSort} options={SORTS} />
          <ArcadeToggle<Conf> label="Conference" size="sm" value={conf} onChange={setConf} options={CONFS} />
        </div>
      </div>
      {boards ? (
        <div className="cw-boards">
          {boards.map((b) => (
            <Reveal key={b.label} className="cw-board">
              <h3 className="cw-board__h">{b.label}</h3>
              <div className="cw-board__tiles">{b.clubs.map((c, i) => tile(c, i + 1))}</div>
            </Reveal>
          ))}
        </div>
      ) : (
        <Reveal className="cw-wall fw-wall">{clubs.sorted.map((c, i) => tile(c, i))}</Reveal>
      )}
      <p className="sx-note">
        Regular-season record{allTime ? ` ${allTime.from}–${allTime.to}` : ''}, playoff trips (PO) from the postseason games, Hall of Famers (HOF) with a stint at the club. The player on each card is the greatest by Career Legacy who played there.
      </p>
    </section>
  );
};

export default FranchiseWall;
