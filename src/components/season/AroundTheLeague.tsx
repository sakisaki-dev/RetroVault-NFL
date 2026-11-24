import { useState } from 'react';
import { Warehouse } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoundGame, SeasonView } from '@/utils/seasonLive';
import { WeatherIcons } from './ScoreBar';
import { ArcadeToggle, ScoreTile } from '@/components/arcade';
import { SectionTitle } from './SeasonGames';
import { IS_NFL } from '@/config/edition';
import { openGame, regularGameId, useGameIds } from '@/utils/nflGames';
import { StarStrip, type SeasonStars } from './NflSeasonExtras';

/**
 * "Around the league": pick a week, see every game as the original lower-third score bar (both clubs' colours and
 * logos). Played weeks show the finals; the live season's weeks still to play show the matchups and the home
 * stadium's weather. From schedule.json's games (past) or the save's league games (live). Rules only.
 */

const GameBar = ({ g, week, coach, stars, gameId }: { g: RoundGame; week: number; coach: boolean; stars: SeasonStars | null; gameId?: string }) => {
  const played = g.awayScore !== undefined && g.homeScore !== undefined;
  const tie = played && g.awayScore === g.homeScore;
  // the closing line (NFL): the favourite and the points; an upset is a win by the underdog of 3 or more points
  const fav = g.line ? (g.line > 0 ? g.home : g.away) : null;
  const upset = played && !tie && fav !== null && Math.abs(g.line!) >= 3 && (g.homeScore! > g.awayScore! ? g.home : g.away) !== fav;
  const lineText = fav ? `${fav} −${Math.abs(g.line!)}` : null;
  return (
    <li className={cn('sx-game', coach && 'is-coach')}>
      <ScoreTile
        away={{ club: g.away, score: g.awayScore }}
        home={{ club: g.home, score: g.homeScore }}
        footer={played ? `WEEK ${week} · FINAL${tie ? ' · TIE' : ''}` : `WEEK ${week} · TO PLAY${g.kickoff ? ` · ${g.kickoff}` : ''}`}
        onClick={played && gameId ? () => openGame(gameId) : undefined}
      />
      <div className="sx-game__meta">
        {played ? (
          <>
            {g.roof && <Warehouse className="h-3 w-3" aria-label="Covered stadium" />}
            {lineText && <span className="tabular-nums" title="Closing spread">Line {lineText}</span>}
            {upset && <span className="sx-tag">Upset</span>}
            <span className="tabular-nums">{g.awayScore! + g.homeScore!} pts</span>
          </>
        ) : g.weather ? <WeatherIcons w={g.weather} /> : <span>{g.away} at {g.home}</span>}
      </div>
      {played && <StarStrip stars={stars} week={week} away={g.away} home={g.home} />}
    </li>
  );
};

const AroundTheLeague = ({ season, stars = null }: { season: SeasonView; stars?: SeasonStars | null }) => {
  const weeks = season.weeks ?? [];
  const ids = useGameIds(IS_NFL);
  const lastPlayed = [...weeks].reverse().find((w) => w.games.some((g) => g.awayScore !== undefined))?.week;
  const [pick, setPick] = useState<number | null>(null);
  const week = weeks.find((w) => w.week === pick) ?? weeks.find((w) => w.week === lastPlayed) ?? weeks[weeks.length - 1];
  if (!weeks.length || !week) return null;
  return (
    <div className="sx-block">
      <SectionTitle kicker={`Week ${week.week}`} club={season.coachTeam} right={
        <ArcadeToggle
          label="Week"
          size="sm"
          value={week.week}
          onChange={(v) => setPick(Number(v))}
          options={weeks.map((w) => ({ value: w.week, label: String(w.week) }))}
        />
      }>Around the league</SectionTitle>
      <ul className="sx-games">
        {week.games.map((g) => (
          <GameBar key={`${g.away}-${g.home}`} gameId={regularGameId(ids, season.season, week.week, g.away, g.home)} stars={stars} g={g} week={week.week} coach={[g.away, g.home].some((t) => t === season.coachTeam || t === season.coachAbbr)} />
        ))}
      </ul>
    </div>
  );
};

export default AroundTheLeague;
