import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn, liftForDarkBg } from '@/utils/teamColors';
import type { SuperBowlEntry } from '@/utils/leagueContent';
import { loadScheduleSeason } from '@/utils/schedule';
import { lastGameIdOf, openGame, useGameDetail, useGameIds, useSuperBowlIds } from '@/utils/nflGames';
import { fmtDate, starsOf } from '@/components/game/gameModel';
import { teamKeyFor, POWER_WEIGHTS, type FranchiseRecord, type TeamSummary } from '../teamStats';
import StripRail from './StripRail';
import '@/components/game/game.css';

/**
 * NFL Teams page, the two long bars: the Super Bowl timeline (one tile per season, the champion's colours, score and
 * how strong that club was) and the team strength and titles strip (every franchise as a column, metric chips; pick a
 * club for its power season by season). Both scroll sideways (StripRail); hovering a season shows a mini preview of
 * its game and a click opens the Game page (components/game).
 */

/* ---------------- hover preview ---------------- */

interface Pop {
  rect: DOMRect;
  node: ReactNode;
}
const usePop = () => {
  const [pop, setPop] = useState<Pop | null>(null);
  const timer = useRef<number | undefined>();
  const hide = () => {
    window.clearTimeout(timer.current);
    setPop(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const bind = (node: ReactNode) => ({
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.currentTarget;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPop({ rect: el.getBoundingClientRect(), node }), 140);
    },
    onPointerLeave: hide,
    onBlur: hide,
  });
  const el = pop ? <PopBox pop={pop} /> : null;
  return { bind, el, hide };
};
const PopBox = ({ pop }: { pop: Pop }) => {
  const W = 290;
  const left = Math.min(Math.max(8, pop.rect.left + pop.rect.width / 2 - W / 2), window.innerWidth - W - 8);
  const below = pop.rect.bottom + 250 < window.innerHeight;
  return (
    <div className="ts-pop" role="tooltip" style={{ left, top: below ? pop.rect.bottom + 8 : pop.rect.top - 8, transform: below ? undefined : 'translateY(-100%)' }}>
      {pop.node}
    </div>
  );
};

const GamePreview = ({ id, kicker, fallback }: { id: string; kicker: string; fallback?: ReactNode }) => {
  const g = useGameDetail(id);
  const star = g ? starsOf(g).ball : null;
  const done = g && g.awayScore !== undefined;
  return (
    <>
      <p className="ts-pop__kick">{kicker}</p>
      {g ? (
        <>
          <div className="ts-pop__score">
            <span className="ts-pop__team"><TeamLogo team={g.away} decorative className="h-9 w-9" />{g.away}</span>
            <span className="ts-pop__n">{done ? <><b style={{ opacity: g.awayScore! >= g.homeScore! ? 1 : 0.5 }}>{g.awayScore}</b> – <b style={{ opacity: g.homeScore! >= g.awayScore! ? 1 : 0.5 }}>{g.homeScore}</b></> : 'vs'}</span>
            <span className="ts-pop__team"><TeamLogo team={g.home} decorative className="h-9 w-9" />{g.home}</span>
          </div>
          <p className="ts-pop__row"><span>{fmtDate(g.date)}</span><span>{g.stadium}</span></p>
          {(g.temp !== undefined || g.roof) && <p className="ts-pop__row"><span>Conditions</span><span>{[g.roof === 'outdoors' ? null : g.roof, g.temp !== undefined ? `${Math.round(g.temp)}°F` : null, g.wind ? `${Math.round(g.wind)} mph wind` : null].filter(Boolean).join(' · ') || 'Outdoors'}</span></p>}
          {g.awayQb && g.homeQb && <p className="ts-pop__row"><span>QBs</span><span>{g.awayQb} / {g.homeQb}</span></p>}
          {star && <p className="ts-pop__row"><span>Game ball</span><span>{star.player.name}</span></p>}
          {star && star.line && <p className="ts-pop__row"><span /><span>{star.line}</span></p>}
          {!done && g.spread !== undefined && <p className="ts-pop__row"><span>Line</span><span>{g.spread}</span></p>}
        </>
      ) : (
        fallback ?? <p className="ts-pop__row"><span>{g === null ? 'Game not in the data' : 'Loading the game…'}</span><span /></p>
      )}
      <p className="ts-pop__go">Click to open the game page</p>
    </>
  );
};

/* ---------------- power by season (schedule files, lazy) ---------------- */

type PowerMap = Map<number, Map<string, number>>;
/** Every season's power scores by club name, loaded together once the strip mounts. */
const useSeasonPower = (years: number[]): PowerMap | null => {
  const [map, setMap] = useState<PowerMap | null>(null);
  const key = years.join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(years.map((y) => loadScheduleSeason(String(y)))).then((all) => {
      if (!live) return;
      const m: PowerMap = new Map();
      all.forEach((s, i) => {
        if (!s) return;
        m.set(years[i], new Map(s.table.flatMap((r) => [[r.team, r.powerScore] as const, [r.abbr, r.powerScore] as const])));
      });
      setMap(m);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
};

/* ---------------- Super Bowl timeline ---------------- */

interface SbStripProps {
  superBowls: SuperBowlEntry[];
  openable: Set<string>;
  onOpen: (key: string) => void;
  highlight: string | null;
  onHighlight: (key: string | null) => void;
}
export const SuperBowlStrip = ({ superBowls, highlight, onHighlight }: SbStripProps) => {
  const list = useMemo(() => [...superBowls].filter((s) => s.winner).sort((a, b) => a.year - b.year), [superBowls]);
  const ids = useSuperBowlIds();
  const power = useSeasonPower(useMemo(() => list.map((s) => s.year), [list]));
  const { bind, el, hide } = usePop();
  const first = list[0]?.year;
  const last = list.at(-1)?.year;
  const wins = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((s) => m.set(s.winner!, (m.get(s.winner!) ?? 0) + 1));
    return m;
  }, [list]);
  const best = [...wins.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <section className="ts" aria-labelledby="sb-strip-h">
      <div className="ts__head">
        <div className="min-w-0">
          <p className="font-pixel text-[9px] uppercase text-gold">Super Bowl timeline</p>
          <h2 id="sb-strip-h" className="font-display text-2xl font-extrabold italic uppercase leading-none sm:text-3xl">
            {list.length} champions, {first}–{last}
          </h2>
        </div>
        {best && <p className="text-xs text-muted-foreground">Most titles in the span: <b className="text-foreground">{best[0]}</b> ({best[1]}). Hover a season for its game, click to open it.</p>}
      </div>
      <StripRail label="Super Bowl champions by season, scroll sideways" start="end">
        {list.map((sb) => {
          const t = findNFLTeam(sb.winner);
          const key = teamKeyFor(sb.winner);
          const id = ids?.[String(sb.year)];
          const pw = power?.get(sb.year)?.get(sb.winner!);
          const dim = highlight != null && highlight !== key;
          const fg = t ? getReadableTextOn(t.primaryColor) : '#fff';
          const label = `${sb.year}, Super Bowl ${sb.roman}: ${t?.fullName ?? sb.winner} beat the ${sb.loser} ${sb.score}`;
          return (
            <button
              key={sb.year}
              type="button"
              className={cn('ts-sb', dim && 'is-dim')}
              aria-label={`${label}. Open the game`}
              disabled={!id}
              onClick={() => id && (hide(), openGame(id))}
              onFocus={() => onHighlight(key)}
              onMouseEnter={() => onHighlight(key)}
              onMouseLeave={() => onHighlight(null)}
              {...(id ? bind(<GamePreview id={id} kicker={`Super Bowl ${sb.roman} · ${sb.year} season`} />) : {})}
            >
              <span className="ts-sb__yr">{sb.year}</span>
              <span className="ts-sb__tile" style={{ ['--tc' as string]: t?.primaryColor ?? '225 30% 30%', color: fg }}>
                <span className="ts-sb__roman">{sb.roman}</span>
                <TeamLogo team={sb.winner} decorative className="h-9 w-9 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]" />
                <span className="ts-sb__score">{sb.score}</span>
              </span>
              <span className="ts-sb__vs">over {findNFLTeam(sb.loser)?.abbreviation ?? sb.loser}</span>
              <span className="ts-sb__pow" style={{ ['--tc' as string]: t?.primaryColor ?? '225 30% 30%' }} title={pw !== undefined ? `${t?.name} power score that season: ${pw.toFixed(1)}` : undefined}>
                {pw !== undefined && <i style={{ height: `${Math.max(6, Math.min(100, pw))}%` }} />}
                {pw !== undefined && <b>{Math.round(pw)}</b>}
              </span>
            </button>
          );
        })}
      </StripRail>
      <p className="ts-key">
        <span><Trophy className="mr-1 inline h-3 w-3 text-gold" aria-hidden />Tile: the champion, the score and the runner-up</span>
        <span>Bar under it: the champion's power score that season (100 × win % + 1.5 × point differential per game + 40 × schedule strength)</span>
      </p>
      {el}
    </section>
  );
};

/* ---------------- team strength and titles ---------------- */

export type StripMetric = 'power' | 'titles' | 'hof' | 'legacy' | 'ovr';
const METRICS: { key: StripMetric; label: string; unit: string }[] = [
  { key: 'power', label: 'Power', unit: 'all-time power score' },
  { key: 'titles', label: 'Titles', unit: 'Super Bowl titles' },
  { key: 'hof', label: 'HOF', unit: 'Hall of Famers' },
  { key: 'legacy', label: 'Legacy', unit: 'combined Career Legacy' },
  { key: 'ovr', label: 'Best OVR', unit: 'best player OVR' },
];
const valueOf = (r: FranchiseRecord | undefined, m: StripMetric): number => {
  if (!r) return 0;
  switch (m) {
    case 'titles': return r.titles;
    case 'hof': return r.hof.length;
    case 'legacy': return r.legacy;
    case 'ovr': return r.bestOvr ?? 0;
    default: return r.power;
  }
};
const fmt = (n: number, m: StripMetric) => (m === 'legacy' && n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n.toLocaleString());

interface StrengthProps {
  teams: TeamSummary[];
  records: Map<string, FranchiseRecord>;
  superBowls: SuperBowlEntry[];
  onOpen: (key: string) => void;
  highlight: string | null;
  onHighlight: (key: string | null) => void;
}
export const StrengthStrip = ({ teams, records, superBowls, onOpen, highlight, onHighlight }: StrengthProps) => {
  const [metric, setMetric] = useState<StripMetric>('power');
  const [pick, setPick] = useState<string | null>(null);
  const meta = METRICS.find((m) => m.key === metric)!;
  const rows = useMemo(
    () => teams.filter((t) => t.team).map((t) => ({ t, v: valueOf(records.get(t.key), metric) })).sort((a, b) => b.v - a.v || (records.get(a.t.key)?.powerRank ?? 99) - (records.get(b.t.key)?.powerRank ?? 99)),
    [teams, records, metric],
  );
  const max = Math.max(1, ...rows.map((r) => r.v));
  const floor = metric === 'ovr' ? Math.max(0, Math.min(...rows.filter((r) => r.v > 0).map((r) => r.v)) - 8) : 0;
  const picked = rows.find((r) => r.t.key === pick)?.t ?? null;
  const years = useMemo(() => [...new Set(superBowls.map((s) => s.year))].sort((a, b) => a - b), [superBowls]);
  const seasonYears = useMemo(() => (years.length ? Array.from({ length: years.at(-1)! - years[0] + 1 }, (_, i) => years[0] + i) : []), [years]);
  const power = useSeasonPower(picked ? seasonYears : []);
  const ids = useGameIds(!!picked);
  const { bind, el, hide } = usePop();
  const top = rows[0];
  const takeaway = top && top.v > 0 ? `The ${top.t.team?.name} lead on ${meta.unit} (${fmt(top.v, metric)})${rows[1] ? `, ahead of the ${rows[1].t.team?.name} (${fmt(rows[1].v, metric)})` : ''}.` : '';

  return (
    <section className="ts" aria-labelledby="strength-strip-h">
      <div className="ts__head">
        <div className="min-w-0">
          <p className="font-pixel text-[9px] uppercase text-gold">Team strength and titles</p>
          <h2 id="strength-strip-h" className="font-display text-2xl font-extrabold italic uppercase leading-none sm:text-3xl">Who runs the league</h2>
        </div>
        <div role="group" aria-label="Rank by" className="flex max-w-full gap-1 overflow-x-auto scrollbar-none rounded-lg bg-secondary/50 p-1">
          {METRICS.map((m) => (
            <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)} className={cn('tap-40 shrink-0 rounded-md px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide transition-colors', metric === m.key ? 'bg-gold text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 px-3.5 text-xs text-muted-foreground">
        {takeaway} {metric === 'power' ? `All-time power blends titles (${POWER_WEIGHTS.titles * 100}%), Hall of Famers (${POWER_WEIGHTS.hof * 100}%), combined Career Legacy (${POWER_WEIGHTS.legacy * 100}%) and the best OVR (${POWER_WEIGHTS.ovr * 100}%).` : `Ranked by ${meta.unit}.`} Pick a club to see its power season by season.
      </p>
      <StripRail key={rows.map((r) => r.t.key).join()} label={`Franchises by ${meta.unit}, scroll sideways`} pickKey={metric}>
        {rows.map(({ t, v }, i) => {
          const rec = records.get(t.key);
          const pct = v <= 0 ? 0 : Math.max(3, ((v - floor) / Math.max(1, max - floor)) * 100);
          const dim = highlight != null && highlight !== t.key;
          const prime = t.team?.primaryColor ?? '226 33% 40%';
          return (
            <button
              key={t.key}
              type="button"
              className={cn('ts-col', dim && 'is-dim', pick === t.key && 'is-pick')}
              aria-pressed={pick === t.key}
              aria-label={`${i + 1}. ${t.label}: ${fmt(v, metric)} ${meta.unit}${rec ? `, ${rec.titles} titles` : ''}. ${pick === t.key ? 'Selected' : 'Show its seasons'}`}
              onClick={() => (hide(), setPick(pick === t.key ? null : t.key))}
              onMouseEnter={() => onHighlight(t.key)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(t.key)}
              {...bind(
                <>
                  <p className="ts-pop__kick">#{i + 1} · {meta.unit}</p>
                  <div className="my-2 flex items-center gap-2"><TeamLogo team={t.team?.abbreviation} decorative className="h-9 w-9" /><span className="font-display text-xl font-extrabold uppercase">{t.label}</span></div>
                  <p className="ts-pop__row"><span>Super Bowl titles</span><span>{rec?.titles ?? 0}</span></p>
                  <p className="ts-pop__row"><span>Hall of Famers</span><span>{rec?.hof.length ?? 0}</span></p>
                  <p className="ts-pop__row"><span>Best OVR</span><span>{rec?.bestOvr ?? '–'}</span></p>
                  <p className="ts-pop__go">Click for its seasons</p>
                </>,
              )}
            >
              <span className="ts-col__rank">{i + 1}</span>
              <span className="ts-col__plot" style={{ ['--tc' as string]: prime, ['--tcl' as string]: liftForDarkBg(prime, 48) }}>
                <span className="ts-col__v" style={{ bottom: `${pct}%` }}>{fmt(v, metric)}</span>
                <span className="ts-col__bar" style={{ height: `${pct}%` }} />
              </span>
              <TeamLogo team={t.team?.abbreviation} decorative className="h-9 w-9" />
              <span className="ts-col__pips" aria-hidden>{rec && rec.titles > 0 ? (rec.titles <= 4 ? '★'.repeat(rec.titles) : `★${rec.titles}`) : ''}</span>
            </button>
          );
        })}
      </StripRail>
      {picked && (
        <div className="ts-seasons">
          <ClubSeasons key={picked.key} team={picked} years={seasonYears} power={power} ids={ids} superBowls={superBowls} onOpenTeam={() => onOpen(picked.key)} />
        </div>
      )}
      {el}
    </section>
  );
};

const ClubSeasons = ({ team, years, power, ids, superBowls, onOpenTeam }: { team: TeamSummary; years: number[]; power: PowerMap | null; ids: ReturnType<typeof useGameIds>; superBowls: SuperBowlEntry[]; onOpenTeam: () => void }) => {
  const t = team.team!;
  const { bind, el, hide } = usePop();
  const sbIds = useSuperBowlIds();
  const prime = t.primaryColor;
  const won = new Set(superBowls.filter((s) => findNFLTeam(s.winner)?.id === t.id).map((s) => s.year));
  const lost = new Set(superBowls.filter((s) => findNFLTeam(s.loser)?.id === t.id).map((s) => s.year));
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-lg font-extrabold uppercase"><TeamLogo team={t.abbreviation} decorative className="h-7 w-7" /> {t.fullName} by season <span className="font-pixel text-[9px] font-normal text-muted-foreground">power score · gold = title · outlined = Super Bowl</span></p>
        <button type="button" onClick={onOpenTeam} className="rounded-md border border-border px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide text-muted-foreground hover:border-gold hover:text-gold">Open team page</button>
      </div>
      <StripRail label={`${t.fullName} power by season, scroll sideways`} start="end">
        {years.map((y) => {
          const pw = power?.get(y)?.get(t.name) ?? power?.get(y)?.get(t.abbreviation);
          const isW = won.has(y);
          const isL = lost.has(y);
          const id = isW || isL ? sbIds?.[String(y)] : lastGameIdOf(ids, y, t.abbreviation);
          return (
            <button
              key={y}
              type="button"
              className={cn('ts-ss', isW && 'is-title', (isW || isL) && 'is-final')}
              style={{ ['--tc' as string]: prime }}
              disabled={!id}
              aria-label={`${y}: power ${pw !== undefined ? pw.toFixed(1) : 'unknown'}${isW ? ', Super Bowl champions' : isL ? ', lost the Super Bowl' : ''}. Open ${isW || isL ? 'the Super Bowl' : 'its last game'}`}
              onClick={() => id && (hide(), openGame(id))}
              {...(id ? bind(<GamePreview id={id} kicker={`${y} · ${isW ? 'Won the Super Bowl' : isL ? 'Lost the Super Bowl' : 'Final game of the season'} · power ${pw !== undefined ? pw.toFixed(1) : '–'}`} />) : {})}
            >
              <span className="ts-ss__m" aria-hidden>{isW ? '★' : isL ? '◆' : ''}</span>
              <span className="ts-ss__plot"><i className="ts-ss__bar" style={{ height: `${pw === undefined ? 4 : Math.max(5, Math.min(100, pw))}%` }} /></span>
              <span className="ts-ss__y">{String(y).slice(2)}</span>
            </button>
          );
        })}
      </StripRail>
      {el}
    </>
  );
};
