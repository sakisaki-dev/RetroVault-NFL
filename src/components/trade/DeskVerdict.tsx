import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import { ViewCount } from '@/components/motion/Reveal';
import { clubPlate } from '@/components/arcade/clubInk';
import { cn } from '@/lib/utils';
import { f1 } from '@/utils/fantasy';
import { flagsFor, FAIR_PCT, LEAN_PCT, TRADE_METHOD_NOTES, type TradeModel, type TradeResult } from '@/utils/tradeSim';
import { NetBars, SideTotals } from './TradeViews';
import { MethodTip, signed } from './TradeParts';
import { DeskDuel } from './DeskDuel';
import { usePhone } from '@/hooks/usePhone';

const METER_MAX = 30;

export const readOf = (r: TradeResult, n: number): string => {
  if (r.verdict === 'Empty') return 'Add players to each side';
  if (r.verdict === 'Fair') return 'Even enough to accept';
  if (n > 2) return `${r.verdict} · Team ${'ABCD'[r.winner ?? 0]} comes out ahead`;
  const who = r.winner === 0 ? 'you' : 'them';
  return r.verdict === 'Leans' ? `Tilts to ${who}` : `Heavily in favour of ${who}`;
};

/** A short burst in the clubs' colours when a trade lands Fair; CSS only, hidden under reduced motion and Lite mode. */
const Confetti = ({ colors }: { colors: string[] }) => (
  <span className="dk-confetti" aria-hidden="true">
    {Array.from({ length: 26 }, (_, i) => (
      <i key={i} style={{ '--x': `${((i * 37) % 100) - 50}%`, '--d': `${(i % 7) * 40}ms`, '--r': `${(i * 53) % 360}deg`, '--c': colors[i % colors.length], '--h': `${70 + ((i * 29) % 80)}px` } as CSSProperties} />
    ))}
  </span>
);

/** Fires a burst each time the verdict becomes Fair with players on both sides. */
const useBurst = (fair: boolean) => {
  const [burst, setBurst] = useState(0);
  const was = useRef(false);
  useEffect(() => {
    if (fair && !was.current) setBurst((b) => b + 1);
    was.current = fair;
  }, [fair]);
  return burst;
};

const Bars = ({ k, a, b, fmt = (x: number) => x.toFixed(0) }: { k: string; a: number; b: number; fmt?: (x: number) => string }) => {
  const top = Math.max(a, b, 1);
  return (
    <div className="dk-why__row">
      <span className="dk-why__k">{k}</span>
      <div className="dk-why__bars">
        <span className="dk-why__bar dk-why__bar--l"><i style={{ width: `${Math.max(10, (a / top) * 100)}%` }}>{fmt(a)}</i></span>
        <span className="dk-why__bar"><i style={{ width: `${Math.max(10, (b / top) * 100)}%` }}>{fmt(b)}</i></span>
      </div>
    </div>
  );
};

/** "Why this verdict": value, VOR, ROS and weeks 15-17 each side, the roster-spot credit and the context flags, with the method behind a tip. */
const Why = ({ r, model, cardValue }: { r: TradeResult; model: TradeModel; cardValue: (k: string) => number | null }) => {
  const t = r.teams[0];
  const flags = useMemo(() => [...t.sent, ...t.received].flatMap((p) => flagsFor(p, null).filter((f) => f.kind !== 'age').map((f) => ({ id: `${p.key}${f.kind}`, text: `${p.name.split(' ').slice(-1)[0]} · ${f.text}`, tone: f.tone }))), [t]);
  if (r.teams.length > 2) return <div className="dk-why"><SideTotals r={r} model={model} cardValue={cardValue} /></div>;
  return (
    <div className="dk-why mo-pop">
      <p className="dk-why__legend"><span>You give</span><span>You get</span></p>
      <Bars k="Value" a={t.sentValue} b={t.receivedValue + t.credit} />
      <Bars k="VOR" a={t.sentVor} b={t.receivedVor} />
      <Bars k="Rest of season" a={t.sentRos} b={t.receivedRos} />
      <Bars k="Weeks 15–17" a={t.sentPo} b={t.receivedPo} />
      <p className="dk-why__line">
        <span>Roster spots {t.spots ? `+${t.spots}` : '0'}</span>
        <span>Consolidation {t.credit > 0 ? `+${t.credit.toFixed(1)}` : '0.0'}</span>
        <span className={cn(t.net < -0.05 && 'is-neg')}>Your net {signed(t.net)}</span>
        {t.lineup && <span>Lineup {f1(t.lineup.beforeW)} → {f1(t.lineup.afterW)}</span>}
      </p>
      {flags.length > 0 && (
        <ul className="dk-flags" aria-label="Context flags">
          {flags.map((f) => <li key={f.id} className={cn('dk-flag', `dk-flag--${f.tone}`)}>{f.text}</li>)}
        </ul>
      )}
      <p className="dk-why__note">{TRADE_METHOD_NOTES.verdict}</p>
    </div>
  );
};

/**
 * The verdict jumbotron (the middle column; on a phone a compact sticky bar): the stamp, the gap in lit digits, a one-line
 * read, what each side gets, the Fair / Leans / Lopsided meter with its marker, "Why this verdict" and Before / after.
 */
export const DeskVerdict = ({
  r, model, cardValue, any, whyOpen, onWhy, onDrawer, clubs, labels = ['You send', 'You get'],
}: {
  r: TradeResult;
  model: TradeModel;
  cardValue: (k: string) => number | null;
  any: boolean;
  whyOpen: boolean;
  onWhy: () => void;
  onDrawer: () => void;
  clubs: string[];
  labels?: [string, string];
}) => {
  const n = r.teams.length;
  const phone = usePhone();
  const t = r.teams[0];
  const gap = r.gap * 100;
  const v = r.verdict.toLowerCase();
  const empty = r.verdict === 'Empty';
  const burst = useBurst(r.verdict === 'Fair' && r.teams.every((x) => x.sent.length > 0 || x.received.length > 0) && r.teams[0].sent.length > 0 && r.teams[0].received.length > 0);
  const colors = useMemo(() => [...clubs.map((c) => clubPlate(c).fill), '#ffc93c', '#ffffff'], [clubs]);
  return (
    <section className={cn('dk-jb', `dk-jb--${v}`)} aria-label="Verdict">
      {burst > 0 && <Confetti key={burst} colors={colors} />}
      <div className="dk-jb__row">
        {n === 2 ? (
          <div className="dk-jb__side"><small>{labels[0] === 'You send' ? 'You give' : labels[0]}</small><b className="dk-led"><ViewCount value={t.sentValue} /></b></div>
        ) : null}
        <div className="dk-jb__mid">
          <span key={r.verdict} className={cn('dk-stamp', `dk-stamp--${v}`)}>{empty ? 'Waiting' : r.verdict}</span>
          <b className={cn('dk-led dk-led--gap', `dk-led--${v}`)}>{empty ? '--' : <ViewCount value={gap} decimals={1} suffix="%" duration={500} />}</b>
        </div>
        {n === 2 ? (
          <div className="dk-jb__side"><small>{labels[1]}</small><b className="dk-led"><ViewCount value={t.receivedValue + t.credit} /></b></div>
        ) : null}
      </div>
      <p className="dk-jb__read">{readOf(r, n)}</p>
      {n > 2 && !empty && <NetBars r={r} />}
      <div className="dk-meter" role="img" aria-label={`Gap ${gap.toFixed(1)} percent: Fair under ${FAIR_PCT}, Leans to ${LEAN_PCT}, Lopsided above`}>
        <span className="dk-meter__z dk-meter__z--fair" style={{ width: `${(FAIR_PCT / METER_MAX) * 100}%` }} />
        <span className="dk-meter__z dk-meter__z--lean" style={{ width: `${((LEAN_PCT - FAIR_PCT) / METER_MAX) * 100}%` }} />
        <span className="dk-meter__z dk-meter__z--lop" />
        {!empty && <i className="dk-meter__mark" style={{ left: `${Math.min(100, (gap / METER_MAX) * 100)}%` }} />}
      </div>
      <div className="dk-meter__k" aria-hidden="true"><span>Fair</span><span>{FAIR_PCT}%</span><span>Leans</span><span>{LEAN_PCT}%</span><span>Lopsided</span></div>
      <div className="dk-jb__act">
        {(phone || n > 2) && <button type="button" className="dk-link" aria-expanded={whyOpen} onClick={onWhy} disabled={!any}>Why this verdict <ChevronDown className={cn('h-4 w-4', whyOpen && 'rotate-180')} aria-hidden="true" /></button>}
        <button type="button" className="dk-link" onClick={onDrawer} disabled={!any}><BarChart3 className="h-4 w-4" aria-hidden="true" /> Before / after</button>
        <MethodTip model={model} />
      </div>
      {n > 2 ? (whyOpen && any && <Why r={r} model={model} cardValue={cardValue} />) : any && (!phone || whyOpen) && <DeskDuel r={r} model={model} labels={labels} />}
    </section>
  );
};
