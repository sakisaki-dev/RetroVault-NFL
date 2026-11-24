import { useMemo, useState } from 'react';
import { Radio, Trophy } from 'lucide-react';
import TeamLogo from '@/components/timeline/TeamLogo';
import { IS_NFL } from '@/config/edition';
import { findNFLTeam } from '@/utils/nflTeams';
import { openGame, useGameIds, useSeasonGames, useSuperBowlIds } from '@/utils/nflGames';
import { parseGameId } from '@/utils/gameFinder';
import { ResultTile, ScoresSkeleton, gameOrder } from '@/components/season/ScoresBrowser';

/**
 * The club sheet's "Schedule": one season of the club's games as results (W/L, score, opponent), each opening the
 * Game page, plus its Super Bowl appearances (from sb.json). The season's file loads when picked.
 */
/** sb.json keeps nflverse's own abbreviations for relocated clubs */
const NOW: Record<string, string> = { STL: 'LAR', LA: 'LAR', OAK: 'LV', SD: 'LAC' };
const now = (a: string) => NOW[a] ?? a;
const sbSides = (id: string) => { const g = parseGameId(id); return { away: now(g.away), home: now(g.home) }; };

const ClubGames = ({ teamName }: { teamName: string }) => {
  const abbr = findNFLTeam(teamName)?.abbreviation;
  const ids = useGameIds(IS_NFL);
  const sb = useSuperBowlIds();
  const years = useMemo(() => (ids ? Object.keys(ids).map(Number).sort((a, b) => b - a) : []), [ids]);
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked ?? years[0];
  const all = useSeasonGames(year);
  const games = useMemo(() => (all && abbr ? all.filter((g) => g.away === abbr || g.home === abbr).sort(gameOrder) : null), [all, abbr]);
  const bowls = useMemo(() => Object.entries(sb ?? {}).filter(([, id]) => abbr && (sbSides(id).away === abbr || sbSides(id).home === abbr)).sort((a, b) => Number(b[0]) - Number(a[0])), [sb, abbr]);
  if (!IS_NFL || !abbr || !years.length) return null;
  return (
    <section aria-labelledby="club-games">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="club-games" className="section-title flex items-center gap-2 text-base"><Radio className="h-4 w-4 text-[hsl(var(--gold))]" aria-hidden /> Schedule</h3>
        <select aria-label="Season" value={year} onChange={(e) => setPicked(Number(e.target.value))} className="h-8 rounded-md border border-border/60 bg-background px-2 font-display text-sm font-bold tabular-nums">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {all === undefined ? <ScoresSkeleton n={6} /> : !games?.length ? <p className="text-sm text-muted-foreground">No games found for {year}.</p> : (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">{games.map((g) => <ResultTile key={g.id} g={g} abbr={abbr} />)}</ul>
      )}
      {bowls.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 flex items-center gap-1.5 font-pixel text-[9px] uppercase tracking-widest text-muted-foreground"><Trophy className="h-3 w-3 text-[hsl(var(--gold))]" aria-hidden /> Super Bowl appearances</p>
          <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {bowls.map(([y, id]) => {
              const g = sbSides(id);
              const opp = g.away === abbr ? g.home : g.away;
              return (
                <li key={y} className="flex-shrink-0">
                  <button type="button" onClick={() => openGame(id)} aria-label={`${y} Super Bowl against ${opp}. Open the game`} className="flex items-center gap-1.5 rounded-md border border-[hsl(var(--gold)/0.5)] bg-black/40 px-2 py-1 hover:bg-[hsl(var(--gold)/0.12)]">
                    <span className="font-display text-sm font-bold tabular-nums">{y}</span>
                    <span className="font-pixel text-[8px] uppercase text-muted-foreground">vs</span>
                    <TeamLogo team={opp} decorative className="h-5 w-5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

export default ClubGames;
