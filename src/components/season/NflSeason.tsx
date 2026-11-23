import { useMemo, useState } from 'react';
import { Crown, LayoutGrid, ListOrdered, Medal, Minus, Star, Trophy, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlayerHit, StarSprite, clinchTags, playoffSeeds, type Clinch } from './NflSeasonExtras';
import TeamLogo from '@/components/timeline/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import type { SeasonView } from '@/utils/seasonLive';
import type { PlayerLookup } from './LivePanels';
import { BOARD_BG, LampGrid, color, lampText, signed } from './seasonGamesUi';
import { LeagueTable, SectionTitle } from './SeasonGames';

/**
 * NFL edition Season page pieces in the site's pixel-stadium style: the season jumbotron (champion, Super Bowl, AP
 * award winners with sprites), the playoff bracket on a turf board, division banners with playoff marks and the power
 * ladder with movement against the season before. All rules over the per-season schedule file.
 */

const nick = (team: string) => findNFLTeam(team)?.name ?? team;
const FIELD = 'linear-gradient(180deg, hsl(142 38% 17%), hsl(142 42% 12%))';

const AWARD_LABEL: Record<string, string> = { mvp: 'MVP', opoy: 'Offensive POY', dpoy: 'Defensive POY', oroy: 'Offensive ROY', droy: 'Defensive ROY', sbmvp: 'Super Bowl MVP' };

const AwardPlate = ({ kind, a, big }: { kind: string; a: { player: string; team: string; position: string }; big?: boolean }) => (
  <li className={cn('min-w-0', big && 'col-span-2 sm:col-span-3 lg:col-span-1 lg:row-span-2')}>
  <PlayerHit name={a.player} pos={a.position}
    className={cn('relative flex h-full w-full min-w-0 items-end gap-2 overflow-hidden rounded-lg border border-[hsl(var(--line)/0.7)] px-2 pt-1.5', big ? 'lg:flex-col lg:items-center lg:px-3 lg:pt-3' : '')}
    style={{ background: `linear-gradient(135deg, ${color(a.team, 0.45)}, hsl(228 55% 6%) 75%)` }}
  >
    <div className={cn('flex-shrink-0 self-end', big && 'lg:order-2')} style={{ marginBottom: big ? -6 : -4 }}>
      <StarSprite name={a.player} pos={a.position} team={a.team} size={big ? 'l' : 'm'} celebrate={kind === 'mvp' || kind === 'sbmvp'} />
    </div>
    <div className={cn('min-w-0 flex-1 pb-2', big && 'lg:order-1 lg:text-center')}>
      <p className="flex items-center gap-1 font-pixel text-[9px] uppercase tracking-wider text-[hsl(var(--gold))] lg:justify-[inherit]">
        {kind === 'mvp' && <Crown className="h-3 w-3" aria-hidden />}
        {AWARD_LABEL[kind] ?? kind}
      </p>
      <p className={cn('break-words font-display font-bold leading-tight', big ? 'text-xl' : 'text-sm')}>{a.player}</p>
      <p className="truncate text-[11px] text-muted-foreground">
        {a.position} · {nick(a.team)}
      </p>
    </div>
  </PlayerHit>
  </li>
);

export const SeasonJumbo = ({ season, live }: { season: SeasonView; live: boolean }) => {
  const sb = season.superBowl;
  const aw = season.awards ?? {};
  const kinds = ['mvp', 'opoy', 'dpoy', 'oroy', 'droy', 'sbmvp'].filter((k) => aw[k]);
  const [w, l] = (sb?.score ?? '').split('-');
  const top = [...season.table].sort((a, b) => b.pct - a.pct || b.diff - a.diff)[0];
  const lead = sb?.winner ?? top?.team;
  return (
    <section aria-label={`${season.season} season`} className="relative overflow-hidden rounded-xl border border-[hsl(var(--gold)/0.55)] shadow-[0_0_24px_hsl(var(--gold)/0.12)]" style={{ background: BOARD_BG }}>
      <span aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 18% 0%, ${color(lead, 0.5)}, transparent 62%)` }} />
      <LampGrid />
      <div className="relative grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {lead && <TeamLogo team={lead} decorative className="h-20 w-20 flex-shrink-0 drop-shadow-[0_0_18px_hsl(0_0%_100%/0.2)] sm:h-28 sm:w-28" />}
          <div className="min-w-0">
            <p className="font-pixel text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--gold))]">
              {live ? `${season.season} season · in progress` : `${season.season} season${sb ? ` · Super Bowl ${sb.roman}` : ''}`}
            </p>
            {sb ? (
              <>
                <p className="flex items-center gap-1.5 font-display text-2xl font-bold uppercase leading-tight sm:text-3xl">
                  <Trophy className="h-6 w-6 flex-shrink-0 text-[hsl(var(--gold))]" aria-hidden /> {nick(sb.winner)}
                </p>
                <p className={cn('font-display text-3xl font-bold tabular-nums leading-none sm:text-4xl', lampText)}>
                  {w}–{l}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  over <TeamLogo team={sb.loser} decorative className="h-4 w-4" /> {nick(sb.loser)}
                </p>
              </>
            ) : top ? (
              <>
                <p className="font-display text-2xl font-bold uppercase leading-tight">{nick(top.team)}</p>
                <p className={cn('font-display text-3xl font-bold tabular-nums leading-none', lampText)}>{top.record}</p>
                <p className="mt-1 text-xs text-muted-foreground">best record so far · Super Bowl still to play</p>
              </>
            ) : null}
          </div>
        </div>
        {kinds.length > 0 ? (
          <ul className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[1.25fr_1fr_1fr]" aria-label="AP award winners">
            {kinds.map((k, i) => (
              <AwardPlate key={k} kind={k} a={aw[k]} big={i === 0} />
            ))}
          </ul>
        ) : (
          <p className="self-center text-xs text-muted-foreground">Awards are announced after the Super Bowl.</p>
        )}
      </div>
    </section>
  );
};

/* ---------------- Playoff bracket ---------------- */

type PGame = NonNullable<SeasonView['playoffs']>[number]['games'][number];

const BracketGame = ({ g, final, seeds }: { g: PGame; final?: boolean; seeds: Map<string, number> }) => {
  const rows = [
    { t: g.away, s: g.away_score, w: g.away_score > g.home_score },
    { t: g.home, s: g.home_score, w: g.home_score > g.away_score },
  ];
  const fav = g.line === undefined || g.line === 0 ? null : g.line > 0 ? g.home : g.away;
  const upset = fav && rows.find((r) => r.w)?.t !== fav && Math.abs(g.line!) >= 2.5;
  return (
    <li className={cn('overflow-hidden rounded-md border bg-black/55 backdrop-blur-sm', final ? 'border-[hsl(var(--gold))] shadow-[0_0_18px_hsl(var(--gold)/0.35)]' : 'border-white/15')}>
      {rows.map((r) => (
        <div key={r.t} className="flex items-center gap-1.5 px-2 py-1" style={{ background: `linear-gradient(90deg, ${color(r.t, r.w ? 0.55 : 0.12)}, transparent 85%)` }}>
          {seeds.has(r.t) && <span className="w-3 text-center font-pixel text-[8px] text-white/60" title="Playoff seed">{seeds.get(r.t)}</span>}
          <TeamLogo team={r.t} decorative className="h-5 w-5 flex-shrink-0" />
          <span className={cn('flex-1 truncate font-display text-sm font-bold uppercase', !r.w && 'text-foreground/55')}>{r.t}</span>
          <span className={cn('font-display text-base font-bold tabular-nums', r.w ? lampText : 'text-foreground/55')}>{r.s}</span>
        </div>
      ))}
      {upset && <p className="bg-[hsl(var(--gold)/0.18)] px-2 py-0.5 text-center font-pixel text-[8px] uppercase tracking-wider text-[hsl(var(--gold))]">Upset · line {fav} −{Math.abs(g.line!)}</p>}
    </li>
  );
};

export const PlayoffBracket = ({ season }: { season: SeasonView }) => {
  const rounds = season.playoffs ?? [];
  if (!rounds.length) return null;
  const sb = season.superBowl;
  const seeds = useMemo(() => playoffSeeds(season), [season]);
  return (
    <div className="space-y-2">
      <SectionTitle icon={Trophy}>Road to the Super Bowl</SectionTitle>
      <div className="relative overflow-x-auto rounded-xl border border-[hsl(142_30%_28%)] p-3" style={{ background: FIELD }}>
        <span aria-hidden className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 calc(10% - 2px), hsl(0 0% 100% / 0.5) calc(10% - 2px) 10%)' }} />
        <div className="relative flex min-w-[640px] items-stretch gap-3">
          {rounds.map((r) => (
            <div key={r.round} className="flex min-w-0 flex-1 flex-col">
              <p className={cn('mb-2 text-center font-pixel text-[9px] uppercase tracking-widest', r.round === 'Super Bowl' ? 'text-[hsl(var(--gold))]' : 'text-white/70')}>{r.round}</p>
              <ul className="flex flex-1 flex-col justify-around gap-2">
                {r.games.map((g) => (
                  <BracketGame key={`${g.away}-${g.home}`} g={g} final={r.round === 'Super Bowl'} seeds={seeds} />
                ))}
              </ul>
            </div>
          ))}
          {sb && (
            <div className="flex w-24 flex-shrink-0 flex-col items-center justify-center gap-1 text-center">
              <Trophy className="h-14 w-14 text-[hsl(var(--gold))] drop-shadow-[0_0_14px_hsl(var(--gold)/0.7)]" aria-hidden />
              <TeamLogo team={sb.winner} decorative className="h-9 w-9" />
              <span className="font-pixel text-[8px] uppercase tracking-wider text-[hsl(var(--gold))]">Champions</span>
            </div>
          )}
        </div>
      </div>
      {seeds.size > 0 && <p className="text-[11px] text-muted-foreground">Seeds: division winners first, then wild cards, each by win percentage then point differential (a simplified tiebreak).</p>}
    </div>
  );
};

/* ---------------- Division banners ---------------- */

export const StandingsBanners = ({ season, upcoming }: { season: SeasonView; upcoming?: { away: string; home: string }[] }) => {
  const seeds = useMemo(() => playoffSeeds(season), [season]);
  const tags = useMemo<Map<string, Clinch>>(() => (!season.playoffs?.length && upcoming ? clinchTags(season, upcoming) : new Map()), [season, upcoming]);
  const made = useMemo(() => {
    const s = new Set<string>();
    for (const r of season.playoffs ?? []) for (const g of r.games) (s.add(g.away), s.add(g.home));
    return s;
  }, [season.playoffs]);
  const done = made.size > 0;
  const divisions = useMemo(() => {
    const m = new Map<string, SeasonView['table']>();
    for (const r of season.table) {
      if (!r.conference || !r.division) continue;
      const k = `${r.conference} ${r.division}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()]
      .map(([k, rows]) => [k, rows.sort((a, b) => (a.divisionRank ?? 9) - (b.divisionRank ?? 9) || b.pct - a.pct)] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [season.table]);
  if (!divisions.length) return null;
  const old = Number(season.season) < 2002;
  return (
    <div className="space-y-2">
      <SectionTitle icon={LayoutGrid}>Division banners</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {divisions.map(([name, rows]) => (
          <li key={name} className="relative">
            <span aria-hidden className="absolute -top-2 left-4 right-4 h-2 rounded-t border border-b-0 border-white/20 bg-[hsl(228_30%_16%)]" />
            <div className="overflow-hidden rounded-b-xl rounded-t-sm border border-[hsl(var(--line)/0.7)]" style={{ background: `linear-gradient(180deg, ${color(rows[0].team, 0.6)}, hsl(228 55% 6%) 55%)`, clipPath: 'polygon(0 0, 100% 0, 100% 94%, 50% 100%, 0 94%)' }}>
              <p className="px-3 pt-2 font-pixel text-[9px] uppercase tracking-widest text-white/80">{name}</p>
              <ol className="space-y-px px-1.5 pb-5 pt-1">
                {rows.map((r, i) => {
                  const champ = season.superBowl?.winner === r.team;
                  const post = made.has(r.abbr);
                  return (
                    <li key={r.abbr} className={cn('flex items-center gap-1.5 rounded px-1.5 py-1', i === 0 ? 'bg-black/40' : '')}>
                      <TeamLogo team={r.team} decorative className="h-5 w-5 flex-shrink-0" />
                      <span className={cn('min-w-0 flex-1 truncate text-[13px] font-semibold uppercase', done && !post && 'text-foreground/50')}>{r.team}</span>
                      {seeds.has(r.abbr) && <span className="rounded bg-black/50 px-1 font-pixel text-[8px] text-[hsl(var(--gold))]" title="Playoff seed">#{seeds.get(r.abbr)}</span>}
                      {tags.get(r.abbr) && <span className={cn('rounded px-1 font-pixel text-[7px] uppercase', tags.get(r.abbr) === 'out' ? 'bg-black/40 text-foreground/45' : 'bg-[hsl(var(--gold)/0.22)] text-[hsl(var(--gold))]')} title="Clinched or eliminated by the games left">{tags.get(r.abbr) === 'div' ? 'Div' : tags.get(r.abbr) === 'in' ? 'In' : 'Out'}</span>}
                      {champ ? <Trophy className="h-3.5 w-3.5 text-[hsl(var(--gold))]" aria-label="Champion" /> : done && post ? <Star className="h-3 w-3 fill-[hsl(var(--gold))] text-[hsl(var(--gold))]" aria-label="Made the playoffs" /> : done ? <span className="font-pixel text-[7px] uppercase text-foreground/40">out</span> : null}
                      <span className="w-[52px] text-right text-xs tabular-nums text-foreground/90">{r.record}</span>
                      <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">{signed(r.diff)}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </li>
        ))}
      </ul>
      {old && <p className="text-[11px] text-muted-foreground">Divisions are shown as aligned today; before 2002 the league had different divisions, so seeds start in 2002.</p>}
      {tags.size > 0 && <p className="text-[11px] text-muted-foreground">Div, In and Out: already clinched or eliminated by the games left (ties count as unbroken).</p>}
    </div>
  );
};

/* ---------------- Power ladder ---------------- */

export const PowerLadder = ({ season }: { season: SeasonView }) => {
  const [all, setAll] = useState(false);
  const rows = [...season.table].filter((r) => Number.isFinite(r.power)).sort((a, b) => a.power - b.power);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.powerScore));
  const min = Math.min(...rows.map((r) => r.powerScore));
  const shown = all ? rows : rows.slice(0, 10);
  const prev = season.prevPower;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle icon={Medal}>Power ladder</SectionTitle>
        <button type="button" onClick={() => setAll((v) => !v)} className="rounded-full border border-border/50 px-2.5 py-1 font-pixel text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
          {all ? 'Top 10' : `All ${rows.length}`}
        </button>
      </div>
      <ol className="grid gap-1.5 md:grid-cols-2">
        {shown.map((r) => {
          const before = prev?.[r.abbr];
          const move = before ? before - r.power : null;
          return (
            <li key={r.abbr} className="relative flex items-center gap-2 overflow-hidden rounded-lg border border-[hsl(var(--line)/0.6)] px-2 py-1.5" style={{ background: BOARD_BG }}>
              <span aria-hidden className="absolute inset-y-0 left-0 opacity-70" style={{ width: `${8 + (88 * (r.powerScore - min)) / Math.max(1, max - min)}%`, background: `linear-gradient(90deg, ${color(r.team, 0.5)}, transparent)` }} />
              <span className={cn('relative w-7 text-center font-display text-xl font-bold tabular-nums', r.power <= 3 ? lampText : 'text-foreground/80')}>{r.power}</span>
              <TeamLogo team={r.team} decorative className="relative h-7 w-7 flex-shrink-0" />
              <span className="relative min-w-0 flex-1 truncate font-display text-sm font-bold uppercase">{r.team}</span>
              <span className="relative text-xs tabular-nums text-foreground/85">{r.record}</span>
              <span className="relative w-9 text-right text-[11px] tabular-nums text-muted-foreground">{signed(r.diff)}</span>
              <span className={cn('relative flex w-9 items-center justify-end gap-0.5 text-[11px] font-semibold tabular-nums', move === null ? 'text-muted-foreground' : move > 0 ? 'text-[hsl(145_63%_55%)]' : move < 0 ? 'text-[hsl(357_80%_70%)]' : 'text-muted-foreground')} title={before ? `Ranked ${before} the season before` : 'Not ranked the season before'}>
                {move === null ? <span className="font-pixel text-[7px]">NEW</span> : move > 0 ? <><TrendingUp className="h-3 w-3" aria-hidden />{move}</> : move < 0 ? <><TrendingDown className="h-3 w-3" aria-hidden />{-move}</> : <Minus className="h-3 w-3" aria-hidden />}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** The full table behind a toggle, for anyone who wants every column. */
export const FullTable = ({ season }: { season: SeasonView }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full border border-border/50 px-3 py-1.5 font-pixel text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <ListOrdered className="h-3.5 w-3.5" aria-hidden /> {open ? 'Hide the full league table' : 'Full league table'}
      </button>
      {open && <LeagueTable season={season} />}
    </div>
  );
};
