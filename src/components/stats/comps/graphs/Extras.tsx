import type { Player } from '@/types/player';
import TeamLogo from '@/components/brand/TeamLogo';
import { cn } from '@/lib/utils';
import { fmtFixed } from '@/utils/numberFormat';
import { GOLD } from '../../visual/chartKit';
import { VIZ, ordinal } from '../../analytics/viz';
import type { Career } from './careerStory';
import { seasonScore } from './careerModel';
import { BOX, groupOf, seasonRates } from './statDefs';
import { clubInk, shortNum, yLabel, type GraphMetric } from './graphKit';

/**
 * Season-by-season sparklines, one per metric (every box stat and the card numbers): the value at the cursor, his
 * career best, and a tap to chart it on the timeline above.
 */
export const SparkRows = ({ career, metrics, metricId, onMetric, idx, wide }: { career: Career; metrics: GraphMetric[]; metricId: string; onMetric: (id: string) => void; idx: number; wide: boolean }) => {
  // a phone gets the card numbers and box stats; a desktop, beside the tall season panel, every rate too
  const rows = metrics.filter((m) => (wide || m.group !== 'Rate') && m.id !== 'skill');
  const n = career.points.length;
  const W = 120;
  const H = 22;
  return (
    <ul className="cg-sparks" aria-label="Every metric by season">
      {rows.map((m) => {
        const vals = career.points.map((p) => m.get(p));
        const fin = vals.filter((v): v is number => v != null && Number.isFinite(v));
        if (!fin.length) return null;
        const lo = Math.min(...fin);
        const hi = Math.max(...fin);
        const y = (v: number) => {
          const t = (v - lo) / (hi - lo || 1);
          return m.invert ? 3 + t * (H - 6) : H - 3 - t * (H - 6);
        };
        const x = (i: number) => (n === 1 ? W / 2 : 2 + (i * (W - 4)) / (n - 1));
        const d = vals.map((v, i) => (v == null || !Number.isFinite(v) ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).reduce<string[]>((acc, pt, i, arr) => {
          if (pt) acc.push(`${i > 0 && arr[i - 1] ? 'L' : 'M'}${pt}`);
          return acc;
        }, []);
        const best = m.invert ? lo : hi;
        const bi = vals.findIndex((v) => v === best);
        const cur = vals[idx];
        return (
          <li key={m.id}>
            <button type="button" onClick={() => onMetric(m.id)} className={cn('cg-spark', m.id === metricId && 'cg-spark--on')} aria-pressed={m.id === metricId}>
              <span className="cg-spark__label">{m.short}</span>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="cg-spark__svg" aria-hidden="true">
                <path d={d.join(' ')} fill="none" stroke={m.id === metricId ? GOLD : VIZ.series[0]} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
                {cur != null && Number.isFinite(cur) && <circle cx={x(idx)} cy={y(cur)} r={2.2} fill={GOLD} />}
              </svg>
              <span className="cg-spark__now">{cur == null || !Number.isFinite(cur) ? '—' : m.fmt(cur)}</span>
              <span className="cg-spark__best">
                best {m.fmt(best)} <span className="opacity-70">{bi >= 0 ? `'${career.points[bi].year % 100}` : ''}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** Career splits by club: the seasons, games, rings and box-stat totals and per-game rates he put up at each stop. */
export const ClubSplits = ({ player, career }: { player: Player; career: Career }) => {
  const box = BOX[groupOf(player.position)];
  const by = new Map<string, { seasons: number[]; games: number; rings: number; tot: Record<string, number>; score: number[] }>();
  career.points.forEach((p, i) => {
    const c = career.clubs[i];
    if (!c || !p.box) return;
    const r = by.get(c) ?? { seasons: [], games: 0, rings: 0, tot: {}, score: [] };
    r.seasons.push(p.year);
    r.games += p.games;
    r.rings += p.awards?.rings ?? 0;
    box.forEach((b) => (r.tot[b.key] = (r.tot[b.key] ?? 0) + (p.box![b.key] ?? 0)));
    const s = seasonScore(player.position, p);
    if (s != null) r.score.push(s);
    by.set(c, r);
  });
  const rows = [...by.entries()];
  if (!rows.length) return null;
  return (
    <div className="cg-card glass-card">
      <h3>Splits by club</h3>
      <p className="cg-sub">His recorded seasons at each stop (totals, per game, rings, average season score), then every season in order.</p>
      <div className="cg-fill">
        {rows.map(([club, r]) => {
          const ink = clubInk(club);
          const avg = r.score.length ? r.score.reduce((a, b) => a + b, 0) / r.score.length : null;
          return (
            <div key={club} className="cg-split" style={{ borderColor: ink.mark }}>
              <div className="flex items-center gap-2">
                {ink.team && <TeamLogo team={ink.team} size={26} decorative />}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold uppercase leading-none" style={{ color: ink.mark }}>
                    {club}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {yLabel(r.seasons[0])}
                    {r.seasons.length > 1 ? `–${yLabel(r.seasons[r.seasons.length - 1])}` : ''} · {r.seasons.length} season{r.seasons.length === 1 ? '' : 's'} · {r.games} games
                    {r.rings ? ` · ${r.rings} ring${r.rings === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                {avg != null && (
                  <span className="text-right">
                    <span className="block font-display text-xl font-bold leading-none tabular-nums text-chalk">{Math.round(avg)}</span>
                    <span className="font-pixel text-[7px] uppercase text-muted-foreground">avg score</span>
                  </span>
                )}
              </div>
              <dl className="cg-split__stats">
                {box.map((b) => (
                  <div key={b.key}>
                    <dt>{b.short}</dt>
                    <dd>
                      {fmtFixed(r.tot[b.key] ?? 0, 0)}
                      <span>{r.games ? fmtFixed((r.tot[b.key] ?? 0) / r.games, 1) : '—'}/G</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
        <p className="font-pixel text-[8px] uppercase text-muted-foreground">Season log</p>
        <ul className="cg-fill__list cg-log">
          {career.points.map((p, i) => {
            if (!p.box) return null;
            const ink = clubInk(career.clubs[i]);
            const s = seasonScore(player.position, p);
            return (
              <li key={p.year}>
                <span className="cg-log__row" style={{ borderLeftColor: ink.mark }}>
                  <span className="w-9 font-display font-bold text-chalk">{yLabel(p.year)}</span>
                  <span className="w-7 text-muted-foreground">{p.games}G</span>
                  <span className="min-w-0 flex-1 truncate text-secondary-foreground">{box.map((b) => `${shortNum(p.box![b.key] ?? 0)} ${b.short.toLowerCase()}`).join(' · ')}</span>
                  <span className="relative h-1.5 w-12 overflow-hidden rounded-sm bg-panel-2" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0" style={{ width: `${Math.max(3, s ?? 0)}%`, background: s == null ? 'transparent' : `hsl(213 80% ${42 + (s / 100) * 26}%)` }} />
                  </span>
                  <span className="w-6 text-right font-mono text-chalk">{s == null ? '—' : Math.round(s)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
