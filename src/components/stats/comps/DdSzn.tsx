import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Player, Position } from '@/types/player';
import { cn } from '@/lib/utils';
import { seasonLabel } from '@/config/edition';
import { playerKey, CAREER_LABEL, type SeasonOvrFile } from '@/config/ovr';
import { gradeFor, percentileOf, type GradeStep, type Overall } from '@/config/skillGrades';
import LeaderboardPeek, { type PeekBoard } from './LeaderboardPeek';
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

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL', 'K'];

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
const useSznBoards = (players: Player[], ovrByKey: Record<string, number> | Map<string, number> | null, skills: Map<string, Overall>) =>
  useMemo(() => {
    const out = new Map<Position, SznEntry[]>();
    if (!ovrByKey) return out;
    const get = (k: string): number | undefined => (ovrByKey instanceof Map ? ovrByKey.get(k) : ovrByKey[k]);
    const seasonOvr = { ovr: { } as Record<string, number> };
    players.forEach((p) => {
      const v = get(playerKey(p));
      if (v != null) seasonOvr.ovr[playerKey(p)] = v;
    });
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
  }, [players, ovrByKey, skills]);

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

interface Props {
  player: Player;
  players: Player[];
  seasonOvr: SeasonOvrFile | null;
  /** Career OVR by player key: a retired player's card in this slot ranks by it instead of a season rating */
  careerOvr?: Map<string, number>;
  onOpenPlayer: (p: Player) => void;
}

/** Whether the Season panel shows for him: an active player with a season rating (retirees and no-season actives get none). */
export const hasSznPanel = (player: Player, seasonOvr: SeasonOvrFile | null) => !!seasonOvr && player.status === 'Active' && seasonOvr.ovr[playerKey(player)] != null;

/**
 * Season panel (owner, 2026-11-25: "skill is not everything, thus some players have a higher SZN score"): the SZN tile
 * in the Skill tile's style (big letter from his SZN percentile at his position, the number, his rank), a one-line
 * SZN vs Skill chip, and the position's SZN list behind a tap.
 */
const DdSzn = ({ player, players, seasonOvr, careerOvr, onOpenPlayer }: Props) => {
  const skills = useSkillRatings();
  // A retired player gets the same card for his career OVR (owner, 2026-11-25: "replace that season score with ovr
  // same format same style"); an active one with a season rating keeps the season card.
  const career = !hasSznPanel(player, seasonOvr) && player.status !== 'Active' && !player.isRealLegend && !!careerOvr;
  const boards = useSznBoards(players, career ? careerOvr! : seasonOvr?.ovr ?? null, skills);
  if (!career && (!seasonOvr || !hasSznPanel(player, seasonOvr))) return null;
  const key = playerKey(player);
  const list = boards.get(player.position);
  const me = list?.find((e) => e.key === key);
  if (!list || !me) return null;
  const pos = player.position;
  const lead = me.gap == null ? null : me.gap >= 3 ? 'up' : me.gap <= -3 ? 'down' : 'even';
  return (
    // owner: "the szn ovr should use the same click and list as the skill and the rest, don't create a new one" — the
    // shared LeaderboardPeek, fed this season's ratings at his position
    <LeaderboardPeek
      player={player}
      onOpenPlayer={onOpenPlayer}
      getBoard={(): PeekBoard => ({
        title: career ? `Career ${CAREER_LABEL}` : 'Season OVR',
        sub: career ? `Every ${pos} · ${list.length} rated` : `${pos}s who played ${seasonLabel(seasonOvr!.season)} · ${list.length} rated`,
        rows: list.map((e) => ({ player: e.player, display: String(e.szn), grade: e.grade })),
      })}
      self={() => ({ player, display: String(me.szn), grade: me.grade })}
    >
      {/* the Skill card's exact layout and wording (owner: "mirror that card to the skill grade") */}
      <button
        type="button"
        aria-label={`${career ? 'Career' : 'Season'} grade ${me.grade?.grade ?? 'none'}, ${career ? 'career' : 'season'} OVR ${me.szn}. Show the ${pos} leaderboard`}
        className={cn(
          'rbk-chip glass-card flex w-full flex-row items-center gap-4 p-4 text-left hover:border-gold/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold lg:flex-col lg:items-start',
          me.grade?.grade === 'S' && 'dd-card--s',
        )}
      >
        <GradeChip grade={me.grade} size="xl" />
        <div className="min-w-0 space-y-1.5">
          <p className="font-pixel text-[9px] uppercase text-gold">{career ? 'Career grade' : 'Season grade'}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className="lamp" title={career ? 'Career OVR: his whole career ranked within the position' : 'Season OVR: this season ranked within the position'}>
              {career ? CAREER_LABEL : 'SZN'} <b>{me.szn}</b>
            </span>
            <span className="lamp" title={career ? 'His rank among every player at the position' : "His rank among this season's rated players at the position"}>
              Rank <b>{me.rank}</b>/{list.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {ordinal(Math.round(me.pct))} percentile among {career ? `all ${pos}s` : `${pos}s this season`}.{!career && lead === 'up' ? ' Above his skill grade.' : lead === 'down' ? ' Below his skill grade.' : ''}
          </p>
        </div>
      </button>
    </LeaderboardPeek>
  );
};

export default DdSzn;
