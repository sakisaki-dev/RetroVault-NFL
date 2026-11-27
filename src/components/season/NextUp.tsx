import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { clubPlate } from '@/components/arcade';
import { findNFLTeam } from '@/utils/nflTeams';
import { openGame, regularGameId, useGameIds } from '@/utils/nflGames';
import { useLiveGames, type LiveGame } from '@/utils/liveGames';
import { reducedMotion } from '@/utils/motion';
import type { PickGame, PlayoffOdds } from '@/utils/playoffOdds';
import './nextUp.css';

/**
 * Season page, "Next up": a thin strip of ticket cards under the jumbotron for the coming week's games, and a small LED
 * lamp in the season header counting down to the next kickoff (red and "LIVE" once a game is on). Both read the same
 * data as "This week" (public/data/nfl/playoff_odds.json: kickoffs in Eastern time, records, win chances from the posted
 * lines). ESPN's scoreboard (the shared liveGames poller) is asked only while a kickoff is near or under way, to show
 * a live score; without it a game is "live" for its first 3.5 hours by the clock.
 */
const ET = 'America/New_York';
const WINDOW = 3.5 * 3600_000;
const SOON = 15 * 60_000;
const nickOf = (abbr: string) => findNFLTeam(abbr)?.name ?? abbr;
const pc = (p: number) => `${Math.round(p * 100)}%`;

/** an Eastern wall-clock date and time as the instant it is */
const etInstant = (date: string, time: string): number => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ET, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(guess));
  const p = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const asEt = Date.UTC(p('year'), p('month') - 1, p('day'), p('hour'), p('minute'));
  return guess - (asEt - guess);
};

const tagOf = (g: PickGame): string | null => {
  const [, mo, da] = g.date.split('-').map(Number);
  const hour = Number(g.time.split(':')[0]);
  if (mo === 12 && da === 25) return 'Christmas';
  if (g.day === 'Thu' && mo === 11 && da >= 22 && da <= 28) return 'Thanksgiving';
  if (g.day === 'Fri' && mo === 11 && da >= 23 && da <= 29) return 'Black Friday';
  if (g.day === 'Thu' && hour >= 19) return 'TNF';
  if (g.day === 'Sun' && hour >= 19) return 'SNF';
  if (g.day === 'Mon' && hour >= 19) return 'MNF';
  return null;
};

export interface NextGame {
  g: PickGame;
  kick: number;
  tag: string | null;
  phase: 'pre' | 'live' | 'final';
  live?: LiveGame;
}

const useNow = (ms: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let t: number | undefined;
    const on = () => { setNow(Date.now()); t = window.setInterval(() => setNow(Date.now()), ms); };
    const off = () => { if (t !== undefined) window.clearInterval(t); t = undefined; };
    const vis = () => (document.hidden ? off() : (off(), on()));
    if (!document.hidden) on();
    document.addEventListener('visibilitychange', vis);
    return () => { off(); document.removeEventListener('visibilitychange', vis); };
  }, [ms]);
  return now;
};

/** The coming week's games with their phase now; finished games drop off unless ESPN shows the final. */
const useNextGames = (odds: PlayoffOdds | null, on: boolean, tickMs: number) => {
  const now = useNow(tickMs);
  const base = useMemo(() => (on && odds ? odds.picks.games.map((g) => ({ g, kick: etInstant(g.date, g.time), tag: tagOf(g) })) : []), [on, odds]);
  const near = base.some((b) => b.kick - now < SOON && now - b.kick < WINDOW + 3600_000);
  const snap = useLiveGames(near);
  const games = useMemo(() => {
    const out: NextGame[] = [];
    base.forEach((b) => {
      const lg = snap.games.find((x) => x.home.abbr === b.g.home && x.away.abbr === b.g.away && Math.abs(x.kick - b.kick) < 36 * 3600_000);
      if (lg?.state === 'in') out.push({ ...b, phase: 'live', live: lg });
      else if (lg?.state === 'post') out.push({ ...b, phase: 'final', live: lg });
      else if (b.kick > now) out.push({ ...b, phase: 'pre' });
      else if (now - b.kick < WINDOW) out.push({ ...b, phase: 'live' });
    });
    return out.sort((a, b) => a.kick - b.kick);
  }, [base, snap.games, now]);
  return { games, now };
};

const goThisWeek = () => document.getElementById('this-week')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
const localKick = (kick: number) => {
  const d = new Date(kick);
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};
const phaseText = (l?: LiveGame) => (l ? (l.period > 4 ? 'OT' : l.desc && /half|final/i.test(l.desc) ? l.desc : `Q${l.period || 1} ${l.clock}`.trim()) : '');

const Ticket = ({ n, ids, season }: { n: NextGame; ids: ReturnType<typeof useGameIds>; season: number }) => {
  const { g } = n;
  const favHome = g.pHome >= 0.5;
  const fav = favHome ? g.home : g.away;
  const p = favHome ? g.pHome : 1 - g.pHome;
  const toss = Math.abs(g.pHome - 0.5) < 0.03;
  const plate = clubPlate(nickOf(fav));
  const awayFill = clubPlate(nickOf(g.away)).fill;
  const homeFill = clubPlate(nickOf(g.home)).fill;
  const row = (abbr: string, rec: string, score?: number) => (
    <span className={cn('nu-tm', abbr === fav && !toss && 'is-fav')}>
      <TeamLogo team={nickOf(abbr)} decorative className="h-[22px] w-[22px]" />
      <b>{abbr}</b>
      <em>{score != null ? <i className="nu-sc">{score}</i> : rec}</em>
    </span>
  );
  const l = n.live;
  const showScore = !!l && n.phase !== 'pre';
  return (
    <li className="nu-li">
      <button
        type="button"
        className={cn('nu-ticket', n.phase === 'live' && 'is-live')}
        style={{ '--nu-fav': plate.fill, '--nu-a': awayFill, '--nu-h': homeFill } as CSSProperties}
        aria-label={`${nickOf(g.away)} at ${nickOf(g.home)}, ${n.phase === 'live' ? 'live' : n.phase === 'final' ? 'final' : localKick(n.kick)}. Open the game`}
        onClick={() => openGame(regularGameId(ids, season, g.week, g.away, g.home) ?? g.id)}
      >
        {/* the matchup in club colours: each club's half of the ticket toned in its colour, its logo as a faint watermark */}
        <span className="nu-wm nu-wm--a" aria-hidden><TeamLogo team={nickOf(g.away)} decorative className="h-full w-full" /></span>
        <span className="nu-wm nu-wm--h" aria-hidden><TeamLogo team={nickOf(g.home)} decorative className="h-full w-full" /></span>
        <span className="nu-top">
          <span>{n.phase === 'live' ? <b className="nu-livetag">LIVE</b> : n.phase === 'final' ? 'Final' : localKick(n.kick)}</span>
          {n.phase === 'live' ? <span>{phaseText(l)}</span> : n.tag && <span className={cn('nu-tag', n.tag.length <= 3 && 'is-prime')}>{n.tag}</span>}
        </span>
        {row(g.away, g.awayRec, showScore ? l!.away.score : undefined)}
        {row(g.home, g.homeRec, showScore ? l!.home.score : undefined)}
        <span className="nu-wp" aria-hidden><i style={{ width: pc(p) }} /></span>
        <span className="nu-bot">
          <span>{toss ? 'Toss-up' : `${nickOf(fav)} favoured`}</span>
          <b>{toss ? '' : pc(p)}</b>
        </span>
      </button>
    </li>
  );
};

export const NextUpStrip = ({ odds, show }: { odds: PlayoffOdds | null; show: boolean }) => {
  const { games } = useNextGames(odds, show, 30_000);
  const ids = useGameIds(true);
  const box = useRef<HTMLUListElement | null>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const measure = useCallback(() => {
    const el = box.current;
    if (el) setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  const count = games.length;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    // a vertical wheel scrolls the row sideways (a trackpad's own sideways swipe is left alone)
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const atEnd = e.deltaY > 0 ? el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 : el.scrollLeft <= 0;
      if (atEnd) return; // let the page scroll on past either end
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro?.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [measure, count]);
  if (!show || !odds || !count) return null;
  const page = (d: number) => box.current?.scrollBy({ left: d * box.current.clientWidth * 0.7, behavior: reducedMotion() ? 'auto' : 'smooth' });
  return (
    <section className="nu" aria-label="Next up">
      <div className="nu-head">
        <span className="nu-k">Next up · Week {odds.picks.week}</span>
        <span className="nu-m">{count} game{count === 1 ? '' : 's'}</span>
        <span className="nu-arrows">
          <button type="button" aria-label="Scroll back" tabIndex={-1} disabled={!edge.l} onClick={() => page(-1)}><ChevronLeft className="h-4 w-4" aria-hidden /></button>
          <button type="button" aria-label="Scroll forward" tabIndex={-1} disabled={!edge.r} onClick={() => page(1)}><ChevronRight className="h-4 w-4" aria-hidden /></button>
        </span>
        <button type="button" className="nu-all" onClick={goThisWeek}>All scores →</button>
      </div>
      <ul ref={box} className="nu-row" onScroll={measure} data-l={edge.l ? '' : undefined} data-r={edge.r ? '' : undefined}>
        {games.map((n) => <Ticket key={n.g.id} n={n} ids={ids} season={odds.season} />)}
      </ul>
    </section>
  );
};

const fmtLeft = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const z = (n: number) => String(n).padStart(2, '0');
  return d ? `${d}D ${z(h)}H ${z(m)}M` : `${z(h)}:${z(m)}:${z(ss)}`;
};

export const NextUpLamp = ({ odds, show }: { odds: PlayoffOdds | null; show: boolean }) => {
  const { games, now } = useNextGames(odds, show, 1000);
  if (!show || !games.length) return null;
  const live = games.filter((n) => n.phase === 'live');
  const next = games.find((n) => n.phase === 'pre');
  if (!live.length && !next) return null;
  const isLive = live.length > 0;
  const left = next ? Math.max(0, Math.round((next.kick - now) / 1000)) : 0;
  const what = isLive ? `LIVE · ${live.length} game${live.length === 1 ? '' : 's'}` : `${next!.g.away} @ ${next!.g.home}`;
  const body = (
    <>
      <span className="nu-dot" aria-hidden />
      <span className="nu-what">{what}</span>
      {!isLive && <span className="nu-led">{fmtLeft(left)}</span>}
    </>
  );
  const cls = cn('nu-lamp', isLive && 'is-live', reducedMotion() && 'is-still');
  const label = isLive ? `${live.length} games live. Go to this week's games` : `Next game ${next!.g.away} at ${next!.g.home} in ${fmtLeft(left)}. Go to this week's games`;
  return (
    <button type="button" className={cls} aria-label={label} onClick={goThisWeek}>
      {body}
    </button>
  );
};
