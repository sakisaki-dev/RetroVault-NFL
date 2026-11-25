import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Player, Position } from '@/types/player';
import { cn } from '@/lib/utils';
import { seasonLabel } from '@/config/edition';
import { playerKey, type SeasonOvrFile } from '@/config/ovr';
import { gradeFor, percentileOf, type GradeStep, type Overall } from '@/config/skillGrades';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { InfoTip } from '@/components/ui/InfoTip';
import TeamLogo from '@/components/brand/TeamLogo';
import CountUp from '@/components/brand/CountUp';
import GameSprite from '@/components/GameSprite';
import { peekProps } from '@/components/peek/peekProps';
import { getTeamColors } from '@/utils/teamColors';
import { signatureTeamOf, usePlayerExtras } from '@/utils/playerExtras';
import { useSkillRatings } from '@/utils/useSkillRatings';
import { displayName } from '@/utils/displayName';
import { ordinal } from '../analytics/viz';
import { GradeChip } from './ddParts';

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'];

export interface SznEntry {
  player: Player;
  key: string;
  szn: number;
  /** Percentile of his SZN among his position's season ratings (0-100) */
  pct: number;
  grade: GradeStep | null;
  rank: number;
  skill: Overall | undefined;
  /** SZN minus skill rating (positive = outplaying his skill) */
  gap: number | null;
}

/**
 * Every player with a season rating this season, grouped by position and ranked. The SZN letter grade is his SZN's
 * mid-rank percentile among his position's season ratings, on the same S / A+ ... F scale as the skill grades
 * (skillGrades.ts GRADE_SCALE), so the two letters mean the same share of the position.
 */
const useSznBoards = (players: Player[], seasonOvr: SeasonOvrFile | null, skills: Map<string, Overall>) =>
  useMemo(() => {
    const out = new Map<Position, SznEntry[]>();
    if (!seasonOvr) return out;
    const byPos = new Map<Position, Player[]>();
    players.forEach((p) => {
      if (p.isRealLegend || seasonOvr.ovr[playerKey(p)] == null) return;
      (byPos.get(p.position) ?? byPos.set(p.position, []).get(p.position)!).push(p);
    });
    byPos.forEach((list, pos) => {
      const sorted = list.map((p) => seasonOvr.ovr[playerKey(p)]).sort((a, b) => a - b);
      const rows = list
        .map((p) => {
          const key = playerKey(p);
          const szn = seasonOvr.ovr[key];
          const pct = percentileOf(sorted, szn);
          const skill = skills.get(key);
          return { player: p, key, szn, pct, grade: gradeFor(pct), rank: 0, skill, gap: skill ? szn - skill.rating : null } as SznEntry;
        })
        .sort((a, b) => b.szn - a.szn || b.pct - a.pct || a.player.name.localeCompare(b.player.name));
      rows.forEach((r, i) => {
        // ties share the better place
        r.rank = i > 0 && rows[i - 1].szn === r.szn ? rows[i - 1].rank : i + 1;
      });
      out.set(pos, rows);
    });
    return out;
  }, [players, seasonOvr, skills]);

const useNarrow = () => {
  const q = '(max-width: 640px)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const fn = () => setOn(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return on;
};

const Row = ({ e, place, me, extras, sort, onOpen }: { e: SznEntry; place: number; me: boolean; extras: ReturnType<typeof usePlayerExtras>; sort: 'szn' | 'gap'; onOpen: (p: Player) => void }) => {
  const team = signatureTeamOf(extras, e.player);
  const c = getTeamColors(team);
  return (
    <li>
      <button
        type="button"
        data-rbk-row=""
        data-me={me || undefined}
        aria-current={me || undefined}
        {...peekProps(e.player)}
        onClick={() => onOpen(e.player)}
        style={{ '--rb-1': c ? `hsl(${c.primary})` : 'hsl(var(--line))' } as CSSProperties}
        className="rbk-row flex w-full items-center gap-2 rounded-md py-1 pl-2.5 pr-2 text-left focus-visible:outline-none"
      >
        <span className={cn('w-8 shrink-0 font-pixel text-[9px] uppercase tabular-nums', place === 1 ? 'text-gold' : 'text-muted-foreground')}>{ordinal(place)}</span>
        <span className="flex h-9 w-8 shrink-0 items-end justify-center overflow-hidden" aria-hidden="true">
          <GameSprite player={e.player} team={team || undefined} kind="bust" size="s" />
        </span>
        {team ? <TeamLogo team={team} size={20} decorative backed /> : <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-chalk">{displayName(e.player.name)}</span>
        {sort === 'gap' && e.gap != null && (
          <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', e.gap > 0 ? 'text-[#3ddc84]' : e.gap < 0 ? 'text-[#ff7a4a]' : 'text-muted-foreground')}>
            {e.gap > 0 ? '+' : e.gap < 0 ? '−' : ''}
            {Math.abs(e.gap)}
          </span>
        )}
        <span className="w-7 shrink-0 text-right font-mono text-xs tabular-nums text-chalk">{e.szn}</span>
        <GradeChip grade={e.grade} size="sm" className="h-5 min-w-[1.6rem] text-xs" />
        <span className="flex shrink-0 items-center gap-0.5 opacity-80" title={e.skill ? `Skill grade ${e.skill.grade.grade}` : 'No skill grade'}>
          <span className="font-pixel text-[7px] uppercase text-muted-foreground">Sk</span>
          <GradeChip grade={e.skill?.grade ?? null} size="sm" className="h-4 min-w-[1.3rem] text-[10px]" />
        </span>
      </button>
    </li>
  );
};

/** The Season panel's sheet: every player at a position ranked by SZN, with his skill grade beside it. */
const SznSheet = ({ boards, player, seasonOvr, onOpenPlayer, children }: { boards: Map<Position, SznEntry[]>; player: Player; seasonOvr: SeasonOvrFile; onOpenPlayer: (p: Player) => void; children: React.ReactElement }) => {
  const narrow = useNarrow();
  const extras = usePlayerExtras();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position>(player.position);
  const [sort, setSort] = useState<'szn' | 'gap'>('szn');
  const leaving = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (open) setPos(player.position);
  }, [open, player.position]);
  const rows = useMemo(() => {
    const r = boards.get(pos) ?? [];
    return sort === 'szn' ? r : [...r].sort((a, b) => (b.gap ?? -99) - (a.gap ?? -99) || b.szn - a.szn);
  }, [boards, pos, sort]);
  // scroll his own row into view (after the sheet's slide-in has laid the list out)
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const el = listRef.current?.querySelector<HTMLElement>('[data-me]');
      el?.scrollIntoView({ block: 'center' });
    }, 260);
    return () => window.clearTimeout(t);
  }, [open, pos, sort]);
  const go = (p: Player) => {
    leaving.current = true;
    setOpen(false);
    onOpenPlayer(p);
  };
  const positions = POSITIONS.filter((x) => boards.has(x));
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side={narrow ? 'bottom' : 'right'}
        className={cn('rbk-sheet overflow-y-auto border-line bg-popover px-3 pb-4 pt-0', narrow ? 'max-h-[80vh] rounded-t-2xl' : 'sm:max-w-md')}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          if (leaving.current) e.preventDefault();
          leaving.current = false;
        }}
      >
        <div>
          <div className="sticky top-0 z-10 -mx-3 space-y-2.5 bg-popover px-3 pb-2 pt-7">
          <div className="pr-12">
            <SheetTitle className="font-display text-sm font-bold uppercase tracking-wide text-foreground">Season OVR · {pos}s</SheetTitle>
            <SheetDescription className="font-pixel text-[8px] uppercase leading-relaxed text-muted-foreground">
              {seasonLabel(seasonOvr.season)}
              {seasonOvr.live ? ' so far' : ''} · {rows.length} ranked
            </SheetDescription>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Position">
            {positions.map((x) => (
              <button
                key={x}
                type="button"
                aria-pressed={pos === x}
                onClick={() => setPos(x)}
                className={cn('rounded-md border px-2 py-1 font-pixel text-[9px] uppercase', pos === x ? 'border-gold/60 bg-gold/20 text-gold' : 'border-line text-muted-foreground hover:text-foreground')}
              >
                {x}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Sort" className="inline-flex overflow-hidden rounded-lg border border-line text-xs">
            {([['szn', 'Season OVR'], ['gap', 'Skill vs SZN']] as const).map(([m, label]) => (
              <button key={m} type="button" aria-pressed={sort === m} onClick={() => setSort(m)} className={cn('px-3 py-1.5 font-display font-bold uppercase tracking-wide', sort === m ? 'bg-gold/20 text-gold' : 'text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
          </div>
          <ul ref={listRef} className="space-y-1 pt-1" aria-label={`${pos} season OVR leaders`}>
            {rows.map((e, i) => (
              <Row key={e.key} e={e} place={sort === 'szn' ? e.rank : i + 1} me={e.key === playerKey(player)} extras={extras} sort={sort} onOpen={go} />
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
};

interface Props {
  player: Player;
  players: Player[];
  seasonOvr: SeasonOvrFile | null;
  onOpenPlayer: (p: Player) => void;
}

/** Whether the Season panel shows for him: an active player with a season rating (retirees and no-season actives get none). */
export const hasSznPanel = (player: Player, seasonOvr: SeasonOvrFile | null) => !!seasonOvr && player.status === 'Active' && seasonOvr.ovr[playerKey(player)] != null;

/**
 * Season panel (owner, 2026-11-25: "skill is not everything, thus some players have a higher SZN score"): the SZN tile
 * in the Skill tile's style (big letter from his SZN percentile at his position, the number, his rank), a one-line
 * SZN vs Skill chip, and the position's SZN list behind a tap.
 */
const DdSzn = ({ player, players, seasonOvr, onOpenPlayer }: Props) => {
  const skills = useSkillRatings();
  const boards = useSznBoards(players, seasonOvr, skills);
  if (!seasonOvr || !hasSznPanel(player, seasonOvr)) return null;
  const key = playerKey(player);
  const list = boards.get(player.position);
  const me = list?.find((e) => e.key === key);
  if (!list || !me) return null;
  const pos = player.position;
  const lead = me.gap == null ? null : me.gap >= 3 ? 'up' : me.gap <= -3 ? 'down' : 'even';
  return (
    <SznSheet boards={boards} player={player} seasonOvr={seasonOvr} onOpenPlayer={onOpenPlayer}>
      <button
        type="button"
        aria-label={`Season OVR ${me.szn}, grade ${me.grade?.grade ?? 'none'}, ${ordinal(me.rank)} of ${list.length} ${pos}s. Show the ${pos} season leaderboard`}
        className={cn(
          'rbk-chip glass-card flex w-full flex-col gap-2.5 p-4 text-left hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
          me.grade?.grade === 'S' && 'dd-card--s',
        )}
      >
        <div className="flex items-center gap-4">
          <GradeChip grade={me.grade} size="xl" />
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 font-pixel text-[9px] uppercase text-gold">
              Season · {seasonLabel(seasonOvr.season)}
              <InfoTip>SZN is his season OVR: this season&rsquo;s line ranked within {pos}s who played it. The letter is his SZN percentile among them on the skill grades&rsquo; scale (S = top 10%). Skill is per-game rates only, so the two can differ.</InfoTip>
            </p>
            <p className="font-display text-5xl font-bold leading-none tabular-nums text-chalk">
              <CountUp value={me.szn} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="lamp">
            {ordinal(me.rank)} of <b>{list.length}</b> {pos}s
          </span>
          {me.skill && (
            <span className="lamp" title={lead === 'up' ? 'Outplaying his skill rating' : lead === 'down' ? 'Below his skill rating' : 'In line with his skill rating'}>
              SZN <b>{me.szn}</b> vs Skill <b>{me.skill.grade.grade}</b>
              {lead === 'up' ? ' ▲' : lead === 'down' ? ' ▼' : ''}
            </span>
          )}
        </div>
        <span className="font-pixel text-[8px] uppercase text-muted-foreground">See all {pos}s ›</span>
      </button>
    </SznSheet>
  );
};

export default DdSzn;
