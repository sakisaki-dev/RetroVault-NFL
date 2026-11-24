import { useMemo, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { ScatterChart as SwarmIcon } from 'lucide-react';
import type { Player, Position } from '@/types/player';
import { POSITIONS, quantile } from '@/config/advanced';
import { playerKey } from '@/config/ovr';
import { IS_NFL } from '@/config/edition';
import { HOF_THRESHOLD, LEGACY_TIERS, isHallOfFamer } from '@/config/stats';
import { POSITION_NAMES } from '@/utils/playerMeta';
import TeamLogo from '../../brand/TeamLogo';
import ChartFrame from '../analytics/ChartFrame';
import Chips from '../analytics/Chips';
import { VIZ, fmtNum } from '../analytics/viz';
import { keyOf } from '../records';
import { GOLD, fmtShort, niceTicks, swarm, useRoving, useWidth } from './chartKit';
import { ChartTip, Legend } from './chartParts';
import { peekProps } from '@/components/peek/peekProps';
import { findNFLTeam } from '@/utils/nflTeams';
import { bannerTeamOf } from '@/utils/playerExtras';
import { POSITION_COLORS } from '../graph/graphConfig';
import { displayName } from '@/utils/displayName';
import { CAREER_LABEL } from '@/config/ovr';

/** A player's dot wears his club's colour (where he is best known): the league as a crowd of jerseys */
const clubFill = (p: Player) => {
  const t = findNFLTeam(bannerTeamOf(p));
  return t ? `hsl(${t.primaryColor})` : VIZ.series[0];
};

type MetricId = 'legacy' | 'ovr' | 'tpg';

const METRICS: { id: MetricId; label: string; short: string; decimals: number }[] = [
  { id: 'legacy', label: 'Career Legacy', short: 'Legacy', decimals: 0 },
  { id: 'ovr', label: `Rating (SZN active, ${CAREER_LABEL} retired)`, short: `SZN/${CAREER_LABEL}`, decimals: 0 },
  { id: 'tpg', label: 'Talent per game', short: 'TPG', decimals: 2 },
];

const R = 4.5;
const LABEL_W = 34;
const PAD_R = 14;
const AXIS_H = 26;
const TOP_H = 18;
/** One fixed band per position: a lane of marks on top, the crowd's density strip under it. */
const ROW_H = 54;
const ROW_H_NARROW = 48;
const MARK_LANE = 14;
/** Pixel blocks of the density strip. */
const BLOCK = 4;
const BIN_PX = 6;
/** Beyond the Hall of Famers, each band marks its top few. */
const TOP_N = 5;

interface Dot {
  key: string;
  player: Player;
  value: number;
  hof: boolean;
  cx: number;
  /** Offset from the mark lane's centre line. */
  dy: number;
}

interface Bin {
  n: number;
  lo: number;
  hi: number;
  /** The club most of the bin's players wear (hsl string) */
  fill: string;
}

interface Row {
  pos: Position;
  dots: Dot[];
  bins: Bin[];
  maxBin: number;
  /** Players at this position with a value (the marks are the notable few) */
  total: number;
  totalHof: number;
  top: number;
  height: number;
  median: number;
  leaderKey: string | null;
}

const DotMark = ({
  dot,
  cy,
  decimals,
  r,
  tabIndex,
  onSelect,
  onKey,
  onShow,
}: {
  dot: Dot;
  cy: number;
  decimals: number;
  r: number;
  tabIndex: number;
  onSelect: (p: Player) => void;
  onKey: (e: KeyboardEvent) => void;
  onShow: (d: Dot | null) => void;
}) => (
  <g
    role="button"
    tabIndex={tabIndex}
    data-rk={dot.key}
    aria-label={`${displayName(dot.player.name)}, ${dot.player.position}${dot.player.team ? `, ${dot.player.team}` : ''}: ${fmtNum(dot.value, decimals)}${dot.hof ? ', Hall of Famer' : ''}. Open player`}
    className="cursor-pointer outline-none [&:focus-visible>.ring]:stroke-[hsl(43_100%_62%)]"
    {...peekProps(dot.player)}
    onClick={() => onSelect(dot.player)}
    onKeyDown={onKey}
    onMouseEnter={() => onShow(dot)}
    onFocus={() => onShow(dot)}
    onBlur={() => onShow(null)}
  >
    <circle className="ring" cx={dot.cx} cy={cy} r={12} fill="transparent" stroke="transparent" strokeWidth={2} />
    {dot.hof ? (
      <rect x={dot.cx - r - 1} y={cy - r - 1} width={r * 2 + 2} height={r * 2 + 2} rx={1.5} transform={`rotate(45 ${dot.cx} ${cy})`} fill={GOLD} stroke="#fff6d0" strokeWidth={1} filter="url(#swarm-glow)" />
    ) : (
      <circle cx={dot.cx} cy={cy} r={r} fill={clubFill(dot.player)} stroke="rgb(255 255 255 / 0.45)" strokeWidth={1} />
    )}
  </g>
);

/**
 * Distribution of a career metric at every position, one beeswarm row each (shared axis). Hall of Famers are gold
 * diamonds; Career Legacy shows the Hall of Fame line and tier lines.
 */
const DistributionSwarm = ({ players, ovrMap, onSelect }: { players: Player[]; ovrMap: Map<string, number>; onSelect: (p: Player) => void }) => {
  const [metric, setMetric] = useState<MetricId>('legacy');
  const [hover, setHover] = useState<Dot | null>(null);
  const [boxRef, width] = useWidth();
  const m = METRICS.find((x) => x.id === metric) ?? METRICS[0];

  const valueOf = useMemo(
    () =>
      (p: Player): number | null => {
        if (metric === 'legacy') return p.careerLegacy > 0 ? p.careerLegacy : null;
        if (metric === 'tpg') return p.tpg > 0 ? p.tpg : null;
        return ovrMap.get(playerKey(p)) ?? null;
      },
    [metric, ovrMap],
  );

  const base = useMemo(() => {
    const vals = players.map((p) => ({ p, v: valueOf(p) })).filter((x): x is { p: Player; v: number } => x.v != null);
    const all = vals.map((x) => x.v);
    const hi = metric === 'legacy' ? Math.max(...all, HOF_THRESHOLD) : Math.max(...all, 1);
    const { ticks, domain } = niceTicks(metric === 'ovr' ? Math.min(...all) : 0, hi, 5);
    return { vals, ticks, domain };
  }, [players, valueOf, metric]);

  const plotW = Math.max(width - LABEL_W - PAD_R, 60);
  const x = (v: number) => LABEL_W + ((v - base.domain[0]) / (base.domain[1] - base.domain[0] || 1)) * plotW;

  const narrow = width < 520;
  const rowH = narrow ? ROW_H_NARROW : ROW_H;
  const markR = narrow ? 3 : R;
  const nBins = Math.max(Math.floor(plotW / BIN_PX), 1);
  const { rows, height, order } = useMemo(() => {
    const [d0, d1] = base.domain;
    const span = d1 - d0 || 1;
    // one pass over everyone: bucket by position
    const byPos = new Map<Position, { p: Player; v: number }[]>();
    for (const it of base.vals) {
      const l = byPos.get(it.p.position);
      if (l) l.push(it);
      else byPos.set(it.p.position, [it]);
    }
    let top = TOP_H;
    const rows: Row[] = [];
    POSITIONS.forEach((pos) => {
      const everyone = byPos.get(pos);
      if (!everyone?.length) return;
      everyone.sort((a, b) => a.v - b.v || a.p.name.localeCompare(b.p.name));
      const counts = new Array<number>(nBins).fill(0);
      const clubs = new Array<Map<string, number> | null>(nBins).fill(null);
      let totalHof = 0;
      for (const it of everyone) {
        const bi = Math.min(Math.max(Math.floor(((it.v - d0) / span) * nBins), 0), nBins - 1);
        counts[bi]++;
        const fill = clubFill(it.p);
        const m0 = clubs[bi] ?? (clubs[bi] = new Map());
        m0.set(fill, (m0.get(fill) ?? 0) + 1);
        if (isHallOfFamer(it.p)) totalHof++;
      }
      const bins: Bin[] = [];
      let maxBin = 0;
      counts.forEach((n, i) => {
        if (!n) return;
        let fill: string = VIZ.series[0];
        let best = 0;
        clubs[i]!.forEach((c, f) => {
          if (c > best) {
            best = c;
            fill = f;
          }
        });
        bins.push({ n, lo: d0 + (i / nBins) * span, hi: d0 + ((i + 1) / nBins) * span, fill });
        if (n > maxBin) maxBin = n;
      });
      // marks: every Hall of Famer, plus the band's top few (the leader among them)
      const topSet = new Set(everyone.slice(-TOP_N).map((it) => it.p));
      const list = everyone.filter((it) => topSet.has(it.p) || isHallOfFamer(it.p));
      const cxs = list.map((it) => ({ cx: x(it.v) }));
      const dys = swarm(cxs, markR).map((d) => Math.max(-6, Math.min(6, d)));
      const leader = everyone[everyone.length - 1];
      rows.push({
        pos,
        top,
        height: rowH,
        total: everyone.length,
        totalHof,
        median: quantile(
          everyone.map((it) => it.v),
          50,
        ),
        bins,
        maxBin,
        leaderKey: keyOf(leader.p),
        dots: list.map((it, i) => ({ key: keyOf(it.p), player: it.p, value: it.v, hof: isHallOfFamer(it.p), cx: cxs[i].cx, dy: dys[i] })),
      });
      top += rowH;
    });
    return { rows, height: top + AXIS_H, order: rows.flatMap((r) => r.dots.map((d) => d.key)) };
    // x depends on plotW and the domain
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, plotW, rowH, nBins, markR]);

  const [binTip, setBinTip] = useState<{ x: number; y: number; pos: Position; bin: Bin } | null>(null);
  const onBandMove = (r: Row, e: ReactMouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const [d0, d1] = base.domain;
    const bi = Math.min(Math.max(Math.floor((px / plotW) * nBins), 0), nBins - 1);
    const lo = d0 + (bi / nBins) * (d1 - d0);
    const bin = r.bins.find((b) => Math.abs(b.lo - lo) < (d1 - d0) / nBins / 2);
    setBinTip(bin ? { x: x((bin.lo + bin.hi) / 2), y: r.top + MARK_LANE + 14, pos: r.pos, bin } : null);
  };

  const roving = useRoving(order);
  const plotBottom = height - AXIS_H;
  const hofCount = base.vals.filter((v) => isHallOfFamer(v.p)).length;
  const lines =
    metric === 'legacy'
      ? [
          { v: HOF_THRESHOLD, label: `Great ${fmtShort(HOF_THRESHOLD)}`, strong: true },
          ...LEGACY_TIERS.filter((t) => t.min > HOF_THRESHOLD && t.min <= base.domain[1]).map((t) => ({ v: t.min, label: '', strong: false })),
        ]
      : [];
  const hoverRow = hover ? rows.find((r) => r.pos === hover.player.position) : null;

  const summary = rows
    .map((r) => `${r.pos}: median ${fmtNum(r.median, m.decimals)}, ${r.totalHof} of ${r.total} in the Hall`)
    .join('; ');

  return (
    <ChartFrame
      title="How the league is spread"
      icon={<SwarmIcon className="h-4 w-4 text-gold" aria-hidden="true" />}
      description={`One band per position, by ${m.label}: the blocks are the crowd (taller means more players, tinted by the commonest club), dots mark each position's top five, gold diamonds the ${hofCount} Hall of Famers${IS_NFL ? '' : ' (voted in by the ballot)'}${metric === 'legacy' ? '; the gold line is the Great tier and the faint lines the Elite and Legendary tiers' : '; the tick in each row is the position median'}.`}
      controls={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Chips label="Distribution metric" value={metric} onChange={setMetric} options={METRICS.map((x0) => ({ value: x0.id, label: x0.short, title: x0.label }))} />
          <Legend
            items={[
              {
                key: 'hof',
                label: 'Hall of Famer',
                swatch: (
                  <svg width="12" height="12" aria-hidden="true">
                    <rect x="2.5" y="2.5" width="7" height="7" transform="rotate(45 6 6)" fill={GOLD} />
                  </svg>
                ),
              },
              {
                key: 'rest',
                label: 'The crowd, in its commonest club colour',
                swatch: <span aria-hidden="true" className="h-2.5 w-2.5" style={{ background: 'conic-gradient(#004c54 0 25%, #a71930 0 50%, #4f2683 0 75%, #00338d 0)' }} />,
              },
            ]}
          />
        </div>
      }
      chart={
        <div ref={boxRef} className="relative w-full" onMouseLeave={() => {
          setHover(null);
          setBinTip(null);
        }}>
          <p className="sr-only">{summary}.</p>
          {width > 0 && (
            <div ref={roving.container}>
              <svg width={width} height={height} role="group" aria-label={`Density of ${m.label} by position with the notable players marked. Arrow keys move between marks, Enter opens one.`} className="block">
                <defs>
                  <filter id="swarm-glow" x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="2.2" result="b" />
                    <feFlood floodColor="#ffc63e" floodOpacity="0.85" />
                    <feComposite in2="b" operator="in" />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {/* the field: each position row a turf band, alternating like mown stripes */}
                {rows.map((r, i) => (
                  <rect key={`band-${r.pos}`} x={0} y={r.top} width={width} height={r.height} fill={i % 2 ? 'rgb(46 125 60 / 0.10)' : 'rgb(46 125 60 / 0.05)'} aria-hidden="true" />
                ))}
                {/* Grid + axis */}
                {base.ticks.map((t) => (
                  <g key={t} aria-hidden="true">
                    <line x1={x(t)} x2={x(t)} y1={TOP_H} y2={plotBottom} stroke={VIZ.grid} />
                    <text x={x(t)} y={plotBottom + 16} textAnchor="middle" fontSize={11} fill={VIZ.muted}>
                      {metric === 'tpg' ? t.toFixed(1) : fmtShort(t)}
                    </text>
                  </g>
                ))}
                {lines.map((l) => (
                  <g key={l.v} aria-hidden="true">
                    <line x1={x(l.v)} x2={x(l.v)} y1={TOP_H - 4} y2={plotBottom} stroke={GOLD} strokeOpacity={l.strong ? 0.9 : 0.35} strokeWidth={l.strong ? 2 : 1} strokeDasharray={l.strong ? undefined : '3 3'} />
                    {l.label && (
                      <text x={x(l.v)} y={TOP_H - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill={GOLD}>
                        {l.label}
                      </text>
                    )}
                  </g>
                ))}
                {rows.map((r, i) => {
                  const lane = r.top + MARK_LANE;
                  const floor = r.top + r.height - 3;
                  const maxBlocks = Math.floor((floor - (lane + 9)) / BLOCK);
                  const lead = r.dots.find((d) => d.key === r.leaderKey);
                  const right = lead ? lead.cx > width - 140 : false;
                  return (
                    <g key={r.pos}>
                      {i > 0 && <line x1={0} x2={width} y1={r.top} y2={r.top} stroke={VIZ.grid} strokeDasharray="2 4" aria-hidden="true" />}
                      <g aria-hidden="true">
                        <rect x={0} y={r.top + r.height / 2 - 9} width={28} height={18} rx={4} fill={POSITION_COLORS[r.pos as Position] ?? VIZ.series[0]} />
                        <text x={14} y={r.top + r.height / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#0b1020" className="font-display">
                          {r.pos}
                        </text>
                      </g>
                      {/* the crowd: a density strip of pixel blocks, log-scaled, tinted by the commonest club in each bin */}
                      <g aria-hidden="true" opacity={0.7}>
                        {r.bins.map((b) => {
                          const blocks = Math.max(1, Math.round((Math.log1p(b.n) / Math.log1p(r.maxBin)) * maxBlocks));
                          const bx = x((b.lo + b.hi) / 2) - BIN_PX / 2;
                          return <rect key={b.lo} x={bx} y={floor - blocks * BLOCK} width={BIN_PX - 1} height={blocks * BLOCK - 1} fill={b.fill} />;
                        })}
                      </g>
                      {metric !== 'legacy' && <line x1={x(r.median)} x2={x(r.median)} y1={lane + 8} y2={floor} stroke={VIZ.muted} strokeWidth={2} aria-hidden="true" />}
                      <rect
                        x={LABEL_W}
                        y={lane + 8}
                        width={plotW}
                        height={floor - lane - 8}
                        fill="transparent"
                        onMouseMove={(e) => onBandMove(r, e)}
                        onMouseLeave={() => setBinTip(null)}
                      />
                      {r.dots.map((d) => (
                        <DotMark
                          key={d.key}
                          dot={d}
                          cy={lane + d.dy}
                          decimals={m.decimals}
                          r={markR}
                          tabIndex={roving.tabIndex(d.key)}
                          onSelect={onSelect}
                          onShow={(dd) => {
                            setBinTip(null);
                            setHover(dd);
                            if (dd) roving.setActive(dd.key);
                          }}
                          onKey={(e) => roving.onKeyDown(d.key, e, () => onSelect(d.player))}
                        />
                      ))}
                      {lead && (
                        <text
                          x={right ? lead.cx - 10 : lead.cx + 10}
                          y={lane + lead.dy + 4}
                          textAnchor={right ? 'end' : 'start'}
                          fontSize={11}
                          fontWeight={700}
                          fill="#f5f2e8"
                          stroke="#0b1020"
                          strokeWidth={3}
                          paintOrder="stroke"
                          className="font-display uppercase"
                          aria-hidden="true"
                        >
                          {displayName(lead.player.name).split(' ').slice(-1)[0]}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
          {binTip && !hover && (
            <ChartTip x={binTip.x} y={binTip.y} width={width}>
              <p className="font-semibold text-foreground">
                {binTip.bin.n} {binTip.pos}
                {binTip.bin.n === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 font-mono tabular-nums text-secondary-foreground">
                {m.short} {fmtNum(binTip.bin.lo, m.decimals)} to {fmtNum(binTip.bin.hi, m.decimals)}
              </p>
            </ChartTip>
          )}
          {hover && hoverRow && (
            <ChartTip x={hover.cx} y={hoverRow.top + MARK_LANE + hover.dy} width={width}>
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                {hover.player.team && <TeamLogo team={hover.player.team} size={16} decorative backed />}
                {displayName(hover.player.name)} <span className="text-muted-foreground">· {hover.player.position}</span>
              </p>
              <p className="mt-0.5 font-mono tabular-nums text-secondary-foreground">
                {m.short} {fmtNum(hover.value, m.decimals)}
                {hover.hof ? ' · Hall of Famer' : ''}
              </p>
              <p className="mt-0.5 text-muted-foreground">Click to open the player</p>
            </ChartTip>
          )}
        </div>
      }
      table={
        <div className="relative max-h-[420px] overflow-auto rounded-md border border-line/60">
          <table className="w-full text-sm">
            <caption className="sr-only">{m.label} of each position's Hall of Famers and top players</caption>
            <thead className="sticky top-0 bg-panel-2 text-left font-pixel text-[9px] uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-normal">Pos</th>
                <th scope="col" className="px-2 py-1.5 font-normal">Player</th>
                <th scope="col" className="px-2 py-1.5 text-right font-normal">{m.short}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-normal">HOF</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((r) =>
                [...r.dots].reverse().map((d) => (
                  <tr key={d.key} className="border-t border-line/40">
                    <td className="px-2 py-1 text-muted-foreground" title={POSITION_NAMES[r.pos]}>{r.pos}</td>
                    <td className="px-2 py-1">
                      <button type="button" {...peekProps(d.player)} onClick={() => onSelect(d.player)} className="font-semibold hover:text-gold">
                        {displayName(d.player.name)}
                      </button>
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtNum(d.value, m.decimals)}</td>
                    <td className="px-2 py-1 text-right text-xs">{d.hof ? 'Yes' : ''}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      }
    />
  );
};

export default DistributionSwarm;
