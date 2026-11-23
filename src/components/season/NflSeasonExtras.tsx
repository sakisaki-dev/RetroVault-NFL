import { useEffect, useMemo, useState } from 'react';
import { Flame, Gauge, Medal, Swords, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import GameSprite, { type SpriteSize } from '@/components/GameSprite';
import TeamLogo from '@/components/timeline/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { useGameSprites } from '@/utils/gameSprites';
import type { SeasonView } from '@/utils/seasonLive';
import type { PlayerLookup } from './LivePanels';
import { BOARD_BG, LampGrid, color, lampText } from './seasonGamesUi';
import { SectionTitle } from './SeasonGames';

/**
 * NFL Season page extras: each game's star performer (public/data/league/stars/<year>.json, scripts/nfl/game_stars.py,
 * lazy per season), highlight cards, the stat-leader and projected-award podiums, playoff seeds and clinch tags.
 */

export type StarRow = [key: string, name: string, line: string];
export interface SeasonStars {
  g: Record<string, { a?: StarRow; h?: StarRow }>;
  l: Record<string, [key: string, name: string, club: string, value: number][]>;
}
const cache = new Map<string, Promise<SeasonStars | null>>();
export const loadStars = (year: string) => {
  let p = cache.get(year);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/league/stars/${year}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<SeasonStars>) : null))
      .catch(() => null);
    cache.set(year, p);
  }
  return p;
};
export const useSeasonStars = (year: string | null) => {
  const [v, setV] = useState<{ year: string; s: SeasonStars | null } | null>(null);
  useEffect(() => {
    if (!year) return;
    let live = true;
    loadStars(year).then((s) => live && setV({ year, s }));
    return () => {
      live = false;
    };
  }, [year]);
  return v && v.year === year ? v.s : null;
};

const SITE_POS: Record<string, string> = { DT: 'DL', DE: 'DL', NT: 'DL', EDGE: 'DL', OLB: 'LB', ILB: 'LB', MLB: 'LB', CB: 'DB', S: 'DB', FS: 'DB', SS: 'DB', FB: 'RB', T: 'OL', G: 'OL', C: 'OL' };
export const sitePos = (p: string) => SITE_POS[p] ?? p;
/** POS:Name -> [position, name] */
export const splitKey = (key: string): [string, string] => {
  const i = key.indexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
};

/**
 * A player's game sprite in his club's kit. Anyone gets one: a player the site has no card for (retired before the
 * roster's first season, say) is drawn from the stand-in looks the sprite resolver assigns by name, so the logo is only
 * the fallback where the sprite art is not in the build at all (the public site).
 */
export const StarSprite = ({ name, pos, team, size = 'm', kind = 'figure', celebrate }: { name: string; pos: string; team: string; size?: SpriteSize; kind?: 'figure' | 'bust'; celebrate?: boolean }) => {
  const sprites = useGameSprites();
  if (!sprites) return <TeamLogo team={team} decorative className={size === 's' ? 'h-8 w-8' : 'h-14 w-14'} />;
  return <GameSprite player={{ name, position: sitePos(pos) as never, team, bannerTeam: team }} team={team} kind={kind} size={size} action={celebrate ? 'celebrate' : undefined} />;
};

const abbrOf = (season: SeasonView, name: string) => season.table.find((r) => r.team === name)?.abbr ?? findNFLTeam(name)?.abbreviation ?? name;
const starKey = (week: number, away: string, home: string) => `${week}-${away}-${home}`;

/** The two stars of a game, one per club, sprite and line. */
export const StarStrip = ({ stars, week, away, home, lookup: _l }: { stars: SeasonStars | null; week: number; away: string; home: string; lookup?: PlayerLookup }) => {
  const g = stars?.g[starKey(week, away, home)];
  if (!g) return null;
  return (
    <div className="grid grid-cols-2 border-t border-white/10 text-[11px]" aria-label="Stars of the game">
      {([['a', away], ['h', home]] as const).map(([side, team]) => {
        const s = g[side];
        if (!s) return <span key={side} />;
        const [pos, name] = splitKey(s[0]);
        return (
          <div key={side} className="flex min-w-0 items-center gap-1.5 px-2 py-1" style={{ background: `linear-gradient(${side === 'a' ? '90deg' : '270deg'}, ${color(team, 0.22)}, transparent)` }}>
            <span className="flex h-9 w-8 flex-shrink-0 items-end justify-center overflow-hidden">
              <StarSprite name={name} pos={pos} team={team} size="s" kind="bust" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-semibold">{name}</span>
              <span className="block truncate text-muted-foreground">{s[2]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

/* ---------------- Highlight reel ---------------- */

type GameRef = NonNullable<SeasonView['upset']>;
export const HighlightReel = ({ season, stars }: { season: SeasonView; stars: SeasonStars | null }) => {
  const l = season.league;
  const items: { key: string; kicker: string; icon: typeof Zap; g: GameRef; caption?: string }[] = [];
  if (season.upset) items.push({ key: 'upset', kicker: 'Upset of the year', icon: Zap, g: season.upset, caption: `${season.upset.winner} (${season.upset.winnerRecord}) beat ${season.upset.loser} (${season.upset.loserRecord}) by ${season.upset.margin}` });
  if (season.blowout) items.push({ key: 'blowout', kicker: 'Blowout', icon: Swords, g: season.blowout, caption: `Won by ${season.blowout.margin}` });
  if (season.shootout) items.push({ key: 'shootout', kicker: 'Shootout', icon: Flame, g: season.shootout, caption: `${season.shootout.total} combined points` });
  if (l?.closest) items.push({ key: 'closest', kicker: 'Nail-biter', icon: Target, g: l.closest, caption: `Decided by ${l.closest.margin}` });
  if (l?.fewestInWin) items.push({ key: 'fewest', kicker: 'Defensive slog', icon: Gauge, g: l.fewestInWin, caption: `${l.fewestInWin.winner} won with ${Math.max(l.fewestInWin.awayScore, l.fewestInWin.homeScore)}` });
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <SectionTitle icon={Zap}>Highlight reel</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ key, kicker, icon: Icon, g, caption }) => {
          const aw = abbrOf(season, g.away);
          const hm = abbrOf(season, g.home);
          const win = g.winner;
          return (
            <li key={key} className="relative overflow-hidden rounded-xl border border-[hsl(var(--gold)/0.45)] shadow-[0_8px_22px_hsl(228_60%_2%/0.45)]" style={{ background: BOARD_BG }}>
              <LampGrid />
              <div className="relative flex items-center justify-between px-3 py-1.5" style={{ background: 'linear-gradient(90deg, hsl(var(--gold)/0.28), transparent)' }}>
                <span className="flex items-center gap-1.5 font-pixel text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--gold))]">
                  <Icon className="h-3.5 w-3.5" aria-hidden /> {kicker}
                </span>
                <span className="font-pixel text-[9px] uppercase tracking-widest text-muted-foreground">Week {g.week}</span>
              </div>
              <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3">
                {[{ t: g.away, s: g.awayScore }, { t: g.home, s: g.homeScore }].map((x, i) => (
                  <div key={x.t} className={cn('flex items-center gap-2', i === 1 && 'col-start-3 flex-row-reverse text-right', i === 0 && 'col-start-1')}>
                    <TeamLogo team={x.t} decorative className="h-10 w-10 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className={cn('truncate font-display text-sm font-bold uppercase', x.t !== win && 'text-foreground/60')}>{x.t}</p>
                      <p className={cn('font-display text-3xl font-bold tabular-nums leading-none', x.t === win ? lampText : 'text-foreground/60')}>{x.s}</p>
                    </div>
                  </div>
                ))}
                <span className="col-start-2 row-start-1 font-pixel text-[9px] text-muted-foreground">@</span>
              </div>
              <StarStrip stars={stars} week={g.week} away={aw} home={hm} />
              {caption && <p className="relative border-t border-white/10 px-3 py-1.5 text-[11px] text-muted-foreground">{caption}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/* ---------------- Podiums ---------------- */

interface PodiumEntry {
  key: string;
  name: string;
  team: string;
  value: string;
  detail?: string;
}
const STEP = [{ h: 84, n: 1 }, { h: 56, n: 2 }, { h: 38, n: 3 }];
const Podium = ({ rows, unit }: { rows: PodiumEntry[]; unit: string }) => {
  const order = [rows[1], rows[0], rows[2]].map((r, i) => (r ? { r, rank: [2, 1, 3][i] } : null));
  return (
    <ol className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-2">
      {order.map((o) => {
        if (!o) return <li key={Math.random()} />;
        const { r, rank } = o;
        const step = STEP[rank - 1];
        const [pos] = splitKey(r.key);
        return (
          <li key={r.key} className="flex min-w-0 flex-col items-center text-center">
            <StarSprite name={r.name} pos={pos} team={r.team} size="m" celebrate={rank === 1} />
            <p className="mt-1 max-w-full truncate font-display text-sm font-bold uppercase leading-tight">{r.name}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <TeamLogo team={r.team} decorative className="h-4 w-4" /> {findNFLTeam(r.team)?.name ?? r.team}
            </p>
            <div className="mt-1 flex w-full flex-col items-center justify-start rounded-t-md border border-b-0 border-white/15 pt-1" style={{ height: step.h, background: `linear-gradient(180deg, ${color(r.team, 0.6)}, hsl(228 55% 6%))` }}>
              <span className={cn('font-display text-xl font-bold tabular-nums leading-none', rank === 1 ? lampText : 'text-foreground')}>{r.value}</span>
              <span className="font-pixel text-[8px] uppercase text-muted-foreground">{r.detail ?? unit}</span>
            </div>
            <span className="-mt-px w-full bg-black/60 py-0.5 font-pixel text-[9px] text-muted-foreground">{rank}</span>
          </li>
        );
      })}
    </ol>
  );
};

interface Awards {
  awards?: Record<string, [string, number, string][]>;
  awardsAbout?: string;
  season?: number;
  through?: number;
}
let awardsReq: Promise<Awards | null> | null = null;
const loadAwards = () => (awardsReq ??= fetch(`${import.meta.env.BASE_URL}data/league/season_leaders.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));

const STAT_TABS: { id: string; label: string; unit: string }[] = [
  { id: 'passing', label: 'Pass yards', unit: 'yds' },
  { id: 'rushing', label: 'Rush yards', unit: 'yds' },
  { id: 'receiving', label: 'Rec yards', unit: 'yds' },
  { id: 'sacks', label: 'Sacks', unit: 'sacks' },
  { id: 'interceptions', label: 'Interceptions', unit: 'INT' },
];

export const Podiums = ({ season, stars, lookup, inProgress }: { season: SeasonView; stars: SeasonStars | null; lookup: PlayerLookup; inProgress: boolean }) => {
  const [awards, setAwards] = useState<Awards | null>(null);
  useEffect(() => {
    if (inProgress) loadAwards().then((a) => setAwards(a && String(a.season) === season.season ? a : null));
  }, [inProgress, season.season]);
  const awardKinds = inProgress && awards?.awards ? Object.keys(awards.awards) : [];
  const tabs = [...awardKinds.map((k) => ({ id: `aw:${k}`, label: `${k} race`, unit: 'score' })), ...STAT_TABS];
  const [tab, setTab] = useState<string | null>(null);
  const shown = tabs.find((t) => t.id === tab) ?? tabs[0];
  const rows = useMemo<PodiumEntry[]>(() => {
    if (!shown) return [];
    if (shown.id.startsWith('aw:'))
      return (awards?.awards?.[shown.id.slice(3)] ?? []).slice(0, 3).map(([key, , text]) => {
        const [, name] = splitKey(key);
        return { key, name, team: lookup(key)?.team ?? '', value: text.split(',')[0], detail: 'projected' };
      });
    return (stars?.l[shown.id] ?? []).map(([key, name, club, v]) => ({ key, name, team: club, value: v.toLocaleString() }));
  }, [shown, stars, awards, lookup]);
  if (!stars && !awardKinds.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={Medal}>{inProgress ? 'Award race and leaders' : 'Season leaders'}</SectionTitle>
        <div role="group" aria-label="Podium" className="scrollbar-none flex max-w-full gap-1 overflow-x-auto rounded-lg bg-secondary/50 p-0.5 text-xs font-semibold">
          {tabs.map((t) => (
            <button key={t.id} type="button" aria-pressed={t.id === shown?.id} onClick={() => setTab(t.id)} className={cn('min-h-[32px] flex-shrink-0 rounded-md px-2.5 py-1 transition-colors', t.id === shown?.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--line)/0.7)] px-3 pb-3 pt-4" style={{ background: BOARD_BG }}>
        <LampGrid />
        <div className="relative">{rows.length ? <Podium rows={rows} unit={shown?.unit ?? ''} /> : <p className="text-center text-xs text-muted-foreground">No leaders yet.</p>}</div>
        {shown?.id.startsWith('aw:') && awards?.awardsAbout && <p className="relative mt-2 text-center text-[11px] text-muted-foreground">{awards.awardsAbout}</p>}
      </div>
    </div>
  );
};

/* ---------------- Seeds and clinch tags ---------------- */

/**
 * Playoff seeds from the real playoff field (2002 on, when the divisions settled): within a conference the division
 * winners come first, then the wild cards, each ordered by win percentage and then point differential (a simplified
 * tiebreak: the league's own head-to-head and common-games steps are not applied). A division winner is the best of
 * its division's playoff clubs by the same order.
 */
export const playoffSeeds = (season: SeasonView): Map<string, number> => {
  const seeds = new Map<string, number>();
  const rounds = season.playoffs ?? [];
  if (!rounds.length || Number(season.season) < 2002) return seeds;
  const made = new Set(rounds.flatMap((r) => r.games.flatMap((g) => [g.away, g.home])));
  const rowOf = new Map(season.table.map((r) => [r.abbr, r]));
  const better = (a: string, b: string) => {
    const x = rowOf.get(a)!;
    const y = rowOf.get(b)!;
    return y.pct - x.pct || y.diff - x.diff || a.localeCompare(b);
  };
  for (const conf of ['AFC', 'NFC']) {
    const field = [...made].filter((a) => rowOf.get(a)?.conference === conf);
    const winners = new Set<string>();
    new Set(field.map((a) => rowOf.get(a)!.division)).forEach((d) => winners.add(field.filter((a) => rowOf.get(a)!.division === d).sort(better)[0]));
    const ordered = [...field.filter((a) => winners.has(a)).sort(better), ...field.filter((a) => !winners.has(a)).sort(better)];
    ordered.forEach((a, i) => seeds.set(a, i + 1));
  }
  return seeds;
};

export type Clinch = 'div' | 'in' | 'out';
/** For a season in progress: what the remaining games already decide. Conservative: ties are not broken in anyone's favour. */
export const clinchTags = (season: SeasonView, upcoming: { away: string; home: string }[], spots = 7): Map<string, Clinch> => {
  const out = new Map<string, Clinch>();
  const rem = new Map<string, number>();
  upcoming.forEach((g) => (rem.set(g.away, (rem.get(g.away) ?? 0) + 1), rem.set(g.home, (rem.get(g.home) ?? 0) + 1)));
  const pts = (r: SeasonView['table'][number]) => r.w + r.t / 2;
  const max = (r: SeasonView['table'][number]) => pts(r) + (rem.get(r.abbr) ?? 0);
  for (const conf of ['AFC', 'NFC']) {
    const c = season.table.filter((r) => r.conference === conf);
    for (const r of c) {
      const mates = c.filter((x) => x.division === r.division && x.abbr !== r.abbr);
      if (mates.every((x) => max(x) < pts(r))) {
        out.set(r.abbr, 'div');
        continue;
      }
      const others = c.filter((x) => x.abbr !== r.abbr);
      if (others.filter((x) => max(x) >= pts(r)).length < spots) out.set(r.abbr, 'in');
      else if (others.filter((x) => pts(x) > max(r)).length >= spots) out.set(r.abbr, 'out');
    }
  }
  return out;
};
