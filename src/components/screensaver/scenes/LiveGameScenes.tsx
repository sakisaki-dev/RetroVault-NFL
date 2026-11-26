import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Player } from '@/types/player';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import { findNFLTeam } from '@/utils/nflTeams';
import { liftForDarkBg } from '@/utils/teamColors';
import { displayName, surnameOf } from '@/utils/displayName';
import { freshEvent, useLiveGames, type LiveDetail, type LiveGame, type LiveLeader, type LiveTeam, type ScoreEvent } from '@/utils/liveGames';
import type { SaverLive } from '@/utils/saverLive';
import type { GamePlayer } from '@/utils/nflGames';
import { reducedMotion, type SaverDeps } from './nflSaverData';
import './liveGames.css';

/**
 * Live games on the screensaver (owner: "design a screensaver with the stadium they're playing in, score bug etc etc,
 * immersive as well while the game is happening, a version for when multiple games are happening").
 *   Game Day       one game in its home stadium: a pixel score bug, both clubs' players on the turf, the drive, the last play,
 *                  the box score, the leaders and the win chance; RED ZONE flashes; a score is a banner with confetti.
 *   Red Zone wall  two or more games: a jumbotron of score bugs, the game in or nearest the red zone enlarged.
 * The show cycles the wall and each live game in turn. Nothing here is AI or stored: it is ESPN's scoreboard, normalised.
 */
const GAME_MS = 26_000;
const WALL_MS = 22_000;
const REST_MS = 14_000;
const REST_EVERY = 3;

/* ---------- colours: the club's primary for a panel (its secondary when the primary is near-black), readable text for the dark ---------- */
const lightness = (hsl: string) => parseFloat(hsl.split(/\s+/)[2] ?? '40');
const panelHsl = (abbr: string) => {
  const t = findNFLTeam(abbr);
  if (!t) return '220 10% 30%';
  return lightness(t.primaryColor) < 15 ? t.secondaryColor : t.primaryColor;
};
const ink = (abbr: string) => liftForDarkBg(panelHsl(abbr), 62);
const teamVars = (a: string, b: string) => ({ '--ca': `hsl(${panelHsl(a)})`, '--cb': `hsl(${panelHsl(b)})`, '--ia': ink(a), '--ib': ink(b) }) as CSSProperties;

const clockText = (g: LiveGame) => {
  if (/half/i.test(g.desc)) return 'HALF';
  if (g.state === 'post') return 'FINAL';
  return `${g.period > 4 ? 'OT' : `Q${g.period}`} ${g.clock}`.trim();
};
const quarterWord = (g: LiveGame) => (/half/i.test(g.desc) ? 'Halftime' : g.period > 4 ? 'Overtime' : ['', '1st', '2nd', '3rd', '4th'][g.period] + ' quarter');

/** Where the ball is on the field, 0 (away's goal line) to 100 (home's), and the way the offence is driving */
const fieldPos = (g: LiveGame): { x: number; dir: 1 | -1; red: boolean } | null => {
  const s = g.sit;
  if (!s?.spot || !s.poss) return null;
  const x = s.spot.side === g.away.abbr ? s.spot.yd : 100 - s.spot.yd;
  const dir = s.poss === g.away.abbr ? 1 : -1;
  const toGo = dir === 1 ? 100 - x : x;
  return { x, dir, red: s.redZone || toGo <= 20 };
};
const redZoneNow = (g: LiveGame) => g.state === 'in' && (g.sit?.redZone || (fieldPos(g)?.red ?? false));

/** What the wall and the cycle put first: the red zone, then the tightest, latest game */
export const liveOrder = (games: LiveGame[], events: ScoreEvent[], now = Date.now()) =>
  games.slice().sort((a, b) => {
    const rz = (redZoneNow(b) ? 1 : 0) - (redZoneNow(a) ? 1 : 0);
    if (rz) return rz;
    const fa = freshEvent(events, a.id, now) ? 1 : 0;
    const fb = freshEvent(events, b.id, now) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const close = Math.abs(a.home.score - a.away.score) - Math.abs(b.home.score - b.away.score);
    return close || b.period - a.period || a.kick - b.kick;
  });

const useNow = (ms: number) => {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setN(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return n;
};

/* ---------- small pieces ---------- */
const Football = ({ className }: { className?: string }) => (
  <svg className={`sv-lg__ball ${className ?? ''}`} viewBox="0 0 24 14" aria-hidden="true">
    <ellipse cx="12" cy="7" rx="11" ry="6" fill="#8a4a1f" stroke="#2a1306" strokeWidth="1.4" />
    <path d="M6 7h12M9 4.8v4.4M12 4.4v5.2M15 4.8v4.4" stroke="#f5efe2" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);
const Pips = ({ n }: { n: number | null }) => (
  <span className="sv-lg__pips" aria-label={n === null ? undefined : `${n} timeouts`}>
    {[0, 1, 2].map((i) => (
      <i key={i} className={n === null || i < n ? 'is-on' : ''} />
    ))}
  </span>
);
const Live = ({ label = 'Live' }: { label?: string }) => (
  <span className="sv-lg__live">
    <i /> {label}
  </span>
);
const Confetti = ({ colors, count = 70 }: { colors: string[]; count?: number }) => {
  const h = (n: number) => {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  return (
    <span className="sv-parts sv-parts--confetti sv-lg__confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${h(i + 1) * 100}%`,
              '--d': `${-h(i + 7) * 3}s`,
              '--t': `${3.2 + h(i + 13) * 3}s`,
              '--s': `${6 + h(i + 29) * 8}px`,
              '--x': `${(h(i + 41) - 0.5) * 220}px`,
              '--r': `${h(i + 53) * 720 - 360}deg`,
              '--c': colors[i % colors.length],
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
};

/** A club-colour score panel (the widget's score bug): logo, name, record, big score, timeouts, a ball when on offence */
const Panel = ({ t, offence, side, small, glow }: { t: LiveTeam; offence: boolean; side: 'away' | 'home'; small?: boolean; glow?: boolean }) => (
  <div className={`sv-lg__panel sv-lg__panel--${side} ${small ? 'is-small' : ''} ${glow ? 'is-glow' : ''}`} style={{ '--c': `hsl(${panelHsl(t.abbr)})` } as CSSProperties}>
    <TeamLogo team={t.name} size={small ? 40 : 76} decorative />
    <span className="sv-lg__pname">
      <b>{t.name}</b>
      <small>{t.rec ? `${t.rec} · ` : ''}{t.abbr}</small>
    </span>
    <span className="sv-lg__pscore">{t.score}</span>
    <span className="sv-lg__pextra">
      <Pips n={t.timeouts} />
      {offence ? <Football /> : <span className="sv-lg__noball" />}
    </span>
  </div>
);

const FieldStrip = ({ g, flash }: { g: LiveGame; flash?: boolean }) => {
  const f = fieldPos(g);
  const pct = (x: number) => 100 / 12 + x * (10 / 12);
  const s = g.sit;
  const fd = f && s?.dist ? f.x + f.dir * s.dist : null;
  const ydLabel = s?.spot ? `${s.spot.side} ${s.spot.yd}` : '';
  return (
    <div className={`sv-lg__strip ${f?.red ? 'is-red' : ''}`} style={teamVars(g.away.abbr, g.home.abbr)}>
      <span className="sv-lg__ez sv-lg__ez--a"><b>{g.away.name}</b></span>
      <span className="sv-lg__ez sv-lg__ez--h"><b>{g.home.name}</b></span>
      <span className="sv-lg__yards" aria-hidden="true">
        {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((n, i) => (
          <u key={i} style={{ left: `${pct((i + 1) * 10)}%` }}>{n}</u>
        ))}
      </span>
      {f && <span className="sv-lg__rz" style={f.dir === 1 ? { left: `${pct(80)}%`, width: `${pct(100) - pct(80)}%` } : { left: `${pct(0)}%`, width: `${pct(20) - pct(0)}%` }} />}
      {f && fd !== null && fd >= 0 && fd <= 100 && <span className="sv-lg__fd" style={{ left: `${pct(fd)}%` }} />}
      {f && (
        <span className="sv-lg__marker" style={{ left: `${pct(f.x)}%` }}>
          <Football />
          <em>{ydLabel}</em>
        </span>
      )}
      {!f && <span className="sv-lg__nospot">{quarterWord(g)}</span>}
      {(f?.red || flash) && <span className="sv-lg__rzflag">Red zone</span>}
    </div>
  );
};

const shortName = (n: string) => {
  const p = displayName(n);
  const sp = p.split(' ');
  return sp.length > 1 ? `${sp[0][0]}. ${surnameOf(p)}` : p;
};
const LeaderLines = ({ abbr, list }: { abbr: string; list: LiveLeader[] }) => (
  <div className="sv-lg__leaders" style={{ '--i': ink(abbr) } as CSSProperties}>
    <h4>{findNFLTeam(abbr)?.name ?? abbr}</h4>
    {list.slice(0, 3).map((l) => (
      <p key={l.cat}>
        <u>{l.cat === 'passing' ? 'PASS' : l.cat === 'rushing' ? 'RUSH' : 'REC'}</u>
        <b>{shortName(l.name)}</b>
        <span>{l.line.replace(/ YDS/gi, ' yds').replace(/ TD/g, ' TD').replace(/ INT/g, ' INT')}</span>
      </p>
    ))}
  </div>
);

const BoxScore = ({ g }: { g: LiveGame }) => {
  const periods = Math.max(4, g.away.ls.length, g.home.ls.length);
  const heads = Array.from({ length: periods }, (_, i) => (i < 4 ? `${i + 1}` : i === 4 ? 'OT' : `OT${i - 3}`));
  const row = (t: LiveTeam) => (
    <tr key={t.abbr} style={{ '--i': ink(t.abbr) } as CSSProperties}>
      <th>{t.abbr}</th>
      {heads.map((_, i) => (
        <td key={i} className={i + 1 === g.period && g.state === 'in' ? 'is-now' : ''}>{t.ls[i] ?? (i < g.period ? 0 : '')}</td>
      ))}
      <td className="is-total">{t.score}</td>
    </tr>
  );
  return (
    <table className="sv-lg__box" aria-label="Box score by quarter">
      <thead>
        <tr>
          <th />
          {heads.map((h) => (
            <th key={h}>{h}</th>
          ))}
          <th>T</th>
        </tr>
      </thead>
      <tbody>
        {row(g.away)}
        {row(g.home)}
      </tbody>
    </table>
  );
};

const WinBar = ({ g, win }: { g: LiveGame; win: number | null }) => {
  if (win === null) return <div className="sv-lg__win is-none"><h4>Win chance</h4><p>Not on the feed yet</p></div>;
  const h = Math.round(win * 100);
  return (
    <div className="sv-lg__win" style={teamVars(g.away.abbr, g.home.abbr)}>
      <h4>Win chance</h4>
      <div className="sv-lg__winbar" role="img" aria-label={`${g.home.name} ${h} percent, ${g.away.name} ${100 - h} percent`}>
        <i className="sv-lg__winh" style={{ width: `${h}%` }} />
        <i className="sv-lg__wina" style={{ width: `${100 - h}%` }} />
        <span className="sv-lg__winmid" />
      </div>
      <p>
        <b style={{ color: 'var(--ib)' }}>{g.home.abbr} {h}%</b>
        <b style={{ color: 'var(--ia)' }}>{100 - h}% {g.away.abbr}</b>
      </p>
    </div>
  );
};

/* ---------- the players on the turf ---------- */
const asGp = (name: string, pos: string): GamePlayer => ({ name, gsis: '', pos, side: 0, s: {} as GamePlayer['s'] });
const rosterBest = (players: Player[], club: string, pos: string) =>
  players.filter((p) => p.position === pos && findNFLTeam(p.team ?? '')?.name === club && p.status === 'Active').sort((a, b) => b.careerLegacy - a.careerLegacy)[0];

/** Each side's QB and best skill player of the game (the leaders ESPN names, else the club's best card player) */
const faces = (g: LiveGame, side: 'away' | 'home', list: LiveLeader[], deps: SaverDeps, players: Player[]): Player[] => {
  const club = g[side].name;
  const out: Player[] = [];
  const pick = (l?: LiveLeader) => {
    if (!l) return undefined;
    const p = deps.lookup(asGp(l.name, l.pos));
    return p && findNFLTeam(p.team ?? '')?.name === club ? p : p;
  };
  const qb = pick(list.find((l) => l.cat === 'passing')) ?? rosterBest(players, club, 'QB');
  if (qb) out.push(qb);
  const sk = pick(list.find((l) => l.cat === 'rushing')) ?? pick(list.find((l) => l.cat === 'receiving')) ?? rosterBest(players, club, 'WR');
  if (sk && !out.includes(sk)) out.push(sk);
  return out.slice(0, 2);
};

const Side = ({ g, side, people, deps, cele }: { g: LiveGame; side: 'away' | 'home'; people: Player[]; deps: SaverDeps; cele: boolean }) => (
  <div className={`sv-lg__side sv-lg__side--${side} ${cele ? 'is-cele' : ''}`}>
    {(side === 'home' ? [...people].reverse() : people).map((p, i) => (
      <span key={p.name} className="sv-fig sv-lg__fig" style={{ '--sv-scale': i === 0 ? 1.35 : 1.15 } as CSSProperties}>
        <span className="sv-fig__shadow" />
        {deps.sprites ? (
          <GameSprite player={p} team={g[side].name} kind="figure" size="l" action={cele ? 'celebrate' : 'idle'} flip={side === 'home'} className="sv-fig__sprite" />
        ) : (
          <span className="sv-fig__logo"><TeamLogo team={g[side].name} size={110} decorative /></span>
        )}
      </span>
    ))}
    {people.length === 0 && !deps.sprites && <TeamLogo team={g[side].name} size={140} decorative />}
  </div>
);

/** Time of day from the clock (ET): night under the lights from 7 pm, dusk from 4:30, else a day game */
const rollFor = (g: LiveGame, now: number) => {
  const h = (new Date(now).getUTCHours() + 24 - 5) % 24;
  return h >= 19 || h < 3 ? 0.9 : h >= 16 ? 0.4 : 0.1;
};

/* ---------- Game Day ---------- */
export const GameDayScene = ({ g, detail, events, deps, players, ms }: { g: LiveGame; detail?: LiveDetail; events: ScoreEvent[]; deps: SaverDeps; players: Player[]; ms: number }) => {
  const now = useNow(500);
  const ev = freshEvent(events, g.id, now);
  const flipPlayers = useMemo(() => {
    const lead = (s: 'away' | 'home') => detail?.leaders[g[s].abbr] ?? g.leaders[g[s].abbr] ?? [];
    return { away: faces(g, 'away', lead('away'), deps, players), home: faces(g, 'home', lead('home'), deps, players) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.id, detail, players, deps.sprites]);
  const t = findNFLTeam(g.home.abbr);
  const colors = ev ? [`hsl(${panelHsl(ev.abbr)})`, `hsl(${findNFLTeam(ev.abbr)?.secondaryColor ?? '45 90% 55%'})`, '#ffffff'] : [];
  const scorer = ev?.scorer ? deps.lookup(asGp(ev.scorer, '')) : undefined;
  const last = g.sit?.last || detail?.last || '';
  const win = detail?.winHome ?? null;
  const rz = redZoneNow(g);
  const sit = g.sit;
  const wxLine = [g.venue, g.indoor ? 'Roof' : 'Open air', g.weather].filter(Boolean).join(' · ');
  const { Stadium } = deps;
  return (
    <Stadium club={g.home.name} roll={rollFor(g, now)}>
      <div className={`sv-lg ${rz ? 'is-rz' : ''}`} style={{ ...teamVars(g.away.abbr, g.home.abbr), '--sv-dur': `${ms}ms` } as CSSProperties}>
        {rz && <span className="sv-lg__vig" aria-hidden="true" />}
        <p className="sv-lg__kick">
          <Live /> <span>Game day</span> <span>{quarterWord(g)}</span> {wxLine && <span className="sv-lg__wx">{wxLine}</span>}
        </p>
        <div className="sv-lg__bug">
          <Panel t={g.away} offence={sit?.poss === g.away.abbr} side="away" />
          <div className="sv-lg__mid">
            <span className="sv-lg__qt">{clockText(g)}</span>
            {sit?.dd ? <span className="sv-lg__dd">{sit.dd}{sit.spot ? ` at ${sit.spot.side} ${sit.spot.yd}` : ''}</span> : <span className="sv-lg__dd is-quiet">{g.desc || quarterWord(g)}</span>}
            {rz && <span className="sv-lg__rzbadge">Red zone</span>}
          </div>
          <Panel t={g.home} offence={sit?.poss === g.home.abbr} side="home" />
        </div>
        <div className="sv-lg__field">
          <Side g={g} side="away" people={flipPlayers.away} deps={deps} cele={ev?.side === 'away'} />
          <Side g={g} side="home" people={flipPlayers.home} deps={deps} cele={ev?.side === 'home'} />
        </div>
        {ev && (
          <div key={ev.at} className="sv-lg__cele" style={{ '--c': `hsl(${panelHsl(ev.abbr)})`, '--i': ink(ev.abbr) } as CSSProperties}>
            <Confetti colors={colors} count={deps.sprites || true ? 80 : 40} />
            <div className="sv-lg__celebanner">
              <TeamLogo team={findNFLTeam(ev.abbr)?.name ?? ev.abbr} size={84} decorative />
              <span>
                <b>{ev.kind}</b>
                <small>{findNFLTeam(ev.abbr)?.name} · {g.away.abbr} {g.away.score}, {g.home.abbr} {g.home.score}</small>
              </span>
            </div>
            {ev.scorer && (
              <p className="sv-lg__scorer">
                {scorer && deps.sprites && (
                  <span className="sv-lg__scorerfig">
                    <GameSprite player={scorer} team={findNFLTeam(ev.abbr)?.name} kind="figure" size="l" action="celebrate" />
                  </span>
                )}
                <b>{displayName(ev.scorer)}</b>
              </p>
            )}
          </div>
        )}
        <div className="sv-lg__low">
          <FieldStrip g={g} flash={false} />
          <p className="sv-lg__ticker">
            <u>{detail?.drive ? 'Drive' : 'Last play'}</u>
            <span>{last || detail?.drive || 'Waiting for the next snap'}</span>
            {detail?.drive && last ? <em>{detail.drive}</em> : null}
          </p>
          <div className="sv-lg__dash">
            <BoxScore g={g} />
            <WinBar g={g} win={win} />
            <div className="sv-lg__lead2">
              <LeaderLines abbr={g.away.abbr} list={detail?.leaders[g.away.abbr] ?? g.leaders[g.away.abbr] ?? []} />
              <LeaderLines abbr={g.home.abbr} list={detail?.leaders[g.home.abbr] ?? g.leaders[g.home.abbr] ?? []} />
            </div>
          </div>
        </div>
        <span className="sv-lg__tag" aria-hidden="true">{t?.fullName}</span>
      </div>
    </Stadium>
  );
};

/* ---------- Red Zone wall ---------- */
const WallBug = ({ g, big, rz }: { g: LiveGame; big: boolean; rz: boolean }) => {
  const s = g.sit;
  const row = (t: LiveTeam, side: 'away' | 'home') => (
    <div className={`sv-lg__wrow ${s?.poss === t.abbr ? 'is-off' : ''} ${t.score > (side === 'away' ? g.home.score : g.away.score) ? 'is-lead' : ''}`} style={{ '--c': `hsl(${panelHsl(t.abbr)})`, '--i': ink(t.abbr) } as CSSProperties}>
      <TeamLogo team={t.name} size={big ? 64 : 34} decorative />
      <span className="sv-lg__wname"><b>{t.name}</b>{big && <small>{t.rec}</small>}</span>
      {s?.poss === t.abbr && <Football />}
      {big && <Pips n={t.timeouts} />}
      <span className="sv-lg__wscore">{t.score}</span>
    </div>
  );
  return (
    <article className={`sv-lg__wbug ${big ? 'is-big' : ''} ${rz ? 'is-rz' : ''}`}>
      <header>
        <Live label={clockText(g)} />
        {s?.dd && <span className="sv-lg__dd">{s.dd}{s.spot ? ` · ${s.spot.side} ${s.spot.yd}` : ''}</span>}
        {rz && <span className="sv-lg__rzbadge">Red zone</span>}
      </header>
      {row(g.away, 'away')}
      {row(g.home, 'home')}
      {big && (
        <>
          <FieldStrip g={g} />
          {g.sit?.last && <p className="sv-lg__ticker sv-lg__ticker--w"><u>Last play</u><span>{g.sit.last}</span></p>}
        </>
      )}
    </article>
  );
};

export const RedZoneWall = ({ games, events, deps, ms, more }: { games: LiveGame[]; events: ScoreEvent[]; deps: SaverDeps; ms: number; more: number }) => {
  const now = useNow(1000);
  const ordered = liveOrder(games, events, now);
  const [hi, ...rest] = ordered;
  const featured = games.length > 2;
  const k = rest.length <= 4 ? 1 : 2;
  const { Stadium } = deps;
  const rz = ordered.filter(redZoneNow).length;
  return (
    <Stadium club={hi.home.name} roll={rollFor(hi, now)}>
      <div className="sv-lg sv-lg--wall" style={{ '--sv-dur': `${ms}ms` } as CSSProperties}>
        <div className="sv-lg__jumbo">
          <header className="sv-lg__jhead">
            <Live />
            <b>Red Zone</b>
            <span>{games.length + more} games on{rz ? ` · ${rz} in the red zone` : ''}</span>
          </header>
          <div className={`sv-lg__wall ${featured ? 'is-featured' : 'is-pair'}`} style={{ '--k': k } as CSSProperties}>
            {featured ? (
              <>
                <div className="sv-lg__wfeat"><WallBug g={hi} big rz={redZoneNow(hi)} /></div>
                <div className="sv-lg__wrest" style={{ gridTemplateColumns: `repeat(${k}, minmax(0, 1fr))` }}>
                  {rest.map((g, i) => (
                    <div key={g.id} className={rest.length % k && i === rest.length - 1 ? 'is-span' : ''}><WallBug g={g} big={false} rz={redZoneNow(g)} /></div>
                  ))}
                </div>
              </>
            ) : (
              ordered.map((g) => <WallBug key={g.id} g={g} big rz={redZoneNow(g)} />)
            )}
          </div>
          {more > 0 && <p className="sv-lg__more">+{more} more live</p>}
        </div>
      </div>
    </Stadium>
  );
};

/* ---------- the show: the wall, then each game in turn ---------- */
type Seg = { kind: 'wall' } | { kind: 'game'; id: string };

export const LiveShow = ({ mode, deps, players, onShown }: { mode: Exclude<SaverLive, 'off'>; deps: SaverDeps; players: Player[]; onShown?: (on: boolean) => void }) => {
  const [seg, setSeg] = useState<Seg | null>(null);
  const [prev, setPrev] = useState<Seg | null>(null);
  const [rest, setRest] = useState(false);
  const count = useRef(0);
  const seenEvents = useRef(0);
  const focusId = seg?.kind === 'game' ? seg.id : undefined;
  const { live, detail, events } = useLiveGames(true, focusId);
  const ordered = useMemo(() => liveOrder(live, events), [live, events]);
  const ids = ordered.map((g) => g.id).join(',');

  // the cycle: [wall, game, game...] for two or more games, the one game for one
  const next = (cur: Seg | null): Seg | null => {
    if (!ordered.length) return null;
    if (ordered.length === 1) return { kind: 'game', id: ordered[0].id };
    const list: Seg[] = [{ kind: 'wall' }, ...ordered.map((g): Seg => ({ kind: 'game', id: g.id }))];
    const at = cur ? list.findIndex((s) => s.kind === cur.kind && (s.kind === 'wall' || (cur.kind === 'game' && s.id === cur.id))) : -1;
    return list[(at + 1) % list.length];
  };
  const go = (n: Seg | null) => {
    setPrev(seg);
    setSeg(n);
    count.current += 1;
  };

  // first segment as soon as a game is live; a game that ended moves on at once
  useEffect(() => {
    if (!ordered.length) {
      setSeg(null);
      return;
    }
    if (!seg || (seg.kind === 'game' && !ordered.some((g) => g.id === seg.id))) setSeg(ordered.length > 1 ? { kind: 'wall' } : { kind: 'game', id: ordered[0].id });
    else if (seg.kind === 'wall' && ordered.length === 1) setSeg({ kind: 'game', id: ordered[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  // a score in a game that is not on screen jumps to it
  useEffect(() => {
    if (events.length <= seenEvents.current) return;
    const e = events[events.length - 1];
    seenEvents.current = events.length;
    if (e.kind === 'EXTRA POINT') return;
    if (live.some((g) => g.id === e.gameId) && !(seg?.kind === 'game' && seg.id === e.gameId)) go({ kind: 'game', id: e.gameId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);
  // the clock of the cycle
  useEffect(() => {
    if (!seg || rest) return;
    const t = window.setTimeout(() => {
      // Auto gives the normal show a turn in every REST_EVERY + 1
      if (mode === 'auto' && count.current >= REST_EVERY) {
        count.current = 0;
        setRest(true);
        return;
      }
      go(next(seg));
    }, seg.kind === 'wall' ? WALL_MS : GAME_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg, rest, mode, ids]);
  useEffect(() => {
    if (!rest) return;
    const t = window.setTimeout(() => {
      setRest(false);
      go(next(seg));
    }, REST_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest]);
  useEffect(() => {
    if (!prev) return;
    const t = window.setTimeout(() => setPrev(null), 1500);
    return () => window.clearTimeout(t);
  }, [prev]);
  const on = !!seg && !rest && ordered.length > 0;
  useEffect(() => {
    onShown?.(on);
    return () => onShown?.(false);
  }, [on, onShown]);
  if (!on || !seg) return null;

  const MAX = 12;
  const render = (s: Seg, out: boolean) => {
    if (s.kind === 'wall') {
      const shown = ordered.slice(0, MAX);
      return (
        <div key="wall" className={out ? 'sv-slide sv-slide--out' : 'sv-slide sv-slide--in'} style={{ '--sv-dur': `${WALL_MS}ms` } as CSSProperties}>
          <RedZoneWall games={shown} events={events} deps={deps} ms={WALL_MS} more={Math.max(0, ordered.length - MAX)} />
        </div>
      );
    }
    const g = ordered.find((x) => x.id === s.id);
    if (!g) return null;
    return (
      <div key={s.id} className={out ? 'sv-slide sv-slide--out' : 'sv-slide sv-slide--in'} style={{ '--sv-dur': `${GAME_MS}ms` } as CSSProperties}>
        <GameDayScene g={g} detail={detail[g.id]} events={events} deps={deps} players={players} ms={GAME_MS} />
      </div>
    );
  };
  const sameSeg = prev && prev.kind === seg.kind && (prev.kind === 'wall' || (seg.kind === 'game' && prev.id === seg.id));
  return (
    <div className="sv-live" data-reduced={reducedMotion() ? '1' : undefined}>
      {prev && !sameSeg && render(prev, true)}
      {render(seg, false)}
    </div>
  );
};
