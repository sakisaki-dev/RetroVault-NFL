import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Moon, Radio } from 'lucide-react';
import { ClubPicker } from '@/components/controls';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { NFL_TEAMS, findNFLTeam } from '@/utils/nflTeams';
import { openGame, useSeasonGames, type GameDetail } from '@/utils/nflGames';
import { POST_ROUNDS, ROUND_LABEL, kickoffOf, regWeeks } from '@/utils/gameFinder';
import { BOARD_BG, RESULT_STYLE, color, type Result } from './seasonGamesUi';
import { ArcadeToggle, ClubBadge, PixelStepper, SectionHeader } from '@/components/arcade';
import { ScoreTile } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import './sx.css';

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

const GameTile = ({ g, i = 0 }: { g: GameDetail; i?: number }) => {
  const done = played(g);
  const k = kickoffOf(g);
  const slot = k.tag && ['TNF', 'SNF', 'MNF'].includes(k.tag) ? k.tag : undefined;
  return (
    <li className="min-w-0 mo-fade" style={stag(i, 45)}>
      <ScoreTile
        away={{ club: g.away, score: g.awayScore }}
        home={{ club: g.home, score: g.homeScore }}
        status={done ? (g.ot ? 'ot' : 'final') : 'scheduled'}
        slot={slot}
        kickoff={`${k.tag && k.tag !== 'Night' ? '' : `${k.day} `}${k.date}${k.time ? ` · ${k.time}` : ''}`.toUpperCase()}
        footer={done ? undefined : undefined}
        onClick={() => { memo.back = true; openGame(g.id); }}
        className={cn(g.type !== 'REG' && 'sx-playoff-tile')}
      />
    </li>
  );
};

/** One club's result, for the season strip. */
export const ResultTile = ({ g, abbr, remember, i = 0 }: { g: GameDetail; abbr: string; remember?: boolean; i?: number }) => {
  const home = g.home === abbr;
  const opp = home ? g.away : g.home;
  const done = played(g);
  const pf = home ? g.homeScore : g.awayScore;
  const pa = home ? g.awayScore : g.homeScore;
  const r: Result | undefined = done ? (pf! > pa! ? 'W' : pf! < pa! ? 'L' : 'T') : undefined;
  const k = kickoffOf(g);
  const wk = g.type === 'REG' ? `Wk ${g.week}` : ROUND_LABEL[g.type];
  return (
    <li className="min-w-0 mo-fade" style={stag(i, 30)}>
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

  const weekLabel: Record<string, string> = { WC: 'WC', DIV: 'DIV', CON: 'CON', SB: 'SB' };
  return (
    <section id="scores" aria-labelledby="scores-heading" className="sx-sec scroll-mt-20">
      <SectionHeader
        club={club ?? undefined}
        kicker={`Every game since ${FIRST}`}
        title={<span id="scores-heading">Scores</span>}
        right={<PixelStepper label="Season" value={season} values={SEASONS} onChange={setSeason} />}
      />

      <div className={cn(club && 'opacity-40')}>
        <ArcadeToggle
          label="Week"
          size="sm"
          value={club ? '' : week}
          onChange={(v) => setPick(String(v))}
          options={chips.map((c) => ({ value: c.k, label: weekLabel[c.l] ?? c.l, disabled: (!!sorted && !have.has(c.k)) || !!club }))}
        />
      </div>

      <ClubPicker value={club} onChange={setClub} />

      <p className="sx-pick" aria-live="polite">
        {club ? <><ClubBadge club={club} size="sm" /> {season} {clubName}{record && shown.length ? ` · ${record}` : ''}</> : <>{season} · {ROUND_LABEL[week] ?? `Week ${week}`}</>}
      </p>

      {sorted === undefined ? (
        <ScoresSkeleton n={club ? 12 : 8} />
      ) : sorted === null ? (
        <p className="rounded-lg border border-dashed border-border/50 p-4 text-sm text-muted-foreground">The {season} games could not be loaded.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/50 p-4 text-sm text-muted-foreground">No games here{club ? ' for that club' : ' that week'}.</p>
      ) : club ? (
        <Reveal as="ul" key={`${season}-${club}`} className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{shown.map((g, i) => <ResultTile key={g.id} g={g} abbr={club} remember i={i} />)}</Reveal>
      ) : (
        <Reveal as="ul" key={`${season}-${week}`} className="sx-scorelist">{shown.map((g, i) => <GameTile key={g.id} g={g} i={i} />)}</Reveal>
      )}
    </section>
  );
};

export default ScoresBrowser;
