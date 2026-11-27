import { Reveal, stag } from '@/components/motion/Reveal';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CalendarClock, HeartPulse, History, Scale, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/timeline/TeamLogo';
import { PlayerStrip } from '@/components/brand/ClubStrip';
import { PixelPanel, ScoreTile, SectionHeader } from '@/components/arcade';
import { findNFLTeam } from '@/utils/nflTeams';
import { gameHash, loadGameSeason, useGameIds, useSeasonGames, type GameDetail } from '@/utils/nflGames';
import { meetingsOf } from '@/utils/gameFinder';
import { pctText, usePlayoffOdds } from '@/utils/playoffOdds';
import { useThisSeasonAll } from '@/utils/thisSeason';
import { useInjuryList, type InjuryCode } from '@/utils/injuries';
import { displayName } from '@/utils/displayName';
import { keyOfPlayer } from '@/utils/playerSearch';
import { hslOf } from '../season/seasonGamesUi';
import { liftForDarkBg } from '@/utils/teamColors';
import { played, teamName } from './gameModel';
import './pregame.css';

/**
 * Pre-game view for a game not yet played: win chances from the posted line (playoff_odds.json, the Season page's
 * This week), implied team totals, tale of the tape from the season's played games, each club's leaders this season
 * (thisseason.json) and injury report (injuries.json), and the last meetings. Only data the site already loads.
 */
const norm = (a: string) => findNFLTeam(a)?.abbreviation ?? a;
const f1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : '0');

/** Standard normal CDF (Abramowitz-Stegun), for a win chance from a spread when the odds file lacks the game. */
const phi = (z: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
};

interface TapeData {
  w: number; l: number; t: number; gp: number; pf: number; pa: number;
  hw: number; hl: number; ht: number; aw: number; al: number; at: number;
  streak: string; last5: ('W' | 'L' | 'T')[];
}
const rec = (w: number, l: number, t: number) => (t ? `${w}-${l}-${t}` : `${w}-${l}`);

const tapeOf = (games: GameDetail[], club: string): TapeData => {
  const mine = games
    .filter((x) => x.type === 'REG' && played(x) && (norm(x.home) === club || norm(x.away) === club))
    .sort((a, b) => a.date.localeCompare(b.date) || a.week - b.week);
  const t: TapeData = { w: 0, l: 0, t: 0, gp: mine.length, pf: 0, pa: 0, hw: 0, hl: 0, ht: 0, aw: 0, al: 0, at: 0, streak: '–', last5: [] };
  const res: ('W' | 'L' | 'T')[] = [];
  for (const x of mine) {
    const home = norm(x.home) === club;
    const f = home ? x.homeScore! : x.awayScore!;
    const a = home ? x.awayScore! : x.homeScore!;
    t.pf += f; t.pa += a;
    const r = f > a ? 'W' : f < a ? 'L' : 'T';
    res.push(r);
    const k = r === 'W' ? 'w' : r === 'L' ? 'l' : 't';
    t[k] += 1;
    t[`${home ? 'h' : 'a'}${k}` as 'hw'] += 1;
  }
  t.last5 = res.slice(-5);
  if (res.length) {
    const last = res[res.length - 1];
    let n = 0;
    for (let i = res.length - 1; i >= 0 && res[i] === last; i--) n++;
    t.streak = `${last}${n}`;
  }
  return t;
};

/* ---------------- win chances ---------------- */

const WinChances = ({ g, pHome, line }: { g: GameDetail; pHome: number; line: number | undefined }) => {
  const away = norm(g.away);
  const home = norm(g.home);
  const pAway = 1 - pHome;
  const total = g.total;
  const impH = total !== undefined && line !== undefined ? (total + line) / 2 : undefined;
  const impA = total !== undefined && line !== undefined && impH !== undefined ? total - impH : undefined;
  const awayFav = pAway > pHome;
  return (
    <PixelPanel className="pg-win" pad="sm" style={{ ['--ca' as string]: `hsl(${hslOf(away)})`, ['--ch' as string]: `hsl(${hslOf(home)})` } as CSSProperties}>
      <Reveal className="pg-win__row">
        <span className={cn('pg-win__club mo-run-l', awayFav && 'is-fav')} style={stag(0)}><TeamLogo team={away} decorative className="h-8 w-8" /><b>{away}</b><em>{pctText(pAway)}</em></span>
        <span className="pg-win__vs mo-pop" style={stag(2)} aria-hidden>VS</span>
        <span className={cn('pg-win__club pg-win__club--h mo-run-r', !awayFav && 'is-fav')} style={stag(0)}><em>{pctText(pHome)}</em><b>{home}</b><TeamLogo team={home} decorative className="h-8 w-8" /></span>
      </Reveal>
      <Reveal className="pg-win__bar" role="img" aria-label={`${teamName(away)} ${pctText(pAway)}, ${teamName(home)} ${pctText(pHome)}`}>
        <i className="a mo-grow" style={{ width: `${pAway * 100}%`, ...stag(3) }} /><i className="h mo-grow mo-grow--r" style={{ width: `${pHome * 100}%`, ...stag(3) }} />
      </Reveal>
      <Reveal as="ul" className="pg-win__facts">
        {line !== undefined && <li className="mo-rise" style={stag(4)}><span>Spread</span><b>{line === 0 ? 'Pick' : `${line > 0 ? home : away} −${Math.abs(line)}`}</b></li>}
        {total !== undefined && <li className="mo-rise" style={stag(5)}><span>Over / under</span><b>{total}</b></li>}
        {impA !== undefined && impH !== undefined && <li className="mo-rise" style={stag(6)}><span>Implied score</span><b>{away} {f1(impA)} · {home} {f1(impH)}</b></li>}
      </Reveal>
    </PixelPanel>
  );
};

/* ---------------- tale of the tape ---------------- */

const Dots = ({ r }: { r: TapeData['last5'] }) => (
  <span className="pg-dots" aria-label={r.join(' ')}>{r.map((x, i) => <i key={i} data-r={x}>{x}</i>)}</span>
);

const rankOf = (vals: Record<string, number>, club: string, high: boolean) => {
  const mine = vals[club];
  return Object.values(vals).filter((x) => (high ? x > mine : x < mine)).length + 1;
};

const Tape = ({ g, away, home, tapes, power }: { g: GameDetail; away: string; home: string; tapes: Record<string, TapeData>; power: Record<string, number> | null }) => {
  const A = tapes[away];
  const H = tapes[home];
  const ppg = useMemo(() => Object.fromEntries(Object.entries(tapes).filter(([, t]) => t.gp).map(([c, t]) => [c, t.pf / t.gp])), [tapes]);
  const apg = useMemo(() => Object.fromEntries(Object.entries(tapes).filter(([, t]) => t.gp).map(([c, t]) => [c, t.pa / t.gp])), [tapes]);
  if (!A?.gp || !H?.gp) return null;
  type Row = { id: string; label: string; a: ReactNodeLike; h: ReactNodeLike; better?: 0 | 1 | null };
  type ReactNodeLike = string | JSX.Element;
  const cmp = (a: number, b: number, higher = true): 0 | 1 | null => (a === b ? null : (a > b) === higher ? 0 : 1);
  const ord = (n: number) => `#${n}`;
  const wp = (t: TapeData) => (t.w + t.t / 2) / Math.max(1, t.gp);
  const rows: Row[] = [
    { id: 'rec', label: 'Record', a: rec(A.w, A.l, A.t), h: rec(H.w, H.l, H.t), better: cmp(wp(A), wp(H)) },
    { id: 'split', label: 'Road / home', a: `${rec(A.aw, A.al, A.at)} away`, h: `${rec(H.hw, H.hl, H.ht)} home`, better: cmp(A.aw + A.at / 2 - (A.aw + A.al + A.at) * 0.5, H.hw + H.ht / 2 - (H.hw + H.hl + H.ht) * 0.5) },
    { id: 'ppg', label: 'Points / game', a: `${f1(+(A.pf / A.gp).toFixed(1))} (${ord(rankOf(ppg, away, true))})`, h: `${f1(+(H.pf / H.gp).toFixed(1))} (${ord(rankOf(ppg, home, true))})`, better: cmp(A.pf / A.gp, H.pf / H.gp) },
    { id: 'apg', label: 'Allowed / game', a: `${f1(+(A.pa / A.gp).toFixed(1))} (${ord(rankOf(apg, away, false))})`, h: `${f1(+(H.pa / H.gp).toFixed(1))} (${ord(rankOf(apg, home, false))})`, better: cmp(A.pa / A.gp, H.pa / H.gp, false) },
    { id: 'diff', label: 'Point diff', a: signed(A.pf - A.pa), h: signed(H.pf - H.pa), better: cmp(A.pf - A.pa, H.pf - H.pa) },
  ];
  if (power) rows.push({ id: 'pwr', label: 'Power rank', a: ord(rankOf(power, away, true)), h: ord(rankOf(power, home, true)), better: cmp(power[away], power[home]) });
  rows.push({ id: 'form', label: 'Last 5', a: <Dots r={A.last5} />, h: <Dots r={H.last5} />, better: null });
  rows.push({ id: 'str', label: 'Streak', a: A.streak, h: H.streak, better: null });
  return (
    <Reveal>
    <PixelPanel className="pg-tape" pad="sm" style={{ ['--ca' as string]: `hsl(${hslOf(away)})`, ['--ch' as string]: `hsl(${hslOf(home)})` } as CSSProperties}>
      <div className="pg-tape__head"><TeamLogo team={away} decorative className="h-7 w-7" /><span>{g.season}</span><TeamLogo team={home} decorative className="h-7 w-7" /></div>
      {rows.map((r, i) => (
        <div key={r.id} className="pg-tape__row mo-rise" style={stag(i)}>
          <span className={cn('pg-tape__v', r.better === 0 && 'is-better')}>{r.a}</span>
          <span className="pg-tape__l">{r.label}</span>
          <span className={cn('pg-tape__v pg-tape__v--h', r.better === 1 && 'is-better')}>{r.h}</span>
        </div>
      ))}
    </PixelPanel>
    </Reveal>
  );
};

/* ---------------- key players and injuries ---------------- */

const LEADS: { label: string; stat: string; pos: string[]; unit: string }[] = [
  { label: 'Passing', stat: 'Pass yds', pos: ['QB'], unit: 'yds' },
  { label: 'Rushing', stat: 'Rush yds', pos: ['RB', 'QB', 'WR'], unit: 'yds' },
  { label: 'Receiving', stat: 'Rec yds', pos: ['WR', 'TE', 'RB'], unit: 'yds' },
  { label: 'Sacks', stat: 'Sacks', pos: ['DL', 'LB', 'DB'], unit: 'sck' },
  { label: 'Interceptions', stat: 'INT', pos: ['DB', 'LB', 'DL'], unit: 'INT' },
];

interface Lead { label: string; key: string; value: number; unit: string; rank: number | null; of: number | null }

const leadsOf = (raw: NonNullable<ReturnType<typeof useThisSeasonAll>>, club: string): Lead[] => {
  const out: Lead[] = [];
  for (const L of LEADS) {
    let best: Lead | null = null;
    for (const [key, p] of Object.entries(raw.p)) {
      if (norm(p.c) !== club || !L.pos.includes(key.split(':')[0])) continue;
      const s = p.s.find((x) => x[0] === L.stat);
      if (!s || !(s[1] > 0)) continue;
      if (!best || s[1] > best.value) best = { label: L.label, key, value: s[1], unit: L.unit, rank: s[2], of: s[3] };
    }
    if (best) out.push(best);
  }
  return out;
};

const HURT: Record<InjuryCode, { label: string; ink: string; rank: number }> = {
  IR: { label: 'IR', ink: 'hsl(0 78% 62%)', rank: 3 },
  Out: { label: 'Out', ink: 'hsl(14 90% 58%)', rank: 0 },
  Doubtful: { label: 'Doubtful', ink: 'hsl(24 95% 58%)', rank: 1 },
  Questionable: { label: 'Questionable', ink: 'hsl(40 95% 58%)', rank: 2 },
};
const SHOWN_HURT = 5;

const PlayerRow = ({ k, club, right }: { k: string; club: string; right: JSX.Element }) => {
  const [pos, ...rest] = k.split(':');
  const name = rest.join(':');
  return (
    <div className="pg-pl">
      <span className="pg-pl__spr" aria-hidden><GameSprite player={{ name, position: pos, team: club, bannerTeam: club }} team={club} kind="bust" size="s" /></span>
      <PlayerStrip name={displayName(name)} position={pos} team={teamName(club)} size="sm" />
      {right}
    </div>
  );
};

const ClubPlayers = ({ club, raw, hurt }: { club: string; raw: ReturnType<typeof useThisSeasonAll>; hurt: { key: string; code: InjuryCode; part: string }[] }) => {
  const leads = useMemo(() => (raw ? leadsOf(raw, club) : []), [raw, club]);
  const [all, setAll] = useState(false);
  const shown = all ? hurt : hurt.slice(0, SHOWN_HURT);
  return (
    <PixelPanel className="pg-club" pad="sm" style={{ ['--tc' as string]: liftForDarkBg(hslOf(club)) } as CSSProperties}>
      <p className="pg-club__tag"><TeamLogo team={club} decorative className="h-5 w-5" /> {teamName(club)}</p>
      {leads.length > 0 && (
        <Reveal as="ul" className="pg-leads" aria-label={`${teamName(club)} leaders this season`}>
          {leads.map((l, i) => (
            <li key={l.label} className="pg-lead mo-rise" style={stag(i)}>
              <span className="pg-leads__k">{l.label}</span>
              <PlayerRow k={l.key} club={club} right={<span className="pg-leads__v"><b>{l.value.toLocaleString()}</b> {l.unit}{l.rank ? <small>#{l.rank}</small> : null}</span>} />
            </li>
          ))}
        </Reveal>
      )}
      <p className="pg-club__sub"><HeartPulse className="h-3.5 w-3.5" aria-hidden /> Injury report</p>
      {hurt.length === 0 ? <p className="pg-none">Nobody listed.</p> : (
        <ul className="pg-hurt">
          {shown.map((h) => (
            <li key={h.key} title={h.part || undefined}>
              <PlayerRow k={h.key} club={club} right={<span className="pg-tag" style={{ color: HURT[h.code].ink }}><i aria-hidden />{HURT[h.code].label}</span>} />
            </li>
          ))}
          {hurt.length > SHOWN_HURT && (
            <li><button type="button" className="pg-more" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `+${hurt.length - SHOWN_HURT} more`}</button></li>
          )}
        </ul>
      )}
    </PixelPanel>
  );
};

/* ---------------- head to head ---------------- */

const H2H = ({ g, away, home }: { g: GameDetail; away: string; home: string }) => {
  const ids = useGameIds(true);
  const [rows, setRows] = useState<GameDetail[] | null>(null);
  useEffect(() => {
    if (!ids) return;
    let live = true;
    const ms = meetingsOf(ids, away, home, 8).filter((m) => m.id !== g.id).slice(0, 5);
    void Promise.all(ms.map(async (m) => (await loadGameSeason(m.season))?.get(m.id))).then((r) => {
      if (live) setRows(r.filter((x): x is GameDetail => !!x && played(x)));
    });
    return () => { live = false; };
  }, [ids, away, home, g.id]);
  if (!rows) return null;
  if (!rows.length) return <p className="pg-none">No meetings on record.</p>;
  const wins = (c: string) => rows.filter((x) => { const h = norm(x.home) === c; return h ? x.homeScore! > x.awayScore! : x.awayScore! > x.homeScore!; }).length;
  return (
    <>
      <p className="pg-h2h__sum"><b>{away}</b> {wins(away)} · <b>{home}</b> {wins(home)}{rows.length - wins(away) - wins(home) ? ` · ${rows.length - wins(away) - wins(home)} tied` : ''}<span> in the last {rows.length}</span></p>
      <Reveal as="ul" className="pg-h2h">
        {rows.map((x, i) => (
          <li key={x.id} className="mo-rise" style={stag(i)}>
            <span className="pg-h2h__when">{x.type === 'REG' ? `${x.season} · Wk ${x.week}` : `${x.season} · ${x.type}`}</span>
            <ScoreTile away={{ club: x.away, score: x.awayScore }} home={{ club: x.home, score: x.homeScore }} onClick={() => { window.location.hash = gameHash(x.id); }} />
          </li>
        ))}
      </Reveal>
    </>
  );
};

/* ---------------- the view ---------------- */

const PreGame = ({ g }: { g: GameDetail }) => {
  const away = norm(g.away);
  const home = norm(g.home);
  const odds = usePlayoffOdds(true);
  const season = useSeasonGames(g.season);
  const raw = useThisSeasonAll();
  const inj = useInjuryList();
  const { getAllPlayers } = useLeague();

  const pick = odds?.picks.games.find((x) => x.week === g.week && norm(x.away) === away && norm(x.home) === home);
  const line = pick?.line ?? g.spread;
  const pHome = pick?.pHome ?? (line !== undefined ? phi(line / 13.45) : undefined);

  const tapes = useMemo(() => {
    const m: Record<string, TapeData> = {};
    if (season) for (const c of [away, home]) m[c] = tapeOf(season, c);
    // every club, for the offense / defense ranks
    if (season) {
      const clubs = new Set<string>();
      season.forEach((x) => { clubs.add(norm(x.away)); clubs.add(norm(x.home)); });
      clubs.forEach((c) => { if (!m[c]) m[c] = tapeOf(season, c); });
    }
    return m;
  }, [season, away, home]);
  const power = useMemo(() => (odds ? Object.fromEntries(Object.entries(odds.clubs).map(([c, o]) => [norm(c), o.rating])) : null), [odds]);

  const hurtBy = useMemo(() => {
    const by: Record<string, { key: string; code: InjuryCode; part: string; legacy: number }[]> = { [away]: [], [home]: [] };
    if (!inj) return by;
    const byKey = new Map(getAllPlayers().map((p) => [keyOfPlayer(p), p]));
    for (const e of inj.entries) {
      const p = byKey.get(e.key);
      const c = p?.team ? norm(p.team) : '';
      if (p && by[c]) by[c].push({ ...e, legacy: p.careerLegacy ?? 0 });
    }
    for (const c of Object.keys(by)) by[c].sort((a, b) => HURT[a.code].rank - HURT[b.code].rank || b.legacy - a.legacy || a.key.localeCompare(b.key));
    return by;
  }, [inj, getAllPlayers, away, home]);

  return (
    <>
      {pHome !== undefined && (
        <section aria-labelledby="pg-win-h" className="space-y-3">
          <SectionHeader title={<span id="pg-win-h" className="gm-sech"><Scale className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> Win chances</span>} kicker="From the betting line" />
          <WinChances g={g} pHome={pHome} line={line} />
        </section>
      )}
      <div className="pg-duo">
        {season && tapes[away]?.gp > 0 && tapes[home]?.gp > 0 && (
          <section aria-labelledby="pg-tape-h" className="space-y-3 pg-duo__a">
            <SectionHeader title={<span id="pg-tape-h" className="gm-sech"><Star className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> Tale of the tape</span>} kicker={`${g.season} season so far`} />
            <Tape g={g} away={away} home={home} tapes={tapes} power={power} />
          </section>
        )}
        <section aria-labelledby="pg-h2h-h" className="space-y-3 pg-duo__b">
          <SectionHeader title={<span id="pg-h2h-h" className="gm-sech"><History className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> Head to head</span>} kicker="Last five meetings" />
          <H2H g={g} away={away} home={home} />
        </section>
      </div>
      <section aria-labelledby="pg-key-h" className="space-y-3">
        <SectionHeader title={<span id="pg-key-h" className="gm-sech"><CalendarClock className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> Key players</span>} kicker="Leaders this season and who is hurt" />
        <Reveal className="pg-clubs">
          <div className="mo-run-l min-w-0"><ClubPlayers club={away} raw={raw} hurt={hurtBy[away]} /></div>
          <div className="mo-run-r min-w-0" style={stag(1)}><ClubPlayers club={home} raw={raw} hurt={hurtBy[home]} /></div>
        </Reveal>
      </section>
      <p className="pg-note">The box score, rosters and advanced stats appear here once the game is final.</p>
    </>
  );
};

export default PreGame;
