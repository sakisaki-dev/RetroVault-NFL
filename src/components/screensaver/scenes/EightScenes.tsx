import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
import { Stadium } from '../Screensaver';
import type { DraftNightData, HometownData, LockerData, LongOneData, MilestoneData, OldNewData, TwoMinData, WxGameData } from './eightData';
import './eightScenes.css';

/*
 * Eight scenes made from real files only (see eightData.ts for where each pick comes from): Draft night, Two-minute
 * drill, The long one, Locker room, Milestone watch, Old vs new, Weather game, Hometown. One short line of copy each,
 * motion in CSS (transforms), the few timers stop with reduced motion.
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

/* ================================ 1. Draft night ================================ */
export const DraftNightScene = ({ data, sprites }: { data: DraftNightData; sprites: boolean }) => {
  const { pick, school, player, year } = data;
  const [round, no, club, name, pos, , , ovr, pb, ap, , games] = pick;
  const t = findNFLTeam(club);
  const full = t?.name ?? club;
  const arrived = useAfter(4600);
  const stats = [
    { k: 'Career OVR', v: ovr },
    { k: 'Pro Bowls', v: pb },
    { k: 'All-Pro', v: ap },
    { k: 'Games', v: games },
  ].filter((s): s is { k: string; v: number } => s.v != null && (s.k !== 'All-Pro' || s.v > 0) && (s.k !== 'Pro Bowls' || s.v > 0));
  return (
    <Stadium club={full} roll={0.9}>
      <div className="e8-dr" style={{ ...cardVars(full), ...clubVars(full) }}>
        <p className="sv-kick e8-dr__kick">Draft night · {year}</p>
        <div className="e8-dr__stage">
          <span className="e8-dr__wall" aria-hidden="true">
            <span className="e8-seal e8-seal--xl">
              <TeamLogo team={full} size={210} decorative />
            </span>
          </span>
          <span className="e8-dr__walker">
            {player ? <Stand p={player} sprites={sprites} action={arrived ? 'celebrate' : 'run'} scale={1.5} team={full} /> : <TeamLogo team={full} size={120} decorative />}
          </span>
          <div className="e8-dr__podium">
            <span className="e8-seal">
              <TeamLogo team={full} size={56} decorative />
            </span>
            <i>Round {round}</i>
            <b>Pick {no}</b>
          </div>
        </div>
        <aside className="e8-dr__card">
          <p className="e8-dr__who">{displayName(name)}</p>
          <p className="e8-dr__line">
            {pos} · {full}
          </p>
          {school && (
            <p className="e8-dr__school">
              <CollegeMark info={markInfo(school)!} size={44} />
              <span>{school.name}</span>
            </p>
          )}
          <dl className="e8-dr__stats">
            {stats.map((s) => (
              <div key={s.k}>
                <dd>{fmt(s.v)}</dd>
                <dt>{s.k}</dt>
              </div>
            ))}
          </dl>
        </aside>
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
  const sides = [0, 1] as const;
  const names = [abbrName(g.away), abbrName(g.home)];
  return (
    <Stadium club={names[1]} roll={data.roll}>
      <div className="e8-tm">
        <p className="sv-kick">Two-minute drill · {roundLabel(g)}{g.ot ? ' · overtime' : ''}</p>
        <div className="e8-tm__board">
          {sides.map((i) => {
            const team = (
              <div key={i} className={`e8-tm__team e8-tm__team--${i}${done && winSide === i ? ' is-win' : ''}`} style={clubVars(names[i])}>
                <TeamLogo team={names[i]} size={72} decorative />
                <b>{names[i]}</b>
                <span className="e8-tm__n">{i === 0 ? a : h}</span>
              </div>
            );
            return i === 1 ? [
              <div key="c" className="e8-tm__clock">
                <span className="e8-tm__q">{g.ot ? 'OT' : '4th'}</span>
                <b>{`${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`}</b>
                <i className={done ? 'is-on' : ''}>{done ? `Final · by ${margin}` : 'Two minutes'}</i>
              </div>,
              team,
            ] : team;
          })}
        </div>
        <div className="e8-tm__field" aria-hidden="true">
          <span className="e8-tm__ez e8-tm__ez--l" style={clubVars(names[0])}>
            <span className="e8-seal"><TeamLogo team={names[0]} size={64} decorative /></span>
          </span>
          <span className="e8-tm__ez e8-tm__ez--r" style={clubVars(names[1])}>
            <span className="e8-seal"><TeamLogo team={names[1]} size={64} decorative /></span>
          </span>
          <span className="e8-tm__yards" />
          <span className="e8-tm__ball" />
        </div>
        <div className="e8-tm__qbs">
          {sides.map((i) => {
            const gp = qbOf(g, i);
            const card = gp ? lookup(gp) : undefined;
            return (
              <div key={i} className={`e8-tm__qb${done && winSide === i ? ' is-win' : ''}`} style={clubVars(names[i])}>
                {card ? <Stand p={card} sprites={sprites} action={done && winSide === i ? 'celebrate' : 'idle'} scale={1.25} team={names[i]} flip={i === 1} /> : <TeamLogo team={names[i]} size={96} decorative />}
                {gp && (
                  <span className="e8-tm__plate">
                    <b>{displayName(gp.name)}</b>
                    <small>{lineOf(gp)}</small>
                  </span>
                )}
              </div>
            );
          })}
        </div>
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
  const marks = [0, 10, 20, 30, 40, 50, 60].filter((m) => m <= yards);
  const dist = useCount(yards, 3300, 1500);
  const good = useAfter(4800);
  return (
    <Stadium club={club} roll={0.9}>
      <div className="e8-lg" style={{ ...clubVars(club), '--yds': yards } as CSSProperties}>
        <div className="sv-rec__board e8-lg__board">
          <p className="sv-kick">Longest field goal · {g.season}</p>
          <p className="e8-lg__yds">
            {dist}
            <small>yds</small>
          </p>
          <h2 className="e8-lg__name">{displayName(name)}</h2>
          <p className="e8-lg__line">
            {club}
            {clubAbbr === g.away ? ` at ${abbrName(g.home)}` : ` vs ${abbrName(g.away)}`} · {fmtDate(g.date)}
          </p>
        </div>
        <div className="e8-lg__flight" aria-hidden="true">
          <span className="e8-lg__rule">
            {marks.map((m) => (
              <i key={m} style={{ left: `${(m / yards) * 100}%` }}>
                {m}
              </i>
            ))}
          </span>
          <span className="e8-lg__x">
            <span className="e8-lg__y">
              <span className="e8-lg__ball" />
            </span>
          </span>
          <span className="e8-lg__post">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className={`e8-lg__good${good ? ' is-on' : ''}`}>It&apos;s good</span>
        </div>
        <div className="e8-lg__kicker">
          {kicker ? <Stand p={kicker} sprites={sprites} action={good ? 'celebrate' : 'idle'} scale={1.3} team={club} /> : <TeamLogo team={club} size={110} decorative />}
        </div>
      </div>
    </Stadium>
  );
};

/* ================================ 4. Locker room ================================ */
export const LockerRoomScene = ({ data, numberFor }: { data: LockerData; numberFor: (p: Player) => number | null }) => {
  const t = findNFLTeam(data.club);
  return (
    <div className="e8-lk" style={clubVars(data.club)}>
      <span className="e8-lk__lights" aria-hidden="true" />
      <header className="e8-lk__head">
        <TeamLogo team={data.club} size={84} decorative />
        <div>
          <p className="sv-kick">Locker room · all-time greats</p>
          <h2 className="sv-title e8-lk__title">{t?.fullName ?? data.club}</h2>
        </div>
      </header>
      <ul className="e8-lk__row">
        {data.players.map((p, i) => {
          const club = findNFLTeam(bannerTeamOf(p));
          const num = numberFor(p);
          return (
            <li key={p.name + i} className="e8-lk__stall" style={{ ...clubVars(club?.name ?? data.club), '--i': i } as CSSProperties}>
              <span className="e8-lk__tag">{surnameOf(p.name)}</span>
              <span className="e8-lk__shelf">
                <TeamLogo team={club?.name ?? data.club} size={40} decorative />
              </span>
              <span className="e8-lk__hanger" aria-hidden="true" />
              <span className="e8-lk__jersey">
                {num != null && num > 0 && <b>{num}</b>}
              </span>
              <span className="e8-lk__pants" aria-hidden="true" />
              <span className="e8-lk__pos">
                {p.position} · {fmt(p.careerLegacy)}
              </span>
            </li>
          );
        })}
      </ul>
      <span className="e8-lk__bench" aria-hidden="true" />
    </div>
  );
};

/* ================================ 5. Milestone watch ================================ */
export const MilestoneScene = ({ data, sprites }: { data: MilestoneData; sprites: boolean }) => {
  const p = data.player;
  const club = clubOfP(p);
  const pct = Math.min(99.5, (data.have / data.mark) * 100);
  const games = useCount(data.games, 1500, 2000);
  const have = useCount(data.have, 600, 2200);
  return (
    <Stadium club={club} roll={data.roll}>
      <div className="e8-ms" style={{ ...clubVars(club), '--w': `${pct}%` } as CSSProperties}>
        <div className="e8-ms__man">
          <Stand p={p} sprites={sprites} action="run" scale={1.7} team={club} />
        </div>
        <div className="e8-ms__panel">
          <p className="sv-kick">Milestone watch · {data.label}</p>
          <h2 className="e8-ms__name">{displayName(p.name)}</h2>
          <p className="e8-ms__nums">
            <b>{fmt(have)}</b> <span>of {fmt(data.mark)}</span>
          </p>
          <span className="e8-ms__bar">
            <i />
            <em>{Math.round(pct)}%</em>
          </span>
          <p className="e8-ms__games">
            <b>{games}</b> {data.games === 1 ? 'game' : 'games'} at his pace
          </p>
          <p className="e8-ms__sub">
            {fmt(data.mark - data.have)} to go · {data.perGame >= 10 ? Math.round(data.perGame) : data.perGame.toFixed(1)} {data.unit} a game
          </p>
        </div>
      </div>
    </Stadium>
  );
};

/* ================================ 6. Old vs new ================================ */
export const OldVsNewScene = ({ data, sprites }: { data: OldNewData; sprites: boolean }) => {
  const rows = useMemo(() => {
    const a = careerLine(data.old);
    const b = careerLine(data.neu);
    return a.map((r) => ({ label: r.label, o: r.value, n: b.find((x) => x.label === r.label)?.value })).filter((r): r is { label: string; o: number; n: number } => Number.isFinite(r.o) && r.n !== undefined && Number.isFinite(r.n)).slice(0, 4);
  }, [data]);
  const side = (p: Player, year: number | null, span: string, tag: string, flip: boolean) => {
    const club = clubOfP(p);
    return (
      <div className={`e8-on__half${flip ? ' e8-on__half--new' : ''}`} style={clubVars(club)}>
        <p className="sv-kick">{tag}{span ? ` · ${span}` : ''}</p>
        <Stand p={p} sprites={sprites} action="idle" scale={2.4} season={year} team={club} flip={flip} />
        <span className="e8-on__plate">
          <TeamLogo team={club} size={28} decorative />
          <b>{displayName(p.name)}</b>
        </span>
      </div>
    );
  };
  return (
    <Stadium club={clubOfP(data.neu)} roll={data.roll}>
      <div className="e8-on">
        {side(data.old, data.oldYear, data.oldSpan, 'Then', false)}
        <div className="e8-on__mid">
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
        {side(data.neu, data.neuYear, data.neuSpan, 'Now', true)}
      </div>
    </Stadium>
  );
};

/* ================================ 7. Weather game ================================ */
const TICK: [string, string][] = [
  ['passing_yards', 'pass yds'],
  ['rushing_yards', 'rush yds'],
  ['def_sacks', 'sacks'],
  ['fg_made', 'FG'],
];
export const WeatherGameScene = ({ data }: { data: WxGameData }) => {
  const g = data.game;
  const home = abbrName(g.home);
  const away = abbrName(g.away);
  const cold = Math.round(g.temp ?? 0);
  const items = useMemo(() => {
    const out: { k: string; t: string }[] = [];
    if (g.team) {
      TICK.forEach(([col, label]) => {
        const a = g.team![0][col];
        const h = g.team![1][col];
        if (a !== undefined && h !== undefined) out.push({ k: label.toUpperCase(), t: `${g.away} ${Math.round(a)} · ${g.home} ${Math.round(h)}` });
      });
    }
    podiumOf(g).forEach((p) => out.push({ k: (p.side === 0 ? g.away : g.home), t: `${displayName(p.name)} ${lineOf(p)}` }));
    return out;
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
    <Stadium club={home} roll={data.roll} look={data.fx === 'snow' ? 'snow' : 'night'}>
      <div className="e8-wx" style={{ ...clubVars(home), '--wind': data.wind } as CSSProperties}>
        <p className="sv-kick">Weather game · {roundLabel(g)}</p>
        <div className="e8-wx__main">
          <p className="e8-wx__temp">
            {cold}
            <small>°F</small>
          </p>
          <div className="e8-wx__tape">
            <span className="e8-wx__score">
              <TeamLogo team={away} size={60} decorative />
              <b>{g.awayScore}</b>
              <i>–</i>
              <b>{g.homeScore}</b>
              <TeamLogo team={home} size={60} decorative />
            </span>
            <p className="e8-wx__line">
              {g.stadium ? `${g.stadium} · ` : ''}
              {roofLabel(g.roof)}
              {g.wind ? ` · wind ${Math.round(g.wind)} mph` : ''} · {fmtDate(g.date)}
            </p>
          </div>
        </div>
        <div className="sv-sb__ticker e8-wx__ticker">
          <span className="sv-sb__tag">Box score</span>
          <span className="sv-sb__crawl">
            <span className="sv-sb__track">
              {set}
              {set}
            </span>
          </span>
        </div>
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
  const pennants: ReactNode[] = Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />);
  return (
    <div className="e8-ht" style={schoolColors(s)}>
      {info && (
        <span className="e8-ht__mark" aria-hidden="true">
          <CollegeMark info={info} size={560} />
        </span>
      )}
      <span className="e8-ht__pennants" aria-hidden="true">
        {pennants}
      </span>
      <header className="e8-ht__head">
        {info && <CollegeMark info={info} size={110} />}
        <div>
          <p className="sv-kick">Hometown · best in the league</p>
          <h2 className="sv-title e8-ht__title">{s.name}</h2>
        </div>
      </header>
      <ul className="e8-ht__row">
        {order.map((p, i) => {
          const club = clubOfP(p);
          const best = p === data.players[0];
          return (
            <li key={p.name + i} className={`e8-ht__man${best ? ' is-best' : ''}`} style={{ ...clubVars(club), '--i': i } as CSSProperties}>
              <Stand p={p} sprites={sprites} action={best ? 'celebrate' : 'idle'} scale={best ? 1.9 : 1.5} team={club} />
              <span className="e8-ht__plate">
                <TeamLogo team={club} size={24} decorative />
                <b>{surnameOf(p.name)}</b>
                <small>
                  {p.position} · {fmt(p.careerLegacy)}
                </small>
              </span>
            </li>
          );
        })}
      </ul>
      <span className="e8-ht__turf" aria-hidden="true" />
    </div>
  );
};
