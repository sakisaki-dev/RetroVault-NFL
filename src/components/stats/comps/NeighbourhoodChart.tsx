import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '@/types/player';
import { SIM_MIN_GAMES, type SimilarityMode } from '@/config/advanced';
import { isHallOfFamer } from '@/config/stats';
import { percentileOf } from '@/config/skillGrades';
import { loadCareerSeasons, type CareerSeasonsFile } from '@/utils/careerSeasons';
import { bannerTeamOf } from '@/utils/playerExtras';
import { VIZ } from '../analytics/viz';
import Chips from '../analytics/Chips';
import { keyOf } from '../records';
import { peekProps } from '../../peek/peekProps';
import { dotColors } from './compColors';
import { pairScores, type PositionModel } from './compModel';

/**
 * The Neighbourhood chart: his ~30 nearest comparable careers (by the similarity model) as club-colour dots over a
 * faint pixel-density layer of the rest of the position. Everything is O(n) or O(n log n) per change over the position's
 * pool (no all-pairs map): axes, filters and the neighbour search are recomputed only when a control changes.
 */

const N_NEIGHBOURS = 30;
const GX = 44;
const GY = 28;

interface Axis {
  id: string;
  label: string;
  get: (p: Player) => number;
  lower?: boolean;
  decimals: number;
  scale?: number;
  suffix?: string;
}

export interface NeighbourhoodProps {
  player: Player;
  model: PositionModel;
  mode: SimilarityMode;
  ovrMap: Map<string, number>;
  careerOvrMap: Map<string, number>;
  seasonOvr?: Record<string, number> | null;
  wide: boolean;
  onPick: (p: Player) => void;
}

type EraId = 'all' | '2000s' | '2010s' | '2020s';
const ERAS: { id: EraId; lo: number; hi: number }[] = [
  { id: 'all', lo: 0, hi: 9999 },
  { id: '2000s', lo: 1990, hi: 2009 },
  { id: '2010s', lo: 2010, hi: 2019 },
  { id: '2020s', lo: 2020, hi: 9999 },
];

/** Preset axis pairs by feature id per position (first two that exist are used). */
const PRESETS: Record<string, [string, string, string][]> = {
  QB: [['ya', 'tdPct', 'Efficiency'], ['passYdsG', 'rushYdsG', 'Dual threat'], ['cmp', 'intPct', 'Accuracy'], ['car', 'szn', 'CAR vs SZN']],
  RB: [['ypc', 'rushYdsG', 'Run game'], ['rushYdsG', 'recYdsG', 'Workload'], ['td16', 'ypt', 'Scoring']],
  WR: [['ypr', 'recG', 'Big play vs volume'], ['recYdsG', 'tdPerRec', 'Production']],
  TE: [['ypr', 'recG', 'Big play vs volume'], ['recYdsG', 'tdPerRec', 'Production']],
  OL: [['blocksG', 'car', 'Blocks vs CAR']],
  LB: [['tklG', 'sackG', 'Tackler vs rusher'], ['intG', 'tklG', 'Coverage'], ['impactG', 'car', 'Impact vs CAR']],
  DB: [['tklG', 'intG', 'Tackler vs ballhawk'], ['intG', 'ffG', 'Takeaways'], ['impactG', 'car', 'Impact vs CAR']],
  DL: [['sackG', 'tklG', 'Rusher vs tackler'], ['sackG', 'ffG', 'Disruption'], ['impactG', 'car', 'Impact vs CAR']],
};

const fmt = (a: Axis, v: number) => {
  const x = a.scale ? v * a.scale : v;
  return `${x.toFixed(a.decimals)}${a.suffix ?? ''}`;
};

const say = (pct: number) =>
  pct >= 90 ? 'top 10%' : pct >= 75 ? 'top quarter' : pct >= 55 ? 'above average' : pct >= 45 ? 'about average' : pct >= 25 ? 'below average' : pct >= 10 ? 'bottom quarter' : 'bottom 10%';

const niceTicks = (lo: number, hi: number, n = 5) => {
  const step0 = (hi - lo) / n || 1;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(t);
  return out;
};

const quant = (sorted: number[], q: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1))))];

/** Debut and last season he played, from the season-end rows (games rising). */
const careerSpan = (cs: CareerSeasonsFile, key: string): [number, number] | null => {
  const rec = cs.players[key];
  if (!rec) return null;
  let first = -1;
  let last = -1;
  let prev = 0;
  rec.rows.forEach((r, i) => {
    const g = r ? Number(r[5]) || 0 : prev;
    if (g > prev) {
      if (first < 0) first = i;
      last = i;
    }
    prev = g;
  });
  return first < 0 ? null : [rec.from + first, rec.from + last];
};

const NeighbourhoodChart = ({ player, model, mode, ovrMap, careerOvrMap, seasonOvr, wide, onPick }: NeighbourhoodProps) => {
  const pos = player.position;
  const key = keyOf(player);
  const axes = useMemo<Axis[]>(() => {
    const feats: Axis[] = model.features.map((f) => ({ id: f.id, label: f.label, get: f.get, lower: f.lowerIsBetter, decimals: f.decimals ?? 1, scale: f.scale, suffix: f.suffix }));
    const extra: Axis[] = [
      { id: 'car', label: 'CAR', get: (p) => careerOvrMap.get(keyOf(p)) ?? NaN, decimals: 0 },
      { id: 'szn', label: 'SZN', get: (p) => seasonOvr?.[keyOf(p)] ?? NaN, decimals: 0 },
      { id: 'games', label: 'Games', get: (p) => p.games, decimals: 0 },
    ];
    return [...feats, ...extra];
  }, [model, careerOvrMap, seasonOvr]);
  const byId = useMemo(() => new Map(axes.map((a) => [a.id, a])), [axes]);
  const presets = useMemo(
    () => (PRESETS[pos] ?? []).filter(([x, y]) => byId.has(x) && byId.has(y) && (!(x === 'szn' || y === 'szn') || !!seasonOvr)),
    [pos, byId, seasonOvr],
  );
  const [ax, setAx] = useState<[string, string]>(() => [presets[0]?.[0] ?? axes[0].id, presets[0]?.[1] ?? axes[1]?.id ?? axes[0].id]);
  useEffect(() => {
    if (!byId.has(ax[0]) || !byId.has(ax[1])) setAx([presets[0]?.[0] ?? axes[0].id, presets[0]?.[1] ?? axes[1]?.id ?? axes[0].id]);
  }, [byId, presets, axes, ax]);
  const X = byId.get(ax[0]) ?? axes[0];
  const Y = byId.get(ax[1]) ?? axes[1] ?? axes[0];

  const [era, setEra] = useState<EraId>('all');
  const [status, setStatus] = useState<'all' | 'active' | 'retired'>('all');
  const [qualified, setQualified] = useState(true);
  // the 2.5 MB career-years file loads only when an era is picked
  const [careers, setCareers] = useState<CareerSeasonsFile | null>(null);
  useEffect(() => {
    if (era === 'all') return;
    let alive = true;
    loadCareerSeasons().then((d) => alive && setCareers(d));
    return () => {
      alive = false;
    };
  }, [era]);
  const [sel, setSel] = useState<Player | null>(null);
  useEffect(() => setSel(null), [key, mode]);

  const qMin = useMemo(() => {
    const g = model.pool.filter((p) => p.games >= SIM_MIN_GAMES).map((p) => p.games).sort((a, b) => a - b);
    return g.length ? Math.max(SIM_MIN_GAMES, Math.min(32, quant(g, 0.5))) : SIM_MIN_GAMES;
  }, [model]);

  const view = useMemo(() => {
    const eraDef = ERAS.find((e) => e.id === era) ?? ERAS[0];
    const inEra = (p: Player) => {
      if (era === 'all' || !careers) return true;
      const s = careerSpan(careers, keyOf(p));
      return !!s && (s[0] + s[1]) / 2 >= eraDef.lo && (s[0] + s[1]) / 2 <= eraDef.hi;
    };
    const filtered = model.pool.filter(
      (p) => (!qualified || p.games >= qMin) && (status === 'all' || (status === 'active') === (p.status === 'Active')) && inEra(p),
    );
    const pts: { p: Player; x: number; y: number }[] = [];
    filtered.forEach((p) => {
      const x = X.get(p);
      const y = Y.get(p);
      if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ p, x, y });
    });
    const me = { x: X.get(player), y: Y.get(player) };
    const meOk = Number.isFinite(me.x) && Number.isFinite(me.y);
    // neighbours: nearest by the similarity model inside the filtered pool
    const zt = model.z(player);
    const near = pts
      .filter((d) => d.p !== player && d.p.name !== player.name)
      .map((d) => {
        const s = pairScores(model, zt, model.z(d.p));
        return { ...d, sim: mode === 'style' ? s.style : s.level, level: s.level };
      })
      .filter((d) => Number.isFinite(d.sim))
      .sort((a, b) => b.sim - a.sim || b.level - a.level || a.p.name.localeCompare(b.p.name))
      .slice(0, N_NEIGHBOURS);
    const xs = pts.map((d) => d.x).sort((a, b) => a - b);
    const ys = pts.map((d) => d.y).sort((a, b) => a - b);
    const ext = (s: number[], extra: number[]) => {
      if (!s.length) return [0, 1] as [number, number];
      let lo = quant(s, 0.01);
      let hi = quant(s, 0.99);
      extra.filter(Number.isFinite).forEach((v) => {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      });
      const pad = (hi - lo || 1) * 0.05;
      return [lo - pad, hi + pad] as [number, number];
    };
    const dx = ext(xs, [me.x, ...near.map((d) => d.x)]);
    const dy = ext(ys, [me.y, ...near.map((d) => d.y)]);
    const cells = new Map<number, number>();
    let maxC = 0;
    pts.forEach((d) => {
      const cx = Math.floor(((d.x - dx[0]) / (dx[1] - dx[0])) * GX);
      const cy = Math.floor(((d.y - dy[0]) / (dy[1] - dy[0])) * GY);
      if (cx < 0 || cy < 0 || cx >= GX || cy >= GY) return;
      const k = cy * GX + cx;
      const c = (cells.get(k) ?? 0) + 1;
      cells.set(k, c);
      if (c > maxC) maxC = c;
    });
    const pctOf = (a: Axis, sortedVals: number[], v: number) => {
      const raw = percentileOf(sortedVals, v);
      return a.lower ? 100 - raw : raw;
    };
    return {
      n: pts.length,
      near,
      dx,
      dy,
      cells,
      maxC,
      me,
      meOk,
      medX: xs.length ? quant(xs, 0.5) : NaN,
      medY: ys.length ? quant(ys, 0.5) : NaN,
      pctX: meOk && xs.length ? pctOf(X, xs, me.x) : NaN,
      pctY: meOk && ys.length ? pctOf(Y, ys, me.y) : NaN,
    };
  }, [model, player, mode, X, Y, era, status, qualified, qMin, careers]);

  const W = wide ? 720 : 360;
  const H = wide ? 430 : 360;
  const pad = { l: 44, r: 14, t: 12, b: 36 };
  const px = (v: number) => pad.l + ((Math.max(view.dx[0], Math.min(view.dx[1], v)) - view.dx[0]) / (view.dx[1] - view.dx[0])) * (W - pad.l - pad.r);
  const py = (v: number) => H - pad.b - ((Math.max(view.dy[0], Math.min(view.dy[1], v)) - view.dy[0]) / (view.dy[1] - view.dy[0])) * (H - pad.t - pad.b);
  const cw = (W - pad.l - pad.r) / GX;
  const ch = (H - pad.t - pad.b) / GY;
  const xt = niceTicks(view.dx[0], view.dx[1], wide ? 6 : 4);
  const yt = niceTicks(view.dy[0], view.dy[1], 5);

  // Labels: him, then the closest comps, skipping any that would overlap one already placed
  const labels = useMemo(() => {
    const placed: { x: number; y: number; w: number }[] = [];
    const out: { x: number; y: number; text: string; anchor: 'start' | 'end'; gold?: boolean }[] = [];
    const tryPlace = (x: number, y: number, text: string, gold?: boolean) => {
      const w = text.length * 5.4 + 6;
      const anchor: 'start' | 'end' = x + w + 12 > W - pad.r ? 'end' : 'start';
      const x0 = anchor === 'start' ? x + 9 : x - 9 - w;
      if (placed.some((q) => Math.abs(q.y - y) < 11 && x0 < q.x + q.w && x0 + w > q.x)) return;
      placed.push({ x: x0, y, w });
      out.push({ x: anchor === 'start' ? x + 9 : x - 9, y: y + 3.5, text, anchor, gold });
    };
    if (view.meOk) tryPlace(px(view.me.x), py(view.me.y), player.name, true);
    view.near.slice(0, wide ? 9 : 5).forEach((d) => tryPlace(px(d.x), py(d.y), d.p.name.split(' ').slice(-1)[0]));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, W, H, wide]);

  const selRef = useRef<HTMLDivElement | null>(null);
  const sim = (n: { sim: number }) => `${Math.round(n.sim)}%`;
  const closest = view.near.slice(0, 3).map((d) => d.p.name);
  const hofN = view.near.filter((d) => isHallOfFamer(d.p)).length;
  const retN = view.near.filter((d) => d.p.status !== 'Active').length;
  const says = !view.meOk
    ? `${player.name} has no ${!Number.isFinite(X.get(player)) ? X.label : Y.label} on record, so he can't be placed on these axes. Try another pair.`
    : `Among ${view.n.toLocaleString()} ${pos}s he is ${say(view.pctX)} for ${X.label} (${fmt(X, view.me.x)}) and ${say(view.pctY)} for ${Y.label} (${fmt(Y, view.me.y)}).`;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {presets.length > 0 && (
          <Chips
            label="Axis presets"
            value={presets.find(([x, y]) => x === ax[0] && y === ax[1])?.[2] ?? 'custom'}
            onChange={(v) => {
              const p = presets.find((q) => q[2] === v);
              if (p) setAx([p[0], p[1]]);
            }}
            options={presets.map(([, , l]) => ({ value: l, label: l }))}
          />
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <label className="flex items-center gap-1">
            X
            <select className="rounded bg-night/70 px-1.5 py-1 text-foreground" value={X.id} onChange={(e) => setAx([e.target.value, ax[1]])}>
              {axes.filter((a) => a.id !== 'szn' || seasonOvr).map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Y
            <select className="rounded bg-night/70 px-1.5 py-1 text-foreground" value={Y.id} onChange={(e) => setAx([ax[0], e.target.value])}>
              {axes.filter((a) => a.id !== 'szn' || seasonOvr).map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Chips label="Era" value={era} onChange={setEra} options={ERAS.map((e) => ({ value: e.id, label: e.id === 'all' ? 'All eras' : e.id, title: e.id === 'all' ? undefined : 'By the middle of his career' }))} />
        <Chips label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'retired', label: 'Retired' }]} />
        <Chips
          label="Qualified"
          value={qualified ? 'on' : 'off'}
          onChange={(v) => setQualified(v === 'on')}
          options={[{ value: 'on', label: `Starters (${qMin}+ G)`, title: 'Players with enough games to trust their rates' }, { value: 'off', label: 'Everyone' }]}
        />
      </div>

      <div className="relative overflow-hidden rounded-lg border border-line/60 bg-night/50">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${player.name} among ${pos}s: ${X.label} against ${Y.label}`} style={{ imageRendering: 'pixelated', touchAction: 'manipulation' }}>
          {xt.map((t) => (
            <g key={`x${t}`}>
              <line x1={px(t)} x2={px(t)} y1={pad.t} y2={H - pad.b} stroke={VIZ.grid} strokeWidth={0.6} />
              <text x={px(t)} y={H - pad.b + 13} textAnchor="middle" fontSize={9} fill={VIZ.muted}>{fmt(X, t)}</text>
            </g>
          ))}
          {yt.map((t) => (
            <g key={`y${t}`}>
              <line y1={py(t)} y2={py(t)} x1={pad.l} x2={W - pad.r} stroke={VIZ.grid} strokeWidth={0.6} />
              <text x={pad.l - 5} y={py(t) + 3} textAnchor="end" fontSize={9} fill={VIZ.muted}>{fmt(Y, t)}</text>
            </g>
          ))}
          {[...view.cells].map(([k, c]) => {
            const cx = k % GX;
            const cy = Math.floor(k / GX);
            const t = Math.sqrt(c / view.maxC);
            return <rect key={k} x={pad.l + cx * cw} y={H - pad.b - (cy + 1) * ch} width={cw + 0.4} height={ch + 0.4} fill={`rgba(57,135,229,${(0.07 + t * 0.4).toFixed(3)})`} />;
          })}
          {Number.isFinite(view.medX) && <line x1={px(view.medX)} x2={px(view.medX)} y1={pad.t} y2={H - pad.b} stroke={VIZ.axis} strokeDasharray="3 4" strokeWidth={0.9} />}
          {Number.isFinite(view.medY) && <line y1={py(view.medY)} y2={py(view.medY)} x1={pad.l} x2={W - pad.r} stroke={VIZ.axis} strokeDasharray="3 4" strokeWidth={0.9} />}
          <text x={(pad.l + W - pad.r) / 2} y={H - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={VIZ.ink}>{X.label}{X.lower ? ' (lower is better)' : ''}</text>
          <text transform={`translate(10 ${(pad.t + H - pad.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fontWeight={700} fill={VIZ.ink}>{Y.label}{Y.lower ? ' (lower is better)' : ''}</text>
          {view.meOk && view.near.slice(0, 5).map((d) => (
            <line key={`l${keyOf(d.p)}`} x1={px(view.me.x)} y1={py(view.me.y)} x2={px(d.x)} y2={py(d.y)} stroke="hsl(43 100% 62%)" strokeOpacity={0.45} strokeWidth={1} />
          ))}
          {[...view.near].reverse().map((d) => {
            const c = dotColors(bannerTeamOf(d.p));
            const r = (wide ? 5 : 4) + Math.max(0, Math.min(1, ((ovrMap.get(keyOf(d.p)) ?? 60) - 55) / 40)) * (wide ? 4 : 3);
            const on = sel === d.p;
            return (
              <g
                key={keyOf(d.p)}
                tabIndex={0}
                role="button"
                aria-label={`${d.p.name}, ${sim(d)} similar`}
                style={{ cursor: 'pointer', outline: 'none' }}
                onClick={() => setSel(on ? null : d.p)}
                onKeyDown={(e) => (e.key === 'Enter' ? onPick(d.p) : e.key === ' ' ? (e.preventDefault(), setSel(d.p)) : null)}
                {...peekProps(d.p)}
              >
                <title>{`${d.p.name} · ${sim(d)} similar · ${X.label} ${fmt(X, d.x)} · ${Y.label} ${fmt(Y, d.y)}`}</title>
                <circle cx={px(d.x)} cy={py(d.y)} r={r + 6} fill="transparent" />
                <rect x={px(d.x) - r} y={py(d.y) - r} width={r * 2} height={r * 2} rx={2} fill={c.fill} stroke={on ? '#fff' : isHallOfFamer(d.p) ? 'hsl(43 100% 62%)' : c.ring} strokeWidth={on || isHallOfFamer(d.p) ? 2 : 1.2} opacity={d.p.status === 'Active' ? 1 : 0.85} />
              </g>
            );
          })}
          {view.meOk && (
            <g>
              <circle cx={px(view.me.x)} cy={py(view.me.y)} r={wide ? 13 : 11} fill="none" stroke="hsl(43 100% 62%)" strokeWidth={2} />
              <path d={`M${px(view.me.x)} ${py(view.me.y) - 7} l6 7 l-6 7 l-6 -7 z`} fill="hsl(43 100% 62%)" stroke="#111627" strokeWidth={1.4} />
            </g>
          )}
          {labels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={l.gold ? 11 : 9.5} fontWeight={l.gold ? 800 : 600} fill={l.gold ? 'hsl(43 100% 62%)' : VIZ.ink} stroke="#111627" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
              {l.text}
            </text>
          ))}
        </svg>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span><span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'rgba(57,135,229,.55)' }} /> the other {view.n.toLocaleString()} {pos}s (darker = more)</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-gold" /> him</span>
        <span>squares: his {Math.min(N_NEIGHBOURS, view.near.length)} nearest, gold rim = Hall of Famer</span>
      </p>

      {sel && (
        <div ref={selRef} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel-2/70 p-2.5 text-sm">
          <div>
            <span className="font-bold">{sel.name}</span>{' '}
            <span className="text-muted-foreground">
              {sel.position} · {bannerTeamOf(sel) || 'FA'} · {sel.status === 'Active' ? 'Active' : 'Retired'} · {sel.games} G
              {view.near.find((d) => d.p === sel) ? ` · ${sim(view.near.find((d) => d.p === sel)!)} similar` : ''}
            </span>
          </div>
          <button type="button" onClick={() => onPick(sel)} className="tap-40 rounded bg-gold px-3 py-1 font-display text-xs font-bold uppercase text-night">
            Open Deep Dive
          </button>
        </div>
      )}

      <div className="rounded-lg border border-gold/25 bg-gold/5 p-2.5 text-sm">
        <div className="font-display text-[11px] font-bold uppercase tracking-wider text-gold">What this says</div>
        <p className="mt-0.5">{says}</p>
        {closest.length > 0 && (
          <p className="mt-1 text-muted-foreground">
            Closest {mode === 'style' ? 'in style' : 'overall'}: {closest.join(', ')}. Of his {view.near.length} nearest, {retN} are retired{hofN ? ` and ${hofN} ${hofN === 1 ? 'is a Hall of Famer' : 'are Hall of Famers'}` : ''}.
          </p>
        )}
        {era !== 'all' && !careers && <p className="mt-1 text-xs text-muted-foreground">Loading career years for the era filter…</p>}
      </div>
    </div>
  );
};

export default NeighbourhoodChart;
