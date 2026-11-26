import { openPlayerCard } from '@/utils/playerCardLink';
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { ArrowLeft, CalendarDays, CloudSun, Gauge, MapPin, ScrollText, Shield, Sparkles, Swords, Trophy, Users, Wind } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/timeline/TeamLogo';
import PixelLoader from '@/components/ui/PixelLoader';
import { findNFLTeam } from '@/utils/nflTeams';
import { openTeamPage } from '@/utils/teamSearch';
import { useGameDetail, type GameDetail, type GamePlayer, type Stat } from '@/utils/nflGames';
import { buildHash, canGoBackInApp, useHubRoute } from '../stats/hub/hashRoute';
import { usePageSwipeBack } from '@/hooks/usePageSwipeBack';
import { PodiumStage } from '../season/NflSeasonExtras';
import { useGameSprites } from '@/utils/gameSprites';
import { hslOf } from '../season/seasonGamesUi';
import { liftForDarkBg } from '@/utils/teamColors';
import {
  atsOf, compareRows, podiumOf, fmtDate, hasNgs, hasPfr, hasSnaps, impact, leadersFor, missingFor, played, recapOf, roofLabel, roundLabel, sitePos, snaps,
  lineOf, readableOf, rank, score, tackles, teamName, unitOf, unitsOf, v, winnerOf, hasCardPos, roman, superBowlNumber, type Side, type Star, type Unit,
} from './gameModel';
import { toneOf, NameStrip, SpriteOf, QbDuel, GroundGame, AirAttack, PassRush, Efficiency, Fantasy, SpecialTeams, matchupTabs, type Linker } from './gameSections';
import { clubVars, clubPlate, SectionHeader, Marquee, PixelPanel, PixelChip, ClubBadge, ArcadeToggle, CrowdDivider, ClubStrip } from '@/components/arcade';
import { Performers } from './GamePerformers';
import { PixelCup } from '../frontoffice/PixelCup';
import './game.css';
import './gameStage.css';
import './gameKit.css';
import '@/components/season/seaPhone.css';
import { displayName, surnameOf } from '@/utils/displayName';
import { stripKeySuffix } from '@/utils/nameSuffix';
import { Reveal, ViewCount, stag, useReveal } from '@/components/motion/Reveal';

const MoreGames = lazy(() => import('./MoreGames'));

/**
 * Stats › Game: one game in depth (#stats/game?id=<nflverse game id>), any game 1999-2026. Broadcast header, recap,
 * team comparison, players of the game, both rosters standing as sprites in the kits of that season, the box score,
 * every advanced stat the year has and a plain note of what it hasn't. Data: public/data/nfl/game/<year>.json
 * (scripts/nfl/game_detail.py), loaded for this game's season only.
 */

const abbrOf = (a: string) => findNFLTeam(a)?.abbreviation ?? a;
const fx = (x: number | undefined, d = 0) => (x === undefined || Number.isNaN(x) ? '–' : d ? x.toFixed(d) : String(Math.round(x)));
const sgn = (x: number, d = 1) => (x > 0 ? `+${x.toFixed(d)}` : x < 0 ? `−${Math.abs(x).toFixed(d)}` : (0).toFixed(d));

/** Mounts its children when scrolled near, once (a roster is 70 sprites; only the ones in view draw). */
const InView = ({ children, className, minH = 90 }: { children: ReactNode; className?: string; minH?: number }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    if (typeof IntersectionObserver === 'undefined') return setOn(true);
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setOn(true), io.disconnect()), { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return (
    <div ref={ref} className={className} style={on ? undefined : { minHeight: minH }}>
      {on ? children : null}
    </div>
  );
};

const Section = ({ id, icon: Icon, title, kicker, children, className, g }: { id: string; icon: typeof Users; title: string; kicker?: string; children: ReactNode; className?: string; g?: GameDetail }) => (
  <section id={id} aria-labelledby={`${id}-h`} className={cn('space-y-3', className)}>
    <SectionHeader
      title={<span id={`${id}-h`} className="gm-sech"><Icon className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> {title}</span>}
      kicker={kicker}
    />
    {children}
  </section>
);

/* ---------------- header ---------------- */

/** A kickoff at 7 pm or later (the file's times are Eastern) or the Super Bowl plays under the lights. */
const isNight = (g: GameDetail) => g.type === 'SB' || (!!g.time && parseInt(g.time, 10) >= 19);

/* ---------------- recap, comparison, stars ---------------- */

const Recap = ({ g }: { g: GameDetail }) => {
  const lines = recapOf(g);
  if (!lines.length) return null;
  return (
    <p className="gm-recap">
      <ScrollText className="mr-1.5 inline h-4 w-4 -translate-y-px text-[hsl(var(--gold))]" aria-hidden />
      {lines.join(' ')}
    </p>
  );
};

const Compare = ({ g }: { g: GameDetail }) => {
  if (!g.team) return null;
  const [A, H] = g.team;
  const base = compareRows(g);
  const byId = (id: string) => base.find((r) => r.id === id);
  const fgs = (s: Stat) => `${v(s, 'fg_made')}/${v(s, 'fg_att')}`;
  const rows: { id: string; label: string; a: number; h: number; sa?: string; sh?: string; lowerBetter?: boolean; tip?: string }[] = [];
  const pass = byId('pass'); if (pass) rows.push({ ...pass, label: 'Net passing yards', tip: `Passing yards less yards lost to sacks. Gross: ${v(A, 'passing_yards')} ${teamName(g.away)}, ${v(H, 'passing_yards')} ${teamName(g.home)} (the QB lines above are gross).` });
  const rush = byId('rush'); if (rush) rows.push({ ...rush, label: 'Rushing yards' });
  const fd = byId('fd'); if (fd) rows.push({ ...fd });
  if (v(A, 'fg_att') || v(H, 'fg_att')) rows.push({ id: 'fg', label: 'Field goals', a: v(A, 'fg_made'), h: v(H, 'fg_made'), sa: fgs(A), sh: fgs(H) });
  rows.push({ id: 'sk', label: 'Sacks', a: v(A, 'def_sacks'), h: v(H, 'def_sacks'), sa: fx(v(A, 'def_sacks'), Number.isInteger(v(A, 'def_sacks')) ? 0 : 1), sh: fx(v(H, 'def_sacks'), Number.isInteger(v(H, 'def_sacks')) ? 0 : 1) });
  if (v(A, 'penalties') || v(H, 'penalties')) rows.push({ id: 'pen', label: 'Penalties', a: v(A, 'penalty_yards'), h: v(H, 'penalty_yards'), sa: `${v(A, 'penalties')}-${v(A, 'penalty_yards')}`, sh: `${v(H, 'penalties')}-${v(H, 'penalty_yards')}`, lowerBetter: true });
  const to = byId('to'); if (to) rows.push({ ...to });
  const shown = rows.filter((r) => r.a || r.h || r.id === 'sk');
  if (!shown.length) return null;
  return (
    <PixelPanel className="gm-compare" pad="sm" style={{ ['--ca' as string]: clubPlate(g.away).fill, ['--ch' as string]: clubPlate(g.home).fill }}>
      <div className="gm-compare__head">
        <TeamLogo team={g.away} decorative className="h-7 w-7" />
        <TeamLogo team={g.home} decorative className="h-7 w-7" />
      </div>
      <Reveal className="gm-compare__rows">
      {shown.map((r, i) => {
        const aBetter = r.lowerBetter ? r.a < r.h : r.a > r.h;
        const hBetter = r.lowerBetter ? r.h < r.a : r.h > r.a;
        const tot = Math.abs(r.a) + Math.abs(r.h);
        const pa = tot ? Math.max(4, Math.min(96, (Math.abs(r.a) / tot) * 100)) : 50;
        return (
          <div key={r.id} className="gm-cmp mo-rise" style={stag(i)}>
            <span className={cn('gm-cmp__n', aBetter && 'is-better')}>{r.sa ?? <ViewCount value={Math.round(r.a)} />}</span>
            <span className="gm-cmp__l" title={r.tip}>{r.label}{r.lowerBetter ? ' (lower wins)' : ''}</span>
            <span className={cn('gm-cmp__n gm-cmp__n--h', hBetter && 'is-better')}>{r.sh ?? <ViewCount value={Math.round(r.h)} />}</span>
            <span className="gm-cmp__seg" aria-hidden><i className="a mo-grow" style={{ width: `${pa}%`, ['--i' as string]: i + 1 }} /><i className="h mo-grow mo-grow--r" style={{ width: `${100 - pa}%`, ['--i' as string]: i + 1 }} /></span>
          </div>
        );
      })}
      </Reveal>
    </PixelPanel>
  );
};


/* ---- stadium: the scoreboard, both clubs' starters squared up on the turf, the line ---- */

const startersOf = (g: GameDetail, side: Side): GamePlayer[] => {
  const mine = g.players.filter((p) => p.side === side && hasCardPos(p.pos));
  const best = (ids: string[]) => mine.filter((p) => ids.includes(unitOf(p))).sort((a, b) => rank(b) - rank(a) || score(b) - score(a))[0];
  const qb = best(['qb']);
  const skill = mine.filter((p) => ['bf', 'rec'].includes(unitOf(p)) && p !== qb).sort((a, b) => rank(b) - rank(a) || score(b) - score(a))[0];
  const def = best(['dl', 'lb', 'db']);
  return [qb, skill, def].filter(Boolean) as GamePlayer[];
};

const clock = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} ET`;
};
const kickerOf = (g: GameDetail) => {
  const d = new Date(`${g.date}T12:00:00`);
  const day = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'long' });
  const date = Number.isNaN(d.getTime()) ? g.date : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const round = g.type === 'REG' ? `Week ${g.week}` : roundLabel(g).replace(/^\d{4} /, '');
  const when = isNight(g) ? (day ? `${day} night` : 'Night') : day;
  return [round, when, date, clock(g.time)].filter(Boolean).join(' · ');
};

const atsChip = (g: GameDetail): string | null => {
  const ats = atsOf(g);
  if (!ats || ats.push || ats.points < 0.5) return null;
  const fav = ats.favorite === 0 ? g.away : g.home;
  const dog = ats.favorite === 0 ? g.home : g.away;
  const w = winnerOf(g);
  const pts = String(ats.points).replace(/\.0$/, '');
  if (w !== null && (w === ats.favorite) === false) return `${teamName(dog)} won as +${pts} underdogs`;
  return ats.covered ? `${teamName(fav)} covered −${pts}` : `${teamName(dog)} covered as +${pts} underdogs`;
};

/** An anchor's props that open the player's card (the key is POS:Name). */
const cardLink = (key: string) => ({ href: '#', onClick: (e: { preventDefault(): void }) => { e.preventDefault(); openPlayerCard(key); } });

const Stadium = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const done = played(g);
  const w = winnerOf(g);
  const night = isNight(g);
  const total = done ? g.awayScore! + g.homeScore! : null;
  const weather = [g.temp !== undefined ? `${Math.round(g.temp)}°F` : null, g.wind !== undefined ? `${Math.round(g.wind)} mph wind` : null].filter(Boolean).join(' · ');
  const covered = atsChip(g);
  const dome = g.roof === 'dome' || g.roof === 'closed';
  const sq = ([0, 1] as Side[]).map((s) => startersOf(g, s));
  const ball = done ? podiumOf(g)[0] : undefined;
  const windy = (g.wind ?? 0) >= 12 && g.roof !== 'dome' && g.roof !== 'closed';
  const cold = g.temp !== undefined && g.temp < 40 && g.roof !== 'dome' && g.roof !== 'closed';
  const revSb = useReveal<HTMLDivElement>();
  const revMu = useReveal<HTMLDivElement>();
  const fig = (p: GamePlayer, side: Side, i: number) => {
    const lastNm = surnameOf(p.name);
    return (
      <li key={p.gsis + p.name} className={cn('gm-mu__fig', side === 1 && 'gm-mu__fig--home', side === 0 ? 'mo-run-l' : 'mo-run-r')} style={stag(i + 2)}>
        <span className="gm-mu__spr">{cold && <i className="gm-breath" aria-hidden />}<SpriteOf p={p} g={g} flip={side === 1} celebrate={w === side && unitOf(p) === 'qb'} /></span>
        <NameStrip p={p} g={g} link={link} className="gm-mu__name">{lastNm}</NameStrip>
      </li>
    );
  };
  const club = (side: Side) => {
    const abbr = side === 0 ? g.away : g.home;
    return (
      <button type="button" className={cn('gm-sb__club mo-pop', side === 1 && 'is-home')} onClick={() => openTeamPage(teamName(abbr))} aria-label={`${teamName(abbr)} team page`}>
        <TeamLogo team={abbr} decorative className="gm-sb__logo" />
        <span className="gm-sb__name">{teamName(abbr)}</span>
        <span className="gm-sb__role">{side === 0 ? 'Away' : 'Home'}</span>
      </button>
    );
  };
  return (
    <PodiumStage team={g.home} turf={night ? 'night' : 'day'} className={cn('gm-stage', !night && 'gm-stage--day', dome && 'gm-stage--dome', cold && 'gm-stage--cold')}>
      {dome && <div className="gm-roof" aria-hidden />}
      <span className="gm-ez gm-ez--a" style={{ ['--tc' as string]: toneOf(g.away) }} aria-hidden>{abbrOf(g.away)}</span>
      <span className="gm-ez gm-ez--h" style={{ ['--tc' as string]: toneOf(g.home) }} aria-hidden>{abbrOf(g.home)}</span>
      {windy && <div className="gm-wind" aria-hidden>{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ top: `${14 + i * 9}%`, animationDelay: `${-i * 0.7}s`, width: `${14 + (i % 3) * 8}%` }} />)}</div>}
      <div ref={revSb} className="gm-sb" style={{ ['--ca' as string]: toneOf(g.away), ['--ch' as string]: toneOf(g.home) }}>
        {club(0)}
        <div className="gm-sb__mid" role="img" aria-label={done ? `${teamName(g.away)} ${g.awayScore}, ${teamName(g.home)} ${g.homeScore}` : 'Not played yet'}>
          <span className="gm-sb__fin">{done ? `Final${g.ot ? ' · OT' : ''}${w === null ? ' · Tie' : ''}` : g.time ? clock(g.time) : 'To play'}</span>
          {done && (
            <div className="gm-sb__score">
              <span className={cn('gm-num', w === 0 && 'is-win', w === 1 && 'is-lose')}><ViewCount value={g.awayScore!} duration={900} /></span>
              <span className="gm-dash">–</span>
              <span className={cn('gm-num', w === 1 && 'is-win', w === 0 && 'is-lose')}><ViewCount value={g.homeScore!} duration={900} /></span>
            </div>
          )}
        </div>
        {club(1)}
      </div>
      <div ref={revMu} className="gm-mu">
        <ul className="gm-mu__side" aria-label={`${teamName(g.away)} starters`}>{[...sq[0]].reverse().map((p, i) => fig(p, 0, i))}</ul>
        <div className="gm-mu__mid">
          <span className="gm-mu__vs mo-pop" style={stag(5)} aria-hidden>VS</span>
          {ball && (
            <div className="gm-ball mo-pop" style={{ ['--tc' as string]: toneOf(ball.side === 0 ? g.away : g.home), ['--i' as string]: 8 }}>
              <span className="gm-mu__spr gm-ball__spr"><SpriteOf p={ball} g={g} celebrate /></span>
              <NameStrip p={ball} g={g} link={link} className="gm-mu__name"><span className="gm-ball__k">Game ball</span> {surnameOf(ball.name)}</NameStrip>
            </div>
          )}
        </div>
        <ul className="gm-mu__side" aria-label={`${teamName(g.home)} starters`}>{sq[1].map((p, i) => fig(p, 1, i))}</ul>
      </div>
      <ul className="gm-chips" aria-label="Game conditions">
        {(g.stadium || g.roof) && <li><MapPin className="h-3 w-3" aria-hidden /> {[g.stadium, g.roof ? roofLabel(g.roof).toLowerCase() : null].filter(Boolean).join(' · ')}</li>}
        {weather && <li><Wind className="h-3 w-3" aria-hidden /> {weather}</li>}
        {g.spread !== undefined && <li title="Closing spread"><Gauge className="h-3 w-3" aria-hidden /> Line <b>{g.spread === 0 ? 'pick' : `${abbrOf(g.spread > 0 ? g.home : g.away)} −${Math.abs(g.spread)}`}</b>{g.total !== undefined ? ` · O/U ${g.total}` : ''}</li>}
        {g.spread === undefined && g.total !== undefined && <li>O/U {g.total}</li>}
        {covered && <li>{covered}</li>}
        {total !== null && g.total !== undefined && <li>{total} points · <b>{total > g.total ? 'over' : total < g.total ? 'under' : 'push'}</b></li>}
      </ul>
    </PodiumStage>
  );
};

/* ---- stars of the game: top three on a podium ---- */

const kickerLine = (g: GameDetail, top: GamePlayer[]): string | null => {
  const k = g.players.filter((p) => !top.includes(p) && (v(p.s, 'fg_made') >= 3 || (v(p.s, 'fg_att') >= 2 && v(p.s, 'fg_made') === v(p.s, 'fg_att'))))
    .sort((a, b) => v(b.s, 'fg_made') - v(a.s, 'fg_made'))[0];
  return k ? `${displayName(k.name)} (${k.side === 0 ? abbrOf(g.away) : abbrOf(g.home)}) went ${v(k.s, 'fg_made')}/${v(k.s, 'fg_att')} on field goals.` : null;
};

const GamePodium = ({ g, link, champions }: { g: GameDetail; link: Linker; champions?: Side }) => {
  const top = useMemo(() => (champions === undefined ? podiumOf(g) : podiumOf({ ...g, players: g.players.filter((p) => p.side === champions) })), [g, champions]);
  if (top.length < 1) return null;
  const order = [top[1], top[0], top[2]].map((p, i) => (p ? { p, rank: [2, 1, 3][i] } : null));
  const winner = winnerOf(g);
  const kick = kickerLine(g, top);
  return (
    <>
      <PodiumStage team={top[0].side === 0 ? g.away : g.home} turf={isNight(g) ? 'night' : 'day'} className="gm-podstage">
        <Reveal as="ol" className="gm-pod" aria-label="Stars of the game: 1st in the middle, 2nd left, 3rd right">
          {order.map((o, i) => {
            if (!o) return <li key={`e${i}`} />;
            const { p, rank: r } = o;
            const abbr = p.side === 0 ? g.away : g.home;
            return (
              <li key={p.gsis + p.name} className={cn('gm-pod__col mo-step', r === 1 && 'is-first')} style={stag(r === 1 ? 3 : r === 2 ? 2 : 0)}>
                <SpriteOf p={p} g={g} size="m" celebrate={r === 1 || winner === p.side} />
                <div className="nsx-step gm-pod__step" style={{ minHeight: [92, 118, 84][r - 1], ...clubVars(abbr) }}>
                  <span className="gm-pod__rank">{r}</span>
                  <NameStrip p={p} g={g} link={link} className="gm-pod__name" />
                  <span className="gm-pod__team"><TeamLogo team={abbr} decorative className="h-3.5 w-3.5" /> {abbrOf(abbr)} · {p.pos}</span>
                  <span className="gm-pod__line">{lineOf(p)}</span>
                </div>
              </li>
            );
          })}
        </Reveal>
      </PodiumStage>
      {kick && <p className="gm-kick">{kick}</p>}
    </>
  );
};

/* ---------------- rosters ---------------- */

const shortLine = (p: GamePlayer, unit: Unit['def']['id']): string => {
  const s = p.s;
  switch (unit) {
    case 'qb': return v(s, 'attempts') ? `${v(s, 'completions')}/${v(s, 'attempts')} · ${v(s, 'passing_yards')}` : snaps(p) ? `${snaps(p)} snaps` : '';
    case 'bf': return v(s, 'carries') ? `${v(s, 'carries')} car · ${v(s, 'rushing_yards')}` : v(s, 'receptions') ? `${v(s, 'receptions')} rec · ${v(s, 'receiving_yards')}` : snaps(p) ? `${snaps(p)} snaps` : '';
    case 'rec': return v(s, 'targets') || v(s, 'receptions') ? `${v(s, 'receptions')}/${v(s, 'targets')} · ${v(s, 'receiving_yards')}` : snaps(p) ? `${snaps(p)} snaps` : '';
    case 'ol': return snaps(p) ? `${snaps(p)} snaps` : v(s, 'penalties') ? `${v(s, 'penalties')} pen` : '';
    case 'st': return v(s, 'fg_att') || v(s, 'pat_att') ? `${v(s, 'fg_made')}/${v(s, 'fg_att')} FG · ${v(s, 'pat_made')}/${v(s, 'pat_att')} XP` : v(s, 'pt_att') ? `${v(s, 'pt_att')} punts` : v(s, 'punt_returns') || v(s, 'kickoff_returns') ? `${v(s, 'punt_returns') + v(s, 'kickoff_returns')} ret` : '';
    default: return [tackles(s) ? `${tackles(s)} tkl` : '', v(s, 'def_sacks') ? `${v(s, 'def_sacks')} sck` : '', v(s, 'def_interceptions') ? `${v(s, 'def_interceptions')} INT` : ''].filter(Boolean).join(' · ') || (snaps(p) ? `${snaps(p)} snaps` : '');
  }
};

const Figure = ({ p, g, unit, link }: { p: GamePlayer; g: GameDetail; unit: Unit['def']['id']; link: Linker }) => {
  const abbr = p.side === 0 ? g.away : g.home;
  const href = link(p);
  const last = surnameOf(p.name);
  const hot = impact(p.s) >= 8 || v(p.s, 'fantasy_points_ppr') >= 15;
  const inner = (
    <>
      <span className="gm-fig__stage">
        <GameSprite player={{ name: p.name, position: sitePos(p.pos), team: abbr, bannerTeam: abbr }} team={abbr} season={g.season} size="s" />
      </span>
      <span className="gm-fig__pos">{p.pos || '—'}</span>
      <span className="gm-fig__name">{last}</span>
      <span className="gm-fig__line">{shortLine(p, unit) || ' '}</span>
    </>
  );
  const cls = cn('gm-fig', hot && 'is-hot');
  return href ? <a {...cardLink(href)} className={cls} title={`${displayName(p.name)}, ${p.pos}: open card`}>{inner}</a> : <div className={cls} title={`${displayName(p.name)}, ${p.pos}`}>{inner}</div>;
};

const Roster = ({ g, side, link }: { g: GameDetail; side: Side; link: Linker }) => {
  const abbr = side === 0 ? g.away : g.home;
  const units = useMemo(() => unitsOf(g, side), [g, side]);
  const total = units.reduce((n, u) => n + u.players.length, 0);
  const snapped = hasSnaps(g);
  return (
    <div className="gm-roster" style={{ ['--tc' as string]: hslOf(abbr) }}>
      <div className="gm-roster__head">
        <TeamLogo team={abbr} decorative className="h-8 w-8" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold uppercase leading-none">{findNFLTeam(abbr)?.fullName ?? abbr}</p>
          <p className="text-[11px] text-muted-foreground">{total} players {snapped ? 'on the field (snap counts)' : 'with a recorded stat'} · {g.season} kit</p>
        </div>
      </div>
      {units.map((u) => {
        const shown = u.players.slice(0, Math.max(u.def.show, 1));
        const rest = u.players.slice(shown.length);
        return (
          <div key={u.def.id} className="gm-unit" data-side={u.def.side}>
            <p className="gm-unit__label">{u.def.label} <b>{u.players.length}</b></p>
            <InView className="gm-unit__turf" minH={110}>
              <div className="gm-unit__row">
                {shown.map((p) => <Figure key={p.gsis + p.name} p={p} g={g} unit={u.def.id} link={link} />)}
              </div>
            </InView>
            {rest.length > 0 && (
              <p className="gm-unit__rest">
                <span>Also played:</span>{' '}
                {rest.map((p, i) => {
                  const href = link(p);
                  const t = `${displayName(p.name)}${shortLine(p, u.def.id) ? ` (${shortLine(p, u.def.id)})` : ''}`;
                  return <span key={p.gsis + p.name}>{href ? <a {...cardLink(href)}>{t}</a> : t}{i < rest.length - 1 ? ', ' : ''}</span>;
                })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ---------------- tables ---------------- */

interface Col {
  h: string;
  title?: string;
  get: (s: Stat) => number | undefined;
  dec?: number;
  fmt?: (s: Stat) => string;
}
const has = (k: string) => (s: Stat) => (k in s ? s[k] : undefined);
const nz = (s: Stat, ...ks: string[]) => ks.some((k) => (s[k] ?? 0) !== 0);

const BOX: { id: string; title: string; test: (s: Stat) => boolean; sort: (s: Stat) => number; cols: Col[] }[] = [
  { id: 'pass', title: 'Passing', test: (s) => nz(s, 'attempts'), sort: (s) => v(s, 'passing_yards'), cols: [
    { h: 'C/A', get: has('completions'), fmt: (s) => `${v(s, 'completions')}/${v(s, 'attempts')}` }, { h: 'YDS', get: has('passing_yards') }, { h: 'TD', get: has('passing_tds') }, { h: 'INT', get: has('passing_interceptions') },
    { h: 'SK', title: 'Sacks taken', get: has('sacks_suffered') }, { h: 'AIR', title: 'Air yards', get: has('passing_air_yards') }, { h: 'YAC', get: has('passing_yards_after_catch') }, { h: '1D', get: has('passing_first_downs') },
    { h: 'EPA', get: has('passing_epa'), dec: 1 }, { h: 'CPOE', get: has('passing_cpoe'), dec: 1 }, { h: 'PPR', title: 'Fantasy points (PPR)', get: has('fantasy_points_ppr'), dec: 1 } ] },
  { id: 'rush', title: 'Rushing', test: (s) => nz(s, 'carries'), sort: (s) => v(s, 'rushing_yards'), cols: [
    { h: 'CAR', get: has('carries') }, { h: 'YDS', get: has('rushing_yards') }, { h: 'AVG', get: (s) => (v(s, 'carries') ? v(s, 'rushing_yards') / v(s, 'carries') : undefined), dec: 1 }, { h: 'TD', get: has('rushing_tds') },
    { h: '1D', get: has('rushing_first_downs') }, { h: 'EPA', get: has('rushing_epa'), dec: 1 }, { h: 'FUM', title: 'Fumbles lost', get: has('fumbles_lost_total') } ] },
  { id: 'rec', title: 'Receiving', test: (s) => nz(s, 'targets', 'receptions'), sort: (s) => v(s, 'receiving_yards'), cols: [
    { h: 'REC', get: has('receptions'), fmt: (s) => `${v(s, 'receptions')}/${v(s, 'targets')}` }, { h: 'YDS', get: has('receiving_yards') }, { h: 'TD', get: has('receiving_tds') }, { h: 'AIR', title: 'Air yards', get: has('receiving_air_yards') },
    { h: 'YAC', get: has('receiving_yards_after_catch') }, { h: '1D', get: has('receiving_first_downs') }, { h: 'EPA', get: has('receiving_epa'), dec: 1 } ] },
  { id: 'def', title: 'Defense', test: (s) => impact(s) > 0, sort: (s) => impact(s), cols: [
    { h: 'TKL', title: 'Tackles (solo + assists)', get: (s) => tackles(s) }, { h: 'SOLO', get: has('def_tackles_solo') }, { h: 'TFL', get: has('def_tackles_for_loss') }, { h: 'SCK', get: has('def_sacks'), dec: 1 }, { h: 'QBH', title: 'QB hits', get: has('def_qb_hits') },
    { h: 'INT', get: has('def_interceptions') }, { h: 'PD', title: 'Passes defended', get: has('def_pass_defended') }, { h: 'FF', get: has('def_fumbles_forced') }, { h: 'FR', get: has('fumble_recovery_opp') }, { h: 'TD', get: has('def_tds') } ] },
  { id: 'kick', title: 'Kicking, punting and returns', test: (s) => nz(s, 'fg_att', 'pat_att', 'pt_att', 'punt_returns', 'kickoff_returns'), sort: (s) => kick(s), cols: [
    { h: 'FG', get: has('fg_att'), fmt: (s) => (v(s, 'fg_att') ? `${v(s, 'fg_made')}/${v(s, 'fg_att')}` : '') }, { h: 'LNG', get: has('fg_long') }, { h: 'XP', get: has('pat_att'), fmt: (s) => (v(s, 'pat_att') ? `${v(s, 'pat_made')}/${v(s, 'pat_att')}` : '') },
    { h: 'PUNTS', get: has('pt_att') }, { h: 'P YDS', get: has('pt_yards') }, { h: 'PR', title: 'Punt returns / yards', get: has('punt_returns'), fmt: (s) => (v(s, 'punt_returns') ? `${v(s, 'punt_returns')}/${v(s, 'punt_return_yards')}` : '') },
    { h: 'KR', title: 'Kick returns / yards', get: has('kickoff_returns'), fmt: (s) => (v(s, 'kickoff_returns') ? `${v(s, 'kickoff_returns')}/${v(s, 'kickoff_return_yards')}` : '') } ] },
];
function kick(s: Stat) {
  return 3 * v(s, 'fg_made') + v(s, 'pat_made') + v(s, 'pt_att') * 0.1;
}

const ADV: { id: string; title: string; note: string; src: string; test: (s: Stat) => boolean; sort: (s: Stat) => number; cols: Col[] }[] = [
  { id: 'a-pass', title: 'Quarterbacks under pressure', src: 'PFR + NGS', note: 'Pressures, hurries, hits and blitzes faced; bad throws; time to throw and aggressiveness (Next Gen).', test: (s) => nz(s, 'attempts') && nz(s, 'times_pressured', 'times_blitzed', 'avg_time_to_throw', 'passing_bad_throws'), sort: (s) => v(s, 'attempts'), cols: [
    { h: 'PRESS', title: 'Times pressured', get: has('times_pressured') }, { h: 'HURRY', get: has('times_hurried') }, { h: 'HIT', get: has('times_hit') }, { h: 'BLITZ', title: 'Times blitzed', get: has('times_blitzed') },
    { h: 'BAD', title: 'Bad throws', get: has('passing_bad_throws') }, { h: 'DROPS', title: 'Drops by his receivers', get: has('passing_drops') },
    { h: 'TTT', title: 'Average time to throw (sec)', get: has('avg_time_to_throw'), dec: 2 }, { h: 'AGG', title: 'Aggressiveness: share of throws into tight windows', get: has('aggressiveness'), dec: 1 }, { h: 'IAY', title: 'Average intended air yards', get: has('avg_intended_air_yards'), dec: 1 } ] },
  { id: 'a-rush', title: 'The ground game', src: 'PFR + NGS', note: 'Yards before and after contact, broken tackles, rush yards over expected and the share of carries into eight defenders (Next Gen).', test: (s) => nz(s, 'carries') && nz(s, 'rushing_yards_before_contact', 'rushing_yards_after_contact', 'rushing_broken_tackles', 'efficiency'), sort: (s) => v(s, 'carries'), cols: [
    { h: 'CAR', get: has('carries') }, { h: 'YBC', title: 'Yards before contact', get: has('rushing_yards_before_contact') }, { h: 'YAC', title: 'Yards after contact', get: has('rushing_yards_after_contact') }, { h: 'BTK', title: 'Broken tackles', get: has('rushing_broken_tackles') },
    { h: 'RYOE', title: 'Rush yards over expected (NGS)', get: has('rush_yards_over_expected'), dec: 1 }, { h: '8+', title: 'Share of carries against 8 or more defenders (NGS)', get: has('percent_attempts_gte_eight_defenders'), dec: 0 }, { h: 'EFF', title: 'Efficiency (NGS)', get: has('efficiency'), dec: 2 } ] },
  { id: 'a-rec', title: 'Receivers: drops, contact and separation', src: 'PFR + NGS', note: 'Drops and broken tackles after the catch (PFR); cushion, separation and yards after catch above expected (Next Gen).', test: (s) => nz(s, 'targets') && nz(s, 'receiving_drop', 'receiving_broken_tackles', 'avg_separation', 'avg_cushion'), sort: (s) => v(s, 'targets'), cols: [
    { h: 'TGT', get: has('targets') }, { h: 'DROP', get: has('receiving_drop') }, { h: 'BTK', title: 'Broken tackles', get: has('receiving_broken_tackles') },
    { h: 'SEP', title: 'Average separation (yds, NGS)', get: has('avg_separation'), dec: 1 }, { h: 'CUSH', title: 'Average cushion (yds, NGS)', get: has('avg_cushion'), dec: 1 }, { h: 'YAC+', title: 'Yards after catch above expected (NGS)', get: has('avg_yac_above_expectation'), dec: 1 } ] },
  { id: 'a-def', title: 'Pass rush and coverage', src: 'PFR', note: 'Pressures, hurries and blitzes; as a cover man: targets, catches and yards allowed, passer rating when targeted; missed tackles.', test: (s) => nz(s, 'def_pressures', 'def_targets', 'def_missed_tackles', 'def_times_blitzed'), sort: (s) => v(s, 'def_targets') * 3 + v(s, 'def_pressures') * 2 + tackles(s), cols: [
    { h: 'PRESS', title: 'Pressures', get: has('def_pressures') }, { h: 'HURRY', get: has('def_times_hurried') }, { h: 'BLITZ', get: has('def_times_blitzed') },
    { h: 'TGT', title: 'Targets in his coverage', get: has('def_targets') }, { h: 'CMP', title: 'Completions allowed', get: has('def_completions_allowed') }, { h: 'YDS', title: 'Yards allowed', get: has('def_yards_allowed') }, { h: 'RTG', title: 'Passer rating allowed', get: has('def_passer_rating_allowed'), dec: 1 }, { h: 'MT', title: 'Missed tackles', get: has('def_missed_tackles') } ] },
];

const StatTable = ({ title, rows, cols, g, link, tag }: { title: string; rows: GamePlayer[]; cols: Col[]; g: GameDetail; link: Linker; tag?: string }) => {
  const shown = cols.filter((c) => rows.some((p) => (c.get(p.s) ?? 0) !== 0));
  if (!shown.length || !rows.length) return null;
  return (
    <div className="gm-tbl">
      <p className="gm-tbl__t">{title}{tag && <i>{tag}</i>}</p>
      <div className="gm-tbl__scroll">
        <table>
          <thead>
            <tr>
              <th scope="col" className="text-left">Player</th>
              {shown.map((c) => <th key={c.h} scope="col" title={c.title}>{c.h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const href = link(p);
              return (
                <tr key={p.gsis + p.name}>
                  <th scope="row">
                    {href ? <a {...cardLink(href)}>{displayName(p.name)}</a> : p.name}
                    <small>{p.pos}</small>
                  </th>
                  {shown.map((c) => {
                    const val = c.get(p.s);
                    const txt = c.fmt ? c.fmt(p.s) : val === undefined || val === 0 ? '' : fx(val, c.dec);
                    return <td key={c.h} className={txt ? '' : 'is-empty'}>{txt || '·'}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const TeamTables = ({ g, side, link, kind }: { g: GameDetail; side: Side; link: Linker; kind: 'box' | 'adv' }) => {
  const abbr = side === 0 ? g.away : g.home;
  const mine = g.players.filter((p) => p.side === side);
  const defs = kind === 'box' ? BOX : ADV;
  const tables = defs
    .map((d) => ({ d, rows: mine.filter((p) => d.test(p.s)).sort((a, b) => d.sort(b.s) - d.sort(a.s) || a.name.localeCompare(b.name)) }))
    .filter((t) => t.rows.length);
  return (
    <div className="gm-team-tables" style={{ ['--tc' as string]: hslOf(abbr) }}>
      <p className="gm-team-tag"><TeamLogo team={abbr} decorative className="h-5 w-5" /> {findNFLTeam(abbr)?.fullName ?? abbr}</p>
      {tables.length ? tables.map(({ d, rows }) => <StatTable key={d.id} title={d.title} rows={rows} cols={d.cols} g={g} link={link} tag={(d as { src?: string }).src} />) : <p className="text-sm text-muted-foreground">Nothing recorded for this club.</p>}
    </div>
  );
};

/* ---------------- snap counts ---------------- */

const SnapBars = ({ g, side, link }: { g: GameDetail; side: Side; link: Linker }) => {
  const abbr = side === 0 ? g.away : g.home;
  const mine = g.players.filter((p) => p.side === side);
  const off = mine.filter((p) => v(p.s, 'offense_snaps') > 0).sort((a, b) => v(b.s, 'offense_snaps') - v(a.s, 'offense_snaps'));
  const def = mine.filter((p) => v(p.s, 'defense_snaps') > 0).sort((a, b) => v(b.s, 'defense_snaps') - v(a.s, 'defense_snaps'));
  const mo = Math.max(1, off[0] ? v(off[0].s, 'offense_snaps') : 1);
  const md = Math.max(1, def[0] ? v(def[0].s, 'defense_snaps') : 1);
  const col = (rows: GamePlayer[], key: string, max: number, label: string) => (
    <div>
      <p className="gm-tbl__t">{label}<i>{rows.length ? `${max} snaps` : ''}</i></p>
      <Reveal as="ul" className="gm-snaps">
        {rows.slice(0, 16).map((p, i) => {
          const n = v(p.s, key);
          const href = link(p);
          return (
            <li key={p.gsis + p.name} className="mo-rise" style={stag(i)}>
              <span className="gm-snaps__n">{href ? <a {...cardLink(href)}>{displayName(p.name)}</a> : p.name}<small>{p.pos}</small></span>
              <span className="gm-snaps__bar"><i className="mo-grow" style={{ width: `${(n / max) * 100}%`, ['--i' as string]: i }} /></span>
              <span className="gm-snaps__v">{n}<small>{Math.round((n / max) * 100)}%</small></span>
            </li>
          );
        })}
      </Reveal>
    </div>
  );
  return (
    <div className="gm-team-tables" style={{ ['--tc' as string]: hslOf(abbr) }}>
      <p className="gm-team-tag"><TeamLogo team={abbr} decorative className="h-5 w-5" /> {findNFLTeam(abbr)?.fullName ?? abbr}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {col(off, 'offense_snaps', mo, 'Offense')}
        {col(def, 'defense_snaps', md, 'Defense')}
      </div>
    </div>
  );
};

/* ---------------- page ---------------- */

const SideTabs = ({ g, side, onSide }: { g: GameDetail; side: Side; onSide: (s: Side) => void }) => (
  <div role="group" aria-label="Club" className="gm-sidetabs">
    {([0, 1] as Side[]).map((s) => {
      const a = s === 0 ? g.away : g.home;
      return (
        <button key={s} type="button" aria-pressed={side === s} onClick={() => onSide(s)} style={{ ['--tc' as string]: hslOf(a) }}>
          <TeamLogo team={a} decorative className="h-5 w-5" /> {abbrOf(a)}
        </button>
      );
    })}
  </div>
);

const Missing = ({ g }: { g: GameDetail }) => {
  const items = missingFor(g);
  if (!items.length) return null;
  return (
    <aside className="gm-missing" aria-label="What this game's data does not have">
      <p className="font-pixel text-[9px] uppercase tracking-widest text-[hsl(var(--gold))]">Not in this game&rsquo;s data</p>
      <ul>
        {items.map((m) => <li key={m.id}><b>{m.label}.</b> {m.note}</li>)}
      </ul>
    </aside>
  );
};

/* ---------------- Super Bowl ---------------- */

const CONFETTI = Array.from({ length: 46 }, (_, i) => ({ x: (i * 37) % 100, d: (i * 13) % 17 / 10, t: 3.2 + ((i * 7) % 9) / 3, r: (i * 53) % 90, k: i % 3 }));

const Confetti = ({ club }: { club: string }) => {
  const t = findNFLTeam(club);
  const cols = [t ? `hsl(${t.primaryColor})` : '#f5c542', t ? `hsl(${t.secondaryColor})` : '#fff', '#ffd54a'];
  return (
    <div className="gm-confetti" aria-hidden>
      {CONFETTI.map((c, i) => <i key={i} style={{ left: `${c.x}%`, top: `${(c.x * 7) % 60}%`, background: cols[c.k], animationDelay: `${-c.d}s`, animationDuration: `${c.t}s`, transform: `rotate(${c.r}deg)` }} />)}
    </div>
  );
};

const SuperBowlBanner = ({ g }: { g: GameDetail }) => {
  const w = winnerOf(g);
  const champ = w === null ? g.home : w === 0 ? g.away : g.home;
  const t = findNFLTeam(champ);
  return (
    <div className="gm-sbban">
      <Marquee
        className="gm-sbban__m"
        kicker={`${g.season} season finale`}
        title={`Super Bowl ${roman(superBowlNumber(g.season))}`}
        right={w !== null ? <span className="gm-sbban__champ"><PixelCup band={t?.primaryColor ?? '43 100% 62%'} className="gm-sbban__cup" /><ClubBadge club={champ} size="sm" /></span> : undefined}
      />
      {w !== null && <Confetti club={champ} />}
    </div>
  );
};

/** The champions' three best on a podium under the cup. */
const Champions = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const w = winnerOf(g);
  if (w === null) return null;
  const champ = w === 0 ? g.away : g.home;
  const t = findNFLTeam(champ);
  return (
    <Section g={g} id="gm-champs" icon={Trophy} title={`${teamName(champ)}: world champions`} kicker="The title team's stars">
      <div className="gm-champs">
        <span className="gm-champs__cup"><PixelCup band={t?.primaryColor ?? '43 100% 62%'} spark={1} className="gm-champs__svg" /></span>
        <div className="gm-champs__pod"><GamePodium g={g} link={link} champions={w} /></div>
      </div>
    </Section>
  );
};

const GameView = ({ g }: { g: GameDetail }) => {
  const { getAllPlayers } = useLeague();
  // nflverse lines carry no suffix ("James Cook"); the sheet does ("James Cook III"): exact key first, else the one suffixed match
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
  const link: Linker = (p) => {
    if (!hasCardPos(p.pos)) return null;
    const full = `${sitePos(p.pos)}:${displayName(p.name)}`;
    // and the other way: the game line carries a suffix the sheet doesn't ("Deebo Samuel Sr.")
    const key = pool.get(full) ?? pool.get(stripKeySuffix(full));
    return key ?? null;
  };
  const [side, setSide] = useState<Side>(winnerOf(g) === 0 ? 0 : 1);
  const done = played(g);
  const sb = g.type === 'SB' && done;
  const advOk = hasPfr(g) || hasNgs(g);
  const snapOk = hasSnaps(g);
  const away = teamName(g.away);
  const home = teamName(g.home);

  const [matchupPick, setMatchup] = useState<'eff' | 'ground' | 'air' | 'rush' | 'fan' | 'st'>('eff');
  const mTabs = useMemo(() => matchupTabs(g), [g]);
  const matchup = mTabs.some((t) => t.value === matchupPick) ? matchupPick : mTabs[0]?.value ?? 'eff';
  const [deep, setDeep] = useState<'box' | 'rosters' | 'adv' | 'snaps' | 'coaches' | null>(null);
  const { navigate } = useHubRoute();
  const back = () => {
    if (canGoBackInApp()) window.history.back();
    else navigate({ tab: 'career', sub: 'teams' });
  };
  // Phones: swipe right goes back, like the Deep Dive (to the page that opened the game, else Teams)
  const { ref: swipeRef, hint: swipeHint } = usePageSwipeBack<HTMLDivElement>({ tab: 'career', sub: 'teams' }, canGoBackInApp() ? 'Back' : 'Teams');
  const tabs = [
    { id: 'box' as const, label: 'Full box score', sub: 'every player', icon: ScrollText, on: g.players.length > 0 },
    { id: 'rosters' as const, label: 'Rosters', sub: snapOk ? 'everyone who took a snap' : 'everyone with a stat', icon: Users, on: g.players.length > 0 },
    { id: 'adv' as const, label: 'Advanced stats', sub: 'pressures, separation', icon: Sparkles, on: advOk },
    { id: 'snaps' as const, label: 'Snap counts', sub: '', icon: Shield, on: snapOk },
    { id: 'coaches' as const, label: 'Coaches', sub: [g.awayCoach, g.homeCoach].filter(Boolean).join(' · '), icon: Swords, on: !!(g.awayCoach || g.homeCoach) },
  ].filter((t) => t.on);
  const pair = (render: (s: Side) => ReactNode) => (
    <>
      <SideTabs g={g} side={side} onSide={setSide} />
      <div className="gm-pair">{([0, 1] as Side[]).map((s) => <div key={s} className="gm-team" data-active={side === s}>{render(s)}</div>)}</div>
    </>
  );

  return (
    <div ref={swipeRef} className="container gm space-y-7 py-5 sm:py-7">
      {swipeHint}
      <nav aria-label="Game navigation" className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" data-gm-back className="gm-back gm-back--main" onClick={back}><ArrowLeft className="h-4 w-4" aria-hidden /> {canGoBackInApp() ? 'Back' : 'Teams'}</button>
        <a href={`#season?y=${g.season}`} className="gm-back">{g.season} season</a>
        <span className="gm-kicker">{kickerOf(g)}</span>
      </nav>

      {sb && <SuperBowlBanner g={g} />}
      <Stadium g={g} link={link} />

      {done ? (
        <>
          {recapOf(g).length > 0 && (
            <Section g={g} id="gm-recap" icon={ScrollText} title="How it was won" kicker="From the box score">
              <Recap g={g} />
            </Section>
          )}
          <div className="gm-duo">
            {g.players.length > 0 && (
              <Section g={g} id="gm-stars" icon={Trophy} title="Stars of the game" className="gm-duo__a">
                <GamePodium g={g} link={link} />
              </Section>
            )}
            {g.team && (
              <Section g={g} id="gm-tape" icon={Gauge} title="Tale of the tape" className="gm-duo__b">
                <Compare g={g} />
              </Section>
            )}
          </div>
          {sb && <Champions g={g} link={link} />}
          <CrowdDivider />
          <QbDuel g={g} link={link} />
          {mTabs.length > 0 && (
            <Section g={g} id="gm-matchup" icon={Gauge} title="Matchup stats" kicker="Efficiency, rushing, passing, defense, fantasy and kicking">
              <ArcadeToggle
                label="Matchup stats"
                value={matchup}
                onChange={(v) => setMatchup(v as typeof matchup)}
                options={mTabs}
              />
              <div key={matchup} className="mo-xfade">
                {matchup === 'eff' && <Efficiency g={g} />}
                {matchup === 'ground' && <GroundGame g={g} link={link} />}
                {matchup === 'air' && <AirAttack g={g} link={link} />}
                {matchup === 'rush' && <PassRush g={g} link={link} />}
                {matchup === 'fan' && <Fantasy g={g} link={link} />}
                {matchup === 'st' && <SpecialTeams g={g} />}
              </div>
            </Section>
          )}
          <CrowdDivider />
          {g.players.length > 0 && (
            <Section g={g} id="gm-players" icon={Users} title="Top performers" kicker="By club">
              <Performers g={g} link={link} />
            </Section>
          )}

          {tabs.length > 0 && (
            <section id="gm-deeper" aria-label="More of the game's data" className="space-y-3">
              <SectionHeader title="Dig deeper" kicker="Every player, every stat" />
              <div role="group" aria-label="Dig deeper" className="gm-deeper">
                {tabs.map((t) => (
                  <PixelChip key={t.id} pressed={deep === t.id} onClick={() => setDeep(deep === t.id ? null : t.id)} icon={<t.icon className="h-4 w-4" aria-hidden />}>
                    {t.label}{t.sub && <small>{t.sub}</small>}
                  </PixelChip>
                ))}
              </div>
              {deep === 'coaches' && (
                <div className="gm-coaches">
                  {([0, 1] as Side[]).map((s) => {
                    const abbr = s === 0 ? g.away : g.home;
                    const qb = s === 0 ? g.awayQb : g.homeQb;
                    return (
                      <p key={s} style={{ ['--tc' as string]: toneOf(abbr) }}>
                        <TeamLogo team={abbr} decorative className="h-6 w-6" />
                        <span><b>{teamName(abbr)}</b>{' '}{[(s === 0 ? g.awayCoach : g.homeCoach) ? `Coach ${s === 0 ? g.awayCoach : g.homeCoach}` : null, qb ? `QB ${displayName(qb)}` : null, g.rest[s] !== undefined ? `${g.rest[s]} days rest` : null].filter(Boolean).join(' · ')}</span>
                      </p>
                    );
                  })}
                  {g.referee && <p className="gm-coaches__ref">Referee {g.referee}</p>}
                </div>
              )}
              {deep === 'box' && pair((s) => <TeamTables g={g} side={s} link={link} kind="box" />)}
              {deep === 'rosters' && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {snapOk ? 'Everyone on the field, by snaps' : <>Players with a stat line<InfoTip className="ml-1 align-middle">Snap counts begin in 2013, so linemen and players with no stat line are not listed.</InfoTip></>} · tap a player for his Deep Dive
                  </p>
                  {pair((s) => <Roster g={g} side={s} link={link} />)}
                </>
              )}
              {deep === 'adv' && (
                <>
                  <p className="font-pixel text-[9px] uppercase tracking-widest text-muted-foreground">{[hasPfr(g) ? 'Pro Football Reference' : '', hasNgs(g) ? 'Next Gen Stats' : ''].filter(Boolean).join(' · ')}</p>
                  {pair((s) => <TeamTables g={g} side={s} link={link} kind="adv" />)}
                </>
              )}
              {deep === 'snaps' && pair((s) => <SnapBars g={g} side={s} link={link} />)}
            </section>
          )}
        </>
      ) : (
        <p className="gm-recap">This game has not been played yet. Kickoff {g.time ? `at ${g.time} ET` : 'time to be set'} on {fmtDate(g.date)}; the roster, box score and advanced stats appear here once it is final.</p>
      )}

      <Missing g={g} />

      <Suspense fallback={null}>
        <MoreGames g={g} />
      </Suspense>
    </div>
  );
};

const GamePage = ({ gameId }: { gameId?: string }) => {
  const g = useGameDetail(gameId);
  useEffect(() => {
    if (g) document.title = `${teamName(g.away)} at ${teamName(g.home)} · ${roundLabel(g)}`;
  }, [g]);
  if (!gameId) {
    return (
      <div className="container py-16 text-center">
        <Swords className="mx-auto mb-3 h-12 w-12 text-[hsl(var(--gold))]" aria-hidden />
        <h1 className="font-display text-3xl font-bold uppercase">Pick a game</h1>
        <p className="mt-2 text-sm text-muted-foreground">Open any game from a Season page, a player's game log or the Super Bowl timeline on the Teams page.</p>
        <a href="#stats/teams" className="gm-back mt-4 inline-flex">Teams</a>
      </div>
    );
  }
  if (g === undefined) return <PixelLoader label="Game" what="the box score" minHeight="60vh" className="justify-start pt-20" />;
  if (g === null) {
    return (
      <div className="container py-16 text-center">
        <h1 className="font-display text-3xl font-bold uppercase">Game not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">No game has the id {gameId}. Games run from 1999 to the current season.</p>
        <a href="#season" className="gm-back mt-4 inline-flex">Season page</a>
      </div>
    );
  }
  return <GameView g={g} />;
};

export default GamePage;
