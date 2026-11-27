import { useEffect, useMemo, useState } from 'react';
import { useLeague } from '@/context/LeagueContext';
import { findNFLTeam } from '@/utils/nflTeams';
import { useLiveGames, type LiveDetail, type LiveGame, type ScoreEvent } from '@/utils/liveGames';
import { etInstant, matchLive } from '@/utils/liveMatch';
import type { GameDetail } from '@/utils/nflGames';

/** Dev only: `?liveFixture=1` stands a recorded game in for ESPN (`&liveAdvance=1` moves it on after a few seconds) */
export const liveFixtureOn = (): boolean => {
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).has('liveFixture');
  } catch {
    return false;
  }
};

export interface LiveForGame {
  lg: LiveGame;
  detail: LiveDetail | undefined;
  events: ScoreEvent[];
}

/**
 * The live feed of one site game. ESPN's scoreboard is polled (the shared liveGames poller, 30 s while anything is live)
 * from 15 minutes before the kickoff until 8 hours after it, only for a game the data hasn't recorded a score for; the
 * ESPN game is paired with this one by clubs and kickoff (liveMatch.ts) and its summary follows it. Returns null unless
 * the game is in progress right now (a break such as the half counts: ESPN keeps the state "in").
 */
export const useLiveForGame = (g: GameDetail, done: boolean): LiveForGame | null => {
  const kick = useMemo(() => etInstant(g.date, g.time || '13:00'), [g.date, g.time]);
  const fixture = liveFixtureOn() && !done;
  const [now] = useState(() => Date.now());
  const near = !done && now > kick - 15 * 60_000 && now - kick < 8 * 3600_000;
  const { getAllPlayers } = useLeague();
  const [focus, setFocus] = useState<string | undefined>();
  const snap = useLiveGames(near || fixture, focus);
  const lg = matchLive(snap.games, g.away, g.home, kick);
  useEffect(() => setFocus(lg?.id), [lg?.id]);
  useEffect(() => {
    if (!fixture) return;
    // the clubs' own best active players stand in the fixture, so the spotlight and leaders open real cards
    const who = (abbr: string, pos: string) =>
      getAllPlayers()
        .filter((p) => p.position === pos && p.status === 'Active' && findNFLTeam(p.team)?.abbreviation === abbr)
        .sort((a, b) => b.trueTalent - a.trueTalent)[0]?.name;
    void import('./liveViewFixture').then((m) => m.installLiveViewFixture(g.away, g.home, kick, who));
  }, [fixture, g.away, g.home, kick, getAllPlayers]);
  if (done || !lg || lg.state !== 'in') return null;
  return { lg, detail: snap.detail[lg.id], events: snap.events };
};
