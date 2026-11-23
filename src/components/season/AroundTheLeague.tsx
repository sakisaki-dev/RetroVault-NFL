import { useEffect, useRef, useState } from 'react';
import { Globe2, Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoundGame, SeasonView } from '@/utils/seasonLive';
import ScoreBar, { WeatherIcons } from './ScoreBar';
import { SectionTitle } from './SeasonGames';
import { StarStrip, type SeasonStars } from './NflSeasonExtras';

/**
 * "Around the league": pick a week, see every game as the original lower-third score bar (both clubs' colours and
 * logos). Played weeks show the finals; the live season's weeks still to play show the matchups and the home
 * stadium's weather. From schedule.json's games (past) or the save's league games (live). Rules only.
 */

const GameBar = ({ g, week, coach, stars }: { g: RoundGame; week: number; coach: boolean; stars: SeasonStars | null }) => {
  const played = g.awayScore !== undefined && g.homeScore !== undefined;
  const tie = played && g.awayScore === g.homeScore;
  // the closing line (NFL): the favourite and the points; an upset is a win by the underdog of 3 or more points
  const fav = g.line ? (g.line > 0 ? g.home : g.away) : null;
  const upset = played && !tie && fav !== null && Math.abs(g.line!) >= 3 && (g.homeScore! > g.awayScore! ? g.home : g.away) !== fav;
  const lineText = fav ? `${fav} −${Math.abs(g.line!)}` : null;
  return (
    <ScoreBar
      away={g.away}
      home={g.home}
      awayScore={g.awayScore}
      homeScore={g.homeScore}
      coach={coach}
      upcoming={!played}
      kicker={`Week ${week} · ${played ? `Final${tie ? ' · Tie' : ''}` : 'To play'}${!played && g.kickoff ? ` · ${g.kickoff}` : ''}`}
      aside={
        played ? (
          <>
            {g.roof && <Warehouse className="h-3 w-3" aria-label="Covered stadium" />}
            {lineText && <span className="tabular-nums" title="Closing spread">Line {lineText}</span>}
            {upset && <span className="rounded bg-[hsl(var(--gold)/0.2)] px-1 font-pixel text-[8px] uppercase text-[hsl(var(--gold))]">Upset</span>}
            <span className="tabular-nums">{g.awayScore! + g.homeScore!} pts</span>
          </>
        ) : g.weather ? <WeatherIcons w={g.weather} /> : null
      }
      extra={played ? <StarStrip stars={stars} week={week} away={g.away} home={g.home} /> : undefined}
      srText={played ? `${g.away} ${g.awayScore} at ${g.home} ${g.homeScore}` : `${g.away} at ${g.home}, to play`}
    />
  );
};

const AroundTheLeague = ({ season, stars = null }: { season: SeasonView; stars?: SeasonStars | null }) => {
  const weeks = season.weeks ?? [];
  const lastPlayed = [...weeks].reverse().find((w) => w.games.some((g) => g.awayScore !== undefined))?.week;
  const [pick, setPick] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  const week = weeks.find((w) => w.week === pick) ?? weeks.find((w) => w.week === lastPlayed) ?? weeks[weeks.length - 1];
  // Keep the shown week's pill in view inside the scrolling picker (never scrolls the page)
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && bar.current) bar.current.scrollLeft = el.offsetLeft - bar.current.clientWidth / 2 + el.offsetWidth / 2;
  }, [week?.week]);
  if (!weeks.length || !week) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={Globe2}>Around the league</SectionTitle>
        <div ref={bar} role="group" aria-label="Week" className="scrollbar-none relative flex max-w-full gap-1 overflow-x-auto rounded-lg bg-secondary/50 p-0.5 text-xs font-semibold">
          {weeks.map((w) => {
            const toPlay = !w.games.some((g) => g.awayScore !== undefined);
            return (
              <button
                key={w.week}
                type="button"
                aria-pressed={w.week === week.week}
                aria-label={`Week ${w.week}${toPlay ? ', to play' : ''}`}
                onClick={() => setPick(w.week)}
                className={cn(
                  'min-h-[36px] min-w-[36px] flex-shrink-0 rounded-md px-2 py-1.5 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  w.week === week.week ? 'bg-background text-foreground shadow-sm' : toPlay ? 'text-muted-foreground/60 hover:text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {w.week}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {week.games.map((g) => (
          <GameBar key={`${g.away}-${g.home}`} stars={stars} g={g} week={week.week} coach={[g.away, g.home].some((t) => t === season.coachTeam || t === season.coachAbbr)} />
        ))}
      </ul>
    </div>
  );
};

export default AroundTheLeague;
