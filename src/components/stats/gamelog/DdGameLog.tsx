import { useEffect, useMemo, useState } from 'react';
import type { Player } from '@/types/player';
import { keyOf } from '../records';
import { useGameLog } from '@/utils/gameLogs';
import { gameHash, openGame } from '@/utils/nflGames';
import { cn } from '@/lib/utils';
import { RULES, roundShort, abbrOf, avg, dist, fmtDate, fmtN, parseGames, streaksOf, teamHue, teamOf, type Game } from './gameLogModel';
import './gameLog.css';
import { displayName } from '@/utils/displayName';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PAGE = 12;

const Logo = ({ abbr, size = 20 }: { abbr: string; size?: number }) => {
  const t = teamOf(abbr);
  const [bad, setBad] = useState(false);
  if (!t || bad)
    return (
      <span className="gl-logo gl-logo--ph" style={{ width: size, height: size, background: teamHue(abbr) }} aria-hidden="true">
        {abbrOf(abbr).slice(0, 1)}
      </span>
    );
  return <img className="gl-logo" src={t.logoUrl} alt="" width={size} height={size} loading="lazy" onError={() => setBad(true)} />;
};

const Result = ({ g }: { g: Game }) => (
  <span className={cn('gl-res', g.win === true ? 'gl-res--w' : g.win === false ? 'gl-res--l' : 'gl-res--t')}>
    <b>{g.win === true ? 'W' : g.win === false ? 'L' : 'T'}</b> {g.pf}-{g.pa}
  </span>
);

const useReduced = () => {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const f = () => setR(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return r;
};

const Seg = <T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[]; label: string }) => (
  <div className="gl-seg" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={o.v} type="button" aria-pressed={value === o.v} className={cn('gl-seg__b', value === o.v && 'is-on')} onClick={() => onChange(o.v)}>
        {o.l}
      </button>
    ))}
  </div>
);

const Tile = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'gold' | 'turf' }) => (
  <div className="gl-tile">
    <span className="gl-tile__k">{label}</span>
    <span className={cn('gl-tile__v', tone === 'gold' && 'text-gold', tone === 'turf' && 'gl-turf')}>{value}</span>
    {sub && <span className="gl-tile__s">{sub}</span>}
  </div>
);

const DdGameLog = ({ player }: { player: Player }) => {
  const key = keyOf(player);
  const log = useGameLog(key);
  const rule = RULES[player.position];
  const reduced = useReduced();
  const all = useMemo(() => parseGames(log, player.position), [log, player.position]);

  const [season, setSeason] = useState<'all' | number>('all');
  const [type, setType] = useState<'ALL' | 'REG' | 'POST'>('ALL');
  const [page, setPage] = useState(0);
  const [split, setSplit] = useState<'ha' | 'wl' | 'opp' | 'month'>('ha');
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'g', dir: -1 });
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    setSeason('all');
    setType('ALL');
    setPage(0);
    setSel(null);
  }, [key]);

  const seasons = useMemo(() => [...new Set(all.map((g) => g.season))].sort((a, b) => b - a), [all]);
  const hasPost = all.some((g) => g.post);
  const games = useMemo(() => all.filter((g) => (season === 'all' || g.season === season) && (type === 'ALL' || (type === 'POST') === g.post)), [all, season, type]);
  const chartSeason = season === 'all' ? seasons[0] : season;
  const chartGames = useMemo(() => all.filter((g) => g.season === chartSeason && (type === 'ALL' || (type === 'POST') === g.post)), [all, chartSeason, type]);

  const keyVals = (gs: Game[]) => gs.map((g) => g.key);
  const career = useMemo(() => dist(keyVals(all)), [all]);
  const best = useMemo(() => [...games].sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 5), [games]);
  const streaks = useMemo(() => streaksOf(all, rule.streaks), [all, rule]);
  const record = useMemo(() => {
    const w = games.filter((g) => g.win === true).length;
    const l = games.filter((g) => g.win === false).length;
    return { w, l, t: games.length - w - l };
  }, [games]);

  if (log === undefined) return <div className="gl-panel gl-empty" role="status">Loading game log…</div>;
  if (!log || !all.length) return <div className="gl-panel gl-empty">No game-by-game log is on file for {displayName(player.name)}.</div>;

  const maxKey = Math.max(1, ...chartGames.map((g) => g.key));
  const selGame = sel != null ? chartGames.find((g) => g.i === sel) ?? null : null;
  const shown = selGame ?? chartGames[chartGames.length - 1] ?? null;
  const rowsDesc = [...games].reverse();
  const pages = Math.max(1, Math.ceil(rowsDesc.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const slice = rowsDesc.slice(pg * PAGE, pg * PAGE + PAGE);
  const bestGame = [...games].sort((a, b) => b.score - a.score)[0];
  const regAvg = avg(keyVals(games));

  // ---- splits
  const groupBy = (f: (g: Game) => { id: string; label: string; ord: number; abbr?: string } | null) => {
    const m = new Map<string, { id: string; label: string; ord: number; abbr?: string; gs: Game[] }>();
    games.forEach((g) => {
      const k = f(g);
      if (!k) return;
      const e = m.get(k.id) ?? { ...k, gs: [] };
      e.gs.push(g);
      m.set(k.id, e);
    });
    return [...m.values()];
  };
  const groups =
    split === 'ha'
      ? groupBy((g) => ({ id: g.home ? 'h' : 'a', label: g.home ? 'Home' : 'Away', ord: g.home ? 0 : 1 }))
      : split === 'wl'
        ? groupBy((g) => (g.win === null ? null : { id: g.win ? 'w' : 'l', label: g.win ? 'In wins' : 'In losses', ord: g.win ? 0 : 1 }))
        : split === 'opp'
          ? groupBy((g) => ({ id: abbrOf(g.opp), label: teamOf(g.opp)?.name ?? g.opp, ord: 0, abbr: g.opp }))
          : groupBy((g) => ({ id: String(g.month), label: MONTHS[g.month], ord: (g.month + 3) % 12 }));
  const rowsS = groups.map((e) => {
    const w = e.gs.filter((g) => g.win === true).length;
    const l = e.gs.filter((g) => g.win === false).length;
    return {
      ...e, g: e.gs.length, w, l, key: avg(keyVals(e.gs)),
      cols: rule.splitCols.map((c) => avg(e.gs.map((g) => c.get(g.r)))),
    };
  });
  const sortVal = (r: (typeof rowsS)[number], k: string) => (k === 'g' ? r.g : k === 'wl' ? r.w / Math.max(1, r.w + r.l) : k === 'key' ? r.key : k === 'name' ? r.label.charCodeAt(0) : r.cols[Number(k.slice(1))] ?? 0);
  const sortedS = [...rowsS].sort((a, b) => {
    if (split !== 'opp' && sort.k === 'g' && sort.dir === -1) return a.ord - b.ord;
    if (sort.k === 'name') return sort.dir * a.label.localeCompare(b.label) * -1;
    return sort.dir * (sortVal(a, sort.k) - sortVal(b, sort.k)) || a.label.localeCompare(b.label);
  });
  const maxS = Math.max(0.0001, ...rowsS.map((r) => r.key));
  const setSortK = (k: string) => setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === 'name' ? -1 : -1 }));
  const Th = ({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) => (
    <th scope="col" aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={className}>
      <button type="button" onClick={() => setSortK(k)} className="gl-th">
        {children}
        <span aria-hidden="true">{sort.k === k ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );

  // ---- consistency
  const cd = dist(keyVals(games));
  const seasonGames = all.filter((g) => g.season === chartSeason);
  const form = [
    { l: 'Last 3', v: avg(keyVals(all.slice(-3))), n: Math.min(3, all.length) },
    { l: 'Last 5', v: avg(keyVals(all.slice(-5))), n: Math.min(5, all.length) },
    { l: seasons.length ? `${chartSeason}` : 'Season', v: avg(keyVals(seasonGames)), n: seasonGames.length },
    { l: 'Career', v: career?.mean ?? 0, n: all.length },
  ];
  const formMax = Math.max(1, ...form.map((f) => f.v));
  const cv = cd && cd.mean > 0 ? cd.sd / cd.mean : 0;
  const temper = !cd ? '' : cv < 0.55 ? 'Steady' : cv < 0.85 ? 'Streaky' : 'Boom or bust';
  const span = cd ? Math.max(0.0001, cd.max - Math.min(0, cd.min)) : 1;
  const base = cd ? Math.min(0, cd.min) : 0;
  const pct = (v: number) => `${((v - base) / span) * 100}%`;

  return (
    <div className="gl space-y-3">
      {/* scoreboard strip */}
      <div className="gl-board">
        <div className="gl-board__bulbs" aria-hidden="true" />
        <div className="gl-tiles">
          <Tile label="Games" value={String(games.length)} sub={season === 'all' ? `${seasons[seasons.length - 1]}–${seasons[0]}` : String(season)} />
          <Tile label="Record" value={`${record.w}-${record.l}${record.t ? `-${record.t}` : ''}`} sub={games.length ? `${Math.round((record.w / games.length) * 100)}% wins` : ''} tone="turf" />
          <Tile label={`${rule.keyLabel} / game`} value={fmtN(regAvg)} sub={player.position === 'OL' ? 'team scoring' : 'average'} tone="gold" />
          <Tile label="Best game" value={bestGame ? fmtN(bestGame.score) : '-'} sub={bestGame ? `${bestGame.season} wk ${bestGame.week} vs ${abbrOf(bestGame.opp)}` : ''} />
          <Tile label="Playoff games" value={String(games.filter((g) => g.post).length)} sub={hasPost ? 'in the file' : 'none'} />
        </div>
      </div>

      {/* filters */}
      <div className="gl-filters">
        <div className="gl-chips" role="group" aria-label="Season">
          <button type="button" aria-pressed={season === 'all'} className={cn('gl-chip', season === 'all' && 'is-on')} onClick={() => { setSeason('all'); setPage(0); }}>All</button>
          {seasons.map((s) => (
            <button key={s} type="button" aria-pressed={season === s} className={cn('gl-chip', season === s && 'is-on')} onClick={() => { setSeason(s); setPage(0); setSel(null); }}>
              {s}
            </button>
          ))}
        </div>
        {hasPost && (
          <Seg label="Game type" value={type} onChange={(v) => { setType(v); setPage(0); setSel(null); }} options={[{ v: 'ALL', l: 'All' }, { v: 'REG', l: 'Regular' }, { v: 'POST', l: 'Playoffs' }]} />
        )}
      </div>

      {/* per-game chart */}
      <div className="gl-panel gl-field">
        <div className="gl-head">
          <h3 className="gl-h">{chartSeason} game by game</h3>
          <span className="gl-sub">{rule.keyLabel}{season === 'all' ? ' · latest season (pick a season above)' : ''}</span>
        </div>
        {chartGames.length === 0 ? (
          <p className="gl-empty">No games for this filter.</p>
        ) : (
          <>
            <div className="gl-chart" role="list" aria-label={`${displayName(player.name)} ${rule.keyLabel} by game, ${chartSeason}`}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                const bs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
                const at = bs.indexOf(document.activeElement as HTMLButtonElement);
                const nx = bs[Math.max(0, Math.min(bs.length - 1, at + (e.key === 'ArrowRight' ? 1 : -1)))];
                nx?.focus();
                e.preventDefault();
              }}>
              <div className="gl-grid" aria-hidden="true">
                {[1, 0.75, 0.5, 0.25].map((f) => <span key={f} style={{ bottom: `${f * 100}%` }}><i>{fmtN(maxKey * f, 0)}</i></span>)}
              </div>
              {chartGames.map((g, k) => {
                const h = Math.max(2, (Math.max(0, g.key) / maxKey) * 100);
                return (
                  <div key={g.i} role="listitem" className="gl-col">
                    <button
                      type="button"
                      className={cn('gl-bar', g.win === true ? 'gl-bar--w' : g.win === false ? 'gl-bar--l' : 'gl-bar--t', g.post && 'gl-bar--post', shown?.i === g.i && 'is-sel', !reduced && 'gl-bar--anim')}
                      style={{ height: `${h}%`, animationDelay: `${k * 18}ms` }}
                      aria-label={`${g.post ? g.round : `Week ${g.week}`}, ${g.home ? 'vs' : 'at'} ${abbrOf(g.opp)}, ${g.win === true ? 'win' : g.win === false ? 'loss' : 'tie'} ${g.pf} to ${g.pa}, ${rule.keyLabel} ${fmtN(g.key)}`}
                      onMouseEnter={() => setSel(g.i)}
                      onFocus={() => setSel(g.i)}
                      onClick={() => setSel(g.i)}
                    />
                    <span className="gl-wk">{g.post ? 'P' : g.week}</span>
                  </div>
                );
              })}
            </div>
            <div className="gl-legend" aria-hidden="true">
              <span><i className="gl-dot gl-dot--w" /> Win</span><span><i className="gl-dot gl-dot--l" /> Loss</span><span><i className="gl-dot gl-dot--post" /> Playoff</span>
              <span className="gl-sub">bar = {rule.keyLabel.toLowerCase()}; P = playoffs</span>
            </div>
            {shown && (
              <div className="gl-pick" aria-live="polite" style={{ '--tc': teamHue(shown.opp) } as React.CSSProperties}>
                <Logo abbr={shown.opp} size={34} />
                <div className="min-w-0">
                  <div className="gl-pick__t">{shown.post ? shown.round : `Week ${shown.week}`} · {shown.home ? 'vs' : 'at'} {teamOf(shown.opp)?.fullName ?? shown.opp} · <Result g={shown} />{typeof shown.r.game === 'string' && <> · <a href={gameHash(shown.r.game)} className="text-gold hover:underline">Open game page</a></>}</div>
                  <div className="gl-pick__l">
                    {rule.hasLine ? rule.line.map((c) => <span key={c.id}><em>{c.label}</em> {c.fmt ? c.fmt(shown.r) : fmtN(c.get(shown.r))}</span>) : <span><em>Team</em> {shown.pf} points for, {shown.pa} against</span>}
                    <span className="text-gold"><em>{rule.keyShort}</em> {fmtN(shown.key)}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* consistency */}
        <div className="gl-panel">
          <div className="gl-head"><h3 className="gl-h">Consistency</h3><span className="gl-sub">{rule.keyLabel}, every game on file</span></div>
          {cd && career && (
            <>
              <div className="gl-cons">
                <Tile label="Mean" value={fmtN(cd.mean)} />
                <Tile label="Std dev" value={fmtN(cd.sd)} sub={temper} />
                <Tile label="Floor (p20)" value={fmtN(cd.floor)} />
                <Tile label="Ceiling (p80)" value={fmtN(cd.ceil)} tone="gold" />
              </div>
              <div className="gl-range" aria-label={`Range ${fmtN(cd.min)} to ${fmtN(cd.max)}, floor ${fmtN(cd.floor)}, ceiling ${fmtN(cd.ceil)}, mean ${fmtN(cd.mean)}`} role="img">
                <span className="gl-range__band" style={{ left: pct(cd.floor), width: `calc(${pct(cd.ceil)} - ${pct(cd.floor)})` }} />
                <span className="gl-range__mean" style={{ left: pct(cd.mean) }} />
                <span className="gl-range__end" style={{ left: 0 }}>{fmtN(cd.min)}</span>
                <span className="gl-range__end" style={{ right: 0 }}>{fmtN(cd.max)}</span>
              </div>
              <p className="gl-sub mb-2 mt-1">The band is the middle 60% of his games (p20 to p80); the tick is his mean.</p>
              <ul className="space-y-1.5">
                {form.map((f) => {
                  const d = f.v - (career?.mean ?? 0);
                  return (
                    <li key={f.l} className="gl-form">
                      <span className="gl-form__l">{f.l}<small>{f.n}g</small></span>
                      <span className="gl-form__bar"><i style={{ width: `${(f.v / formMax) * 100}%` }} /></span>
                      <span className="gl-form__v">{fmtN(f.v)}</span>
                      <span className={cn('gl-form__d', f.l === 'Career' ? 'opacity-0' : d >= 0 ? 'gl-turf' : 'gl-flag')}>{d >= 0 ? '+' : ''}{fmtN(d)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* best games */}
        <div className="gl-panel">
          <div className="gl-head"><h3 className="gl-h">Best games</h3><span className="gl-sub">by {player.position === 'QB' || player.position === 'RB' || player.position === 'WR' || player.position === 'TE' ? 'fantasy PPR points' : player.position === 'OL' ? 'scoring margin' : 'impact score'}</span></div>
          <ol className="space-y-1.5">
            {best.map((g, k) => (
              <li key={g.i} className="gl-best" style={{ '--tc': teamHue(g.opp) } as React.CSSProperties}>
                <span className="gl-best__n">{k + 1}</span>
                <Logo abbr={g.opp} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="gl-best__t">{g.season} {g.post ? g.round : `wk ${g.week}`} · {g.home ? 'vs' : 'at'} {abbrOf(g.opp)} <Result g={g} /></div>
                  <div className="gl-best__l">{rule.hasLine ? rule.line.filter((c) => c.get(g.r) !== 0 || c.id === 'py').map((c) => `${c.fmt ? c.fmt(g.r) : fmtN(c.get(g.r))} ${c.label.toLowerCase()}`).join(' · ') : `${fmtDate(g.date)}`}</div>
                </div>
                <span className="gl-best__s">{fmtN(g.score)}</span>
              </li>
            ))}
          </ol>
                  </div>
      </div>

      {/* splits */}
      <div className="gl-panel">
        <div className="gl-head">
          <h3 className="gl-h">Splits</h3>
          <Seg label="Split by" value={split} onChange={(v) => { setSplit(v); setSort({ k: 'g', dir: -1 }); }} options={[{ v: 'ha', l: 'Home / Away' }, { v: 'wl', l: 'Wins / Losses' }, { v: 'opp', l: 'Opponent' }, { v: 'month', l: 'Month' }]} />
        </div>
        <div className="gl-tablewrap">
          <table className="gl-table">
            <thead>
              <tr>
                <Th k="name" className="text-left">{split === 'opp' ? 'Opponent' : split === 'month' ? 'Month' : 'Split'}</Th>
                <Th k="g">G</Th>
                <Th k="wl">W-L</Th>
                <Th k="key" className="gl-hide-sm">{rule.keyShort}/g</Th>
                {rule.splitCols.map((c, i) => <Th key={c.id} k={`c${i}`}>{c.label}/g</Th>)}
              </tr>
            </thead>
            <tbody>
              {sortedS.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="gl-rowh">{r.abbr ? <Logo abbr={r.abbr} size={20} /> : null}<span>{r.label}</span></th>
                  <td>{r.g}</td>
                  <td>{r.w}-{r.l}</td>
                  <td className="gl-hide-sm gl-keycell"><span className="gl-minibar"><i style={{ width: `${(r.key / maxS) * 100}%` }} /></span><b>{fmtN(r.key)}</b></td>
                  {r.cols.map((v, i) => <td key={i}>{fmtN(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {split === 'opp' && <p className="gl-sub mt-1.5">Click a column heading to sort. The file has no stadium roof data, so there is no indoor/outdoor split.</p>}
      </div>

      {/* streaks */}
      <div className="gl-panel">
        <div className="gl-head"><h3 className="gl-h">Streaks</h3><span className="gl-sub">longest run on file, and the run he is on now</span></div>
        <div className="gl-streaks">
          {streaks.map((s) => (
            <div key={s.id} className={cn('gl-streak', s.current > 0 && s.current === s.best && s.best > 1 && 'is-live')}>
              <span className="gl-streak__n">{s.best}</span>
              <span className="gl-streak__l">{s.label}</span>
              <span className="gl-streak__s">
                {s.bestFrom && s.bestTo ? `${s.bestFrom.season}${s.bestFrom.season !== s.bestTo.season ? `–${s.bestTo.season}` : ''}` : 'never'}
                {s.current > 0 ? ` · now ${s.current}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* the log */}
      <div className="gl-panel">
        <div className="gl-head"><h3 className="gl-h">Every game</h3><span className="gl-sub">{games.length} games, newest first</span></div>
        {rule.hasLine ? (
          <div className="gl-tablewrap">
            <table className="gl-table gl-log">
              <thead>
                <tr>
                  <th scope="col" className="text-left">Game</th>
                  <th scope="col">Result</th>
                  {rule.line.map((c) => <th scope="col" key={c.id}>{c.label}</th>)}
                  <th scope="col">{rule.keyShort}</th>
                </tr>
              </thead>
              <tbody>
                {slice.map((g) => (
                  <tr key={g.i} className={cn(g.post && 'gl-post', typeof g.r.game === 'string' && 'cursor-pointer hover:bg-white/5')} onClick={typeof g.r.game === 'string' ? (e) => { if (!(e.target as HTMLElement).closest('a')) openGame(g.r.game as string); } : undefined}>
                    <th scope="row" className="gl-rowh"><Logo abbr={g.opp} size={26} /><span>{g.post ? `${g.season} ${roundShort(g.round)}` : `${g.season} W${g.week}`}<small>{g.home ? 'vs' : '@'} {abbrOf(g.opp)}</small></span>{typeof g.r.game === 'string' && <a href={gameHash(g.r.game)} className="ml-2 font-pixel text-[8px] uppercase text-gold hover:underline">Box score</a>}</th>
                    <td><Result g={g} /></td>
                    {rule.line.map((c) => <td key={c.id} className={c.get(g.r) === 0 ? 'opacity-40' : ''}>{c.fmt ? c.fmt(g.r) : fmtN(c.get(g.r))}</td>)}
                    <td className="font-bold text-gold">{fmtN(g.key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="gl-tablewrap">
            <table className="gl-table gl-log">
              <thead><tr><th scope="col" className="text-left">Game</th><th scope="col">Result</th><th scope="col">Date</th></tr></thead>
              <tbody>
                {slice.map((g) => (
                  <tr key={g.i} className={cn(g.post && 'gl-post', typeof g.r.game === 'string' && 'cursor-pointer hover:bg-white/5')} onClick={typeof g.r.game === 'string' ? (e) => { if (!(e.target as HTMLElement).closest('a')) openGame(g.r.game as string); } : undefined}>
                    <th scope="row" className="gl-rowh"><Logo abbr={g.opp} size={20} /><span>{g.post ? g.round : `${g.season} W${g.week}`}<small>{g.home ? 'vs' : '@'} {abbrOf(g.opp)}</small></span>{typeof g.r.game === 'string' && <a href={gameHash(g.r.game)} className="ml-2 font-pixel text-[8px] uppercase text-gold hover:underline">Box score</a>}</th>
                    <td><Result g={g} /></td>
                    <td>{fmtDate(g.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="gl-pager">
            <button type="button" disabled={pg === 0} onClick={() => setPage(pg - 1)} className="gl-seg__b">Newer</button>
            <span>Page {pg + 1} of {pages}</span>
            <button type="button" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} className="gl-seg__b">Older</button>
          </div>
        )}
        {!rule.hasLine && <p className="gl-sub mt-2">Offensive linemen have no box-score line in the data, so their log carries results and team scoring only.</p>}
      </div>
    </div>
  );
};

export default DdGameLog;
