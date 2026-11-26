import type { Player } from '@/types/player';
import type { MarketHistory } from '@/utils/cardMarket';
import type { InjuryCode } from '@/utils/injuries';
import { findNFLTeam } from '@/utils/nflTeams';
import { RULES, avg, fmtDate, fmtN, abbrOf, streaksOf, teamOf, type Game } from '@/components/stats/gamelog/gameLogModel';
import type { Pnews, Upcoming } from '@/utils/playerNews';

/**
 * The Deep Dive News section's analysis cards: rules over our own data (his game log, pnews.json, the injury report, the
 * market history, the schedule), no AI and nothing invented. Every card names its numbers and its source.
 */
export interface RuleRow {
  label: string;
  value: string;
  /** up / down against the comparison, or neutral */
  tone?: 'up' | 'down';
}
export interface RuleCard {
  id: string;
  kind: 'game' | 'trend' | 'milestone' | 'injury' | 'market' | 'fantasy' | 'high' | 'season' | 'honours' | 'streak';
  kicker: string;
  title: string;
  big?: string;
  bigLabel?: string;
  tone?: 'up' | 'down';
  lines: string[];
  rows?: RuleRow[];
  source: string;
  /** The game's page on the site, when the card is about one game */
  gameId?: string;
}

const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtN(Math.abs(v), d)}`;
const tone = (v: number, eps = 0.05): 'up' | 'down' | undefined => (v > eps ? 'up' : v < -eps ? 'down' : undefined);
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const num = (v: number) => v.toLocaleString('en-US');

export const keyLabelOf = (pos: Player['position']) => RULES[pos].keyLabel;
export const gameIdOf = (g: Game) => String(g.r.game ?? '');

/** Regular-season games of the latest season on file, oldest first */
export const currentSeason = (games: Game[]): Game[] => {
  const s = Math.max(0, ...games.map((g) => g.season));
  return games.filter((g) => g.season === s && !g.post);
};

/** One game: his line, and the key stat against his average in the season's other games. */
export const gameLineCard = (g: Game, all: Game[], pos: Player['position']): RuleCard | null => {
  const rule = RULES[pos];
  if (!rule.hasLine) return null;
  const others = all.filter((x) => x.season === g.season && x.post === g.post && x.i !== g.i);
  if (others.length < 3) return null;
  const base = avg(others.map((x) => x.key));
  const diff = g.key - base;
  const line = rule.line.map((c) => `${c.fmt ? c.fmt(g.r) : String(c.get(g.r))} ${c.label}`).join(' · ');
  const opp = teamOf(g.opp)?.name ?? abbrOf(g.opp);
  return {
    id: `game-${g.i}`,
    kind: 'game',
    kicker: `${g.post ? g.round : `Week ${g.week}`} ${g.home ? 'vs' : 'at'} ${opp}`,
    title: 'His line in that game',
    big: signed(diff),
    bigLabel: `${rule.keyShort} vs his average`,
    tone: tone(diff),
    lines: [
      line,
      `${fmtN(g.key)} ${rule.keyShort} against ${fmtN(base)} a game in his other ${others.length} ${g.season} games.`,
    ],
    source: `Game log, ${fmtDate(g.date)}`,
    gameId: gameIdOf(g),
  };
};

/** Last three games against the season and his career. */
export const trendCard = (all: Game[], pos: Player['position']): RuleCard | null => {
  const rule = RULES[pos];
  if (!rule.hasLine) return null;
  const cur = currentSeason(all);
  if (cur.length < 4) return null;
  const last3 = cur.slice(-3);
  const col = rule.splitCols[0];
  const rows: RuleRow[] = [];
  const k3 = avg(last3.map((g) => g.key));
  const kS = avg(cur.map((g) => g.key));
  const kC = avg(all.filter((g) => !g.post).map((g) => g.key));
  rows.push({ label: `${rule.keyShort}, last 3`, value: fmtN(k3), tone: tone(k3 - kS) });
  rows.push({ label: `${rule.keyShort}, season`, value: fmtN(kS) });
  rows.push({ label: `${rule.keyShort}, career`, value: fmtN(kC), tone: tone(kS - kC) });
  if (col) {
    const c3 = avg(last3.map((g) => col.get(g.r)));
    const cS = avg(cur.map((g) => col.get(g.r)));
    rows.push({ label: `${col.label}, last 3 / season`, value: `${fmtN(c3)} / ${fmtN(cS)}`, tone: tone(c3 - cS, 0.5) });
  }
  const diff = k3 - kS;
  return {
    id: 'trend',
    kind: 'trend',
    kicker: 'Form',
    title: diff >= 0 ? 'Running hot' : 'Cooling off',
    big: signed(diff),
    bigLabel: `${rule.keyShort} per game, last 3 vs season`,
    tone: tone(diff),
    lines: [`Weeks ${last3.map((g) => g.week).join(', ')} against ${cur.length} games this season and his career average of ${fmtN(kC)}.`],
    rows,
    source: 'Game log (regular season)',
  };
};

export const milestoneCard = (pn: Pnews | null, key: string): RuleCard | null => {
  const ms = pn?.m[key];
  if (!ms?.length) return null;
  const [label, have, target, pace, togo] = ms[0];
  return {
    id: 'milestone',
    kind: 'milestone',
    kicker: 'Milestones in reach',
    title: `${num(target)} ${label}`,
    big: num(target - have),
    bigLabel: `${label} to go`,
    lines: [`${num(have)} so far; about ${fmtN(Math.ceil(togo * 10) / 10)} games at his recent ${fmtN(pace)} a game.`],
    rows: ms.map(([l, h, t, p, g]) => ({ label: `${num(t)} ${l}`, value: `${num(t - h)} to go · ~${fmtN(Math.ceil(g * 10) / 10)} g` })),
    source: 'Career totals, last 17 games (pnews.json)',
  };
};

export const injuryCard = (inj: { code: InjuryCode; part: string; week: number } | undefined, active: boolean, week: number | undefined): RuleCard | null => {
  if (inj) {
    return {
      id: 'injury',
      kind: 'injury',
      kicker: 'Injury report',
      title: inj.code === 'IR' ? 'On injured reserve' : inj.code,
      big: inj.code,
      bigLabel: inj.code === 'IR' ? 'club reserve list' : `Week ${inj.week} report`,
      tone: 'down',
      lines: [inj.part ? `Listed with ${inj.part}.` : 'No detail given.'],
      source: 'injuries.json (nflverse report, roster status)',
    };
  }
  if (!active || !week) return null;
  return { id: 'injury', kind: 'injury', kicker: 'Injury report', title: 'Not listed', big: 'Clear', bigLabel: `Week ${week} report`, tone: 'up', lines: ['Not on the latest injury report or his club’s reserve list.'], source: 'injuries.json' };
};

/** His card's rating path: CAR at the last season ends, and now. */
export const marketCard = (market: MarketHistory | null, key: string): RuleCard | null => {
  if (!market?.length) return null;
  const pts = market.map((s) => ({ s, p: s.players[key] })).filter((x) => x.p);
  if (pts.length < 2) return null;
  const now = pts[pts.length - 1];
  const ends = pts.filter((x) => x.s.id.startsWith('season-')).slice(-3);
  if (!ends.length) return null;
  const prev = ends[ends.length - 1];
  const dOvr = now.p.ovr - prev.p.ovr;
  const pct = prev.p.value > 0 ? ((now.p.value - prev.p.value) / prev.p.value) * 100 : 0;
  const rows: RuleRow[] = [
    ...ends.map((x) => ({ label: `OVR, ${x.s.id.slice(7)} end`, value: String(x.p.ovr) })),
    { label: 'OVR, now', value: String(now.p.ovr), tone: tone(dOvr, 0.4) },
  ];
  if (now.p.szn != null) rows.push({ label: 'SZN, this season', value: String(now.p.szn) });
  return {
    id: 'market',
    kind: 'market',
    kicker: 'Card market',
    title: dOvr > 0 ? 'Rating climbing' : dOvr < 0 ? 'Rating slipping' : 'Rating steady',
    big: signed(dOvr, 0),
    bigLabel: `OVR since ${prev.s.id.slice(7)} ended`,
    tone: tone(dOvr, 0.4),
    lines: [`Card value ${num(now.p.value)} coins${(now.s as { rebase?: boolean }).rebase ? '' : `, ${signed(pct, 1)}% on the ${prev.s.id.slice(7)} season end`}${now.p.grade ? `; skill grade ${now.p.grade}` : ''}.`],
    rows,
    source: 'market.json season-end snapshots',
  };
};

export interface NextMatch {
  week: number;
  date: string;
  time: string;
  home: boolean;
  opp: string;
  oppAbbr: string;
}
/** His club's next game from the schedule (upcoming.json), else null (a bye week or the season is over). */
export const nextMatch = (up: Upcoming[], club: string): NextMatch | null => {
  const abbr = findNFLTeam(club)?.abbreviation;
  if (!abbr) return null;
  const g = up.find((x) => x.home === abbr || x.away === abbr);
  if (!g) return null;
  const home = g.home === abbr;
  const oppAbbr = home ? g.away : g.home;
  return { week: g.week, date: g.date, time: g.time, home, opp: findNFLTeam(oppAbbr)?.name ?? oppAbbr, oppAbbr };
};

export const fantasyCard = (
  pn: Pnews | null,
  key: string,
  pos: Player['position'],
  next: NextMatch | null,
  espn: { positionRank?: string; percentOwned?: string; last7Days?: string } | null | undefined,
): RuleCard | null => {
  const r = pn?.ppr[key];
  if (!pn || !r || !['QB', 'RB', 'WR', 'TE'].includes(pos)) return null;
  const [rank, tot, g, ppg] = r;
  const lines = [`${fmtN(tot)} PPR points in ${g} games this season, ${fmtN(ppg)} a game.`];
  const rows: RuleRow[] = [{ label: `${pos} rank, PPR total`, value: `${pos}${rank}` }, { label: 'Per game', value: fmtN(ppg) }];
  if (next) {
    const v = pn.vs[pos]?.[next.oppAbbr];
    if (v) {
      const [vr, factor] = v;
      const soft = vr <= 10 ? 'a soft matchup' : vr > pn.teams - 10 ? 'a tough matchup' : 'a middling matchup';
      lines.push(`Next: ${next.home ? 'vs' : 'at'} the ${next.opp} (week ${next.week}), whose defence ranks ${ord(vr)} of ${pn.teams} against ${pos}s, ${soft}.`);
      rows.push({ label: `${next.oppAbbr} defence vs ${pos}`, value: `${ord(vr)} of ${pn.teams}`, tone: vr <= 10 ? 'up' : vr > pn.teams - 10 ? 'down' : undefined });
      rows.push({ label: 'Points allowed vs league', value: `${fmtN(factor * 100, 0)}%` });
    }
  }
  if (espn?.percentOwned) rows.push({ label: 'ESPN fantasy, owned', value: `${fmtN(Number(espn.percentOwned), 1)}%` });
  return {
    id: 'fantasy',
    kind: 'fantasy',
    kicker: 'Fantasy outlook',
    title: `${pos}${rank} in PPR`,
    big: `${pos}${rank}`,
    bigLabel: 'PPR rank this season',
    lines,
    rows,
    source: 'Game logs; defence factor from the last 8 games (lab.json); schedule',
  };
};

// ---------- the archive (retired players with no news) ----------

export const archiveCards = (player: Player, all: Game[]): RuleCard[] => {
  const out: RuleCard[] = [];
  const pos = player.position;
  const rule = RULES[pos];
  if (rule.hasLine && all.length >= 3) {
    const best = [...all].sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 3);
    out.push({
      id: 'highs',
      kind: 'high',
      kicker: 'Career highs',
      title: `His best games by ${rule.keyShort}`,
      big: fmtN(best[0].score),
      bigLabel: `${rule.keyShort}, ${best[0].season} ${best[0].post ? best[0].round : `week ${best[0].week}`}`,
      tone: 'up',
      lines: [`Best of ${all.length} games on file (1999 on), with the line: ${rule.line.map((c) => `${c.fmt ? c.fmt(best[0].r) : c.get(best[0].r)} ${c.label}`).join(' · ')}.`],
      rows: best.map((g) => ({ label: `${g.season} ${g.post ? g.round : `wk ${g.week}`} ${g.home ? 'vs' : 'at'} ${abbrOf(g.opp)}`, value: `${fmtN(g.score)} ${rule.keyShort}` })),
      source: 'Game log',
      gameId: gameIdOf(best[0]),
    });
    const bySeason = new Map<number, Game[]>();
    all.filter((g) => !g.post).forEach((g) => bySeason.set(g.season, [...(bySeason.get(g.season) ?? []), g]));
    const seasons = [...bySeason.entries()].map(([s, gs]) => ({ s, tot: gs.reduce((a, g) => a + g.key, 0), n: gs.length })).sort((a, b) => b.tot - a.tot);
    if (seasons.length >= 2) {
      const b = seasons[0];
      out.push({
        id: 'bestseason',
        kind: 'season',
        kicker: 'Best season',
        title: `${b.s}`,
        big: fmtN(b.tot, 0),
        bigLabel: `${rule.keyShort} in ${b.n} games`,
        tone: 'up',
        lines: [`${fmtN(b.tot / b.n)} a game, the top of ${seasons.length} seasons on file.`],
        rows: seasons.slice(0, 3).map((x) => ({ label: String(x.s), value: `${fmtN(x.tot, 0)} ${rule.keyShort} · ${x.n} g` })),
        source: 'Game log, regular season',
      });
    }
  }
  const honours: RuleRow[] = [
    ['Rings', player.rings], ['MVP', player.mvp], [pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE' || pos === 'OL' || pos === 'K' ? 'OPOY' : 'DPOY', player.opoy], ['Super Bowl MVP', player.sbmvp], ['Rookie of the Year', player.roty],
  ].filter(([, v]) => (v as number) > 0).map(([l, v]) => ({ label: String(l), value: String(v) }));
  if (honours.length) {
    out.push({
      id: 'honours',
      kind: 'honours',
      kicker: 'Honours',
      title: 'What he won',
      big: String(honours.reduce((a, h) => a + Number(h.value), 0)),
      bigLabel: 'titles and awards',
      tone: 'up',
      lines: [`${player.games} career games.`],
      rows: honours,
      source: 'Career card (players.json)',
    });
  }
  if (rule.hasLine && all.length >= 20) {
    const s = streaksOf(all, rule.streaks).sort((a, b) => b.best - a.best)[0];
    if (s && s.best >= 3) {
      out.push({
        id: 'streak',
        kind: 'streak',
        kicker: 'Longest streak',
        title: s.label,
        big: String(s.best),
        bigLabel: 'games in a row',
        lines: [s.bestFrom && s.bestTo ? `From ${fmtDate(s.bestFrom.date)} to ${fmtDate(s.bestTo.date)}.` : ''].filter(Boolean),
        source: 'Game log',
      });
    }
  }
  return out;
};
