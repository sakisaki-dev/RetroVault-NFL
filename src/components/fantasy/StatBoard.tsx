import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { ViewCount, stag } from '@/components/motion/Reveal';
import { cn } from '@/lib/utils';
import { f1, ord, tierOfFinish, useFantasyRaw, type FPos } from '@/utils/fantasy';
import { statContext, type StatContext } from './stats';
import { tileGrid } from './parts';

export interface BoardTile {
  id: string;
  k: string;
  /** the figure: a number (counted up) with its formatting, or text */
  num?: { value: number; decimals?: number; suffix?: string };
  v?: string;
  sub?: string;
  tone?: 'lead' | 'good' | 'bad';
}

const span = (v: number, lo: number, hi: number) => (hi > lo ? `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%` : '50%');

/** What a stat is, where he stands against his position, the leader and median, a strip of the league and the formula. */
export const Detail = ({ ctx, pos }: { ctx: StatContext; pos: FPos }) => {
  const { def, value, rank, of, pct, leader, median, dist, weeks } = ctx;
  const lo = dist[0] ?? 0;
  const hi = dist[dist.length - 1] ?? 1;
  const tiers = def.id === 'sw' || def.id === 'bm' || def.id === 'bu';
  const wmax = Math.max(1, ...weeks);
  const group = def.id === 'overall' ? 'skill players' : `${pos}s`;
  return (
    <div className="fx-det__in">
      <p className="fx-det__what">{def.what}</p>
      <div className="fx-det__facts">
        <div><em>Against {group}</em><b>{rank != null ? <>{ord(rank)} <i>of {of}</i></> : '—'}</b>{pct != null && <span>{pct}th percentile</span>}</div>
        <div><em>League leader</em><b>{leader ? def.fmt(leader.value) : '—'}</b>{leader && <span>{leader.name}</span>}</div>
        <div><em>{pos} median</em><b>{median != null ? def.fmt(median) : '—'}</b>{value != null && median != null && value !== median && <span>{value > median ? '+' : '−'}{def.fmt(Math.abs(value - median))} for him</span>}</div>
      </div>
      {dist.length > 1 && (
        <div className="fx-dist" role="img" aria-label={`${of} ${group} from ${def.fmt(lo)} to ${def.fmt(hi)}${value != null ? `, he is at ${def.fmt(value)}` : ''}`}>
          <div className="fx-dist__track">
            {dist.map((d, i) => <i key={i} style={{ left: span(d, lo, hi) }} />)}
            {median != null && <u style={{ left: span(median, lo, hi) }} title="Median" />}
            {value != null && <b style={{ left: span(value, lo, hi) }} title="Him" />}
          </div>
          <div className="fx-dist__ends"><span>{def.fmt(lo)}</span><span>{def.low ? 'lower is better' : 'higher is better'}</span><span>{def.fmt(hi)}</span></div>
        </div>
      )}
      {weeks.length > 0 && (
        <div className="fx-wkbars" aria-label="His weeks">
          {weeks.map((w, i) => (
            tiers
              ? <span key={i} className={cn('fx-wkdot', `fx-wkdot--${tierOfFinish(pos, w)}`)} title={`${pos}${w} that week`}>{w}</span>
              : <i key={i} style={{ height: `${Math.max(6, (Math.max(0, w) / wmax) * 100)}%` }} title={f1(w)} />
          ))}
        </div>
      )}
      <p className="fx-det__f"><em>Formula</em> {def.formula}</p>
    </div>
  );
};

/** A tile grid whose tiles open a detail (one at a time, the same card hover and press as the Skill ratings). */
const StatBoard = ({ tiles, playerKey, pos, open, onOpen, grid, className, first = 0 }: {
  tiles: BoardTile[]; playerKey: string; pos: FPos; open: string | null; onOpen: (id: string | null) => void; grid?: boolean; className?: string; first?: number;
}) => {
  const raw = useFantasyRaw();
  const openTile = tiles.find((t) => t.id === open);
  const ctx = useMemo(() => (raw && openTile ? statContext(raw, playerKey, openTile.id) : null), [raw, playerKey, openTile]);
  const out: ReactNode[] = [];
  tiles.forEach((t, i) => {
    const on = open === t.id;
    out.push(
      <button
        key={t.id}
        id={`fx-stat-${t.id}`}
        type="button"
        aria-expanded={on}
        aria-controls={`fx-det-${t.id}`}
        className={cn('fx-tile rbk-chip mo-rise', t.tone && `fx-tile--${t.tone}`, on && 'is-open', grid && i === tiles.length - 1 && 'fx-tile--last')}
        style={stag(i + first)}
        onClick={() => onOpen(on ? null : t.id)}
      >
        <span className="fx-tile__k">{t.k}<ChevronDown className="fx-tile__c" aria-hidden="true" /></span>
        <span className="fx-tile__v">{t.num ? <ViewCount value={t.num.value} decimals={t.num.decimals ?? 0} suffix={t.num.suffix} /> : t.v}</span>
        <span className="fx-tile__s">{t.sub ?? ' '}</span>
      </button>,
    );
    if (on && ctx) out.push(<div key={`${t.id}-d`} id={`fx-det-${t.id}`} className="fx-det dd-enter" role="region" aria-label={`${t.k} detail`}><Detail ctx={ctx} pos={pos} /></div>);
  });
  return <div className={cn('fx-tiles', className)} style={grid ? tileGrid(tiles.length) : ({ '--cols': tiles.length } as CSSProperties)}>{out}</div>;
};

export default StatBoard;
