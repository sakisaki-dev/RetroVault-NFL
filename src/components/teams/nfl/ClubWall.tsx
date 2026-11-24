import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import TeamLogo from '@/components/brand/TeamLogo';
import { StarSprite } from '@/components/season/NflSeasonExtras';
import { isInLeague } from '@/components/InLeague';
import { findNFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn } from '@/utils/teamColors';
import { loadSeasonOvr } from '@/utils/useOfficialOvr';
import { useGameSprites } from '@/utils/gameSprites';
import { useSchedule, useScheduleSeason, type TableRow } from '@/utils/schedule';
import { seasonLabel } from '@/config/edition';
import { displayName } from '@/utils/displayName';
import { divisionKey, sortTeams, type FranchiseRecord, type TeamSortKey, type TeamSummary } from '../teamStats';
import './clubWall.css';

type Conf = 'all' | 'AFC' | 'NFC';
type View = 'wall' | 'grid';
type WallSort = Extract<TeamSortKey, 'division' | 'power' | 'titles' | 'name'>;

const SORTS: { key: WallSort; label: string }[] = [
  { key: 'division', label: 'Division' },
  { key: 'power', label: 'Power' },
  { key: 'titles', label: 'Titles' },
  { key: 'name', label: 'A–Z' },
];
const CONFS: { key: Conf; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'AFC', label: 'AFC' },
  { key: 'NFC', label: 'NFC' },
];

const VIEW_KEY = 'rv:teams:view';
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'wall';
  } catch {
    return 'wall';
  }
};

const stars = (n: number) => (n <= 0 ? '' : n <= 3 ? '★'.repeat(n) : `★×${n}`);

interface Club {
  s: TeamSummary;
  rec?: FranchiseRecord;
  row?: TableRow;
  top: Player[];
}

const Chips = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) => (
  <div role="group" aria-label={label} className="cw-chips">
    {options.map((o) => (
      <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)} className={cn('cw-chip', value === o.key && 'is-on')}>
        {o.label}
      </button>
    ))}
  </div>
);

const useNarrow = () => {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
};

interface TileProps {
  club: Club;
  firstSeason: number;
  season: number | null;
  onOpen: (key: string) => void;
  /** Big power rank in the corner (the Power sort) */
  bigRank?: boolean;
  leader?: boolean;
  hasSprites: boolean;
  narrow: boolean;
}

const lastTitleLine = (rec: FranchiseRecord | undefined, firstSeason: number) => {
  const last = rec?.titleYears.length ? Math.max(...rec.titleYears) : null;
  return last ? { text: `Last title ${seasonLabel(last)}`, none: false } : { text: firstSeason ? `No title since ${seasonLabel(firstSeason)}` : 'No title on record', none: true };
};

const label = ({ club, season }: { club: Club; season: number | null }) => {
  const { s, rec, row, top } = club;
  return `${s.label}${s.team ? `, ${s.team.conference} ${s.team.division}` : ''}. ${row ? `${season ? seasonLabel(season) + ' record ' : 'Record '}${row.record}. ` : ''}Power rank ${row?.power ?? rec?.powerRank ?? '—'}. ${rec?.titles ?? 0} titles.${top[0] ? ` Star ${displayName(top[0].name)}.` : ''} Open club page`;
};

/** The 2026 power rank (the ladder's number), else the all-time one */
const rankOf = (c: Club) => c.row?.power ?? c.rec?.powerRank ?? 99;

const Tile = ({ club, firstSeason, season, onOpen, bigRank, leader, hasSprites, narrow }: TileProps) => {
  const { s, rec, row, top } = club;
  const t = s.team!;
  const primary = t.primaryColor;
  const secondary = t.secondaryColor !== t.primaryColor ? t.secondaryColor : '226 33% 18%';
  const fg = getReadableTextOn(primary);
  const titles = rec?.titles ?? 0;
  const last = lastTitleLine(rec, firstSeason);
  const sprites = leader ? (top.length === 3 ? [top[1], top[0], top[2]] : top) : top.slice(0, 1);
  return (
    <button
      type="button"
      onClick={() => onOpen(s.key)}
      aria-label={label({ club, season })}
      title={`${t.city} ${t.name} · ${last.text}`}
      className={cn('cw-tile', !leader && 'cw-tile--thin', leader && 'cw-tile--lead', titles > 0 && 'cw-tile--champ', bigRank && 'cw-tile--rank')}
      style={{
        ['--p' as string]: `hsl(${primary})`,
        ['--s' as string]: `hsl(${secondary})`,
        background: `linear-gradient(155deg, hsl(${primary}) 0%, hsl(${primary}) 55%, hsl(${secondary}) 150%)`,
        color: fg,
      }}
    >
      <span aria-hidden="true" className="cw-bglogo">
        <TeamLogo team={t} size={leader ? 340 : 170} decorative />
      </span>
      {(row || rec) && (
        <span aria-hidden="true" className={cn('cw-rank', bigRank && 'cw-rank--big')}>
          {leader && !bigRank ? 'DIV LEADER · ' : ''}#{rankOf(club)}
        </span>
      )}
      <span className="cw-text">
        {leader ? (
          <span className="cw-city">
            <TeamLogo team={t} size={20} decorative />
            {t.city}
          </span>
        ) : (
          <TeamLogo team={t} size={26} decorative className="cw-mini" />
        )}
        <span className="cw-name">{t.name}</span>
        <span className="cw-row">
          {row && <span className="cw-rec">{leader && season ? `${seasonLabel(season)} ` : ''}{row.record}</span>}
          {titles > 0 && <span className="cw-ttl">{stars(titles)}</span>}
        </span>
        {leader && <span className={cn('cw-last', last.none && 'is-none')}>{last.text}</span>}
      </span>
      {hasSprites && sprites.length > 0 && (
        <span className={cn('cw-sprites', leader && 'cw-sprites--lead')} aria-hidden="true">
          {sprites.map((p, i) => (
            <span key={p.name + p.position} className="cw-fig">
              <StarSprite name={p.name} pos={p.position} team={t.name} size="s" kind={leader ? 'figure' : 'bust'} celebrate={leader ? i === (sprites.length === 3 ? 1 : 0) : false} />
            </span>
          ))}
        </span>
      )}
    </button>
  );
};

const Strip = ({ club, place, season, onOpen }: { club: Club; place: number; season: number | null; onOpen: (key: string) => void }) => {
  const { s, rec, row } = club;
  const t = s.team!;
  const fg = getReadableTextOn(t.primaryColor);
  const titles = rec?.titles ?? 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(s.key)}
      aria-label={label({ club, season })}
      className="cw-strip"
      style={{ background: `linear-gradient(100deg, hsl(${t.primaryColor}) 0%, hsl(${t.primaryColor}) 60%, hsl(${t.secondaryColor !== t.primaryColor ? t.secondaryColor : '226 33% 18%'}) 160%)`, color: fg }}
    >
      <span className="cw-strip__n">{place}</span>
      <span className="cw-strip__abbr">{t.abbreviation}</span>
      <span className="cw-strip__name">
        <small>{t.city}</small>
        {t.name}
      </span>
      <span className="cw-strip__ttl">{stars(titles)}</span>
      <span className="cw-strip__rec">{row?.record ?? '–'}</span>
    </button>
  );
};

interface Props {
  teams: TeamSummary[];
  records: Map<string, FranchiseRecord>;
  league: Player[];
  firstSeason: number;
  onOpen: (key: string) => void;
}

/**
 * The top of Stats → Teams, NFL edition: the club wall. Division sort = one board per division, clubs in standings
 * order, the leader a double-height card with its top three players over its logo; the other sorts a plain wall.
 * Grid view = compact strips in the same order. Every number comes from the page's own data (schedule table, Super Bowls).
 */
const ClubWall = ({ teams, records, league, firstSeason, onOpen }: Props) => {
  const [sort, setSort] = useState<WallSort>('division');
  const [conf, setConf] = useState<Conf>('all');
  const [view, setView] = useState<View>(readView);
  const sprites = useGameSprites();
  const narrow = useNarrow();
  void narrow;
  const { dataVersion } = useLeague();

  const [ovr, setOvr] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let live = true;
    void loadSeasonOvr().then((f) => live && setOvr(f?.ovr ?? {}));
    return () => {
      live = false;
    };
  }, []);

  const schedule = useSchedule();
  const seasonId = useMemo(() => {
    const ids = schedule ? Object.keys(schedule.seasons) : [];
    return ids.length ? ids.sort((a, b) => Number(b) - Number(a))[0] : null;
  }, [schedule]);
  const sched = useScheduleSeason(schedule, seasonId) ?? null;
  const season = seasonId ? Number(seasonId) : null;

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  };

  const clubs = useMemo(() => {
    const rows = new Map<string, TableRow>((sched?.table ?? []).map((r) => [r.team, r]));
    const byClub = new Map<string, Player[]>();
    league.forEach((p) => {
      if (p.isRealLegend || !isInLeague(p)) return;
      const n = findNFLTeam(p.team)?.name;
      if (n) byClub.set(n, [...(byClub.get(n) ?? []), p]);
    });
    const score = (p: Player) => ovr?.[`${p.position}:${p.name}`] ?? -1;
    const wanted = teams.filter((t) => t.team && (conf === 'all' || t.team.conference === conf));
    const sorted = sortTeams(wanted, sort === 'division' ? 'division' : sort, records);
    if (sort === 'power') sorted.sort((a, b) => (rows.get(a.team!.name)?.power ?? 99) - (rows.get(b.team!.name)?.power ?? 99));
    return sorted.map<Club>((s) => ({
      s,
      rec: records.get(s.key),
      row: rows.get(s.team!.name),
      top: (byClub.get(s.team!.name) ?? []).sort((a, b) => score(b) - score(a) || (b.careerLegacy ?? 0) - (a.careerLegacy ?? 0)).slice(0, 3),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, records, league, sched, ovr, conf, sort, dataVersion]);

  const boards = useMemo(() => {
    if (sort !== 'division') return null;
    const out: { label: string; clubs: Club[] }[] = [];
    clubs.forEach((c) => {
      const lab = `${c.s.team!.conference} ${c.s.team!.division}`;
      const last = out.at(-1);
      if (last?.label === lab) last.clubs.push(c);
      else out.push({ label: lab, clubs: [c] });
    });
    const pct = (c: Club) => (c.row ? (c.row.w + c.row.t / 2) / Math.max(1, c.row.w + c.row.l + c.row.t) : 0);
    out.forEach((b) => b.clubs.sort((x, y) => pct(y) - pct(x) || rankOf(x) - rankOf(y)));
    return out;
  }, [clubs, sort]);

  const tileProps = { firstSeason, season, onOpen, hasSprites: !!sprites, narrow };
  void divisionKey;

  return (
    <section aria-labelledby="club-wall-heading" className="cw space-y-3">
      <div className="cw-bar">
        <h2 id="club-wall-heading" className="section-title text-2xl">
          Club wall
          <span className="font-pixel text-[9px] text-muted-foreground">{clubs.length}</span>
        </h2>
        <div className="cw-controls">
          <Chips<WallSort> label="Sort" value={sort} options={SORTS} onChange={setSort} />
          <Chips<Conf> label="Conference" value={conf} options={CONFS} onChange={setConf} />
          <Chips<View> label="View" value={view} options={[{ key: 'wall', label: 'Wall' }, { key: 'grid', label: 'Grid' }]} onChange={changeView} />
        </div>
      </div>

      {boards ? (
        <div className="cw-boards">
          {boards.map((b) => (
            <div key={b.label} className="cw-board">
              <h3 className="cw-board__h">{b.label}</h3>
              <div className={view === 'wall' ? 'cw-board__tiles' : 'cw-board__strips'}>
                {b.clubs.map((c, i) =>
                  view === 'wall' ? (
                    <Tile key={c.s.key} club={c} leader={i === 0 && !!c.row} {...tileProps} />
                  ) : (
                    <Strip key={c.s.key} club={c} place={i + 1} season={season} onOpen={onOpen} />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      ) : view === 'wall' ? (
        <div className="cw-wall">
          {clubs.map((c) => (
            <Tile key={c.s.key} club={c} bigRank={sort === 'power'} {...tileProps} />
          ))}
        </div>
      ) : (
        <div className="cw-strips">
          {clubs.map((c, i) => (
            <Strip key={c.s.key} club={c} place={sort === 'power' ? rankOf(c) : i + 1} season={season} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
};

export default ClubWall;
