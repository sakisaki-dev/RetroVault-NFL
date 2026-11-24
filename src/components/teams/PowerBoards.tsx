import { useEffect, useMemo, useState } from 'react';
import { Medal, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findNFLTeam } from '@/utils/nflTeams';
import { useLeague } from '@/context/LeagueContext';
import { useGameSprites } from '@/utils/gameSprites';
import type { Player } from '@/types/player';
import type { ScheduleSeason, TeamSeasonRow } from '@/utils/schedule';
import GameSprite from '../GameSprite';
import TeamLogo from '../timeline/TeamLogo';
import { BOARD_BG, LampGrid, color, lampText, signed } from '../season/seasonGamesUi';
import { displayName } from '@/utils/displayName';
import { isInLeague } from '../InLeague';
import { loadSeasonOvr } from '@/utils/useOfficialOvr';
import type { SeasonOvrFile } from '@/config/ovr';
import './powerBoards.css';

/**
 * Stats → Teams boards (owner-approved NFL immersion pass): the season's power ladder, the Season page's ladder rows with a
 * progression sparkline per club (replaces the tangled all-clubs line chart), and the risers and fallers as an LED stock
 * board with each club's star player as a bust. Rules over schedule.json and the league sheet only.
 */

const seasonNum = (s: string) => Number(s.replace(/\D/g, '')) || 0;
const nick = (team: string) => findNFLTeam(team)?.name ?? team;

/** Power rank across the seasons with weekly scores, one tiny line (rank 1 at the top). */
const Spark = ({ rows, clubs, tone }: { rows: TeamSeasonRow[]; clubs: number; tone: string }) => {
  const pts = [...rows].sort((a, b) => seasonNum(a.season) - seasonNum(b.season)).slice(-14);
  if (pts.length < 2) return <span className="pb-spark pb-spark--none" aria-hidden />;
  const w = 64;
  const h = 20;
  const x = (i: number) => 2 + (i * (w - 4)) / (pts.length - 1);
  const y = (p: number) => 2 + ((p - 1) / Math.max(1, clubs - 1)) * (h - 4);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.power).toFixed(1)}`).join(' ');
  const last = pts.at(-1)!;
  return (
    <svg className="pb-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Power rank over ${pts.length} seasons, latest ${last.power}`}>
      <path d={d} fill="none" stroke={tone} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <circle cx={x(pts.length - 1)} cy={y(last.power)} r="2.4" fill={tone} />
    </svg>
  );
};

export const ClubLadder = ({
  season,
  progression,
  onTrack,
}: {
  season: ScheduleSeason;
  progression: Record<string, TeamSeasonRow[]>;
  onTrack?: (team: string) => void;
}) => {
  const [all, setAll] = useState(false);
  const rows = [...season.table].filter((r) => Number.isFinite(r.power)).sort((a, b) => a.power - b.power);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.powerScore));
  const min = Math.min(...rows.map((r) => r.powerScore));
  const shown = all ? rows : rows.slice(0, 10);
  const prev = season.prevPower;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-gold">
          <Medal className="h-4 w-4" aria-hidden /> Power ladder
        </h3>
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="rounded-full border border-border/50 px-2.5 py-1 font-pixel text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {all ? 'Top 10' : `All ${rows.length}`}
        </button>
      </div>
      <ol className="grid gap-1.5 md:grid-cols-2">
        {shown.map((r) => {
          const before = prev?.[r.abbr];
          const move = before ? before - r.power : null;
          const tone = `hsl(${findNFLTeam(r.team)?.primaryColor ?? '220 10% 55%'})`;
          const Row = onTrack ? 'button' : 'div';
          return (
            <li key={r.abbr} className="min-w-0">
              <Row
                {...(onTrack ? { type: 'button' as const, onClick: () => onTrack(r.team), title: `Show ${r.team} progression` } : {})}
                className="pb-row relative flex w-full items-center gap-2 overflow-hidden rounded-lg border border-[hsl(var(--line)/0.6)] px-2 py-1.5 text-left"
                style={{ background: BOARD_BG }}
              >
                <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: tone }} />
                <span aria-hidden className="absolute inset-y-0 left-0 opacity-70" style={{ width: `${8 + (88 * (r.powerScore - min)) / Math.max(1, max - min)}%`, background: `linear-gradient(90deg, ${color(r.team, 0.5)}, transparent)` }} />
                <span className={cn('relative w-7 text-center font-display text-xl font-bold tabular-nums', r.power <= 3 ? lampText : 'text-foreground/80')}>{r.power}</span>
                <TeamLogo team={r.team} decorative className="relative h-7 w-7 flex-shrink-0" />
                <span className="relative min-w-0 flex-1 truncate font-display text-sm font-bold uppercase">{nick(r.team)}</span>
                <span className="relative hidden min-[420px]:block">
                  <Spark rows={progression[r.team] ?? []} clubs={rows.length} tone={tone} />
                </span>
                <span className="relative text-xs tabular-nums text-foreground/85">{r.record}</span>
                <span className="relative hidden w-9 text-right text-[11px] tabular-nums text-muted-foreground sm:block">{signed(r.diff)}</span>
                <span
                  className={cn('relative flex w-9 items-center justify-end gap-0.5 text-[11px] font-semibold tabular-nums', move === null ? 'text-muted-foreground' : move > 0 ? 'text-[hsl(145_63%_55%)]' : move < 0 ? 'text-[hsl(357_80%_70%)]' : 'text-muted-foreground')}
                  title={before ? `Ranked ${before} the season before` : 'Not ranked the season before'}
                >
                  {move === null ? <span className="font-pixel text-[7px]">NEW</span> : move > 0 ? <><TrendingUp className="h-3 w-3" aria-hidden />{move}</> : move < 0 ? <><TrendingDown className="h-3 w-3" aria-hidden />{-move}</> : <Minus className="h-3 w-3" aria-hidden />}
                </span>
              </Row>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** Each club's star this season, keyed by club id: active players on the club now, best by this season's rating
 * (SZN), then Career Legacy. Never a retiree whose last club it was (Terrell Owens is not the 2026 Bengals' star). */
const useStars = () => {
  const { getAllPlayers, dataVersion, careerData } = useLeague();
  const [szn, setSzn] = useState<SeasonOvrFile | null>(null);
  useEffect(() => {
    let live = true;
    loadSeasonOvr().then((d) => live && setSzn(d));
    return () => {
      live = false;
    };
  }, []);
  return useMemo(() => {
    const best = new Map<string, { p: Player; s: number; l: number }>();
    getAllPlayers().forEach((p) => {
      if (p.isRealLegend || !isInLeague(p)) return;
      const id = findNFLTeam(p.team)?.id;
      if (!id) return;
      const s = szn?.ovr[`${p.position}:${p.name}`] ?? -1;
      const l = p.careerLegacy || 0;
      const cur = best.get(id);
      if (!cur || s > cur.s || (s === cur.s && l > cur.l)) best.set(id, { p, s, l });
    });
    return new Map([...best].map(([k, v]) => [k, v.p]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [careerData, getAllPlayers, dataVersion, szn]);
};

type Move = { team: string; row: TeamSeasonRow & { change: NonNullable<TeamSeasonRow['change']> } };

export const StockBoard = ({
  progression,
  season,
  clubs,
  onTrack,
}: {
  progression: Record<string, TeamSeasonRow[]>;
  season: string;
  clubs: number;
  onTrack: (t: string) => void;
}) => {
  const stars = useStars();
  const sprites = useGameSprites();
  const moved = useMemo(
    () =>
      Object.entries(progression)
        .map(([team, rows]) => ({ team, row: rows.find((r) => r.season === season) }))
        .filter((m): m is Move => !!m.row?.change),
    [progression, season],
  );
  if (!moved.length) return <p className="glass-card p-4 text-sm text-muted-foreground">{season} is the first season with weekly scores, so there is nothing to compare it with.</p>;
  const byChange = [...moved].sort((a, b) => b.row.change.power - a.row.change.power || a.row.power - b.row.power || a.team.localeCompare(b.team));
  const risers = byChange.filter((m) => m.row.change.power > 0).slice(0, 5);
  const fallers = [...byChange].reverse().filter((m) => m.row.change.power < 0).slice(0, 5);
  const tape = [...risers, ...fallers];

  const Side = ({ title, items, up }: { title: string; items: Move[]; up: boolean }) => (
    <div className="pb-side relative min-w-0 overflow-hidden rounded-xl border border-[hsl(var(--line)/0.7)] p-2.5 sm:p-3" style={{ background: BOARD_BG }}>
      <LampGrid />
      <h4 className={cn('relative mb-2 flex items-center gap-2 font-pixel text-[10px] uppercase tracking-widest', up ? 'text-[hsl(145_63%_55%)]' : 'text-[hsl(357_80%_70%)]')}>
        {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />} {title}
      </h4>
      {items.length === 0 ? (
        <p className="relative text-sm text-muted-foreground">None this season.</p>
      ) : (
        <ol className="relative space-y-1.5">
          {items.map((m) => {
            const star = stars.get(findNFLTeam(m.team)?.id ?? '');
            const tone = `hsl(${findNFLTeam(m.team)?.primaryColor ?? '220 10% 55%'})`;
            const d = Math.abs(m.row.change.power);
            return (
              <li key={m.team}>
                <button type="button" onClick={() => onTrack(m.team)} title={`Show ${m.team} progression`} className="pb-stock flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left" style={{ ['--tone' as string]: tone }}>
                  <span className="pb-stock__bust" aria-hidden>
                    {star && sprites && !star.isRealLegend ? <GameSprite player={star} kind="bust" size="s" /> : <TeamLogo team={m.team} decorative className="h-7 w-7" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-display text-sm font-bold uppercase leading-tight">
                      <TeamLogo team={m.team} decorative className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{nick(m.team)}</span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {star ? displayName(star.name) : m.row.record} · #{m.row.power + m.row.change.power} to #{m.row.power}
                    </span>
                  </span>
                  <span className="hidden min-[420px]:block">
                    <Spark rows={progression[m.team] ?? []} clubs={clubs} tone={tone} />
                  </span>
                  <span className={cn('pb-led font-display text-xl font-bold tabular-nums', up ? 'pb-led--up' : 'pb-led--down')}>
                    {up ? '▲' : '▼'}
                    {d}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="pb-tape" aria-hidden>
        <div className="pb-tape__run">
          {[0, 1].map((k) => (
            <span key={k} className="pb-tape__set">
              {tape.map((m) => (
                <span key={`${k}-${m.team}`} className={m.row.change.power > 0 ? 'pb-t-up' : 'pb-t-down'}>
                  {findNFLTeam(m.team)?.abbreviation ?? m.team} {m.row.change.power > 0 ? '▲' : '▼'}
                  {Math.abs(m.row.change.power)}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Side title={`Risers, ${season}`} items={risers} up />
        <Side title={`Fallers, ${season}`} items={fallers} up={false} />
      </div>
    </div>
  );
};
