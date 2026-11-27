import { useEffect, useState } from 'react';
import type { Player } from '@/types/player';
import { playerKey } from '@/config/ovr';
import { dataJson } from '@/utils/dataStore';
import { loadGameSeason, type GameDetail } from '@/utils/nflGames';
import { findNFLTeam } from '@/utils/nflTeams';
import { bannerTeamOf } from '@/utils/playerExtras';
import type { CareerSeasonsFile } from '@/utils/careerSeasons';
import type { DraftYear, PickRow, SchoolFile, SchoolInfo, CollegeIndex } from '@/utils/collegeData';
import { sample } from './nflSaverData';

/*
 * The data behind the eight "real data" scenes (draft night, two-minute drill, the long one, locker room, milestone
 * watch, old vs new, weather game, hometown). Everything is a rule over files the site already has; nothing is invented.
 * What loads, and only when the screensaver runs: saver_picks.json (scripts/nfl/saver_picks.py: coldest games, longest
 * field goals per season, one-score finishes), the one or two game seasons those picks sit in, three draft boards and
 * three school files.
 */

export interface SaverPicks {
  cold: { id: string; season: number; temp: number; wind: number | null }[];
  long: { name: string; yards: number; id: string; season: number }[];
  close: { id: string; season: number }[];
}
export interface SaverExtras {
  picks: SaverPicks | null;
  games: Map<string, GameDetail>;
  drafts: DraftYear[];
  schools: SchoolFile[];
}

const settle = <T,>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

/** Fills `acc` as each file arrives, so a slow connection (a TV) still gets the scenes whose files made it in time */
const loadExtras = async (acc: SaverExtras): Promise<void> => {
  const picksJob = (async () => {
    const picks = await settle(dataJson<SaverPicks>('data/nfl/saver_picks.json'), null);
    acc.picks = picks;
    if (!picks) return;
    const wanted = [...sample(picks.cold.slice(0, 6), 1), ...sample(picks.close, 2), ...sample(picks.long.slice(0, 10), 2)];
    await Promise.all(
      [...new Set(wanted.map((w) => w.season))].map(async (y) => {
        const m = await settle(loadGameSeason(y), null);
        wanted.filter((w) => w.season === y).forEach((w) => {
          const g = m?.get(w.id);
          if (g) acc.games.set(w.id, g);
        });
      }),
    );
  })();
  const years = sample(Array.from({ length: 21 }, (_, i) => 2002 + i), 3);
  const draftJobs = years.map((y) => settle(dataJson<DraftYear>(`data/nfl/college/draft/${y}.json`), null).then((d) => d && acc.drafts.push(d)));
  const schoolJob = (async () => {
    const idx = await settle(dataJson<CollegeIndex>('data/nfl/college/index.json'), null);
    if (!idx) return;
    // schools that sent plenty of players to the site's league (site players 12+), three at random
    const pool = idx.schools.filter((s) => s[10] >= 12);
    await Promise.all(sample(pool, 3).map((s) => settle(dataJson<SchoolFile>(`data/nfl/college/schools/${s[0]}.json`), null).then((f) => f && acc.schools.push(f))));
  })();
  await Promise.all([picksJob, schoolJob, ...draftJobs]);
};

/** undefined while loading; always settles (a missing file just drops its scenes). After 8 s it settles with what has arrived. */
export const useSaverExtras = (on: boolean): SaverExtras | undefined => {
  const [x, setX] = useState<SaverExtras | undefined>(undefined);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const acc: SaverExtras = { picks: null, games: new Map(), drafts: [], schools: [] };
    const done = () => live && setX((v) => v ?? { ...acc, games: new Map(acc.games), drafts: [...acc.drafts], schools: [...acc.schools] });
    const t = window.setTimeout(done, 8_000);
    loadExtras(acc).then(done, done);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [on]);
  return x;
};

/* ---------------------------------------------------------------- scene data ---------------------------------------------------------------- */

export interface DraftNightData { year: number; pick: PickRow; school: SchoolInfo | null; player: Player | null; roll: number }
export interface TwoMinData { game: GameDetail; roll: number }
export interface LongOneData { name: string; yards: number; game: GameDetail; kicker: Player | null; roll: number }
export interface LockerData { club: string; players: Player[]; roll: number }
export interface MilestoneData { player: Player; label: string; unit: string; have: number; mark: number; perGame: number; games: number; roll: number }
export interface OldNewData { old: Player; neu: Player; oldYear: number | null; neuYear: number | null; oldSpan: string; neuSpan: string; pos: string; roll: number }
export interface WxGameData { game: GameDetail; fx: 'snow' | null; wind: number; roll: number }
export interface HometownData { school: SchoolFile; players: Player[]; roll: number }

const byKey = (players: Player[]) => new Map(players.map((p) => [playerKey(p), p]));

export const draftScenes = (drafts: DraftYear[], players: Player[]): DraftNightData[] => {
  const keyed = byKey(players);
  const out: DraftNightData[] = [];
  const usedClubs = new Set<string>();
  for (const d of drafts) {
    // a first-round pick who has a career on the site and a recorded career rating
    const cands = d.picks.filter((p) => p[0] === 1 && p[6] && p[7] != null && keyed.has(p[6]) && findNFLTeam(p[2]));
    const pick = sample(cands, 6).find((p) => !usedClubs.has(p[2])) ?? cands[0];
    if (!pick) continue;
    usedClubs.add(pick[2]);
    out.push({ year: d.y, pick, school: (pick[5] && d.schools[pick[5]]) || null, player: keyed.get(pick[6]!) ?? null, roll: Math.random() });
  }
  return out;
};

export const twoMinScenes = (extras: SaverExtras): TwoMinData[] => {
  const ids = new Set(extras.picks?.close.map((c) => c.id) ?? []);
  return [...extras.games.values()].filter((g) => ids.has(g.id) && g.awayScore != null && g.homeScore != null).map((game) => ({ game, roll: (game.time ?? '') >= '19:00' ? 0.9 : 0.1 }));
};

const fgLong = (g: GameDetail) => g.players.reduce<{ name: string; yards: number } | null>((b, p) => (p.s.fg_long > (b?.yards ?? 0) ? { name: p.name, yards: p.s.fg_long } : b), null);

/** The longest made field goal of the latest season in the loaded game files, plus the longest of other seasons on record */
export const longOneScenes = (extras: SaverExtras, recent: GameDetail[], players: Player[]): LongOneData[] => {
  const kickers = players.filter((p) => p.position === 'K');
  const find = (name: string) => kickers.find((k) => k.name === name) ?? null;
  const out: LongOneData[] = [];
  const seasons = [...new Set(recent.map((g) => g.season))].sort((a, b) => b - a);
  for (const s of seasons.slice(0, 1)) {
    const best = recent.filter((g) => g.season === s).reduce<{ g: GameDetail; name: string; yards: number } | null>((b, g) => {
      const l = fgLong(g);
      return l && l.yards > (b?.yards ?? 0) ? { g, ...l } : b;
    }, null);
    if (best) out.push({ name: best.name, yards: best.yards, game: best.g, kicker: find(best.name), roll: Math.random() });
  }
  extras.picks?.long.forEach((l) => {
    const g = extras.games.get(l.id);
    if (g && !out.some((o) => o.game.id === g.id)) out.push({ name: l.name, yards: l.yards, game: g, kicker: find(l.name), roll: Math.random() });
  });
  return out;
};

export const weatherScenes = (extras: SaverExtras): WxGameData[] =>
  (extras.picks?.cold ?? [])
    .map((c) => extras.games.get(c.id))
    .filter((g): g is GameDetail => !!g && g.temp !== undefined && g.awayScore != null)
    // below freezing it is a snow look (the game files record temperature and wind, not precipitation)
    .map((game) => ({ game, fx: game.temp! <= 32 ? ('snow' as const) : null, wind: Math.min(1, Math.max(0.15, (game.wind ?? 8) / 28)), roll: 0.4 }));

export const lockerScenes = (players: Player[]): LockerData[] => {
  const byClub = new Map<string, Player[]>();
  players.forEach((p) => {
    const c = findNFLTeam(bannerTeamOf(p))?.name;
    if (c) byClub.set(c, [...(byClub.get(c) ?? []), p]);
  });
  return sample([...byClub.entries()].filter(([, ps]) => ps.length >= 5), 4).map(([club, ps]) => ({ club, players: ps.slice(0, 5), roll: Math.random() }));
};

/* ---- milestone watch ---- */
type Num = number | undefined;
const n = (v: Num) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Position → the career totals worth a milestone (label, unit, the player's total; null = the file has none) */
const STATS = (p: Player): { label: string; unit: string; v: number | null }[] => {
  const x = p as unknown as Record<string, Num>;
  switch (p.position) {
    case 'QB': return [{ label: 'Passing yards', unit: 'yards', v: n(x.passYds) }, { label: 'Passing TDs', unit: 'TD passes', v: n(x.passTD) }, { label: 'Rushing yards', unit: 'yards', v: n(x.rushYds) }];
    case 'RB': return [{ label: 'Rushing yards', unit: 'yards', v: n(x.rushYds) }, { label: 'Rushing TDs', unit: 'TDs', v: n(x.rushTD) }, { label: 'Receiving yards', unit: 'yards', v: n(x.recYds) }];
    case 'WR': case 'TE': return [{ label: 'Receiving yards', unit: 'yards', v: n(x.recYds) }, { label: 'Catches', unit: 'catches', v: n(x.receptions) }, { label: 'Receiving TDs', unit: 'TDs', v: n(x.recTD) }];
    case 'K': return [{ label: 'Field goals', unit: 'field goals', v: n(x.fgMade) }];
    default: return [{ label: 'Sacks', unit: 'sacks', v: n(x.sacks) }, { label: 'Interceptions', unit: 'picks', v: n(x.interceptions) }, { label: 'Tackles', unit: 'tackles', v: n(x.tackles) }];
  }
};
const nextMark = (v: number, label: string): number => {
  const yards = /yards/i.test(label);
  const step = yards ? (v >= 10000 ? 5000 : 1000) : v < 100 ? 10 : v < 500 ? 50 : v < 2000 ? 100 : 500;
  return (Math.floor(v / step) + 1) * step;
};

export const milestoneScenes = (players: Player[]): MilestoneData[] => {
  const out: (MilestoneData & { w: number })[] = [];
  for (const p of players) {
    if (p.status !== 'Active' || !(p.games >= 40)) continue;
    for (const s of STATS(p)) {
      if (s.v == null || s.v < 30) continue;
      const mark = nextMark(s.v, s.label);
      const perGame = s.v / p.games;
      const games = Math.ceil((mark - s.v) / perGame);
      // within two seasons of games at his career pace, and a mark that means something for the stat
      if (perGame > 0 && games >= 1 && games <= 34) out.push({ player: p, label: s.label, unit: s.unit, have: s.v, mark, perGame, games, roll: Math.random(), w: p.careerLegacy });
    }
  }
  // the best-known players first, one line each
  const seen = new Set<string>();
  const top = out.sort((a, b) => b.w - a.w).filter((m) => (seen.has(playerKey(m.player)) ? false : seen.add(playerKey(m.player)))).slice(0, 14);
  return sample(top, 4);
};

/* ---- old vs new ---- */
export const spanText = (file: CareerSeasonsFile | null, p: Player): string => {
  const s = span(file, p);
  // the stat files start in 1999: an earlier career is shown as running through its last year, not as starting then
  return s ? (s.from === file?.seasons[0] ? `through ${s.to}` : s.from === s.to ? `${s.from}` : `${s.from}–${s.to}`) : '';
};
/** His first and last season with a changing career line (the file keeps his final totals on every later row) */
const span = (file: CareerSeasonsFile | null, p: Player): { from: number; to: number } | null => {
  const e = file?.players[playerKey(p)];
  if (!e || !file) return null;
  const start = file.seasons.indexOf(e.from);
  const key = (r: (typeof e.rows)[number]) => (r ? JSON.stringify(r.slice(5, -1)) : '');
  // the first unbroken run of seasons (a retired player's row for the current season repeats his final totals)
  let last = -1;
  for (let i = 0; i < e.rows.length && e.rows[i]; i++) {
    if (i === 0 || key(e.rows[i]) !== key(e.rows[i - 1])) last = i;
  }
  const to = file.seasons[start + last];
  return last >= 0 && to != null ? { from: e.from, to } : null;
};
export const eraYear = (file: CareerSeasonsFile | null, p: Player): number | null => {
  const s = span(file, p);
  return s ? Math.round((s.from + s.to) / 2) : null;
};
export const oldNewScenes = (players: Player[], file: CareerSeasonsFile | null): OldNewData[] => {
  const out: OldNewData[] = [];
  for (const pos of sample(['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB', 'OL'], 8)) {
    const at = players.filter((p) => p.position === pos);
    const olds = at.filter((p) => p.status === 'Retired' && eraYear(file, p) != null && (span(file, p)?.from ?? 9999) <= 2008).slice(0, 8);
    const news = at.filter((p) => p.status === 'Active' && eraYear(file, p) != null).slice(0, 6);
    if (!olds.length || !news.length) continue;
    const old = sample(olds, 1)[0];
    const neu = sample(news, 1)[0];
    out.push({ old, neu, oldYear: eraYear(file, old), neuYear: eraYear(file, neu), oldSpan: spanText(file, old), neuSpan: spanText(file, neu), pos, roll: Math.random() });
    if (out.length >= 3) break;
  }
  return out;
};

/* ---- hometown ---- */
export const hometownScenes = (schools: SchoolFile[], players: Player[]): HometownData[] => {
  const keyed = byKey(players);
  return schools
    .map((school): HometownData | null => {
      const alumni = school.players
        .filter((r) => r[1] != null && keyed.has(r[0]))
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 5)
        .map((r) => keyed.get(r[0])!);
      return alumni.length >= 4 ? { school, players: alumni, roll: Math.random() } : null;
    })
    .filter((x): x is HometownData => !!x);
};
