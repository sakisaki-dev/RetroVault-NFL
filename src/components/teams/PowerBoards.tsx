import { useState } from 'react';
import { Medal, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findNFLTeam } from '@/utils/nflTeams';
import type { ScheduleSeason, TeamSeasonRow } from '@/utils/schedule';
import TeamLogo from '../timeline/TeamLogo';
import { BOARD_BG, color, lampText, signed } from '../season/seasonGamesUi';
import './powerBoards.css';

/**
 * Stats → Teams boards (owner-approved NFL immersion pass): the season's power ladder, the Season page's ladder rows with a
 * progression sparkline per club (replaces the tangled all-clubs line chart), Rules over schedule.json and the league sheet only.
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
