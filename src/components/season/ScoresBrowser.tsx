import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Moon, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { NFL_TEAMS, findNFLTeam } from '@/utils/nflTeams';
import { openGame, useSeasonGames, type GameDetail } from '@/utils/nflGames';
import { POST_ROUNDS, ROUND_LABEL, kickoffOf, regWeeks } from '@/utils/gameFinder';
import { BOARD_BG, LampGrid, RESULT_STYLE, color, lampText, type Result } from './seasonGamesUi';

/**
 * The Season page's Scores browser: any game from 1999 to now. A season picker, week chips (1-18, then Wild Card,
 * Divisional, Conference, Super Bowl) and club logo chips; one club's filter lays its whole season out as a strip of
 * results. A tile opens the Game page (history push, so Back returns here). A season's file (about 1 MB) loads when
 * the season is picked and is cached by nflGames.
 */

const FIRST = 1999;
const LAST = 2026;
/** Kept for the session so Back from a game returns to the same season, week and club. */
const memo = { season: LAST, pick: null as string | null, club: null as string | null, back: false };

const SEASONS = Array.from({ length: LAST - FIRST + 1 }, (_, i) => LAST - i);
const CLUBS = [...NFL_TEAMS].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));

export const played = (g: GameDetail) => g.awayScore !== undefined && g.homeScore !== undefined;
const keyOfGame = (g: GameDetail) => (g.type === 'REG' ? String(g.week) : g.type);
export const gameOrder = (a: GameDetail, b: GameDetail) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''));

const Side = ({ team, score, won }: { team: string; score?: number; won: boolean | null }) => (
  <div className="flex min-w-0 items-center gap-1.5 px-2 py-1" style={{ background: `linear-gradient(90deg, ${color(team, won ? 0.55 : 0.2)}, ${color(team, 0.04)})` }}>
    <TeamLogo team={team} decorative className="h-6 w-6 flex-shrink-0 drop-shadow" />
    <span className={cn('min-w-0 flex-1 truncate text-sm uppercase tracking-wide', won ? 'font-extrabold' : won === false ? 'font-medium text-foreground/60' : 'font-semibold')}>{findNFLTeam(team)?.abbreviation ?? team}</span>
    <span className={cn('font-display text-xl tabular-nums leading-none', won ? cn('font-bold', lampText) : won === false ? 'font-medium text-foreground/60' : 'text-foreground')}>{score ?? ''}</span>
  </div>
);

const Kick = ({ g }: { g: GameDetail }) => {
  const k = kickoffOf(g);
  return (
    <span className="flex min-w-0 items-center gap-1">
      {k.night && <Moon className="h-3 w-3 flex-shrink-0 text-[hsl(var(--gold))]" aria-label="Primetime" />}
      {k.tag && <b className="rounded bg-[hsl(var(--gold)/0.2)] px-1 text-[hsl(var(--gold))]">{k.tag}</b>}
      <span className="truncate">{k.tag && k.tag !== 'Night' ? '' : `${k.day} `}{k.date}{k.time ? ` · ${k.time}` : ''}</span>
    </span>
  );
};

const GameTile = ({ g }: { g: GameDetail }) => {
  const done = played(g);
  const tie = done && g.awayScore === g.homeScore;
  const aw = done && !tie ? g.awayScore! > g.homeScore! : null;
  const hw = done && !tie ? g.homeScore! > g.awayScore! : null;
  const k = kickoffOf(g);
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => { memo.back = true; openGame(g.id); }}
        aria-label={`${g.away} at ${g.home}${done ? `, ${g.awayScore} to ${g.homeScore}${g.ot ? ', overtime' : ''}` : ', not played yet'}, ${k.day} ${k.date}. Open the game`}
        className={cn(
          'group relative block w-full overflow-hidden rounded-lg border text-left shadow-[0_6px_18px_hsl(228_60%_2%/0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          g.type === 'REG' ? 'border-[hsl(var(--line)/0.7)] hover:border-[hsl(var(--gold)/0.6)]' : 'border-[hsl(var(--gold)/0.6)]',
        )}
        style={{ background: BOARD_BG }}
      >
        <LampGrid />
        <div className="relative divide-y divide-white/5" aria-hidden>
          <Side team={g.away} score={g.awayScore} won={aw} />
          <Side team={g.home} score={g.homeScore} won={hw} />
        </div>
        <div className="relative flex items-center justify-between gap-1 px-2 py-1 font-pixel text-[8px] uppercase tracking-wider text-muted-foreground" aria-hidden>
          <Kick g={g} />
          <span className="flex-shrink-0 text-[hsl(var(--gold))]">{done ? (g.ot ? 'Final · OT' : 'Final') : 'Upcoming'}</span>
        </div>
      </button>
    </li>
  );
};

/** One club's result, for the season strip. */
export const ResultTile = ({ g, abbr, remember }: { g: GameDetail; abbr: string; remember?: boolean }) => {
  const home = g.home === abbr;
  const opp = home ? g.away : g.home;
  const done = played(g);
  const pf = home ? g.homeScore : g.awayScore;
  const pa = home ? g.awayScore : g.homeScore;
  const r: Result | undefined = done ? (pf! > pa! ? 'W' : pf! < pa! ? 'L' : 'T') : undefined;
  const k = kickoffOf(g);
  const wk = g.type === 'REG' ? `Wk ${g.week}` : ROUND_LABEL[g.type];
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => { if (remember) memo.back = true; openGame(g.id); }}
        aria-label={`${wk}, ${home ? 'vs' : 'at'} ${opp}${done ? `, ${r === 'W' ? 'win' : r === 'L' ? 'loss' : 'tie'} ${pf} to ${pa}` : ', not played yet'}. Open the game`}
        className={cn('relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', g.type === 'REG' ? 'border-[hsl(var(--line)/0.7)]' : 'border-[hsl(var(--gold)/0.6)]')}
        style={{ background: `linear-gradient(90deg, ${color(opp, 0.3)}, ${BOARD_BG} 70%)` }}
      >
        <span className={cn('inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded font-display text-sm font-bold', r ? RESULT_STYLE[r] : 'bg-muted/40 text-muted-foreground')} aria-hidden>{r ?? '–'}</span>
        <TeamLogo team={opp} decorative className="h-7 w-7 flex-shrink-0" />
        <span className="min-w-0 flex-1 leading-tight" aria-hidden>
          <span className="block truncate font-display text-sm font-bold uppercase">{home ? 'vs' : '@'} {findNFLTeam(opp)?.abbreviation ?? opp}</span>
          <span className="flex items-center gap-1 font-pixel text-[8px] uppercase tracking-wider text-muted-foreground">
            {k.night && <Moon className="h-2.5 w-2.5 text-[hsl(var(--gold))]" />}{wk}{g.ot ? ' · OT' : ''}
          </span>
        </span>
        <span className="font-display text-base font-bold tabular-nums" aria-hidden>{done ? `${pf}–${pa}` : ''}</span>
      </button>
    </li>
  );
};

export const ScoresSkeleton = ({ n = 8 }: { n?: number }) => (
  <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading the season">
    {Array.from({ length: n }, (_, i) => (
      <li key={i} className="h-[92px] animate-pulse rounded-lg border border-[hsl(var(--line)/0.5)] bg-white/[0.04] motion-reduce:animate-none" />
    ))}
  </ul>
);

const chip = (on: boolean, off?: boolean) =>
  cn(
    'inline-flex min-h-[34px] flex-shrink-0 items-center justify-center rounded-md px-2.5 font-pixel text-[9px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    on ? 'bg-[hsl(var(--gold))] text-black' : off ? 'text-muted-foreground/40' : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
  );

const ScoresBrowser = () => {
  const [season, setSeason] = useState(memo.season);
  const [pick, setPick] = useState<string | null>(memo.pick); // week chip, null = the latest played
  const [club, setClub] = useState<string | null>(memo.club);
  const games = useSeasonGames(season);

  const sorted = useMemo(() => (games ? [...games].sort(gameOrder) : null), [games]);
  const latest = useMemo(() => {
    if (!sorted) return null;
    const last = [...sorted].reverse().find(played) ?? sorted[0];
    return last ? keyOfGame(last) : null;
  }, [sorted]);
  const week = pick ?? latest ?? '1';
  const have = useMemo(() => new Set(sorted?.map(keyOfGame)), [sorted]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setPick(null);
  }, [season]);
  useEffect(() => {
    Object.assign(memo, { season, pick, club });
  }, [season, pick, club]);
  // coming back from a game: land on the browser
  useEffect(() => {
    if (!memo.back) return;
    memo.back = false;
    const t = window.setTimeout(() => document.getElementById('scores')?.scrollIntoView({ block: 'start' }), 60);
    return () => window.clearTimeout(t);
  }, []);

  const shown = useMemo(() => (sorted ?? []).filter((g) => (club ? g.away === club || g.home === club : keyOfGame(g) === week)), [sorted, week, club]);
  const chips = [...Array.from({ length: regWeeks(season) }, (_, i) => ({ k: String(i + 1), l: String(i + 1) })), ...POST_ROUNDS.map((r) => ({ k: r, l: r }))];
  const step = (d: number) => setSeason((s) => Math.min(LAST, Math.max(FIRST, s + d)));
  const clubName = club ? findNFLTeam(club)?.fullName ?? club : null;
  const record = useMemo(() => {
    if (!club) return null;
    let w = 0, l = 0, t = 0;
    for (const g of shown) {
      if (g.type !== 'REG' || !played(g)) continue;
      const pf = g.home === club ? g.homeScore! : g.awayScore!;
      const pa = g.home === club ? g.awayScore! : g.homeScore!;
      if (pf > pa) w++; else if (pf < pa) l++; else t++;
    }
    return `${w}-${l}${t ? `-${t}` : ''}`;
  }, [club, shown]);

  return (
    <section id="scores" aria-labelledby="scores-heading" className="scroll-mt-20 space-y-3 rounded-xl border border-border/40 bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="scores-heading" className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
            <Radio className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> Scores
          </h2>
          <p className="text-xs text-muted-foreground">Every game since {FIRST}: pick a season and a week, or a club for its whole year. Tap a game for its page.</p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Season">
          <button type="button" aria-label="Previous season" disabled={season <= FIRST} onClick={() => step(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary/50 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <select aria-label="Season" value={season} onChange={(e) => setSeason(Number(e.target.value))} className="h-9 rounded-md border border-border/60 bg-background px-2 font-display text-base font-bold tabular-nums">
            {SEASONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button type="button" aria-label="Next season" disabled={season >= LAST} onClick={() => step(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary/50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div role="group" aria-label="Week" className={cn('flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]', club && 'opacity-40')}>
        {chips.map((c) => {
          const off = !!sorted && !have.has(c.k);
          return (
            <button key={c.k} type="button" disabled={off || !!club} aria-pressed={!club && c.k === week} onClick={() => setPick(c.k)} className={chip(!club && c.k === week, off)} title={ROUND_LABEL[c.k] ?? `Week ${c.k}`}>
              {c.l}
            </button>
          );
        })}
      </div>

      <div role="group" aria-label="Club" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible">
        <button type="button" aria-pressed={!club} onClick={() => setClub(null)} className={chip(!club)}>All</button>
        {CLUBS.map((t) => (
          <button key={t.id} type="button" aria-pressed={club === t.abbreviation} aria-label={t.fullName} title={t.fullName} onClick={() => setClub(club === t.abbreviation ? null : t.abbreviation)}
            className={cn('inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', club === t.abbreviation ? 'bg-[hsl(var(--gold)/0.25)] ring-2 ring-[hsl(var(--gold))]' : 'bg-secondary/40 opacity-80 hover:opacity-100')}>
            <TeamLogo team={t.name} decorative className="h-6 w-6" />
          </button>
        ))}
      </div>

      <p className="flex items-center gap-2 font-pixel text-[9px] uppercase tracking-widest text-muted-foreground" aria-live="polite">
        {club ? <><TeamLogo team={club} decorative className="h-5 w-5" /> {season} {clubName}{record && shown.length ? ` · ${record}` : ''}</> : <>{season} · {ROUND_LABEL[week] ?? `Week ${week}`}</>}
      </p>

      {sorted === undefined ? (
        <ScoresSkeleton n={club ? 12 : 8} />
      ) : sorted === null ? (
        <p className="rounded-lg border border-dashed border-border/50 p-4 text-sm text-muted-foreground">The {season} games could not be loaded.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/50 p-4 text-sm text-muted-foreground">No games here{club ? ' for that club' : ' that week'}.</p>
      ) : club ? (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{shown.map((g) => <ResultTile key={g.id} g={g} abbr={club} remember />)}</ul>
      ) : (
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{shown.map((g) => <GameTile key={g.id} g={g} />)}</ul>
      )}
    </section>
  );
};

export default ScoresBrowser;
