import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Player } from '@/types/player';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { CollegeMark } from '@/components/player/DraftTiles';
import { cardVars, schoolColors } from '@/components/college/shared';
import { careerLine } from '@/components/hof/hofUtils';
import { lineOf, podiumOf, fmtDate, roofLabel, roundLabel } from '@/components/game/gameModel';
import { markInfo } from '@/utils/collegeData';
import type { GameDetail, GamePlayer } from '@/utils/nflGames';
import { findNFLTeam } from '@/utils/nflTeams';
import { bannerTeamOf } from '@/utils/playerExtras';
import { getReadableTextOn, liftForDarkBg } from '@/utils/teamColors';
import { displayName, surnameOf } from '@/utils/displayName';
import { reducedMotion } from '@/utils/motion';
import { usePerfMode } from '@/hooks/usePerfMode';
import { Stadium } from '../Screensaver';
import type { DraftNightData, HometownData, LongOneData, MilestoneData, OldNewData, TwoMinData, WxGameData } from './eightData';
import './eightScenes.css';

/*
 * Seven scenes made from real files only (see eightData.ts): Draft night, Two-minute drill, The long one, Milestone
 * watch, Old vs new, Weather game, Hometown. The art carries each one (a draft stage, a drive on the turf, a kick in
 * perspective, a painted progress line, two eras split, a blizzard, a campus); text stays to a lower third or an LED.
 * Motion is CSS transforms; the few timers and the snow canvas stop or hold a still frame with reduced motion.
 */
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const clubVars = (club: string): CSSProperties => {
  const t = findNFLTeam(club);
  return t ? ({ '--k1': liftForDarkBg(t.primaryColor, 45), '--k2': `hsl(${t.secondaryColor})`, '--k1d': `hsl(${t.primaryColor})`, '--k-ink': getReadableTextOn(t.primaryColor) } as CSSProperties) : {};
};
const clubOfP = (p: Player) => findNFLTeam(bannerTeamOf(p))?.name ?? 'Eagles';
const abbrName = (abbr: string) => findNFLTeam(abbr)?.name ?? abbr;

/** n counts up to `to` from the scene's start; reduced motion shows the final value */
const useCount = (to: number, delay = 0, ms = 2200): number => {
  const [v, setV] = useState(reducedMotion() ? to : 0);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      setV(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, ms]);
  return v;
};

/** true after `ms` (immediately with reduced motion) */
const useAfter = (ms: number): boolean => {
  const [on, setOn] = useState(reducedMotion());
  useEffect(() => {
    if (reducedMotion()) return;
    const t = window.setTimeout(() => setOn(true), ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return on;
};

/** A player standing in his club's kit (era kit when `season` is given), or the club's mark where there are no sprites */
const Stand = ({ p, sprites, action = 'idle', scale = 1, season, team, flip }: { p: Player; sprites: boolean; action?: 'idle' | 'celebrate' | 'run'; scale?: number; season?: number | null; team?: string; flip?: boolean }) => {
  const club = team ?? clubOfP(p);
  return (
    <span className={flip ? 'sv-fig sv-fig--mirror' : 'sv-fig'} style={{ '--sv-scale': scale } as CSSProperties}>
      <span className="sv-fig__shadow" />
      {sprites ? (
        <GameSprite player={p} team={club} season={season ?? undefined} kind="figure" size="l" action={action} flip={flip} className="sv-fig__sprite" />
      ) : (
        <span className="sv-fig__logo">
          <TeamLogo team={club} size={120} decorative />
        </span>
      )}
    </span>
  );
};

/** The broadcast lower third every scene ends on: one kicker, one headline, a line, a few small numbers */
const Lower = ({ kick, head, sub, nums, club, pos = 'bl' }: { kick: string; head: string; sub?: string; nums?: { k: string; v: string }[]; club: string; pos?: 'bl' | 'tl' }) => (
  <div className={`e8-lt e8-lt--${pos}`} style={clubVars(club)}>
    <p className="sv-kick">{kick}</p>
    <h2 className="e8-lt__head">{head}</h2>
    {sub && <p className="e8-lt__sub">{sub}</p>}
    {nums && nums.length > 0 && (
      <p className="e8-lt__nums">
        {nums.map((n) => (
          <span key={n.k}>
            <b>{n.v}</b> {n.k}
          </span>
        ))}
      </p>
    )}
  </div>
);

/** Camera flashes: `n` small blinks in the stands, x and y in percent of the screen (`xs` the x ranges to scatter in) */
const Flashes = ({ n, xs, y = [36, 66] }: { n: number; xs: [number, number][]; y?: [number, number] }) => (
  <span className="e8-flashes" aria-hidden="true">
    {Array.from({ length: n }, (_, i) => {
      const [a, b] = xs[i % xs.length];
      return <i key={i} style={{ '--x': a + ((i * 37) % 100) * (b - a) / 100, '--y': y[0] + ((i * 53) % 100) * (y[1] - y[0]) / 100, '--d': `${((i * 7) % 11) * 0.37}s` } as CSSProperties} />;
    })}
  </span>
);

/** Lit LED letters: a dot-matrix mask over pixel type */
const Led = ({ children, className = '' }: { children: ReactNode; className?: string }) => <span className={`e8-led ${className}`}>{children}</span>;

/* ================================ 1. Draft night ================================ */
export const DraftNightScene = ({ data, sprites }: { data: DraftNightData; sprites: boolean }) => {
  const { pick, school, player, year } = data;
  const [round, no, club, name, pos, , , ovr, pb, ap, , games] = pick;
  const full = findNFLTeam(club)?.name ?? club;
  const arrived = useAfter(4300);
  const nums = [
    { k: 'OVR', v: ovr },
    { k: 'Pro Bowls', v: pb },
    { k: 'All-Pro', v: ap },
    { k: 'games', v: games },
  ]
    .filter((s) => s.v != null && !(s.v === 0 && (s.k === 'Pro Bowls' || s.k === 'All-Pro')))
    .map((s) => ({ k: s.k, v: fmt(s.v as number) }));
  const sur = surnameOf(name);
  return (
    <Stadium club={full} roll={0.9}>
      <div className="e8-dr" style={{ ...cardVars(full), ...clubVars(full) }}>
        <span className="e8-dr__cone" aria-hidden="true" />
        <div className="e8-dr__wall" aria-hidden="true">
          <span className="e8-dr__tiles">
            {Array.from({ length: 18 }, (_, i) => (
              <span key={i}>
                <TeamLogo team={full} size={44} decorative />
              </span>
            ))}
          </span>
          <span className="e8-seal e8-seal--xl">
            <TeamLogo team={full} size={150} decorative />
          </span>
          <span className="e8-dr__led">
            <i>Round {round}</i>
            <Led>Pick {no}</Led>
          </span>
        </div>
        <span className="e8-dr__stage" aria-hidden="true" />
        <div className="e8-dr__lect" aria-hidden="true">
          <span className="e8-seal">
            <TeamLogo team={full} size={46} decorative />
          </span>
          <i>{year}</i>
        </div>
        <span className="e8-dr__walker">
          {player ? <Stand p={player} sprites={sprites} action={arrived ? 'celebrate' : 'run'} scale={1.5} team={full} /> : <TeamLogo team={full} size={150} decorative />}
          {arrived && (
            <span className="e8-dr__jersey" aria-hidden="true">
              <b>{sur}</b>
            </span>
          )}
        </span>
        <Flashes n={22} xs={[[2, 22], [78, 98]]} />
        <Lower kick={`Draft night · ${year}`} head={`${displayName(name)}`} sub={`${pos} · ${full}${school ? ` · ${school.name}` : ''}`} nums={nums} club={full} />
      </div>
    </Stadium>
  );
};

/* ================================ 2. Two-minute drill ================================ */
/** The clock runs 2:00 to 0:00 in the scene's first 9 s, the final lights at zero */
const useClock = (): number => {
  const [s, setS] = useState(reducedMotion() ? 0 : 120);
  useEffect(() => {
    if (reducedMotion()) return;
    const t0 = performance.now() + 800;
    const iv = window.setInterval(() => {
      const k = Math.min(1, Math.max(0, (performance.now() - t0) / 9000));
      setS(Math.round(120 * (1 - k)));
      if (k >= 1) window.clearInterval(iv);
    }, 250);
    return () => window.clearInterval(iv);
  }, []);
  return s;
};
const qbOf = (g: GameDetail, side: 0 | 1): GamePlayer | undefined => {
  const name = side === 0 ? g.awayQb : g.homeQb;
  return g.players.find((p) => p.side === side && p.name === name) ?? g.players.filter((p) => p.side === side && p.pos === 'QB').sort((a, b) => (b.s.attempts ?? 0) - (a.s.attempts ?? 0))[0];
};
export const TwoMinuteScene = ({ data, lookup, sprites }: { data: TwoMinData; lookup: (gp: GamePlayer) => Player | undefined; sprites: boolean }) => {
  const g = data.game;
  const clock = useClock();
  const done = clock === 0;
  const a = g.awayScore ?? 0;
  const h = g.homeScore ?? 0;
  const margin = Math.abs(a - h);
  const winSide: 0 | 1 = a > h ? 0 : 1;
  const names = [abbrName(g.away), abbrName(g.home)];
  // the winner drives toward the other end zone: the away club's own end zone is on the left
  const right = winSide === 0;
  const x0 = right ? 22 : 78;
  return (
    <Stadium club={names[1]} roll={data.roll}>
      <div className="e8-tm" style={{ ...clubVars(names[winSide]), '--x0': `${x0}%`, '--dx': `${right ? 62 : -62}%`, '--fd': `${x0 + (right ? 9 : -9)}%`, '--tl': `${right ? x0 : x0 - 62}%`, '--org': right ? '0 50%' : '100% 50%' } as CSSProperties}>
        <Flashes n={18} xs={[[3, 30], [70, 97]]} y={[40, 64]} />
        <div className="e8-tm__jumbo" aria-hidden={false}>
          <span className="e8-tm__cable" />
          <span className="e8-tm__cable" />
          <div className="e8-tm__face">
            <span className={`e8-tm__side${done && winSide === 0 ? ' is-win' : ''}`}>
              <TeamLogo team={names[0]} size={50} decorative />
              <Led>{a}</Led>
            </span>
            <span className="e8-tm__clock">
              <i>{g.ot ? 'OT' : '4th'}</i>
              <Led className="e8-led--red">{`${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`}</Led>
            </span>
            <span className={`e8-tm__side e8-tm__side--r${done && winSide === 1 ? ' is-win' : ''}`}>
              <Led>{h}</Led>
              <TeamLogo team={names[1]} size={50} decorative />
            </span>
          </div>
        </div>
        <div className="e8-tm__field" aria-hidden="true">
          <div className="e8-tm__plane">
            {[0, 1].map((i) => (
              <span key={i} className={`e8-tm__ez e8-tm__ez--${i}`} style={clubVars(names[i])}>
                <TeamLogo team={names[i]} size={84} decorative />
              </span>
            ))}
            <span className="e8-tm__yards" />
            <span className="e8-tm__drive">
              <span className="e8-tm__trail" />
              <span className="e8-tm__fd" />
              <span className="e8-tm__los" />
              <span className="e8-tm__ball" />
            </span>
          </div>
        </div>
        {([0, 1] as const).map((i) => {
          const gp = qbOf(g, i);
          const card = gp ? lookup(gp) : undefined;
          return (
            <div key={i} className={`e8-tm__qb e8-tm__qb--${i}${done && winSide === i ? ' is-win' : ''}`} style={clubVars(names[i])}>
              {card ? <Stand p={card} sprites={sprites} action={done && winSide === i ? 'celebrate' : 'idle'} scale={1.45} team={names[i]} flip={i === 1} /> : <TeamLogo team={names[i]} size={110} decorative />}
              {gp && <span className="e8-tm__plate">{surnameOf(gp.name)}</span>}
            </div>
          );
        })}
        <Lower kick={`Two-minute drill · ${roundLabel(g)}${g.ot ? ' · overtime' : ''}`} head={`${names[winSide]} by ${margin}`} sub={`${names[0]} at ${names[1]} · ${fmtDate(g.date)}`} club={names[winSide]} pos="tl" />
      </div>
    </Stadium>
  );
};

/* ================================ 3. The long one ================================ */
export const LongOneScene = ({ data, sprites }: { data: LongOneData; sprites: boolean }) => {
  const { game: g, name, yards, kicker } = data;
  const gp = g.players.find((p) => p.name === name && (p.s.fg_long ?? 0) === yards) ?? g.players.find((p) => p.name === name);
  const clubAbbr = gp ? (gp.side === 0 ? g.away : g.home) : g.home;
  const club = abbrName(clubAbbr);
  const dist = useCount(yards, 3200, 1500);
  const good = useAfter(5000);
  return (
    <Stadium club={club} roll={0.9}>
      <div className="e8-lg" style={clubVars(club)}>
        <div className="e8-lg__ground" aria-hidden="true">
          <span className="e8-lg__lines" />
          <span className="e8-lg__tee" />
        </div>
        <div className="e8-lg__posts" aria-hidden="true">
          <span className="e8-lg__flag">
            <Led>{yards}</Led>
          </span>
          <i className="e8-lg__stem" />
          <i className="e8-lg__bar" />
          <i className="e8-lg__up e8-lg__up--l" />
          <i className="e8-lg__up e8-lg__up--r" />
        </div>
        <div className="e8-lg__flight" aria-hidden="true">
          {[3, 2, 1, 0].map((gh) => (
            <span key={gh} className="e8-lg__ball" style={{ '--g': gh } as CSSProperties} />
          ))}
        </div>
        <div className="e8-lg__kicker">
          {kicker ? <Stand p={kicker} sprites={sprites} action={good ? 'celebrate' : 'idle'} scale={1.7} team={club} /> : <TeamLogo team={club} size={130} decorative />}
        </div>
        <div className="e8-lg__led" aria-hidden="true">
          <Led>
            {dist}
            <small> yds</small>
          </Led>
          <Led className={`e8-led--green e8-lg__good${good ? ' is-on' : ''}`}>It&apos;s good</Led>
        </div>
        <Lower kick={`Longest field goal · ${g.season}`} head={displayName(name)} sub={`${club}${clubAbbr === g.away ? ` at ${abbrName(g.home)}` : ` vs ${abbrName(g.away)}`} · ${fmtDate(g.date)}`} club={club} />
      </div>
    </Stadium>
  );
};

/* ================================ 5. Milestone watch ================================ */
export const MilestoneScene = ({ data, sprites }: { data: MilestoneData; sprites: boolean }) => {
  const p = data.player;
  const club = clubOfP(p);
  const pct = Math.min(0.985, data.have / data.mark);
  const have = useCount(data.have, 700, 3000);
  return (
    <Stadium club={club} roll={data.roll}>
      <div className="e8-ms" style={{ ...clubVars(club), '--p': pct } as CSSProperties}>
        <div className="e8-ms__board">
          <span className="e8-ms__cable" aria-hidden="true" />
          <span className="e8-ms__cable" aria-hidden="true" />
          <div className="e8-ms__face">
            <p className="sv-kick">{data.label}</p>
            <Led className="e8-ms__digits">{fmt(have)}</Led>
            <p className="e8-ms__of">of {fmt(data.mark)}</p>
          </div>
        </div>
        <div className="e8-ms__line" aria-hidden="true">
          <span className="e8-ms__track" />
          <span className="e8-ms__fill" />
          <span className="e8-ms__ticks">
            {Array.from({ length: 11 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          <span className="e8-ms__goal">
            <b>{fmt(data.mark)}</b>
          </span>
        </div>
        <div className="e8-ms__runner">
          <Stand p={p} sprites={sprites} action="run" scale={1.7} team={club} />
        </div>
        <Lower
          pos="tl"
          kick="Milestone watch"
          head={displayName(p.name)}
          sub={`${fmt(data.mark - data.have)} to go · about ${data.games} ${data.games === 1 ? 'game' : 'games'} at his pace`}
          nums={[{ k: `${data.unit} a game`, v: data.perGame >= 10 ? String(Math.round(data.perGame)) : data.perGame.toFixed(1) }]}
          club={club}
        />
      </div>
    </Stadium>
  );
};

/* ================================ 6. Old vs new ================================ */
export const OldVsNewScene = ({ data, sprites }: { data: OldNewData; sprites: boolean }) => {
  const rows = useMemo(() => {
    const a = careerLine(data.old);
    const b = careerLine(data.neu);
    return a.map((r) => ({ label: r.label, o: r.value, n: b.find((x) => x.label === r.label)?.value })).filter((r): r is { label: string; o: number; n: number } => Number.isFinite(r.o) && r.n !== undefined && Number.isFinite(r.n)).slice(0, 3);
  }, [data]);
  const oldClub = clubOfP(data.old);
  const newClub = clubOfP(data.neu);
  return (
    <Stadium club={newClub} roll={0.85}>
      <div className="e8-on">
        <div className="e8-on__then" aria-hidden="true">
          <Stadium club={oldClub} roll={0.1} look="day" />
          <span className="e8-on__grain" />
          <span className="e8-on__vig" />
        </div>
        <span className="e8-on__split" aria-hidden="true" />
        <p className="e8-on__tag e8-on__tag--l">
          Then<small>{data.oldSpan}</small>
        </p>
        <p className="e8-on__tag e8-on__tag--r">
          Now<small>{data.neuSpan}</small>
        </p>
        <div className="e8-on__who e8-on__who--l" style={clubVars(oldClub)}>
          <Stand p={data.old} sprites={sprites} action="idle" scale={2.3} season={data.oldYear} team={oldClub} />
          <span className="e8-on__name">{surnameOf(data.old.name)}</span>
        </div>
        <div className="e8-on__who e8-on__who--r" style={clubVars(newClub)}>
          <Stand p={data.neu} sprites={sprites} action="idle" scale={2.3} season={data.neuYear} team={newClub} flip />
          <span className="e8-on__name">{surnameOf(data.neu.name)}</span>
        </div>
        <div className="e8-on__bars">
          <p className="sv-kick">{data.pos} · career</p>
          {rows.map((r, i) => {
            const tot = Math.max(1, Math.abs(r.o) + Math.abs(r.n));
            return (
              <div key={r.label} className="e8-on__row" style={{ '--i': i } as CSSProperties}>
                <b className={r.o >= r.n ? 'is-lead' : ''}>{fmt(r.o)}</b>
                <span className="e8-on__bar">
                  <i style={{ width: `${(Math.abs(r.o) / tot) * 100}%` }} />
                  <i style={{ width: `${(Math.abs(r.n) / tot) * 100}%` }} />
                  <em>{r.label}</em>
                </span>
                <b className={r.n >= r.o ? 'is-lead' : ''}>{fmt(r.n)}</b>
              </div>
            );
          })}
        </div>
      </div>
    </Stadium>
  );
};

/* ================================ 7. Weather game ================================ */
/** Snow (or rain) falling in three depths, leaning with the game's wind, snow settling in drifts along the bottom edge. Still frame under reduced motion. */
const Blizzard = ({ snow, wind, lite }: { snow: boolean; wind: number; lite: boolean }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const k = lite ? 0.5 : Math.min(0.75, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(cv.clientWidth * k));
    const H = Math.max(1, Math.round(cv.clientHeight * k));
    cv.width = W;
    cv.height = H;
    const still = reducedMotion();
    const N = Math.round((snow ? 520 : 420) * (lite ? 0.45 : 1));
    const lean = (snow ? 40 : 160) * wind * k;
    const fl = Array.from({ length: N }, () => {
      const z = 0.35 + Math.random() * 0.65;
      return { x: Math.random() * W, y: Math.random() * H, z, ph: Math.random() * 6.28 };
    });
    const BIN = 6 * k;
    const drift = new Float32Array(Math.ceil(W / BIN) + 2);
    const maxH = H * 0.07;
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      for (const f of fl) {
        if (!still) {
          if (snow) {
            f.y += (60 + 120 * f.z) * k * dt;
            f.x += (lean * f.z + Math.sin(now / 900 + f.ph) * 14 * k) * dt;
          } else {
            f.y += (900 * f.z + 300) * k * dt;
            f.x += lean * f.z * dt * 3;
          }
          if (f.y > H) {
            if (snow) {
              const b = Math.min(drift.length - 1, Math.max(0, Math.floor(f.x / BIN)));
              drift[b] = Math.min(maxH, drift[b] + 0.35 * k * f.z);
            }
            f.y = -4;
            f.x = Math.random() * W * 1.2 - W * 0.1;
          }
          if (f.x > W + 10) f.x = -10;
          if (f.x < -10) f.x = W + 10;
        }
        if (snow) {
          const s = Math.max(1, Math.round((2 + 4 * f.z) * k));
          ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.5 * f.z})`;
          ctx.fillRect(Math.round(f.x), Math.round(f.y), s, s);
        } else {
          ctx.strokeStyle = `rgba(190,215,255,${0.25 + 0.4 * f.z})`;
          ctx.lineWidth = Math.max(1, 1.6 * f.z * k);
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + lean * f.z * 0.05, f.y + 20 * f.z * k);
          ctx.stroke();
        }
      }
      if (snow) {
        for (let i = 1; i < drift.length - 1; i++) drift[i] = drift[i] * 0.9 + (drift[i - 1] + drift[i + 1]) * 0.05;
        ctx.fillStyle = '#eef4fc';
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 0; i < drift.length; i++) ctx.lineTo(i * BIN, H - drift[i] * (0.6 + 0.4 * Math.sin(i * 0.7)));
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    // a still frame starts with drifts already banked
    if (still && snow) for (let i = 0; i < drift.length; i++) drift[i] = maxH * (0.35 + 0.5 * Math.abs(Math.sin(i * 0.31)));
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [snow, wind, lite]);
  return <canvas ref={ref} className="e8-wx__canvas" aria-hidden="true" />;
};

const Who = ({ gp, lookup, sprites, club, flip }: { gp: GamePlayer; lookup: (gp: GamePlayer) => Player | undefined; sprites: boolean; club: string; flip: boolean }) => {
  const card = lookup(gp);
  return (
    <div className={`e8-wx__who e8-wx__who--${flip ? 'r' : 'l'}`} style={clubVars(club)}>
      {card ? <Stand p={card} sprites={sprites} scale={1.5} team={club} flip={flip} /> : <TeamLogo team={club} size={120} decorative />}
      <span className="e8-wx__breath" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="e8-wx__nm">{surnameOf(gp.name)}</span>
    </div>
  );
};

const TICK: [string, string][] = [
  ['passing_yards', 'pass yds'],
  ['rushing_yards', 'rush yds'],
  ['def_sacks', 'sacks'],
  ['fg_made', 'FG'],
];
export const WeatherGameScene = ({ data, lookup, sprites }: { data: WxGameData; lookup: (gp: GamePlayer) => Player | undefined; sprites: boolean }) => {
  const g = data.game;
  const home = abbrName(g.home);
  const away = abbrName(g.away);
  const t = Math.round(g.temp ?? 0);
  const snow = data.fx === 'snow';
  const { lite } = usePerfMode();
  const fill = Math.min(1, Math.max(0.04, (t + 10) / 80));
  const items = useMemo(() => {
    const out: { k: string; t: string }[] = [];
    if (g.team) {
      TICK.forEach(([col, label]) => {
        const a = g.team![0][col];
        const h = g.team![1][col];
        if (a !== undefined && h !== undefined) out.push({ k: label.toUpperCase(), t: `${g.away} ${Math.round(a)} · ${g.home} ${Math.round(h)}` });
      });
    }
    return out;
  }, [g]);
  const stars = useMemo(() => {
    const pod = podiumOf(g);
    const l = pod.find((p) => p.side === 0);
    const r = pod.find((p) => p.side === 1);
    return { l, r };
  }, [g]);
  const set = (
    <span className="sv-sb__set">
      {items.map((it, i) => (
        <span key={i} className="sv-sb__item">
          <em>{it.k}</em>
          {it.t}
        </span>
      ))}
    </span>
  );
  return (
    <Stadium club={home} roll={data.roll} look={snow ? 'snow' : 'night'}>
      <div className={`e8-wx${snow ? ' e8-wx--snow' : ' e8-wx--rain'}`} style={{ ...clubVars(home), '--wind': data.wind, '--fill': fill } as CSSProperties}>
        <span className="e8-wx__frost" aria-hidden="true" />
        <div className="e8-wx__board" aria-hidden="false">
          <span className="e8-wx__ice">
            {Array.from({ length: 14 }, (_, i) => (
              <i key={i} style={{ '--h': `${10 + ((i * 7) % 5) * 7}px` } as CSSProperties} />
            ))}
          </span>
          <TeamLogo team={away} size={46} decorative />
          <Led>{g.awayScore}</Led>
          <Led className="e8-led--dim">–</Led>
          <Led>{g.homeScore}</Led>
          <TeamLogo team={home} size={46} decorative />
        </div>
        <div className="e8-wx__thermo">
          <span className="e8-wx__tube">
            <i className="e8-wx__mercury" />
            <i className="e8-wx__freeze">32</i>
          </span>
          <span className="e8-wx__bulb" />
          <Led className="e8-wx__deg">
            {t}
            <small>°F</small>
          </Led>
        </div>
        {stars.l && <Who gp={stars.l} lookup={lookup} sprites={sprites} club={away} flip={false} />}
        {stars.r && <Who gp={stars.r} lookup={lookup} sprites={sprites} club={home} flip />}
        <Blizzard snow={snow} wind={data.wind} lite={lite} />
        {items.length > 0 && (
          <div className="sv-sb__ticker e8-wx__ticker">
            <span className="sv-sb__tag">Box score</span>
            <span className="sv-sb__crawl">
              <span className="sv-sb__track">
                {set}
                {set}
              </span>
            </span>
          </div>
        )}
        <Lower
          kick={`Weather game · ${roundLabel(g)}`}
          head={`${g.stadium ?? home}`}
          sub={`${roofLabel(g.roof)}${g.wind ? ` · wind ${Math.round(g.wind)} mph` : ''} · ${fmtDate(g.date)}`}
          club={home}
        />
      </div>
    </Stadium>
  );
};

/* ================================ 8. Hometown ================================ */
export const HometownScene = ({ data, sprites }: { data: HometownData; sprites: boolean }) => {
  const s = data.school;
  const info = markInfo(s);
  // the best in the middle, the rest fanning out (the line-up's order)
  const order: Player[] = [];
  data.players.forEach((p, i) => (i % 2 ? order.push(p) : order.unshift(p)));
  const best = data.players[0];
  return (
    <div className="e8-ht" style={schoolColors(s)}>
      <span className="e8-ht__sky" aria-hidden="true" />
      <span className="e8-ht__stands" aria-hidden="true" />
      <span className="e8-ht__crowd" aria-hidden="true" />
      <span className="e8-ht__pennants" aria-hidden="true">
        {Array.from({ length: 13 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </span>
      {[0, 1].map((i) => (
        <span key={i} className={`e8-ht__tower e8-ht__tower--${i}`} aria-hidden="true">
          {Array.from({ length: 12 }, (_, j) => (
            <i key={j} />
          ))}
        </span>
      ))}
      <div className="e8-ht__mural" aria-hidden="true">
        {info && <CollegeMark info={info} size={250} />}
        <b>{s.name}</b>
      </div>
      <span className="e8-ht__turf" aria-hidden="true" />
      <span className="e8-ht__paint" aria-hidden="true" style={{ fontSize: `${Math.min(8, 112 / Math.max(8, s.name.length))}vw` }}>
        {s.name}
      </span>
      <ul className="e8-ht__row">
        {order.map((p, i) => {
          const club = clubOfP(p);
          const lead = p === best;
          return (
            <li key={p.name + i} className={`e8-ht__man${lead ? ' is-best' : ''}`} style={{ ...clubVars(club), '--i': i } as CSSProperties}>
              <Stand p={p} sprites={sprites} action={lead ? 'celebrate' : 'idle'} scale={lead ? 1.55 : 1.3} team={club} />
              <span className="e8-ht__plate">
                <TeamLogo team={club} size={20} decorative />
                <b>{surnameOf(p.name)}</b>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="e8-lt e8-lt--bl" style={{ '--k1': 'var(--cl-sl)', '--k1d': 'var(--cl-sc)' } as CSSProperties}>
        <p className="sv-kick">Hometown · best in the league</p>
        <h2 className="e8-lt__head">{s.name}</h2>
        <p className="e8-lt__sub">
          {displayName(best.name)} leads · {fmt(best.careerLegacy)} Career Legacy
        </p>
      </div>
    </div>
  );
};
