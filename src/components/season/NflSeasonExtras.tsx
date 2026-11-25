import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { openGame, regularGameId, useGameIds } from '@/utils/nflGames';
import { Flame, Gauge, Medal, Swords, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import GameSprite, { type SpriteSize } from '@/components/GameSprite';
import TeamLogo from '@/components/timeline/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { useGameSprites } from '@/utils/gameSprites';
import type { SeasonView } from '@/utils/seasonLive';
import type { PlayerLookup } from './LivePanels';
import { BOARD_BG, LampGrid, color, lampText } from './seasonGamesUi';
import { SectionTitle } from './SeasonGames';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import { useLeague } from '@/context/LeagueContext';
import { normalizeName } from '@/utils/playerExtras';
import { stripSuffix } from '@/utils/nameSuffix';
import { keyOfPlayer } from '@/utils/playerSearch';
import { buildHash } from '@/components/stats/hub/hashRoute';
import { peekKeyProps } from '@/components/peek/peekProps';
import { Reveal, stag } from '@/components/motion/Reveal';
import './nflPodium.css';
import './sx.css';
import { ArcadeToggle, clubVars } from '@/components/arcade';
import { dataResponse } from '@/utils/dataStore';
import { displayName } from '@/utils/displayName';

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
    p = dataResponse(`data/league/stars/${year}.json`)
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
export const StarSprite = ({ name, pos, team, size = 'm', kind = 'figure', celebrate, season }: { name: string; pos: string; team: string; size?: SpriteSize; kind?: 'figure' | 'bust'; celebrate?: boolean; season?: number }) => {
  const sprites = useGameSprites();
  if (!sprites) return <TeamLogo team={team} decorative className={size === 's' ? 'h-8 w-8' : 'h-14 w-14'} />;
  return <GameSprite player={{ name, position: sitePos(pos) as never, team, bannerTeam: team }} team={team} kind={kind} size={size} season={season} action={celebrate ? 'celebrate' : undefined} />;
};

const abbrOf = (season: SeasonView, name: string) => season.table.find((r) => r.team === name)?.abbr ?? findNFLTeam(name)?.abbreviation ?? name;
const starKey = (week: number, away: string, home: string) => `${week}-${away}-${home}`;

/** The two stars of a game, one per club, bust and line, each on his club's flat colour. */
export const StarStrip = ({ stars, week, away, home, lookup: _l }: { stars: SeasonStars | null; week: number; away: string; home: string; lookup?: PlayerLookup }) => {
  const g = stars?.g[starKey(week, away, home)];
  if (!g) return null;
  return (
    <div className="grid grid-cols-2 border-t-2 border-[hsl(var(--line))] text-[11px]" aria-label="Stars of the game">
      {([['a', away], ['h', home]] as const).map(([side, team]) => {
        const s = g[side];
        if (!s) return <span key={side} />;
        const [pos, name] = splitKey(s[0]);
        return (
          <PlayerHit key={side} name={name} pos={pos} className="sx-star" style={clubVars(team) as CSSProperties}>
            <span className="sx-star__sp">
              <StarSprite name={name} pos={pos} team={team} size="s" kind="bust" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-semibold">{name}</span>
              <span className="block truncate opacity-85">{s[2]}</span>
            </span>
          </PlayerHit>
        );
      })}
    </div>
  );
};

/* ---------------- Clickable players ---------------- */

/** Name (+ position) → the site's player key, for names that come from game lines or Wikipedia award lists. */
const useKeyFinder = () => {
  const { getAllPlayers, dataVersion } = useLeague();
  return useMemo(() => {
    const by = new Map<string, Player[]>();
    const exact = new Set(getAllPlayers().map((p) => normalizeName(p.name.replace(/\s*\(.*\)$/, ''))));
    getAllPlayers().forEach((p) => {
      const n = normalizeName(p.name.replace(/\s*\(.*\)$/, ''));
      by.set(n, [...(by.get(n) ?? []), p]);
    });
    // game lines and award lists drop the suffix ("James Cook" for "James Cook III"): an exact name still wins
    getAllPlayers().forEach((p) => {
      const bare = normalizeName(stripSuffix(p.name.replace(/\s*\(.*\)$/, '')));
      if (bare === normalizeName(p.name.replace(/\s*\(.*\)$/, '')) || exact.has(bare)) return;
      by.set(bare, [...(by.get(bare) ?? []), p]);
    });
    return (name: string, pos?: string): string | null => {
      const list = by.get(normalizeName(name)) ?? by.get(normalizeName(stripSuffix(name))) ?? [];
      if (!list.length) return null;
      const want = pos ? sitePos(pos) : null;
      const hit = (want && list.find((p) => p.position === want)) || list.reduce((a, b) => ((b.games ?? 0) > (a.games ?? 0) ? b : a));
      return keyOfPlayer(hit);
    };
    // dataVersion: a new league load is a new player list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAllPlayers, dataVersion]);
};

/**
 * A player figure that opens his Deep Dive on tap and the quick look on hold (owner: "the players are not clickable").
 * A name the roster doesn't have (a pre-1999 star) stays a plain figure.
 */
export const PlayerHit = ({ name, pos, playerKey, className, style, children, label }: { name: string; pos?: string; playerKey?: string | null; className?: string; style?: CSSProperties; children: ReactNode; label?: string }) => {
  const find = useKeyFinder();
  const key = playerKey ?? find(name, pos);
  if (!key) return <div className={className} style={style}>{children}</div>;
  return (
    <button
      type="button"
      {...peekKeyProps(key)}
      aria-label={label ?? `Open ${name}'s Deep Dive`}
      onClick={() => {
        window.location.hash = buildHash({ tab: 'career', sub: 'deepdive', p: key });
      }}
      style={style}
      className={cn('cursor-pointer text-left transition-[filter,transform] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold))] active:scale-[0.98]', className)}
    >
      {children}
    </button>
  );
};

/* ---------------- Highlight reel ---------------- */

type GameRef = NonNullable<SeasonView['upset']>;
export const HighlightReel = ({ season, stars }: { season: SeasonView; stars: SeasonStars | null }) => {
  const ids = useGameIds(true);
  const l = season.league;
  const items: { key: string; kicker: string; icon: typeof Zap; g: GameRef; caption?: string }[] = [];
  if (season.upset) items.push({ key: 'upset', kicker: 'Upset of the year', icon: Zap, g: season.upset, caption: `${season.upset.winner} (${season.upset.winnerRecord}) beat ${season.upset.loser} (${season.upset.loserRecord}) by ${season.upset.margin}` });
  if (season.blowout) items.push({ key: 'blowout', kicker: 'Blowout', icon: Swords, g: season.blowout, caption: `Won by ${season.blowout.margin}` });
  if (season.shootout) items.push({ key: 'shootout', kicker: 'Shootout', icon: Flame, g: season.shootout, caption: `${season.shootout.total} combined points` });
  if (l?.closest) items.push({ key: 'closest', kicker: 'Nail-biter', icon: Target, g: l.closest, caption: `Decided by ${l.closest.margin}` });
  if (l?.fewestInWin) items.push({ key: 'fewest', kicker: 'Defensive slog', icon: Gauge, g: l.fewestInWin, caption: `${l.fewestInWin.winner} won with ${Math.max(l.fewestInWin.awayScore, l.fewestInWin.homeScore)}` });
  if (!items.length) return null;
  return (
    <div className="sx-block">
      <SectionTitle kicker="Games that stood out" club={items[0].g.winner}>Highlight reel</SectionTitle>
      <Reveal as="ul" className="sx-games" style={{ listStyle: 'none' }}>
        {items.map(({ key, kicker, icon: Icon, g, caption }, ii) => {
          const aw = abbrOf(season, g.away);
          const hm = abbrOf(season, g.home);
          const win = g.winner;
          const id = regularGameId(ids, season.season, g.week, aw, hm);
          return (
            <li key={key} className="sx-hl mo-rise" style={{ ...(clubVars(win) as CSSProperties), ...stag(ii, 80) }}>
              <div className="sx-hl__head">
                <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" aria-hidden /> {kicker}</span>
                <span>Week {g.week}</span>
              </div>
              <div className="sx-hl__body">
                {[{ t: g.away, s: g.awayScore }, { t: g.home, s: g.homeScore }].map((x, i) => (
                  <div key={x.t} className={cn('flex items-center gap-2', i === 1 && 'col-start-3 flex-row-reverse text-right', i === 0 && 'col-start-1')}>
                    <TeamLogo team={x.t} decorative className="h-10 w-10 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className={cn('truncate font-display text-sm font-bold uppercase', x.t !== win && 'text-foreground/60')}>{x.t}</p>
                      <p className={cn('font-display text-3xl font-bold tabular-nums leading-none', x.t === win ? 'text-[hsl(var(--gold))]' : 'text-foreground/60')}>{x.s}</p>
                    </div>
                  </div>
                ))}
                <span className="col-start-2 row-start-1 font-pixel text-[9px] text-muted-foreground">@</span>
              </div>
              <StarStrip stars={stars} week={g.week} away={aw} home={hm} />
              {caption && (
                <p className="flex items-center justify-between gap-2 border-t-2 border-[hsl(var(--line))] px-3 py-1.5 text-[11px] text-muted-foreground">
                  <span>{caption}</span>
                  {id && <button type="button" onClick={() => openGame(id)} className="ax-chip flex-shrink-0">Box score</button>}
                </p>
              )}
            </li>
          );
        })}
      </Reveal>
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
  sub?: string;
}
const STEP = [{ h: 128, n: 1 }, { h: 104, n: 2 }, { h: 88, n: 3 }];
/** 1st stands in the middle and tallest, 2nd on the left, 3rd on the right; each pedestal is the club's flat colour with its rank, figure and detail. */
const Podium = ({ rows, unit }: { rows: PodiumEntry[]; unit: string }) => {
  const order = [rows[1], rows[0], rows[2]].map((r, i) => (r ? { r, rank: [2, 1, 3][i] } : null));
  return (
    <Reveal as="ol" className="mx-auto grid max-w-3xl list-none grid-cols-3 items-end gap-2 p-0" aria-label="Podium: 1st in the middle, 2nd left, 3rd right">
      {order.map((o, i) => {
        if (!o) return <li key={`empty-${i}`} />;
        const { r, rank } = o;
        const step = STEP[rank - 1];
        const [pos] = splitKey(r.key);
        return (
          <li key={r.key} className="mo-step flex min-w-0 flex-col items-center text-center" style={stag(rank === 1 ? 3 : rank === 2 ? 2 : 0, 110)}>
            <PlayerHit name={r.name} pos={pos} className="flex max-w-full flex-col items-center text-center">
              <StarSprite name={r.name} pos={pos} team={r.team} size="l" celebrate={rank === 1} />
            </PlayerHit>
            <div className={cn('sx-step', rank === 1 && 'sx-step--first')} style={{ minHeight: step.h, ...(clubVars(r.team) as CSSProperties) }}>
              <span className="sx-step__rank" aria-label={`Rank ${rank}`}>{rank}</span>
              <PlayerHit name={r.name} pos={pos} className="max-w-full">
                <span className="sx-step__name"><TeamLogo team={r.team} decorative className="h-5 w-5 flex-shrink-0" /><span>{displayName(r.name)}</span></span>
              </PlayerHit>
              <span className="sx-step__val">{r.value}</span>
              <span className="sx-step__detail">{r.detail ?? unit}</span>
              {r.sub && <span className="sx-step__detail">{r.sub}</span>}
            </div>
          </li>
        );
      })}
    </Reveal>
  );
};

/**
 * The podium's stage (owner: "the background for the widget is a black background, make it more immersive"): a night
 * stadium in the leader's club colours — the game's crowd and stand front painted to his club above, two floodlight
 * beams, a spotlight on the winner's step and the painted turf under the podium (CSS stand-ins in a build without the
 * game art).
 */
export const PodiumStage = ({ team, children, turf = 'night', className }: { team: string; children: ReactNode; turf?: 'day' | 'night' | 'snow'; className?: string }) => {
  const art = useFieldArt(team || 'Eagles', turf);
  const t = findNFLTeam(team);
  const tint = t ? `hsl(${t.primaryColor})` : 'hsl(var(--gold))';
  return (
    <div className={cn('nsx-stage', className)} style={{ ['--nsx-tint' as string]: tint }}>
      <div className={cn('nsx-stage__crowd', art.crowd && 'nsx-stage__crowd--art')} style={art.crowd ? { backgroundImage: `url(${art.crowd})` } : undefined} aria-hidden="true" />
      {art.stands && <div className="nsx-stage__stands" style={{ backgroundImage: `url(${art.stands})` }} aria-hidden="true" />}
      <span className="nsx-stage__beam nsx-stage__beam--l" aria-hidden="true" />
      <span className="nsx-stage__beam nsx-stage__beam--r" aria-hidden="true" />
      <span className="nsx-stage__spot" aria-hidden="true" />
      <div className={cn('nsx-stage__turf', art.turf && 'nsx-stage__turf--art')} style={art.turf ? { backgroundImage: `url(${art.turf})` } : undefined} aria-hidden="true" />
      <div className="nsx-stage__content">{children}</div>
    </div>
  );
};

interface Awards {
  awards?: Record<string, [string, number, string][]>;
  awardsAbout?: string;
  season?: number;
  through?: number;
}
let awardsReq: Promise<Awards | null> | null = null;
const loadAwards = () => (awardsReq ??= dataResponse('data/league/season_leaders.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));

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
      return (awards?.awards?.[shown.id.slice(3)] ?? []).slice(0, 3).map(([key, score, text]) => {
        const [, name] = splitKey(key);
        const parts = text.split(', ');
        return { key, name, team: lookup(key)?.team ?? '', value: parts[0], detail: parts.slice(1).join(' · ') || 'projected', sub: `Score ${score}` };
      });
    return (stars?.l[shown.id] ?? []).map(([key, name, club, v]) => ({ key, name, team: club, value: v.toLocaleString() }));
  }, [shown, stars, awards, lookup]);
  if (!stars && !awardKinds.length) return null;
  return (
    <div className="sx-block">
      <SectionTitle
        kicker={inProgress ? 'Projected by the season so far' : 'Final standings'}
        club={rows[0]?.team}
        right={<ArcadeToggle label="Podium" size="sm" value={shown?.id ?? ''} onChange={(v) => setTab(String(v))} options={tabs.map((t) => ({ value: t.id, label: t.label }))} />}
      >
        {inProgress ? 'Award race and leaders' : 'Season leaders'}
      </SectionTitle>
      <PodiumStage team={rows[0]?.team ?? ''}>
        {rows.length ? <Podium rows={rows} unit={shown?.unit ?? ''} /> : <p className="text-center text-xs text-muted-foreground">No leaders yet.</p>}
      </PodiumStage>
      {shown?.id.startsWith('aw:') && awards?.awardsAbout && <p className="text-center text-[11px] text-muted-foreground">Ranked by projection score, highest first. {awards.awardsAbout}</p>}
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
