import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import TeamLogo from '@/components/brand/TeamLogo';
import { StarSprite, clinchTags, playoffSeeds, type Clinch } from '@/components/season/NflSeasonExtras';
import { isInLeague } from '@/components/InLeague';
import { findNFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn } from '@/utils/teamColors';
import { useGameSprites } from '@/utils/gameSprites';
import { normalizeName, usePlayerExtras } from '@/utils/playerExtras';
import type { SeasonView } from '@/utils/seasonLive';
import { ArcadeToggle, PixelIcon } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { usePlayoffOdds } from '@/utils/playoffOdds';
import { openClubSeason, prefetchClubSeason } from '@/utils/clubSeason';
import { SectionTitle } from './SeasonGames';
import { signed } from './seasonGamesUi';
import '@/components/teams/nfl/clubWall.css';
import './seasonWall.css';

type Row = SeasonView['table'][number];
type Sort = 'division' | 'power' | 'record' | 'name';
type Conf = 'all' | 'AFC' | 'NFC';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'division', label: 'Division' },
  { value: 'power', label: 'Power' },
  { value: 'record', label: 'Record' },
  { value: 'name', label: 'A–Z' },
];
const CONFS: { value: Conf; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'AFC', label: 'AFC' },
  { value: 'NFC', label: 'NFC' },
];

interface Club {
  row: Row;
  top: Player[];
}

const divLabel = (r: Row) => (r.division ? (r.division.startsWith(r.conference ?? '') ? r.division : `${r.conference} ${r.division}`) : 'League');
const byRecord = (a: Row, b: Row) => b.pct - a.pct || b.diff - a.diff || (a.power || 99) - (b.power || 99);

interface TileProps {
  club: Club;
  leader?: boolean;
  big?: boolean;
  at: number;
  seed?: number;
  tag?: Clinch;
  champion: boolean;
  made: boolean;
  done: boolean;
  hasSprites: boolean;
  year: string;
}

const Tile = ({ club, leader, big, at, seed, tag, champion, made, done, hasSprites, year }: TileProps) => {
  const { row, top } = club;
  const t = findNFLTeam(row.team);
  if (!t) return null;
  const primary = t.primaryColor;
  const secondary = t.secondaryColor !== t.primaryColor ? t.secondaryColor : '226 33% 18%';
  const sprites = leader ? (top.length === 3 ? [top[1], top[0], top[2]] : top) : top.slice(0, 1);
  const power = Number.isFinite(row.power) ? row.power : null;
  return (
    <div
      className={cn('cw-tile mo-rise', !leader && 'cw-tile--thin', leader && 'cw-tile--lead', champion && 'cw-tile--champ', big && 'cw-tile--rank', done && !made && 'sw-out')}
      style={{
        ...stag(at, 40),
        ['--p' as string]: `hsl(${primary})`,
        ['--s' as string]: `hsl(${secondary})`,
        background: `linear-gradient(155deg, hsl(${primary}) 0%, hsl(${primary}) 55%, hsl(${secondary}) 150%)`,
        color: getReadableTextOn(primary),
      }}
    >
      <button
        type="button"
        className="cw-hit"
        onClick={() => openClubSeason(row.team, Number(year))}
        onPointerEnter={prefetchClubSeason}
        aria-label={`${t.fullName}, ${divLabel(row)}. ${year} record ${row.record}${power ? `, power rank ${power}` : ''}${seed ? `, playoff seed ${seed}` : ''}. Open club page`}
      />
      <span aria-hidden="true" className="cw-bglogo">
        <TeamLogo team={t} size={leader ? 340 : 170} decorative />
      </span>
      {big && power && <span aria-hidden="true" className="cw-rank cw-rank--big">#{power}</span>}
      <span className="cw-text">
        {leader ? (
          <span className="cw-city">
            <TeamLogo team={t} size={20} decorative backed />
            {t.city}
          </span>
        ) : (
          <TeamLogo team={t} size={26} decorative className="cw-mini" />
        )}
        <span className="cw-id">
          <span className="cw-name">{t.name}</span>
          <span className="cw-facts">
            {signed(row.diff)} pts{power ? ` · power #${power}` : ''}
          </span>
        </span>
        <span className="cw-row">
          <span className="cw-rec">{row.record}</span>
          {leader && <span aria-hidden="true" className="cw-rank cw-rank--inline">DIV LEADER</span>}
          {seed ? <span className="sw-tag" title="Playoff seed">#{seed}</span> : null}
          {tag ? <span className={cn('sw-tag', tag === 'out' && 'sw-tag--out')} title="Clinched or eliminated by the games left">{tag === 'div' ? 'Div' : tag === 'in' ? 'In' : 'Out'}</span> : null}
          {champion ? <PixelIcon name="trophy" size={14} color="#ffd84a" label="Champion" /> : done && made ? <PixelIcon name="star" size={12} color="#ffd84a" label="Made the playoffs" /> : null}
        </span>
      </span>
      {hasSprites && sprites.length > 0 && (
        <span className={cn('cw-sprites', leader && 'cw-sprites--lead')} aria-hidden="true">
          {sprites.map((p, i) => (
            <span key={p.name + p.position} className="cw-fig mo-rise" style={stag(at + i + 2, 70)}>
              <StarSprite name={p.name} pos={p.position} team={t.name} size="s" kind={leader ? 'figure' : 'bust'} celebrate={leader ? i === (sprites.length === 3 ? 1 : 0) : false} />
            </span>
          ))}
        </span>
      )}
    </div>
  );
};

/**
 * The Season page's standings: the club wall (moved here from Teams). One board per division, clubs in standings order,
 * the leader a card with its top three players over its logo; the other sorts are a plain wall. Follows the season
 * switcher: records, power rank and the leader are the shown season's, the players are those on the club in that year
 * (career stints), and the playoff seed and clinched / eliminated marks sit on the cards.
 */
const SeasonClubWall = ({ season, upcoming, live }: { season: SeasonView; upcoming?: { away: string; home: string }[]; live: boolean }) => {
  const [sort, setSort] = useState<Sort>('division');
  const [conf, setConf] = useState<Conf>('all');
  const sprites = useGameSprites();
  const { getAllPlayers, dataVersion } = useLeague();
  const extras = usePlayerExtras();
  const year = Number(season.season);

  const seeds = useMemo(() => playoffSeeds(season), [season]);
  const odds = usePlayoffOdds(live);
  // the odds file's marks (proved by a bound check on the standings) lead; the older rule is the fallback
  const tags = useMemo<Map<string, Clinch>>(() => {
    if (season.playoffs?.length) return new Map();
    if (odds && String(odds.season) === season.season && odds.status === 'live') {
      const m = new Map<string, Clinch>();
      Object.entries(odds.clubs).forEach(([abbr, c]) => c.tag && m.set(abbr, c.tag === 'e' ? 'out' : c.tag === 'x' ? 'in' : 'div'));
      return m;
    }
    return upcoming ? clinchTags(season, upcoming) : new Map();
  }, [season, upcoming, odds]);
  const made = useMemo(() => {
    const s = new Set<string>();
    for (const r of season.playoffs ?? []) for (const g of r.games) (s.add(g.away), s.add(g.home));
    return s;
  }, [season.playoffs]);
  const done = made.size > 0;

  // the players on each club that year: stints covering the season (the live season: today's roster), best Career Legacy first
  const byClub = useMemo(() => {
    const m = new Map<string, Player[]>();
    getAllPlayers().forEach((p) => {
      if (p.isRealLegend) return;
      let club: string | undefined;
      if (live) club = isInLeague(p) ? findNFLTeam(p.team)?.name : undefined;
      else club = extras.stints[normalizeName(p.name)]?.stints.map((s) => (s.from <= year && year <= s.to ? findNFLTeam(s.team)?.name : undefined)).find(Boolean);
      if (club) m.set(club, [...(m.get(club) ?? []), p]);
    });
    m.forEach((l) => l.sort((a, b) => (b.careerLegacy ?? 0) - (a.careerLegacy ?? 0)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAllPlayers, dataVersion, extras.stints, year, live]);

  const clubs = useMemo<Club[]>(() => {
    const rows = season.table.filter((r) => conf === 'all' || r.conference === conf);
    const sorted = [...rows];
    if (sort === 'power') sorted.sort((a, b) => (a.power || 99) - (b.power || 99));
    else if (sort === 'record') sorted.sort(byRecord);
    else if (sort === 'name') sorted.sort((a, b) => a.team.localeCompare(b.team));
    return sorted.map((row) => ({ row, top: (byClub.get(findNFLTeam(row.team)?.name ?? row.team) ?? []).slice(0, 3) }));
  }, [season.table, conf, sort, byClub]);

  const boards = useMemo(() => {
    if (sort !== 'division') return null;
    const m = new Map<string, Row[]>();
    clubs.forEach(({ row }) => m.set(divLabel(row), [...(m.get(divLabel(row)) ?? []), row]));
    const lookup = new Map(clubs.map((c) => [c.row.abbr, c]));
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, rows]) => ({ label, clubs: rows.sort((a, b) => (a.divisionRank ?? 9) - (b.divisionRank ?? 9) || byRecord(a, b)).map((r) => lookup.get(r.abbr)!) }));
  }, [clubs, sort]);

  if (!season.table.some((r) => r.division)) return null;
  const shared = (c: Club) => ({
    club: c,
    seed: seeds.get(c.row.abbr),
    tag: tags.get(c.row.abbr),
    champion: season.superBowl?.winner === c.row.team,
    made: made.has(c.row.abbr),
    done,
    hasSprites: !!sprites,
    year: season.season,
  });
  const old = year < 2002;

  return (
    <div className="sx-block cw" id="season-standings" style={{ scrollMarginTop: 80 }}>
      <SectionTitle
        kicker={`${season.season} standings`}
        club={season.table[0]?.team}
        right={
          <div className="sw-controls">
            <ArcadeToggle<Sort> label="Sort" size="sm" value={sort} onChange={setSort} options={SORTS} />
            <ArcadeToggle<Conf> label="Conference" size="sm" value={conf} onChange={setConf} options={CONFS} />
          </div>
        }
      >
        Club wall
      </SectionTitle>
      {boards ? (
        <div className="cw-boards">
          {boards.map((b) => (
            <Reveal key={b.label} className="cw-board">
              <h3 className="cw-board__h">{b.label}</h3>
              <div className="cw-board__tiles">
                {b.clubs.map((c, i) => (
                  <Tile key={c.row.abbr} leader={i === 0} at={i} {...shared(c)} />
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      ) : (
        <Reveal className="cw-wall">
          {clubs.map((c, i) => (
            <Tile key={c.row.abbr} big={sort === 'power'} at={i % 12} {...shared(c)} />
          ))}
        </Reveal>
      )}
      {old && <p className="sx-note">Divisions are shown as aligned today; before 2002 the league had different divisions, so seeds start in 2002.</p>}
      {tags.size > 0 && <p className="sx-note">Div, In and Out: already clinched or eliminated by the games left (ties count as unbroken).</p>}
      {seeds.size > 0 && <p className="sx-note">Seeds: division winners first, then wild cards, each by win percentage then point differential (a simplified tiebreak). Gold star: made the playoffs.</p>}
    </div>
  );
};

export default SeasonClubWall;
