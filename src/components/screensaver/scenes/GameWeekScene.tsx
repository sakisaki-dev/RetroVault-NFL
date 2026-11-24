import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import { findNFLTeam } from '@/utils/nflTeams';
import { liftForDarkBg } from '@/utils/teamColors';
import { displayName } from '@/utils/displayName';
import type { GameDetail } from '@/utils/nflGames';
import { useLiveSeason } from '@/utils/seasonLive';
import { stadiumWeather, pctText } from '@/utils/stadiumWeather';
import { compareRows, fmtDate, lineOf, podiumOf, recapOf, roofLabel, roundLabel } from '@/components/game/gameModel';
import { clubName, primetimeLabel, reducedMotion, type SaverDeps } from './nflSaverData';
import './saverScenes.css';

/**
 * Game of the week: one notable game replayed as a broadcast (the Game page's own model). The home club's stadium and
 * weather, the scoreboard counting up to the final, the tale of the tape filling, the stars of the game on a podium with
 * the game ball winner celebrating, and the recap typed in. Timings are CSS delays inside the 14 s scene.
 */
const CountUp = ({ to, delay, ms = 2600 }: { to: number; delay: number; ms?: number }) => {
  const [n, setN] = useState(reducedMotion() ? to : 0);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, ms]);
  return <>{n}</>;
};

const Typed = ({ text, delay }: { text: string; delay: number }) => {
  const [n, setN] = useState(reducedMotion() ? text.length : 0);
  useEffect(() => {
    if (reducedMotion()) return;
    let iv = 0;
    const st = window.setTimeout(() => {
      iv = window.setInterval(() => setN((x) => Math.min(text.length, x + 2)), 36);
    }, delay);
    return () => (window.clearTimeout(st), window.clearInterval(iv));
  }, [text, delay]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="sv-gw__caret" />}
    </>
  );
};

const fmtVal = (x: number, dec?: number) => (dec ? x.toFixed(dec) : Math.round(x).toLocaleString('en-US'));

const GameWeekScene = ({ game: g, deps }: { game: GameDetail; deps: SaverDeps }) => {
  const live = useLiveSeason();
  const a = findNFLTeam(g.away);
  const h = findNFLTeam(g.home);
  const homeName = h?.name ?? g.home;
  const rows = useMemo(() => compareRows(g).slice(0, 6), [g]);
  const podium = useMemo(() => podiumOf(g), [g]);
  const recap = useMemo(() => recapOf(g).slice(0, 2).join(' '), [g]);
  const wx = stadiumWeather(live?.clubs?.[homeName]);
  const late = wx?.phases.find((p) => p.key === 'late');
  const dome = g.roof === 'dome' || g.roof === 'closed';
  const roll = (g.time ?? '') >= '19:00' ? 0.9 : (g.time ?? '') < '16:00' ? 0.1 : 0.4;
  const { Stadium } = deps;
  const night = primetimeLabel(g);
  const wxLine = [
    g.stadium,
    roofLabel(g.roof),
    !dome && g.temp !== undefined ? `${Math.round(g.temp)}°F` : '',
    !dome && g.wind ? `wind ${Math.round(g.wind)} mph` : '',
    wx && !wx.covered && late ? `rain ${pctText(late.rain)} of late-season games here` : '',
  ].filter(Boolean).join(' · ');
  // podium order: second, first, third
  const slots = [podium[1], podium[0], podium[2]].map((p, i) => ({ p, rank: [2, 1, 3][i] }));
  const clubOfSide = (s: 0 | 1) => (s === 0 ? g.away : g.home);
  return (
    <Stadium club={homeName} roll={roll}>
      <div className="sv-gw">
        <header className="sv-gw__head">
          <p className="sv-kick">Game of the week · {roundLabel(g)}{night ? ` · ${night}` : ''}</p>
          <div className="sv-gw__score" style={{ '--c1': a ? `hsl(${a.primaryColor})` : '#888', '--c2': h ? `hsl(${h.primaryColor})` : '#888' } as CSSProperties}>
            <span className="sv-gw__club">
              <TeamLogo team={a?.name ?? g.away} size={64} decorative />
              <b>{a?.name ?? g.away}</b>
            </span>
            <span className="sv-gw__num"><CountUp to={g.awayScore ?? 0} delay={900} /></span>
            <span className="sv-gw__fin">{g.ot ? 'Final · OT' : 'Final'}</span>
            <span className="sv-gw__num"><CountUp to={g.homeScore ?? 0} delay={900} /></span>
            <span className="sv-gw__club sv-gw__club--h">
              <b>{h?.name ?? g.home}</b>
              <TeamLogo team={homeName} size={64} decorative />
            </span>
          </div>
          <p className="sv-gw__wx">{fmtDate(g.date)} · {wxLine}</p>
        </header>
        <div className="sv-gw__mid">
          {rows.length > 0 && (
            <section className="sv-gw__tape" aria-label="Tale of the tape">
              <h3 className="sv-kick">Tale of the tape</h3>
              {rows.map((r, i) => {
                const tot = Math.max(0.0001, Math.abs(r.a) + Math.abs(r.h));
                const aw = (Math.abs(r.a) / tot) * 100;
                const aBetter = r.lowerBetter ? r.a < r.h : r.a > r.h;
                const hBetter = r.lowerBetter ? r.h < r.a : r.h > r.a;
                return (
                  <div key={r.id} className="sv-gw__trow" style={{ '--d': `${4.2 + i * 0.4}s` } as CSSProperties}>
                    <b className={aBetter ? 'is-lead' : ''}>{fmtVal(r.a, r.dec)}</b>
                    <span className="sv-gw__bar">
                      <i className="sv-gw__bar-a" style={{ width: `${aw}%`, background: a ? liftForDarkBg(a.primaryColor, 55) : '#888' }} />
                      <i className="sv-gw__bar-h" style={{ width: `${100 - aw}%`, background: h ? liftForDarkBg(h.primaryColor, 55) : '#888' }} />
                      <em>{r.label}</em>
                    </span>
                    <b className={hBetter ? 'is-lead' : ''}>{fmtVal(r.h, r.dec)}</b>
                  </div>
                );
              })}
            </section>
          )}
          <section className="sv-gw__podium" aria-label="Stars of the game">
            <h3 className="sv-kick">Stars of the game</h3>
            <div className="sv-gw__steps">
              {slots.map(({ p, rank }) => {
                const club = clubOfSide(p.side);
                const card = deps.lookup(p);
                const t = findNFLTeam(club);
                return (
                  <div key={p.gsis} className={`sv-gw__step sv-gw__step--${rank}`} style={{ '--c1': t ? liftForDarkBg(t.primaryColor, 45) : '#888' } as CSSProperties}>
                    <div className="sv-gw__who">
                      {deps.sprites && card ? (
                        <GameSprite player={card} team={clubName(club)} kind="figure" size={rank === 1 ? "l" : "m"} action={rank === 1 ? 'celebrate' : 'idle'} />
                      ) : (
                        <TeamLogo team={clubName(club)} size={rank === 1 ? 96 : 72} decorative />
                      )}
                      <span className="sv-gw__plate">
                        {rank === 1 && <u>Game ball</u>}
                        <b>{displayName(p.name)}</b>
                        <small>{lineOf(p)}</small>
                      </span>
                    </div>
                    <span className="sv-gw__block">{rank}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        {recap && (
          <p className="sv-gw__recap">
            <Typed text={recap} delay={9800} />
          </p>
        )}
      </div>
    </Stadium>
  );
};
export default GameWeekScene;
