import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { findNFLTeam } from '@/utils/nflTeams';

/**
 * Live NFL games for the screensaver (owner: "for when games are happening also default the screensaver to show the score").
 * Reads ESPN's public scoreboard from the browser (site.api.espn.com answers with access-control-allow-origin: *), the same
 * feed the Scriptable widget reads (public/widgets/rv-nfl-widget.js `normGame`), and the summary of the game on screen.
 * One shared poller: every 30 s while any game is live (or a score just changed), every 5 min otherwise, woken at the next
 * kickoff; paused while the tab is hidden. Nothing is stored; the screensaver asks for it only while it runs.
 */
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/';
const LIVE_MS = 30_000;
const IDLE_MS = 5 * 60_000;
/** how long a score stays "just happened" (the celebration banner) */
export const SCORE_FLASH_MS = 11_000;

const ESPN_ABBR: Record<string, string> = { WSH: 'WAS', LA: 'LAR', JAC: 'JAX', OAK: 'LV' };
const abbrOf = (a: string) => ESPN_ABBR[a] ?? a;
const num = (x: unknown): number | null => {
  const n = parseFloat(String(x));
  return Number.isNaN(n) ? null : n;
};
const arr = <T,>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : []);

export interface LiveTeam {
  abbr: string;
  id: string;
  /** the site's club name ("Bills") */
  name: string;
  score: number;
  /** points by period */
  ls: number[];
  rec: string;
  timeouts: number | null;
}
export interface LiveSituation {
  down: number;
  dist: number;
  /** "3rd & 4" */
  dd: string;
  /** the club on offence (abbreviation) */
  poss: string | null;
  /** the ball's spot: whose half and the yard line */
  spot: { side: string; yd: number } | null;
  redZone: boolean;
  last: string;
}
export interface LiveLeader {
  cat: 'passing' | 'rushing' | 'receiving';
  name: string;
  pos: string;
  line: string;
}
export interface LiveGame {
  id: string;
  state: 'pre' | 'in' | 'post';
  kick: number;
  period: number;
  clock: string;
  /** ESPN's short status ("Halftime", "3rd Quarter") */
  desc: string;
  home: LiveTeam;
  away: LiveTeam;
  venue: string;
  indoor: boolean;
  weather: string;
  sit: LiveSituation | null;
  /** side abbreviation -> its leaders (from the scoreboard) */
  leaders: Record<string, LiveLeader[]>;
  headline: string;
}
export interface LiveDetail {
  /** home win probability 0..1 (the latest point), null when ESPN has none */
  winHome: number | null;
  /** the current drive ("6 plays, 42 yards, 2:51") */
  drive: string;
  /** the scoring plays so far, last last */
  scoring: { text: string; abbr: string }[];
  leaders: Record<string, LiveLeader[]>;
  last: string;
}
export interface ScoreEvent {
  gameId: string;
  /** the scoring club's abbreviation */
  abbr: string;
  side: 'home' | 'away';
  pts: number;
  kind: 'TOUCHDOWN' | 'FIELD GOAL' | 'SAFETY' | 'EXTRA POINT' | 'SCORE';
  at: number;
  /** the scorer's name, once the summary says */
  scorer?: string;
  text?: string;
}

const LEADER_CATS: Record<string, LiveLeader['cat']> = { passingYards: 'passing', rushingYards: 'rushing', receivingYards: 'receiving' };
const leadersOf = (list: unknown[]): LiveLeader[] => {
  const out: LiveLeader[] = [];
  arr(list as Record<string, unknown>[]).forEach((c) => {
    const cat = LEADER_CATS[String(c.name)];
    const l = arr(c.leaders as Record<string, unknown>[])[0];
    const a = l?.athlete as Record<string, unknown> | undefined;
    if (!cat || !a) return;
    out.push({ cat, name: String(a.displayName ?? a.shortName ?? ''), pos: String((a.position as Record<string, unknown> | undefined)?.abbreviation ?? ''), line: String(l.displayValue ?? '') });
  });
  return out;
};

/** ESPN's scoreboard event -> a LiveGame (the widget's normGame, plus timeouts, weather and leaders by club) */
export const normGame = (e: Record<string, any>): LiveGame | null => {
  const c = arr<any>(e.competitions)[0];
  if (!c) return null;
  const st = c.status || e.status || {};
  const side = (ha: 'home' | 'away'): LiveTeam | null => {
    const x = arr<any>(c.competitors).find((k) => k.homeAway === ha);
    if (!x) return null;
    const abbr = abbrOf(x.team?.abbreviation ?? '');
    return {
      abbr,
      id: String(x.team?.id ?? x.id),
      name: findNFLTeam(abbr)?.name ?? x.team?.shortDisplayName ?? x.team?.displayName ?? abbr,
      score: num(x.score) ?? 0,
      ls: arr<any>(x.linescores).map((l) => num(l.value ?? l.displayValue) ?? 0),
      rec: arr<any>(x.records)[0]?.summary ?? '',
      timeouts: null,
    };
  };
  const home = side('home');
  const away = side('away');
  if (!home || !away) return null;
  const leaders: Record<string, LiveLeader[]> = {};
  arr<any>(c.competitors).forEach((x) => {
    const ab = abbrOf(x.team?.abbreviation ?? '');
    const l = leadersOf(x.leaders);
    if (l.length) leaders[ab] = l;
  });
  const g: LiveGame = {
    id: String(e.id),
    state: (st.type?.state as LiveGame['state']) ?? 'pre',
    kick: Date.parse(e.date),
    period: st.period || 0,
    clock: st.displayClock || '',
    desc: st.type?.shortDetail || st.type?.description || '',
    home,
    away,
    venue: c.venue?.fullName ?? '',
    indoor: !!c.venue?.indoor,
    weather: e.weather ? [e.weather.displayValue, e.weather.temperature != null ? `${Math.round(e.weather.temperature)}°F` : ''].filter(Boolean).join(' · ') : '',
    sit: null,
    leaders,
    headline: arr<any>(c.headlines)[0]?.shortLinkText ?? '',
  };
  const s = c.situation;
  if (s) {
    const poss = [home, away].find((t) => String(t.id) === String(s.possession));
    const m = /([A-Z]{2,3})\s+(\d+)/.exec(s.possessionText || s.downDistanceText || '');
    const ord = ['', '1st', '2nd', '3rd', '4th'][s.down] ?? '';
    home.timeouts = typeof s.homeTimeouts === 'number' ? s.homeTimeouts : null;
    away.timeouts = typeof s.awayTimeouts === 'number' ? s.awayTimeouts : null;
    g.sit = {
      down: s.down ?? 0,
      dist: s.distance ?? 0,
      dd: s.down ? `${ord} & ${s.distance || 'Goal'}` : '',
      poss: poss?.abbr ?? null,
      spot: m ? { side: abbrOf(m[1]), yd: +m[2] } : null,
      redZone: !!s.isRedZone,
      last: s.lastPlay?.text ?? '',
    };
  }
  return g;
};

/** ESPN's summary -> what the single-game scene adds to the scoreboard */
export const normDetail = (d: Record<string, any>): LiveDetail => {
  const wp = arr<any>(d.winprobability);
  const wl = wp.length ? num(wp[wp.length - 1].homeWinPercentage) : null;
  const leaders: Record<string, LiveLeader[]> = {};
  arr<any>(d.leaders).forEach((t) => {
    const ab = abbrOf(t.team?.abbreviation ?? '');
    const l = leadersOf(t.leaders);
    if (ab && l.length) leaders[ab] = l;
  });
  const cur = d.drives?.current;
  const plays = arr<any>(cur?.plays);
  return {
    winHome: wl,
    drive: cur?.description ?? '',
    scoring: arr<any>(d.scoringPlays).map((p) => ({ text: String(p.text ?? ''), abbr: abbrOf(p.team?.abbreviation ?? '') })),
    leaders,
    last: plays.length ? String(plays[plays.length - 1].text ?? '') : '',
  };
};

/** A scoring play's text begins with the scorer: "George Kittle 17 Yd pass from Brock Purdy (...)" */
export const scorerOf = (text: string): string | undefined => {
  const m = /^([A-Za-z][A-Za-z.'’ -]+?)\s+\d/.exec(text.trim());
  return m?.[1]?.trim() || undefined;
};

const kindOf = (pts: number): ScoreEvent['kind'] => (pts >= 6 && pts <= 8 ? 'TOUCHDOWN' : pts === 3 ? 'FIELD GOAL' : pts === 2 ? 'SAFETY' : pts === 1 ? 'EXTRA POINT' : 'SCORE');

/* ---------------- the shared store ---------------- */
export interface LiveSnapshot {
  games: LiveGame[];
  live: LiveGame[];
  detail: Record<string, LiveDetail>;
  events: ScoreEvent[];
  updated: number;
  /** a dev fixture is standing in for ESPN */
  fixture: boolean;
}
let snap: LiveSnapshot = { games: [], live: [], detail: {}, events: [], updated: 0, fixture: false };
const listeners = new Set<() => void>();
const publish = (patch: Partial<LiveSnapshot>) => {
  snap = { ...snap, ...patch };
  if (patch.games) snap.live = snap.games.filter((g) => g.state === 'in');
  listeners.forEach((l) => l());
};

/** who wants it: a count of active readers and the game on screen */
let readers = 0;
const focus = new Map<symbol, string | undefined>();
let timer = 0;
let busy = false;
let useFixture = false;

const focusIds = () => [...new Set([...focus.values()].filter((x): x is string => !!x))];

const noteScores = (next: LiveGame[]) => {
  const before = new Map(snap.games.map((g) => [g.id, g]));
  const fresh: ScoreEvent[] = [];
  next.forEach((g) => {
    const b = before.get(g.id);
    if (!b || g.state !== 'in') return;
    (['away', 'home'] as const).forEach((s) => {
      const d = g[s].score - b[s].score;
      if (d > 0) fresh.push({ gameId: g.id, abbr: g[s].abbr, side: s, pts: d, kind: kindOf(d), at: Date.now() });
    });
  });
  if (fresh.length) publish({ events: [...snap.events.filter((e) => Date.now() - e.at < 10 * 60_000), ...fresh] });
  return fresh.length > 0;
};

const getJson = async (url: string) => {
  // no custom headers (cache: 'no-store' would add Cache-Control and force a CORS preflight ESPN does not answer); ESPN caches 5 s anyway
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
};

const fetchDetail = async (id: string) => {
  try {
    const d = normDetail(await getJson(`${ESPN}summary?event=${id}`));
    const events = snap.events.map((e) => {
      if (e.gameId !== id || e.scorer) return e;
      // the newest scoring play of that club is this event's
      const mine = d.scoring.filter((p) => p.abbr === e.abbr);
      const t = mine[mine.length - 1]?.text;
      return t ? { ...e, scorer: scorerOf(t), text: t } : e;
    });
    publish({ detail: { ...snap.detail, [id]: d }, events });
  } catch {
    /* keep the last detail */
  }
};

const poll = async () => {
  if (busy || useFixture) return;
  busy = true;
  try {
    const board = await getJson(`${ESPN}scoreboard`);
    const games = arr<any>(board.events).map(normGame).filter((g): g is LiveGame => !!g);
    if (useFixture) return;
    noteScores(games);
    publish({ games, updated: Date.now() });
    await Promise.all(focusIds().filter((id) => games.some((g) => g.id === id && g.state !== 'pre')).map(fetchDetail));
  } catch {
    /* offline or ESPN down: keep what we have and try again on the next turn */
  } finally {
    busy = false;
  }
};

const schedule = () => {
  window.clearTimeout(timer);
  if (!readers || useFixture) return;
  const anyLive = snap.live.length > 0;
  let wait = anyLive ? LIVE_MS : IDLE_MS;
  // wake at the next kickoff
  const nextKick = snap.games.filter((g) => g.state === 'pre' && g.kick > Date.now()).map((g) => g.kick).sort((a, b) => a - b)[0];
  if (!anyLive && nextKick && nextKick - Date.now() < wait) wait = Math.max(5_000, nextKick - Date.now() + 5_000);
  timer = window.setTimeout(async () => {
    if (!document.hidden) await poll();
    schedule();
  }, wait);
};

const onVisible = () => {
  if (!document.hidden && readers) {
    void poll().then(schedule);
  }
};

const start = () => {
  if (useFixture) return;
  document.addEventListener('visibilitychange', onVisible);
  void poll().then(schedule);
};
const stop = () => {
  window.clearTimeout(timer);
  document.removeEventListener('visibilitychange', onVisible);
};

/** The dev fixture's scene (?saverScene=gameday|redzone), else null */
export const liveFixtureScene = (): 'gameday' | 'redzone' | null => {
  try {
    const v = new URLSearchParams(window.location.search).get('saverScene');
    return v === 'gameday' || v === 'redzone' ? v : null;
  } catch {
    return null;
  }
};

/** Hand the store a recorded game set instead of ESPN (dev fixture only) */
export const loadFixture = (games: LiveGame[], detail: Record<string, LiveDetail>) => {
  useFixture = true;
  publish({ games, detail, updated: Date.now(), fixture: true });
};
/** Move a fixture on (a score, a new spot): runs the same score detection as a poll */
export const advanceFixture = (fn: (g: LiveGame[]) => LiveGame[], detail?: Record<string, LiveDetail>) => {
  const next = fn(snap.games);
  noteScores(next);
  publish({ games: next, ...(detail ? { detail: { ...snap.detail, ...detail } } : {}), updated: Date.now() });
  // the fixture's scoring plays name the scorer, as the summary would
  const d = snap.detail;
  publish({
    events: snap.events.map((e) => {
      if (e.scorer) return e;
      const mine = (d[e.gameId]?.scoring ?? []).filter((p) => p.abbr === e.abbr);
      const t = mine[mine.length - 1]?.text;
      return t ? { ...e, scorer: scorerOf(t), text: t } : e;
    }),
  });
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Live games. `active`: poll (the screensaver is showing); `focusId`: the game on screen, whose summary is fetched with every
 * poll. `live` is the games in progress now, `events` the scores seen since the screensaver started.
 */
export const useLiveGames = (active: boolean, focusId?: string): LiveSnapshot => {
  const s = useSyncExternalStore(subscribe, () => snap, () => snap);
  const me = useRef<symbol>();
  me.current ??= Symbol('live');
  useEffect(() => {
    if (!active) return;
    readers += 1;
    if (readers === 1) start();
    return () => {
      readers -= 1;
      if (readers === 0) stop();
      focus.delete(me.current!);
    };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    focus.set(me.current!, focusId);
    if (focusId && !useFixture && !snap.detail[focusId]) void fetchDetail(focusId);
  }, [active, focusId]);
  // a poll that lands later picks the new focus up on its own; a faster turn when something is live
  useEffect(() => {
    if (active && s.live.length) schedule();
  }, [active, s.live.length]);
  return useMemo(() => s, [s]);
};

/** Is a score less than SCORE_FLASH_MS old? */
export const freshEvent = (events: ScoreEvent[], gameId: string, now = Date.now()) =>
  [...events].reverse().find((e) => e.gameId === gameId && now - e.at < SCORE_FLASH_MS && e.kind !== 'EXTRA POINT') ?? null;
