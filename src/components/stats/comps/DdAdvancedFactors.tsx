import { useMemo, useState, type CSSProperties } from 'react';
import type { Player } from '@/types/player';
import { cn } from '@/lib/utils';
import { careerPoolLabel, gradeFor } from '@/config/skillGrades';
import { playerKey } from '@/config/ovr';
import { ordinal } from '../analytics/viz';
import { DdBar, GradeChip } from './ddParts';
import LeaderboardPeek, { type PeekBoard } from './LeaderboardPeek';
import { advLeaders, fmtAdv, useAdvanced } from '@/utils/nflAdvanced';
import { displayName } from '@/utils/displayName';

/**
 * NFL edition: the advanced-stat factors of a player (nflverse EPA / CPOE / target share, Next Gen Stats, PFR advanced
 * stats, snap counts; scripts/nfl/advanced.py). Each is a tile like a skill: a letter grade from its percentile within
 * his position (among players with the metric's minimum sample), the value, its source, and the leaderboard behind it.
 * A trait that is a style (time to throw, aDOT) is shown by value and rank without a grade. `scope` follows the page
 * ("2026" this season, "c" the career since 2018, the seasons all the sources share); with `picker` he can pick any season.
 */
const DdAdvancedFactors = ({
  player,
  players,
  scope: forced,
  picker = false,
  onOpenPlayer,
}: {
  player: Player;
  players: Player[];
  scope?: string;
  picker?: boolean;
  onOpenPlayer: (p: Player) => void;
}) => {
  const adv = useAdvanced(player.position);
  const key = playerKey(player);
  const mine = adv?.p[key];
  const scopes = useMemo(() => (mine ? Object.keys(mine).sort((a, b) => (a === 'c' ? 1 : b === 'c' ? -1 : Number(b) - Number(a))) : []), [mine]);
  const [picked, setPicked] = useState<string | null>(null);
  const scope = picker ? (picked && scopes.includes(picked) ? picked : scopes[0]) : forced && scopes.includes(forced) ? forced : null;
  if (!adv || !mine || !scope) {
    return picker && adv ? (
      <p className="glass-card p-4 text-sm text-muted-foreground">No advanced data for {displayName(player.name)}: his position or seasons are not covered by the sources (nflverse advanced data starts in 2016-2018).</p>
    ) : null;
  }
  const entries = Object.entries(mine[scope] ?? {})
    .filter(([id]) => adv.metrics[id]?.pos.includes(player.position))
    .sort((a, b) => Object.keys(adv.metrics).indexOf(a[0]) - Object.keys(adv.metrics).indexOf(b[0]));
  if (!entries.length) return null;
  const byKey = new Map(players.map((p) => [playerKey(p), p]));
  const label = scope === 'c' ? `Career, ${adv.first}-${adv.season}` : scope;
  const board = (id: string): PeekBoard | null => {
    const m = adv.metrics[id];
    const rows = advLeaders(adv, scope, id, player.position).flatMap((e) => {
      const p = byKey.get(e.key);
      return p ? [{ player: p, display: e.display, grade: m.dir === 'style' ? null : gradeFor(e.v[1]) }] : [];
    });
    return {
      title: m.label,
      sub: [`${player.position}s`, label, `${m.src}`, scope === 'c' ? `qualified starters (${careerPoolLabel(player.position)})` : `min ${m.min} ${m.min >= 100 ? 'plays' : 'sample'}`, `${rows.length} qualifiers`, m.dir === 'low' ? 'lower is better' : ''].filter(Boolean).join(' · '),
      rows,
    };
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-pixel text-[9px] uppercase tracking-wider text-gold">Advanced factors · {label}</p>
        {picker && scopes.length > 1 && (
          <div role="group" aria-label="Season" className="flex flex-wrap gap-1">
            {scopes.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === scope}
                onClick={() => setPicked(s)}
                className={cn('rounded-md border px-2 py-1 font-display text-xs font-bold uppercase', s === scope ? 'border-gold/60 bg-gold/20 text-gold' : 'border-line text-muted-foreground hover:text-foreground')}
              >
                {s === 'c' ? 'Career' : s}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label={`${displayName(player.name)} advanced factors`}>
        {entries.map(([id, v], i) => {
          const m = adv.metrics[id];
          const grade = m.dir === 'style' ? null : gradeFor(v[1]);
          return (
            <li key={id} className="dd-enter" style={{ '--i': i } as CSSProperties}>
              <LeaderboardPeek player={player} onOpenPlayer={onOpenPlayer} getBoard={() => board(id)} self={() => ({ player, display: fmtAdv(m, v[0]), grade })}>
                <button
                  type="button"
                  title={`${m.desc}. Source: ${m.src}. Ranked among ${v[3]} ${player.position}s with the minimum sample.`}
                  aria-label={`${m.label}: ${fmtAdv(m, v[0])}, ${ordinal(v[1])} percentile, ${v[2] > 0 ? `rank ${v[2]} of ${v[3]}` : `small sample, shrunk, against ${v[3]} qualified`}. Show the ${player.position} leaderboard`}
                  className="rbk-chip flex h-full w-full items-center gap-3 rounded-lg border border-line bg-panel/80 p-3 text-left hover:border-gold/40 hover:bg-panel-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  {grade ? <GradeChip grade={grade} /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line font-pixel text-[8px] uppercase text-muted-foreground">Style</span>}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-display text-base font-bold uppercase tracking-wide">{m.label}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-chalk">{fmtAdv(m, v[0])}</span>
                    </div>
                    <DdBar pct={v[1]} color={grade?.color} label={`${m.label} percentile`} />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>
                        {m.src}
                        {m.dir === 'low' ? ' · lower is better' : ''}
                      </span>
                      <span>
                        {v[2] > 0 ? `#${v[2]} of ${v[3]}` : `small sample · vs ${v[3]}`}
                      </span>
                    </div>
                  </div>
                </button>
              </LeaderboardPeek>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DdAdvancedFactors;
