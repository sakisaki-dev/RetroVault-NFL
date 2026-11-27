import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/timeline/TeamLogo';
import { PixelBall } from '@/components/ui/PixelLoader';
import { PodiumStage } from '../../season/NflSeasonExtras';
import { ClubStrip, LedDigits, clubPlate } from '@/components/arcade';
import { findNFLTeam } from '@/utils/nflTeams';
import { displayName } from '@/utils/displayName';
import { stripKeySuffix } from '@/utils/nameSuffix';
import { openPlayerCard } from '@/utils/playerCardLink';
import { useGameSprites } from '@/utils/gameSprites';
import { useNflLabData, type NflLabData } from '@/utils/nflLabData';
import { isLite, isReducedMotion, useReducedMotion } from '@/hooks/usePerfMode';
import { SCORE_FLASH_MS, type LiveDetail, type LiveGame, type LiveLeader } from '@/utils/liveGames';
import type { GameDetail } from '@/utils/nflGames';
import { sitePos } from '../gameModel';
import { FORMATION, absOf, fx, fy, lampOf, manX, sameClub, situationOf, spotLabel, type Situation } from './liveField';
import { playFx, type PlayFx, type Pt } from './playFx';
import type { LiveForGame } from './useLiveForGame';
import { DriveTracker, PlayFeed, Quarters, ScoreBug, Scoring, TeamStats, WinChart } from './LivePanels';
import { currentDrivePlays, gainOf, playTone } from './liveModel';
import { turfFor, useLiveFieldArt } from './fieldArtFull';
import './liveView.css';

/**
 * The live game view (owner-approved mockup, docs/CLAUDE_REFERENCE.md "Live game view"): a night stadium with the
 * jumbotron hung over it, the broadcast field with the ball on its real spot and the latest play drawn from the
 * play-by-play, then panels (spotlight, win chance, quarters, drives, scoring, leaders). All of it is ESPN's scoreboard
 * and summary (utils/liveGames.ts): a panel whose data ESPN doesn't give is not drawn, nothing is invented.
 */
const nick = (abbr: string) => findNFLTeam(abbr)?.name ?? abbr;

/** The site's player key (POS:Name) for a name ESPN gives, or null: the exact key first, else the one suffixed match */
const useSiteKey = () => {
  const { getAllPlayers } = useLeague();
  const pool = useMemo(() => {
    const m = new Map<string, string | null>();
    getAllPlayers().forEach((p) => {
      const k = `${p.position}:${displayName(p.name)}`;
      m.set(k, k);
      const b = stripKeySuffix(k);
      if (b !== k && !m.has(b)) m.set(b, k);
      else if (b !== k && m.get(b) !== k) m.set(b, null);
    });
    return m;
  }, [getAllPlayers]);
  return (name: string, pos: string): string | null => {
    const full = `${sitePos(pos)}:${displayName(name)}`;
    return pool.get(full) ?? pool.get(stripKeySuffix(full)) ?? null;
  };
};

/** A number that counts up on load (final value at once with reduced motion or Lite) and flashes when it changes */
const useShown = (to: number, delay = 900) => {
  const [v, setV] = useState(() => (isReducedMotion() || isLite() ? to : 0));
  const [flash, setFlash] = useState(false);
  const prev = useRef<number | null>(null);
  const cur = useRef(v);
  useEffect(() => {
    const first = prev.current === null;
    const changed = !first && prev.current !== to;
    prev.current = to;
    if (changed) {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), Math.min(SCORE_FLASH_MS, 2400));
      setV(to);
      cur.current = to;
      return () => window.clearTimeout(t);
    }
    if (!first || isReducedMotion() || isLite()) {
      setV(to);
      cur.current = to;
      return;
    }
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / 900));
      const n = Math.round(to * (1 - Math.pow(1 - p, 3)));
      cur.current = n;
      setV(n);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return { v, flash };
};

const periodLabel = (g: LiveGame) => (/half/i.test(g.desc) && !/quarter/i.test(g.desc) ? 'HALFTIME' : g.period > 4 ? (g.period === 5 ? 'OVERTIME' : `OT ${g.period - 4}`) : `QTR ${g.period || 1}`);

/* ---------------- the stadium and the jumbotron ---------------- */

const Toes = ({ ball, n, label }: { ball: boolean; n: number | null; label: string }) => (
  <div className="lv-toes" aria-label={n === null ? undefined : `${label}: ${n} timeouts left${ball ? ', has the ball' : ''}`}>
    {ball && <b title="Ball" />}
    {n !== null && [0, 1, 2].map((i) => <i key={i} className={i < n ? '' : 'used'} />)}
  </div>
);

const Half = ({ g, side, ball }: { g: LiveGame; side: 'a' | 'h'; ball: boolean }) => {
  const t = side === 'a' ? g.away : g.home;
  const { v, flash } = useShown(t.score);
  return (
    <div className={cn('lv-half', side === 'a' ? 'is-a' : 'is-h', flash && 'is-flash')} style={{ ['--lv-lamp' as string]: lampOf(t.abbr), ['--lv-tile' as string]: clubPlate(t.abbr).fill } as CSSProperties}>
      <TeamLogo team={t.abbr} decorative className="lv-half__logo" />
      <span className="lv-half__name">{t.name}</span>
      <span className="lv-digits" role="img" aria-label={`${t.name} ${t.score}`}>
        <LedDigits value={v} matrix dot={14} width={2} tone="var(--lv-lamp)" label={String(t.score)} />
      </span>
      <Toes ball={ball} n={t.timeouts} label={t.name} />
    </div>
  );
};

const Lamp = ({ k, v, title }: { k: string; v: string; title?: string }) => (
  <div className="lv-lampbox" title={title}>
    <span>{k}</span>
    <LedDigits value={v} matrix dot={3} color="amber" label={title ?? v} />
  </div>
);

const lead = (g: LiveGame): string =>
  g.home.score === g.away.score ? `Tied ${g.home.score}–${g.away.score}` : `${g.home.score > g.away.score ? g.home.name : g.away.name} lead ${Math.max(g.home.score, g.away.score)}–${Math.min(g.home.score, g.away.score)}`;

const Tron = ({ g, d, kicker }: { g: LiveGame; d: LiveDetail | undefined; kicker: string }) => {
  const sit = g.sit;
  const ball = spotLabel(g);
  const last = d?.last || sit?.last || '';
  const cur = d?.cur;
  const crawl = [last && `Last play ▸ ${last}`, d?.drive && `${nick(sit?.poss ?? g.home.abbr)} ${d.drive}`, lead(g)].filter(Boolean).join('   ▸   ');
  return (
    <div className="lv-tron" role="group" aria-label="Scoreboard">
      <div className="lv-tron__strip"><span>{kicker}</span><span>{g.venue}</span></div>
      <div className="lv-tron__grid">
        <Half g={g} side="a" ball={!!sit?.poss && sameClub(sit.poss, g.away.abbr)} />
        <div className="lv-tron__mid">
          <span className="lv-livetag"><i />LIVE</span>
          <span className="lv-clock"><LedDigits value={g.clock || '0:00'} matrix dot={6} color="red" label={`${g.clock} left`} /></span>
          <span className="lv-tron__q">{periodLabel(g)}</span>
        </div>
        <Half g={g} side="h" ball={!!sit?.poss && sameClub(sit.poss, g.home.abbr)} />
      </div>
      {(sit?.down || ball || cur) && (
        <div className="lv-tron__row">
          {!!sit?.down && <Lamp k="DOWN" v={String(sit.down)} />}
          {!!sit?.down && <Lamp k="TO GO" v={sit.dist ? String(sit.dist) : 'GOAL'} />}
          {ball && <Lamp k="BALL ON" v={ball} />}
          {cur && cur.plays > 0 && <Lamp k="DRIVE" v={`${cur.plays}-${cur.yards}`} title={`${cur.plays} plays, ${cur.yards} yards`} />}
        </div>
      )}
      {crawl && <div className="lv-crawl" aria-label={crawl}><span aria-hidden>{crawl}</span></div>}
    </div>
  );
};

const Hero = ({ g, d, kicker }: { g: LiveGame; d: LiveDetail | undefined; kicker: string }) => {
  const style = { ['--lv-a' as string]: lampOf(g.away.abbr), ['--lv-h' as string]: lampOf(g.home.abbr) } as CSSProperties;
  return (
    <PodiumStage team={g.home.abbr} turf="night" className="lv-stage">
      <div className="lv-sky" aria-hidden style={style}>
        <i className="lv-stars" />
        <div className="lv-skyname"><span>{g.away.name}</span><span>{g.home.name}</span></div>
        <i className="lv-tower is-l" /><i className="lv-tower is-r" />
        <i className="lv-crowd" />
        <div className="lv-pennants">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
      </div>
      <Tron g={g} d={d} kicker={kicker} />
    </PodiumStage>
  );
};

/* ---------------- the field ---------------- */

const ROWS = [
  '....HHHH....', '...HHHHHH...', '...HFFFFH...', '...HFFFF....', '....FFFF....', '..JJJJJJJJ..', '.JJJJNNJJJJ.', '.JJJJNNJJJJ.',
  '.FJJJJJJJJF.', '..JJJJJJJJ..', '...PPPPPP...', '...PPPPPP...', '...PP..PP...', '...SS..SS...', '...SS..SS...', '..KKK..KKK..',
];
const SKIN = ['#e9c7a5', '#8d5a3b', '#6b4430', '#c99a72'];
/** A little pixel player in a club's colours: stands in for the game sprite on a build that has none (the public site) */
const PixelMan = ({ abbr, n }: { abbr: string; n: number }) => {
  const p = clubPlate(abbr);
  const ink: Record<string, string> = { H: p.fill, J: p.fill, N: p.ink, P: p.edge, S: p.fill, K: '#111', F: SKIN[n % SKIN.length] };
  return (
    <svg viewBox="0 0 12 16" width="36" height="48" shapeRendering="crispEdges" aria-hidden>
      {ROWS.flatMap((r, y) => [...r].map((c, x) => (c === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={ink[c]} />)))}
    </svg>
  );
};

/**
 * The 22 on the field are each club's real starters from its depth chart (depth_charts.json): offence LT LG C RG RT, TE,
 * three WRs, QB, RB in the formation's order; defence its line, linebackers, corners and safeties (a 3-4 lends an outside
 * linebacker to the line). Each stands in his own sprite; a slot with no starter or no known player falls back to the
 * pixel man (owner: "use the real sprites instead of the silhouettes").
 */
const OFF_SLOTS = ['LT', 'LG', 'C', 'RG', 'RT', 'TE', 'WR', 'WR', 'WR', 'QB', 'RB'];
const startersOf = (depth: NflLabData['depth'], abbr: string, side: 'o' | 'd'): (string | undefined)[] => {
  const club = depth?.clubs?.[abbr] as { o?: Record<string, string[]>; d?: Record<string, string[]> } | undefined;
  if (!club) return [];
  if (side === 'o') {
    const used: Record<string, number> = {};
    return OFF_SLOTS.map((slot) => {
      const n = (used[slot] = (used[slot] ?? -1) + 1);
      return slot === 'WR' ? club.o?.WR?.[n] : club.o?.[slot]?.[0];
    });
  }
  const d = club.d ?? {};
  const first = (re: RegExp) => Object.keys(d).filter((k) => re.test(k)).map((k) => d[k]?.[0]).filter((x): x is string => !!x);
  const line = first(/DE$|DT$|NT$|^DL/);
  const lbs = first(/LB$/);
  const cbs = first(/CB$/);
  const safeties = first(/^(SS|FS|S)$/);
  while (line.length < 4 && lbs.length > 3) line.push(lbs.pop()!);
  return [...line.slice(0, 4), ...lbs.slice(0, 3), ...cbs.slice(0, 2), ...safeties.slice(0, 2)];
};

const Men = ({ g, sit, season }: { g: LiveGame; sit: Situation; season: number }) => {
  const sprites = useGameSprites();
  const lab = useNflLabData();
  const { getAllPlayers } = useLeague();
  const off = sit.poss;
  const def = sameClub(off, g.away.abbr) ? g.home.abbr : g.away.abbr;
  const byKey = useMemo(() => new Map(getAllPlayers().map((p) => [`${p.position}:${displayName(p.name)}`, p])), [getAllPlayers]);
  const cast = useMemo(() => {
    const club = (a: string) => findNFLTeam(a)?.abbreviation ?? a;
    const o = startersOf(lab?.depth ?? null, club(off), 'o');
    const d = startersOf(lab?.depth ?? null, club(def), 'd');
    let oi = 0;
    let di = 0;
    return FORMATION.map((m) => {
      const key = m.side === 'o' ? o[oi++] : d[di++];
      return key ? byKey.get(key) ?? byKey.get(stripKeySuffix(key)) : undefined;
    });
  }, [lab, off, def, byKey]);
  const men = useMemo(() => FORMATION.map((m, i) => ({ m, i, x: manX(m, sit) })).sort((a, b) => a.m.y - b.m.y), [sit]);
  return (
    <div className="lv-men" aria-hidden>
      {men.map(({ m, i, x }) => {
        const abbr = m.side === 'o' ? off : def;
        // the offence heads sit.dir; a sprite faces right by default, so those heading left are flipped (never a CSS mirror: the number would read backwards)
        const flip = m.side === 'o' ? sit.dir === -1 : sit.dir === 1;
        const who = cast[i];
        return (
          <span key={i} className="lv-man" style={{ left: fx(x), top: `${fy(m.y) * 100}%`, ['--d' as string]: i } as CSSProperties}>
            <span className="lv-man__in">
              {sprites && who ? (
                <GameSprite player={who} team={abbr} season={season} kind="figure" size="s" flip={flip} hoverName={false} />
              ) : (
                <PixelMan abbr={abbr} n={i} />
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
};

const pt = (p: Pt) => ({ x: fx(p[0]), y: `${fy(p[1]) * 100}%` });
/** up to three waypoints as the custom properties the keyframes read (a two-point path gets its midpoint) */
const way = (pts: Pt[]): CSSProperties => {
  const a = pts[0];
  const c = pts[pts.length - 1];
  const b = pts.length > 2 ? pts[1] : ([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] as Pt);
  const [A, B, C] = [pt(a), pt(b), pt(c)];
  return { ['--x0' as string]: A.x, ['--y0' as string]: A.y, ['--x1' as string]: B.x, ['--y1' as string]: B.y, ['--x2' as string]: C.x, ['--y2' as string]: C.y } as CSSProperties;
};

/** The latest play: the runner's path and marker, the ball in flight (it is the one ball and ends on the spot), a tag. Decorative; the play's words sit under the field. */
const PlayLayer = ({ fxs, rest, first, k }: { fxs: PlayFx | null; rest: Pt | null; first: boolean; k: string }) => {
  if (!fxs) return rest ? <span className="lv-ball is-rest" style={{ left: fx(rest[0]), top: `${fy(rest[1]) * 100}%` }}><PixelBall /></span> : null;
  const path = fxs.runner ? fxs.runner.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${(fy(p[1]) * 100).toFixed(2)}`).join(' ') : null;
  const m = fxs.mark ? pt(fxs.mark.at) : null;
  return (
    <div key={k} className={cn('lv-play', first && 'is-first')} aria-hidden>
      {path && (
        <svg className="lv-play__path" viewBox="-10 0 120 100" preserveAspectRatio="none">
          <path d={path} pathLength={1} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {fxs.runner && <i className="lv-mv lv-run" style={way(fxs.runner)} />}
      {m && fxs.mark && (
        <span className={cn('lv-mark', `is-${fxs.mark.tone}`)} style={{ left: m.x, top: m.y }}>
          <i />
          <b>{fxs.mark.tag}</b>
        </span>
      )}
      <span className="lv-mv lv-ballfly" style={{ ...way(fxs.ball), ['--arc' as string]: `${-fxs.arc}px` } as CSSProperties}>
        <span className="lv-mv__in"><PixelBall /></span>
      </span>
    </div>
  );
};

const Field = ({ g, d, season }: { g: LiveGame; d: LiveDetail | undefined; season: number }) => {
  const sit = situationOf(g);
  const art = useLiveFieldArt(g.away.abbr, g.away.name, g.home.abbr, g.home.name, turfFor(g.kick, g.weather));
  const s = g.sit;
  const a = clubPlate(g.away.abbr);
  const h = clubPlate(g.home.abbr);
  const fromYd = absOf(d?.cur?.from, g.away.abbr, g.home.abbr);
  const arrow = sit && fromYd != null && Math.abs(sit.ball - fromYd) > 0.5 ? { lo: Math.min(fromYd, sit.ball), hi: Math.max(fromYd, sit.ball), left: sit.ball < fromYd } : null;
  const fxs = useMemo(() => playFx(d?.lastPlay, g, sit), [d?.lastPlay, g, sit]);
  const chain = useMemo(() => currentDrivePlays(g, d), [g, d]);
  const chainFrom = chain.length ? chain[0].from : null;
  const firstRef = useRef(true);
  useEffect(() => { firstRef.current = false; }, []);
  const key = d?.lastPlay?.id ?? 'rest';
  const attackLo = sit ? (sit.dir === 1 ? 80 : 0) : null;
  const marks = [10, 20, 30, 40, 50, 60, 70, 80, 90];
  const dd = s?.dd ? `${s.dd}${spotLabel(g) ? ` · ${spotLabel(g)}` : ''}` : '';
  const style = { ['--lv-a' as string]: lampOf(g.away.abbr), ['--lv-h' as string]: lampOf(g.home.abbr) } as CSSProperties;
  return (
    <section className="lv-fieldsec" aria-labelledby="lv-fh" style={style}>
      <div className="lv-fieldhead">
        <h2 id="lv-fh">On the field</h2>
        {dd && <span className="lv-dd">{dd}</span>}
        {s?.redZone && <span className="lv-tag is-red">Red zone</span>}
        {sit ? <span className="lv-muted">{nick(sit.poss)} {chain.length ? `drive: ${chain.length} play${chain.length === 1 ? '' : 's'}` : 'ball'} · {g.clock} left</span> : <span className="lv-muted">{/half/i.test(g.desc) ? 'Halftime' : 'Between plays'}</span>}
      </div>
      <div className={cn('lv-field', art && 'has-art')} aria-label={sit ? `Ball on ${spotLabel(g)}` : 'The field'}>
        {/* the game's own field (both end zones painted in the clubs' colours); the CSS field below when there's no art */}
        {art && <div className="lv-art" style={{ backgroundImage: `url(${art})` }} aria-hidden />}
        <div className="lv-ez is-l" style={{ ['--ez' as string]: a.fill, color: a.ink }}><span>{g.away.name}</span></div>
        <div className="lv-ez is-r" style={{ ['--ez' as string]: h.fill, color: h.ink }}><span>{g.home.name}</span></div>
        <TeamLogo team={g.home.abbr} decorative className="lv-midmark" />
        <div className="lv-hash" />
        {attackLo != null && (
          <div className="lv-redzone" style={{ left: fx(attackLo), width: `calc((100% - 100% / 6) * .2)` }}>
            <span>RED ZONE</span>
          </div>
        )}
        {marks.map((yd) => (
          <div key={yd} className="lv-yl" style={{ left: fx(yd) }}><b>{yd <= 50 ? yd : 100 - yd}</b></div>
        ))}
        {arrow && !chain.length && <div className={cn('lv-drivearrow', arrow.left && 'is-l')} style={{ left: fx(arrow.lo), width: `calc((100% - 100% / 6) * ${((arrow.hi - arrow.lo) / 100).toFixed(4)})`, ['--arrow' as string]: sit && sameClub(sit.poss, g.away.abbr) ? 'var(--lv-a)' : 'var(--lv-h)' }} />}
        {chain.length > 0 && sit && (
          <div className="lv-chain" aria-hidden>
            {chainFrom != null && <span className="lv-chain__start" style={{ left: fx(chainFrom) }}><b>START</b></span>}
            {chain.map((p, k) => {
              const lo = Math.min(p.from!, p.to!);
              const hi = Math.max(p.from!, p.to!);
              const tone = playTone(p);
              const gain = gainOf(p, g);
              const cls = tone === 'td' ? 'td' : tone === 'to' ? 'to' : gain >= 10 ? 'big' : gain > 0 ? 'up' : gain < 0 ? 'down' : 'flat';
              return (
                <span key={p.id} className={cn('lv-chain__seg', `is-${cls}`)} style={{ left: fx(lo), width: `calc((100% - 100% / 6) * ${((hi - lo) / 100).toFixed(4)})`, ['--k' as string]: k } as CSSProperties} title={p.text}>
                  <i style={{ [p.to! >= p.from! ? 'right' : 'left']: -6 } as CSSProperties}>{k + 1}</i>
                </span>
              );
            })}
          </div>
        )}
        {sit && <div className="lv-los" data-l="LOS" style={{ left: fx(sit.ball) }} />}
        {sit?.first != null && <div className="lv-fd" data-l="1ST" style={{ left: fx(sit.first) }} />}
        {sit && <Men g={g} sit={sit} season={season} />}
        <PlayLayer fxs={fxs} rest={sit ? [sit.ball, 0.5] : null} first={firstRef.current} k={key} />
      </div>
      <p className="lv-lp"><b>Last play</b> {d?.lastPlay?.text || s?.last || 'Waiting for the next snap.'}</p>
    </section>
  );
};

/* ---------------- the panels ---------------- */

const SPOT_PLAY: Record<string, string> = { 'Pass Reception': 'Catch', Rush: 'Run', 'Passing Touchdown': 'Touchdown pass', 'Rushing Touchdown': 'Touchdown run', Sack: 'Sack', 'Pass Incompletion': 'Incomplete' };

const Sprite = ({ name, pos, abbr, season, size }: { name: string; pos: string; abbr: string; season: number; size: 's' | 'm' }) => {
  const sprites = useGameSprites();
  if (!sprites) return <TeamLogo team={abbr} decorative className="lv-sprite__logo" />;
  return <GameSprite player={{ name, position: sitePos(pos), team: abbr, bannerTeam: abbr }} team={abbr} season={season} kind="figure" size={size} hoverName={false} />;
};

const NameBanner = ({ name, keyOf, abbr }: { name: string; keyOf: string | null; abbr: string }) => (
  <ClubStrip club={abbr} size="md" className="lv-strip" {...(keyOf ? { onClick: () => openPlayerCard(keyOf), title: `${displayName(name)}: open card` } : {})}>
    {displayName(name)}
  </ClubStrip>
);

const leadersOf = (g: LiveGame, d: LiveDetail | undefined): Record<string, LiveLeader[]> => (d && Object.keys(d.leaders).length ? d.leaders : g.leaders);

const Spotlight = ({ g, d, season, siteKey, i }: { g: LiveGame; d: LiveDetail | undefined; season: number; siteKey: ReturnType<typeof useSiteKey>; i: number }) => {
  const s = g.sit;
  const ath = s?.lastAth;
  const key = ath ? siteKey(ath.name, ath.pos) : null;
  if (!ath || !key) return null;
  const abbr = ath.abbr ?? s?.poss ?? g.home.abbr;
  const today = Object.values(leadersOf(g, d)).flat().find((l) => displayName(l.name) === displayName(ath.name));
  const type = s?.lastType ?? '';
  const yds = s?.lastYds;
  const play = [SPOT_PLAY[type] ?? type, yds ? `${yds > 0 ? '' : '−'}${Math.abs(yds)} yd${Math.abs(yds) === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  return (
    <article className={'lv-card lv-spot lv-rise'} style={{ ['--i' as string]: i, ['--lv-tint' as string]: clubPlate(abbr).fill } as CSSProperties}>
      <h3><span className="lv-k">Spotlight</span><span className="lv-livetag"><i />Last play</span></h3>
      <div className="lv-spot__body">
        <span className="lv-spot__sprite"><Sprite name={ath.name} pos={ath.pos} abbr={abbr} season={season} size="m" /></span>
        <div className="lv-spot__txt">
          <NameBanner name={ath.name} keyOf={key} abbr={abbr} />
          {play && <div className="lv-spot__play">{play}</div>}
          <div className="lv-chips">
            <span className="lv-chip">{ath.pos} <b>{abbr}</b></span>
            {today && <span className="lv-chip">Today <b>{today.line}</b></span>}
          </div>
        </div>
      </div>
      <div className="lv-spot__sit">
        {s?.down ? <span><em>Down</em><b>{s.dd}</b></span> : null}
        {s?.toGoal != null && s.poss ? <span><em>To goal</em><b>{s.toGoal} yds</b></span> : null}
        {g.away.timeouts != null && g.home.timeouts != null && <span><em>Timeouts</em><b>{g.away.abbr} {g.away.timeouts} · {g.home.abbr} {g.home.timeouts}</b></span>}
      </div>
    </article>
  );
};

const CAT: Record<LiveLeader['cat'], string> = { passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving' };

const Leaders = ({ g, d, season, siteKey, i, wide }: { g: LiveGame; d: LiveDetail | undefined; season: number; siteKey: ReturnType<typeof useSiteKey>; i: number; wide: boolean }) => {
  const L = leadersOf(g, d);
  const cols = [g.away, g.home].map((t) => ({ t, list: L[t.abbr] ?? [] })).filter((c) => c.list.length);
  if (!cols.length) return null;
  return (
    <article className={cn('lv-card lv-leaders lv-rise', wide && 'is-wide')} style={{ ['--i' as string]: i } as CSSProperties}>
      <h3>Leaders<span className="lv-k lv-r">Tap a name for his card</span></h3>
      <div className="lv-ldgrid">
        {cols.map(({ t, list }) => (
          <div key={t.abbr} className="lv-ldcol" style={{ ['--lv-tint' as string]: clubPlate(t.abbr).fill, ['--lv-lamp' as string]: lampOf(t.abbr) } as CSSProperties}>
            <div className="lv-ldhead"><TeamLogo team={t.abbr} decorative className="lv-lg" />{t.name}<span>{t.score}</span></div>
            {list.map((l) => {
              const key = siteKey(l.name, l.pos);
              return (
                <div key={l.cat} className="lv-ld">
                  <span className="lv-ld__sprite"><Sprite name={l.name} pos={l.pos} abbr={t.abbr} season={season} size="s" /></span>
                  <div className="lv-ld__txt">
                    <span className="lv-cat">{CAT[l.cat]}</span>
                    <NameBanner name={l.name} keyOf={key} abbr={t.abbr} />
                    <span className="lv-ln">{l.line}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </article>
  );
};

/* ---------------- the view ---------------- */

const LiveGameView = ({ g, live, kicker }: { g: GameDetail; live: LiveForGame; kicker: string }) => {
  const { lg, detail } = live;
  const siteKey = useSiteKey();
  const style = { ['--lv-a' as string]: lampOf(lg.away.abbr), ['--lv-h' as string]: lampOf(lg.home.abbr) } as CSSProperties;
  const ath = lg.sit?.lastAth;
  const spotOk = !!ath && !!siteKey(ath.name, ath.pos);
  const hasWp = detail?.winHome != null || (detail?.wp?.length ?? 0) > 2;
  const hasStats = !!detail?.stats?.[lg.away.abbr] && !!detail?.stats?.[lg.home.abbr];
  const hasPlays = (detail?.plays?.length ?? 0) > 0;
  const hasScoring = (detail?.scoreLog?.length ?? 0) > 0;
  const hasLeaders = Object.keys(leadersOf(lg, detail)).length > 0;
  return (
    <div className="lv" style={style} aria-label={`${lg.away.name} at ${lg.home.name}, live`}>
      <Hero g={lg} d={detail} kicker={`NFL · ${kicker}`} />
      <ScoreBug g={lg} d={detail} />
      <Field g={lg} d={detail} season={g.season} />
      {!hasPlays && !hasWp && <p className="lv-wait">The game feed is still filling in. The win chart, drives and play by play appear when ESPN posts them.</p>}
      <section className="lv-grid" aria-label="Game panels">
        <div className={cn('lv-col lv-col--5', !hasWp && 'is-wide')}>
          <Spotlight g={lg} d={detail} season={g.season} siteKey={siteKey} i={0} />
          <Quarters g={lg} i={1} />
        </div>
        <WinChart g={lg} d={detail} i={1} wide={!(spotOk || lg.away.ls.length > 0)} />
        <DriveTracker g={lg} d={detail} i={2} />
        <PlayFeed g={lg} d={detail} i={3} wide={!hasScoring} />
        <Scoring g={lg} d={detail} i={4} wide={!hasPlays} />
        <TeamStats g={lg} d={detail} i={6} wide={!hasLeaders} />
        <Leaders g={lg} d={detail} season={g.season} siteKey={siteKey} i={7} wide={!hasStats} />
      </section>
    </div>
  );
};

export default LiveGameView;
