import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, CloudSun, Gauge, MapPin, ScrollText, Shield, Sparkles, Swords, Trophy, Users, Wind } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/timeline/TeamLogo';
import PixelLoader from '@/components/ui/PixelLoader';
import { findNFLTeam } from '@/utils/nflTeams';
import { openTeamPage } from '@/utils/teamSearch';
import { useGameDetail, type GameDetail, type GamePlayer, type Stat } from '@/utils/nflGames';
import { buildHash } from '../stats/hub/hashRoute';
import { hslOf } from '../season/seasonGamesUi';
import { liftForDarkBg } from '@/utils/teamColors';
import {
  atsOf, compareRows, fmtDate, hasNgs, hasPfr, hasSnaps, impact, leadersFor, missingFor, played, recapOf, roofLabel, roundLabel, sitePos, snaps,
  starsOf, tackles, teamName, unitOf, unitsOf, v, winnerOf, hasCardPos, type Side, type Star, type Unit,
} from './gameModel';
import './game.css';
import { displayName } from '@/utils/displayName';
import { stripKeySuffix } from '@/utils/nameSuffix';

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

const Section = ({ id, icon: Icon, title, kicker, children, className }: { id: string; icon: typeof Users; title: string; kicker?: string; children: ReactNode; className?: string }) => (
  <section id={id} aria-labelledby={`${id}-h`} className={cn('space-y-3', className)}>
    <div className="flex items-end justify-between gap-3 border-b border-[hsl(var(--line)/0.6)] pb-1.5">
      <h2 id={`${id}-h`} className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide sm:text-2xl">
        <Icon className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> {title}
      </h2>
      {kicker && <span className="font-pixel text-[9px] uppercase tracking-widest text-muted-foreground">{kicker}</span>}
    </div>
    {children}
  </section>
);

/* ---------------- header ---------------- */

const topQb = (g: GameDetail, side: Side): GamePlayer | undefined =>
  g.players.filter((p) => p.side === side && unitOf(p) === 'qb').sort((a, b) => v(b.s, 'attempts') - v(a.s, 'attempts') || snaps(b) - snaps(a))[0];

const Hero = ({ g }: { g: GameDetail }) => {
  const done = played(g);
  const w = winnerOf(g);
  const ats = atsOf(g);
  const total = done && g.total !== undefined ? g.awayScore! + g.homeScore! : null;
  const sides: [Side, string][] = [[0, g.away], [1, g.home]];
  const weather = [g.temp !== undefined ? `${Math.round(g.temp)}°F` : null, g.wind !== undefined ? `${Math.round(g.wind)} mph wind` : null].filter(Boolean).join(' · ');
  return (
    <header className="gm-hero" style={{ ['--ca' as string]: hslOf(g.away), ['--ch' as string]: hslOf(g.home) }}>
      <span aria-hidden className="gm-hero__lights" />
      <p className="gm-hero__kicker">
        <span className="text-[hsl(var(--gold))]">{roundLabel(g)}</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" aria-hidden /> {fmtDate(g.date)}</span>
        {g.stadium && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden /> {g.stadium}</span>
          </>
        )}
      </p>
      <div className="gm-hero__board">
        {sides.map(([side, abbr]) => {
          const qb = topQb(g, side);
          const win = w === side;
          const coach = side === 0 ? g.awayCoach : g.homeCoach;
          const qbName = qb?.name ?? (side === 0 ? g.awayQb : g.homeQb);
          return (
            <div key={abbr} className={cn('gm-hero__club', side === 1 && 'gm-hero__club--home', done && w !== null && !win && 'is-lost')}>
              <button type="button" className="gm-hero__logo" onClick={() => openTeamPage(teamName(abbr))} aria-label={`${teamName(abbr)} team page`}>
                <TeamLogo team={abbr} decorative className="h-full w-full drop-shadow-[0_0_18px_hsl(0_0%_100%/0.25)]" />
              </button>
              <div className="min-w-0">
                <p className="gm-hero__role">{side === 0 ? 'Away' : 'Home'}</p>
                <p className="gm-hero__name">{findNFLTeam(abbr)?.name ?? abbr}</p>
                <p className="gm-hero__sub">{[qbName ? `QB ${qbName}` : null, coach ? `Coach ${coach}` : null].filter(Boolean).join(' · ')}</p>
              </div>
              {qb && (
                <span className="gm-hero__qb" aria-hidden>
                  <GameSprite player={{ name: qb.name, position: 'QB', team: abbr, bannerTeam: abbr }} team={abbr} season={g.season} size="m" action={win ? 'celebrate' : undefined} />
                </span>
              )}
            </div>
          );
        })}
        <div className="gm-hero__score" aria-label={done ? `${teamName(g.away)} ${g.awayScore}, ${teamName(g.home)} ${g.homeScore}` : 'Not played yet'}>
          {done ? (
            <>
              <span className={cn('gm-num', w === 0 && 'is-win')}>{g.awayScore}</span>
              <span className="gm-dash">–</span>
              <span className={cn('gm-num', w === 1 && 'is-win')}>{g.homeScore}</span>
            </>
          ) : (
            <span className="font-display text-3xl font-bold uppercase text-muted-foreground">To play</span>
          )}
          <span className="gm-final">{done ? `Final${g.ot ? ' · OT' : ''}${w === null ? ' · Tie' : ''}` : (g.time ?? '')}</span>
        </div>
      </div>
      <ul className="gm-chips" aria-label="Game conditions">
        {g.roof && <li><CloudSun className="h-3 w-3" aria-hidden /> {roofLabel(g.roof)}{g.surface ? ` · ${g.surface}` : ''}</li>}
        {weather && <li><Wind className="h-3 w-3" aria-hidden /> {weather}</li>}
        {g.spread !== undefined && (
          <li title="Closing spread">
            <Gauge className="h-3 w-3" aria-hidden /> Line {g.spread === 0 ? 'pick' : `${abbrOf(g.spread > 0 ? g.home : g.away)} −${Math.abs(g.spread)}`}
            {ats && !ats.push && ats.points > 0 ? ` · ${abbrOf(ats.favorite === 0 ? g.away : g.home)} ${ats.covered ? 'covered' : 'did not cover'}` : ats?.push ? ' · push' : ''}
          </li>
        )}
        {g.total !== undefined && <li title="Closing total">O/U {g.total}{total !== null ? ` · ${total > g.total ? 'over' : total < g.total ? 'under' : 'push'} (${total})` : ''}</li>}
        {g.moneyline && <li title="Closing moneyline">ML {abbrOf(g.away)} {g.moneyline[0] > 0 ? '+' : ''}{g.moneyline[0]} / {abbrOf(g.home)} {g.moneyline[1] > 0 ? '+' : ''}{g.moneyline[1]}</li>}
        {g.referee && <li>Ref {g.referee}</li>}
        {g.rest[0] !== undefined && g.rest[1] !== undefined && <li title="Days of rest">Rest {abbrOf(g.away)} {g.rest[0]}d / {abbrOf(g.home)} {g.rest[1]}d</li>}
      </ul>
    </header>
  );
};

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
  const rows = compareRows(g);
  if (!rows.length) return null;
  return (
    <div className="gm-compare" style={{ ['--ca' as string]: liftForDarkBg(hslOf(g.away), 46), ['--ch' as string]: liftForDarkBg(hslOf(g.home), 46) }}>
      <div className="gm-compare__head">
        <span className="flex items-center gap-1.5"><TeamLogo team={g.away} decorative className="h-5 w-5" /> {abbrOf(g.away)}</span>
        <span className="font-pixel text-[9px] uppercase tracking-widest text-muted-foreground">Team stats</span>
        <span className="flex items-center gap-1.5">{abbrOf(g.home)} <TeamLogo team={g.home} decorative className="h-5 w-5" /></span>
      </div>
      {rows.map((r) => {
        const dec = r.dec ?? 0;
        const mx = Math.max(Math.abs(r.a), Math.abs(r.h), 0.0001);
        const aBetter = r.lowerBetter ? r.a < r.h : r.a > r.h;
        const hBetter = r.lowerBetter ? r.h < r.a : r.h > r.a;
        const fmt = (n: number) => (r.id === 'epa' ? sgn(n) : n.toFixed(dec));
        return (
          <div key={r.id} className="gm-cmp">
            <span className={cn('gm-cmp__n', aBetter && 'is-better')}>{fmt(r.a)}</span>
            <span className="gm-cmp__bar gm-cmp__bar--a" aria-hidden><i style={{ width: `${Math.max(3, (Math.abs(r.a) / mx) * 100)}%`, opacity: aBetter ? 1 : 0.55 }} /></span>
            <span className="gm-cmp__l">{r.label}</span>
            <span className="gm-cmp__bar gm-cmp__bar--h" aria-hidden><i style={{ width: `${Math.max(3, (Math.abs(r.h) / mx) * 100)}%`, opacity: hBetter ? 1 : 0.55 }} /></span>
            <span className={cn('gm-cmp__n', hBetter && 'is-better')}>{fmt(r.h)}</span>
          </div>
        );
      })}
    </div>
  );
};

type Linker = (p: GamePlayer) => string | null;

const StarCard = ({ s, g, big, link }: { s: Star; g: GameDetail; big?: boolean; link: Linker }) => {
  const abbr = s.player.side === 0 ? g.away : g.home;
  const href = link(s.player);
  const body = (
    <>
      <span className="gm-star__sprite">
        <GameSprite player={{ name: s.player.name, position: sitePos(s.player.pos), team: abbr, bannerTeam: abbr }} team={abbr} season={g.season} size={big ? 'l' : 'm'} action={big ? 'celebrate' : undefined} />
      </span>
      <span className="min-w-0">
        <span className="gm-star__k">{big ? <><Trophy className="mr-1 inline h-3 w-3" aria-hidden />Game ball</> : s.kicker}</span>
        <span className="gm-star__n">{displayName(s.player.name)}</span>
        <span className="gm-star__l">{s.player.pos} · {abbrOf(abbr)}</span>
        <span className="gm-star__s">{s.line}</span>
      </span>
    </>
  );
  const cls = cn('gm-star', big && 'gm-star--big');
  const st = { ['--tc' as string]: hslOf(abbr) };
  return href ? <a href={href} className={cls} style={st}>{body}</a> : <div className={cls} style={st}>{body}</div>;
};

const Stars = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const { ball, others } = useMemo(() => starsOf(g), [g]);
  if (!ball) return null;
  return (
    <div className="gm-stars">
      <StarCard s={ball} g={g} big link={link} />
      <div className="gm-stars__rest">
        {others.map((s) => <StarCard key={s.player.gsis + s.player.name} s={s} g={g} link={link} />)}
      </div>
    </div>
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
  const parts = displayName(p.name).split(' ');
  const last = parts.slice(1).join(' ') || p.name;
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
  return href ? <a href={href} className={cls} title={`${displayName(p.name)}, ${p.pos}: open Deep Dive`}>{inner}</a> : <div className={cls} title={`${displayName(p.name)}, ${p.pos}`}>{inner}</div>;
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
                  return <span key={p.gsis + p.name}>{href ? <a href={href}>{t}</a> : t}{i < rest.length - 1 ? ', ' : ''}</span>;
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
                    {href ? <a href={href}>{displayName(p.name)}</a> : p.name}
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
      <ul className="gm-snaps">
        {rows.slice(0, 16).map((p) => {
          const n = v(p.s, key);
          const href = link(p);
          return (
            <li key={p.gsis + p.name}>
              <span className="gm-snaps__n">{href ? <a href={href}>{displayName(p.name)}</a> : p.name}<small>{p.pos}</small></span>
              <span className="gm-snaps__bar"><i style={{ width: `${(n / max) * 100}%` }} /></span>
              <span className="gm-snaps__v">{n}<small>{Math.round((n / max) * 100)}%</small></span>
            </li>
          );
        })}
      </ul>
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
  return (
    <aside className="gm-missing" aria-label="What this game's data does not have">
      <p className="font-pixel text-[9px] uppercase tracking-widest text-[hsl(var(--gold))]">Not in the data for this game</p>
      <ul>
        {items.map((m) => <li key={m.id}><b>{m.label}.</b> {m.note}</li>)}
      </ul>
    </aside>
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
    const key = pool.get(`${sitePos(p.pos)}:${displayName(p.name)}`);
    return key ? buildHash({ tab: 'career', sub: 'deepdive', p: key }) : null;
  };
  const [side, setSide] = useState<Side>(winnerOf(g) === 0 ? 0 : 1);
  const done = played(g);
  const advOk = hasPfr(g) || hasNgs(g);
  const snapOk = hasSnaps(g);
  const away = teamName(g.away);
  const home = teamName(g.home);

  return (
    <div className="container gm space-y-8 py-5 sm:py-7">
      <nav aria-label="Game navigation" className="flex flex-wrap items-center gap-2 text-sm">
        <a href={`#season?y=${g.season}`} className="gm-back"><ArrowLeft className="h-4 w-4" aria-hidden /> {g.season} season</a>
        <button type="button" className="gm-back" onClick={() => openTeamPage(away)}>{away}</button>
        <button type="button" className="gm-back" onClick={() => openTeamPage(home)}>{home}</button>
        <a href="#stats/teams" className="gm-back">All franchises</a>
      </nav>

      <Hero g={g} />

      {done ? (
        <>
          <Recap g={g} />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <Compare g={g} />
            <Stars g={g} link={link} />
          </div>
        </>
      ) : (
        <p className="gm-recap">This game has not been played yet. Kickoff {g.time ? `at ${g.time} ET` : 'time to be set'} on {fmtDate(g.date)}; the roster, box score and advanced stats appear here once it is final.</p>
      )}

      {done && g.players.length > 0 && (
        <>
          <Section id="gm-rosters" icon={Users} title="Rosters" kicker={`${g.season} kits`}>
            <p className="text-sm text-muted-foreground">
              {snapOk ? 'Everyone who was on the field, by snap count.' : 'Everyone who recorded a stat in this game; snap counts begin in 2013, so linemen and players with no stat line are not listed.'} Tap a player for his Deep Dive.
            </p>
            <SideTabs g={g} side={side} onSide={setSide} />
            <div className="gm-pair">
              {([0, 1] as Side[]).map((s) => <div key={s} className="gm-team" data-active={side === s}><Roster g={g} side={s} link={link} /></div>)}
            </div>
          </Section>

          <Section id="gm-leaders" icon={Swords} title="Game leaders">
            <div className="gm-leaders">
              {([0, 1] as Side[]).map((s) => (
                <div key={s} className="gm-leader" style={{ ['--tc' as string]: hslOf(s === 0 ? g.away : g.home) }}>
                  <p className="gm-team-tag"><TeamLogo team={s === 0 ? g.away : g.home} decorative className="h-5 w-5" /> {abbrOf(s === 0 ? g.away : g.home)}</p>
                  <ul>
                    {leadersFor(g, s).map((l) => {
                      const href = link(l.player);
                      return (
                        <li key={l.label}>
                          <span className="gm-leader__k">{l.label}</span>
                          <span className="gm-leader__n">{href ? <a href={href}>{displayName(l.player.name)}</a> : l.player.name}</span>
                          <span className="gm-leader__v">{l.line}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section id="gm-box" icon={ScrollText} title="Box score" kicker="Per player">
            <SideTabs g={g} side={side} onSide={setSide} />
            <div className="gm-pair">
              {([0, 1] as Side[]).map((s) => <div key={s} className="gm-team" data-active={side === s}><TeamTables g={g} side={s} link={link} kind="box" /></div>)}
            </div>
          </Section>

          {advOk && (
            <Section id="gm-adv" icon={Sparkles} title="Advanced stats" kicker={[hasPfr(g) ? 'Pro Football Reference' : '', hasNgs(g) ? 'Next Gen Stats' : ''].filter(Boolean).join(' · ')}>
              <SideTabs g={g} side={side} onSide={setSide} />
              <div className="gm-pair">
                {([0, 1] as Side[]).map((s) => <div key={s} className="gm-team" data-active={side === s}><TeamTables g={g} side={s} link={link} kind="adv" /></div>)}
              </div>
            </Section>
          )}

          {snapOk && (
            <Section id="gm-snaps" icon={Shield} title="Snap counts" kicker="Who played how much">
              <SideTabs g={g} side={side} onSide={setSide} />
              <div className="gm-pair">
                {([0, 1] as Side[]).map((s) => <div key={s} className="gm-team" data-active={side === s}><SnapBars g={g} side={s} link={link} /></div>)}
              </div>
            </Section>
          )}
        </>
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
