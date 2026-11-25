import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, History, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import { scheduleSeasons, useSchedule, useScheduleSeason } from '@/utils/schedule';
import { SEASON_WEEKS, awardRaces, leaderBoards, liveSeasonView, recordText, scheduleWeeks, seasonEntries, useLiveSchedule, useLiveSeason, useUpcoming, withUpcoming, type LiveSeason, type SeasonView } from '@/utils/seasonLive';
import { ClubSplits, SeasonScoreboard } from '@/components/season/SeasonScoreboard';
import { NotableGames, NumbersStrip, WeeklyChart } from '@/components/season/SeasonByNumbers';
import { GameLog, GameRecords, LeagueTable, NoScores, SectionTitle } from '@/components/season/SeasonGames';
import { AwardRaces, InjuryReport, NflInjuryReport, Leaders, type PlayerLookup } from '@/components/season/LivePanels';
import { HeadToHeadGrid } from '@/components/season/scheduleParts';
import { FullTable, PlayoffBracket, PowerLadder, SeasonJumbo } from '@/components/season/NflSeason';
import SeasonClubWall from '@/components/season/SeasonClubWall';
import { HighlightReel, useSeasonStars } from '@/components/season/NflSeasonExtras';
import PlayoffRace from '@/components/season/PlayoffRace';
import ThisWeek from '@/components/season/ThisWeek';
import { usePlayoffOdds } from '@/utils/playoffOdds';
import SeasonLeaders from '@/components/season/SeasonLeaders';
import PlayoffHistory from '@/components/season/PlayoffHistory';
import AroundTheLeague from '@/components/season/AroundTheLeague';
import ScoresBrowser from '@/components/season/ScoresBrowser';
import { PowerAdvanced } from '@/components/teams/TeamAdvanced';
import '@/components/season/season.css';
import '@/components/stats/visual/statsArena.css';
import { CrowdDivider, PixelChip, PixelIcon, PixelStepper, SectionHeader } from '@/components/arcade';
import PixelLoader from '@/components/ui/PixelLoader';
import { IS_NFL, seasonLabel } from '@/config/edition';
import { displayName } from '@/utils/displayName';
import { clearSeasonJump, peekSeasonJump } from '@/utils/seasonLink';

/**
 * The Season page. Its backbone is the design that lived on the Timeline as "Season games" (scoreboard, club splits,
 * week-by-week log, by the numbers, the league table, notable games, game records), for every season with weekly
 * scores and, fed the same way, for the season in progress from the game's save. The live season adds its own
 * sections between them: the perfect-season watch, the award race, the league leaders and the injury report; the
 * all-time block adds the playoff history and head-to-head. Everything is computed from data.
 */

const keyOf = (p: Pick<Player, 'name' | 'position'>) => `${p.position}:${displayName(p.name)}`;
const seasonNum = (id: string) => Number(id.replace(/\D/g, ''));

/** The live season's scoreboard kicker and its perfect-season pill (the scoreboard's own pill style). */
const liveStatus = (view: SeasonView) => {
  const l = view.live!;
  const date = l.updated ? ` · ${l.updated.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';
  return `Live from the save · Week ${l.week} of ${l.weeks}${date}`;
};
const perfectWatch = (s: LiveSeason, view: SeasonView) => {
  const club = s.clubs[s.club];
  if (!club || club.l !== 0 || club.t !== 0 || club.w === 0) return undefined;
  const left = view.live!.left;
  return (
    <>
      <Trophy className="h-3 w-3" aria-hidden /> Perfect season watch · {recordText(club)}
      {left > 0 ? ` · ${left} to play` : ''}
    </>
  );
};

const LiveSections = {
  /** Between the game log and the league table: the award race and the leaders */
  Players: ({ s, lookup, final = false }: { s: LiveSeason; lookup: PlayerLookup; final?: boolean }) => {
    const entries = useMemo(() => seasonEntries(s), [s]);
    const races = useMemo(() => awardRaces(s, entries), [s, entries]);
    const boards = useMemo(() => leaderBoards(entries), [entries]);
    return (
      <>
        <AwardRaces races={races} lookup={lookup} weeksPlayed={Math.max(0, Math.min(s.week, SEASON_WEEKS + 1) - 1)} final={final} />
        <Leaders boards={boards} lookup={lookup} />
      </>
    );
  },
  Injuries: ({ s }: { s: LiveSeason }) => {
    const entries = useMemo(() => seasonEntries(s), [s]);
    return <InjuryReport entries={entries} />;
  },
};

const SeasonTab = () => {
  const live = useLiveSeason();
  const liveSched = useLiveSchedule();
  const schedule = useSchedule();
  const { getAllPlayers, dataVersion } = useLeague();
  const players = useMemo(() => {
    const m = new Map<string, Player>();
    getAllPlayers().forEach((p) => m.set(keyOf(p), p));
    return m;
    // dataVersion: a new league load is a new player list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAllPlayers, dataVersion]);
  const lookup = useCallback<PlayerLookup>((k) => players.get(k), [players]);

  const past = useMemo(() => (schedule ? scheduleSeasons(schedule) : []), [schedule]);
  // once a season-complete import has written the season's weekly scores, it is a finished season, not a live one
  const liveId = live && !past.some((p) => p.season === seasonLabel(live.season)) ? seasonLabel(live.season) : null;
  const liveView = useMemo(() => (live ? liveSeasonView(live, liveSched ?? past.find((p) => p.season === seasonLabel(live.season))) : null), [live, liveSched, past]);
  const options = useMemo(() => {
    const ids = [...new Set([...past.map((p) => p.season), ...(schedule?.seasonIndex ?? []).map((p) => p.season)])].filter((id) => id !== liveId);
    return [...(liveId ? [liveId] : []), ...ids].sort((a, b) => seasonNum(b) - seasonNum(a));
  }, [past, liveId, schedule]);
  // a deep link, #season?y=2003
  const [picked, setPicked] = useState<string | null>(() => peekSeasonJump()?.year ?? new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('y'));
  const wanted = picked && options.includes(picked) ? picked : options[0] ?? null;
  // the shown season's own file (NFL: one per season, loaded when picked)
  const fetched = useScheduleSeason(schedule, wanted);

  // the Teams club wall's chip: scroll to the standings once the season has drawn
  const ready = !!wanted && (!!fetched || past.some((p) => p.season === wanted) || wanted === liveId);
  useEffect(() => {
    const j = peekSeasonJump();
    if (!j || !ready) return;
    const t = window.setTimeout(() => {
      document.getElementById('season-standings')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      clearSeasonJump();
    }, 250);
    return () => window.clearTimeout(t);
  }, [ready]);

  const upcoming = useUpcoming(); // a hook: before the early return below
  const odds = usePlayoffOdds(IS_NFL);
  const stars = useSeasonStars(IS_NFL ? wanted : null);
  if (live === undefined || liveSched === undefined || !schedule) {
    return <PixelLoader label="Season" what="the season" minHeight="60vh" className="container justify-start pt-[14vh]" />;
  }

  const shown = picked && options.includes(picked) ? picked : options[0] ?? null;
  const isLive = !!shown && shown === liveId && !!live && !!liveView;
  const pastSeason = past.find((p) => p.season === shown) ?? fetched ?? undefined;
  const loadingSeason = !isLive && !pastSeason && fetched === undefined;
  const season: SeasonView | null = isLive
    ? liveView
    : pastSeason
      ? { ...pastSeason, weeks: IS_NFL && upcoming && String(upcoming.season) === pastSeason.season ? withUpcoming(scheduleWeeks(pastSeason), upcoming) : scheduleWeeks(pastSeason) }
      : null;
  const span = past.length ? `${past[past.length - 1].season}–${past[0].season}` : '';

  const live1 = (id: string) => id === liveId;
  return (
    <div className="season rv-load-in container mx-auto space-y-4 px-4 py-4 sm:py-6">
      <section aria-labelledby="season-heading" className="sx-sec">
        <SectionHeader
          club={season?.superBowl?.winner ?? season?.table?.[0]?.team}
          kicker={isLive ? 'Live from the save' : 'Season'}
          title={<span id="season-heading">Season {shown ?? ''}</span>}
          right={
            <div className="flex flex-wrap items-center gap-2">
              {IS_NFL && (
                <PixelChip onClick={() => document.getElementById('scores')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })} icon={<PixelIcon name="flag" size={12} />}>
                  Find a game
                </PixelChip>
              )}
              {options.length > 1 && (
                <PixelStepper
                  label="Season"
                  value={Number(shown)}
                  values={options.map(Number)}
                  format={(v) => (live1(String(v)) ? `${v} LIVE` : String(v))}
                  onChange={(v) => setPicked(String(v))}
                />
              )}
            </div>
          }
        />
        {IS_NFL && (
          <p className="sx-note">
            One season at a time: switch the year above to see that season's standings, power ladder, awards and every game. Each franchise's history lives on Teams.
          </p>
        )}

        {loadingSeason ? (
          <PixelLoader label="Season" what={`the ${shown} season`} minHeight="40vh" className="justify-start pt-[8vh]" />
        ) : season ? (
          <>
            {IS_NFL && <SeasonJumbo season={season} live={isLive || !season.superBowl} />}
            {IS_NFL && <PlayoffBracket season={season} />}
            {IS_NFL && <CrowdDivider />}
            {IS_NFL && <SeasonClubWall season={season} live={isLive} upcoming={upcoming && String(upcoming.season) === season.season ? upcoming.games : undefined} />}
            {IS_NFL && odds && String(odds.season) === season.season && !season.superBowl && !season.playoffs?.length && <PlayoffRace odds={odds} />}
            {IS_NFL && odds && String(odds.season) === season.season && odds.status === 'live' && <ThisWeek odds={odds} />}
            {IS_NFL && <SeasonLeaders season={Number(season.season)} inProgress={!season.superBowl} />}
            {IS_NFL && <CrowdDivider />}
            {IS_NFL && <PowerLadder season={season} />}
            {IS_NFL && <PowerAdvanced season={season} />}
            {!IS_NFL && (
              <>
                <SeasonScoreboard season={season} status={isLive ? liveStatus(season) : undefined} badge={isLive ? perfectWatch(live!, season) : undefined} />
                <ClubSplits season={season} />
                <GameLog season={season} />
              </>
            )}
            {IS_NFL && <CrowdDivider />}
            <AroundTheLeague season={season} stars={stars} />
            {isLive && <LiveSections.Players s={live!} lookup={lookup} />}
            {/* a finished season the save still holds (pulled after its Super Bowl): its award ratings and leaders, final */}
            {!isLive && live && shown === seasonLabel(live.season) && <LiveSections.Players s={live} lookup={lookup} final />}
            {season.league && (
              <div className="sx-block">
                <SectionTitle kicker="League scoring" club={season.superBowl?.winner}>{season.season} by the numbers</SectionTitle>
                <NumbersStrip season={season} />
                <WeeklyChart season={season} />
              </div>
            )}
            {IS_NFL ? <FullTable season={season} /> : <LeagueTable season={season} />}
            {!isLive && (
              <div className="sx-block">
                {!IS_NFL && <SectionTitle icon={Trophy}>Notable games</SectionTitle>}
                {IS_NFL ? <HighlightReel season={season} stars={stars} /> : <NotableGames season={season} />}
              </div>
            )}
            {IS_NFL && <CrowdDivider />}
            {isLive && <LiveSections.Injuries s={live!} />}
            {IS_NFL && !isLive && <NflInjuryReport lookup={lookup} season={Number(season.season)} />}
          </>
        ) : (
          <NoScores season={shown ?? 'This season'} available={options} onSeason={setPicked} />
        )}
      </section>

      {IS_NFL && <><CrowdDivider /><ScoresBrowser /></>}

      {!IS_NFL && (schedule.records.length > 0 || Object.keys(schedule.headToHead).length > 0 || !!live?.coachHistory?.length) && (
        <section aria-labelledby="alltime-heading" className="space-y-4 rounded-xl border border-border/40 bg-card p-3 sm:p-4">
          <div>
            <h2 id="alltime-heading" className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
              <History className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> All-time
            </h2>
            <p className="text-xs text-muted-foreground">The coach's playoff history from the save; game records and head-to-head from every season with weekly scores{span ? ` (${span})` : ''}.</p>
          </div>
          {!!live?.coachHistory?.length && <PlayoffHistory history={live.coachHistory} />}
          <GameRecords records={schedule.records} />
          <HeadToHeadGrid h2h={schedule.headToHead} span={span || undefined} />
        </section>
      )}
    </div>
  );
};

export default SeasonTab;
