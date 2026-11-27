import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { Reveal, stag } from '@/components/motion/Reveal';
import { clubPlate } from '@/components/arcade/clubInk';
import { teamOf } from '@/components/fantasy/parts';
import { InfoTip } from '@/components/ui/InfoTip';
import { cn } from '@/lib/utils';
import { liftForDarkBg } from '@/utils/teamColors';
import { f1 } from '@/utils/fantasy';
import { flagsFor, SCORING_LABEL, TRADE_METHOD_NOTES, type TradeModel, type TradePlayer, type TradeResult } from '@/utils/tradeSim';
import { signed } from './TradeParts';
import { reducedMotion } from '@/utils/motion';

/**
 * The Trade duel: the Game page's QB duel (gameSections.tsx QbDuel; same header, grouped rows, mirrored bars that grow in,
 * winner highlight and staggered rise) for the two sides of a trade. Each row is left value, label, right value; the
 * bar splits by who leads (the lower value leads where lower wins). It updates live: the bars slide as players change.
 */
type Unit = 'int' | 'one' | 'pc' | 'pc100';
interface Row { label: string; a: number | null; b: number | null; u?: Unit; better?: 'hi' | 'lo' }
const SHOW: Record<Unit, { mult: number; dec: number; suffix: string }> = { int: { mult: 1, dec: 0, suffix: '' }, one: { mult: 1, dec: 1, suffix: '' }, pc: { mult: 100, dec: 0, suffix: '%' }, pc100: { mult: 1, dec: 0, suffix: '%' } };
interface Group { title: string; rows: Row[] }

const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const has = (xs: (number | null | undefined)[]) => xs.some((x) => x != null);
const total = (ps: TradePlayer[], f: (p: TradePlayer) => number | null | undefined): number | null => (ps.length && has(ps.map(f)) ? sum(ps.map(f)) : null);
const mean = (ps: TradePlayer[], f: (p: TradePlayer) => number | null | undefined): number | null => {
  const xs = ps.map(f).filter((x): x is number => x != null);
  return xs.length ? sum(xs) / xs.length : null;
};

/** The share of the bar the left side takes: 50% level, more when it leads (the lower value leads where lower wins). */
export const splitOf = (a: number, b: number, better?: 'hi' | 'lo'): number => {
  const tot = Math.abs(a) + Math.abs(b);
  if (!tot) return 50;
  if (!better) return Math.max(8, Math.min(92, (Math.abs(a) / tot) * 100));
  const d = (better === 'hi' ? a - b : b - a) / tot;
  return Math.max(8, Math.min(92, 50 + 50 * d));
};

/** A figure that counts to its value, and back down to 0 before it shows a dash when its side empties. */
const Val = ({ v, dec, suffix }: { v: number | null; dec: number; suffix: string }) => {
  const last = useRef(v ?? 0);
  const [shown, setShown] = useState<number | null>(v);
  useEffect(() => {
    const target = v ?? 0;
    const still = typeof document !== 'undefined' && (document.documentElement.dataset.perf === 'lite' || reducedMotion());
    if (still) { last.current = target; setShown(v); return; }
    const a = last.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      const x = a + (target - a) * (1 - (1 - k) ** 3);
      last.current = x;
      setShown(k < 1 || v != null ? x : null);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  if (shown == null) return <>–</>;
  return <>{shown.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{suffix}</>;
};

const groupsOf = (r: TradeResult, model: TradeModel): Group[] => {
  const t = r.teams[0];
  const L = t.sent;
  const R = t.received;
  const unit = SCORING_LABEL[model.settings.scoring];
  const groups: Group[] = [
    { title: 'Value', rows: [
      { label: 'Trade value', a: t.sentValue, b: t.receivedValue, u: 'int', better: 'hi' },
      { label: 'Value over replacement', a: t.sentVor, b: t.receivedVor, u: 'int', better: 'hi' },
      { label: 'Consolidation', a: 0, b: t.credit, u: 'one', better: 'hi' },
      { label: 'Roster spots', a: 0, b: t.spots, u: 'int', better: 'hi' },
    ] },
    { title: 'Season', rows: [
      { label: 'Rest of season', a: t.sentRos, b: t.receivedRos, u: 'int', better: 'hi' },
      { label: 'Weeks 15–17', a: t.sentPo, b: t.receivedPo, u: 'int', better: 'hi' },
      { label: `${unit} / game`, a: total(L, (p) => p.ppg), b: total(R, (p) => p.ppg), u: 'one', better: 'hi' },
    ] },
    { title: 'Floor & ceiling', rows: [
      { label: 'Floor', a: total(L, (p) => p.fl), b: total(R, (p) => p.fl), u: 'one', better: 'hi' },
      { label: 'Ceiling', a: total(L, (p) => p.ce), b: total(R, (p) => p.ce), u: 'one', better: 'hi' },
      { label: 'Start-worthy', a: mean(L, (p) => p.startRate), b: mean(R, (p) => p.startRate), u: 'pc', better: 'hi' },
      { label: 'Bust weeks', a: mean(L, (p) => p.bustRate), b: mean(R, (p) => p.bustRate), u: 'pc', better: 'lo' },
    ] },
    { title: 'Usage', rows: [
      { label: 'Opportunities / game', a: total(L, (p) => p.rec.op?.og?.[0]), b: total(R, (p) => p.rec.op?.og?.[0]), u: 'one', better: 'hi' },
      { label: 'Target share', a: total(L, (p) => p.rec.op?.ts?.[0]), b: total(R, (p) => p.rec.op?.ts?.[0]), u: 'pc100', better: 'hi' },
    ] },
  ];
  // a side with nobody on it has no figures: its values are dashes and its bars stay empty tracks
  return groups.map((g) => ({ ...g, rows: g.rows.map((x) => ({ ...x, a: L.length ? x.a : null, b: R.length ? x.b : null })) }));
};

const surname = (n: string) => n.split(' ').slice(-1)[0];
const clubOfSide = (ps: TradePlayer[]) => ps[0]?.club ?? null;
const FALLBACK = ['hsl(43 90% 58%)', 'hsl(199 80% 58%)'];

const Who = ({ ps, label, club, right }: { ps: TradePlayer[]; label: string; club: string | null; right?: boolean }) => {
  const flags = useMemo(() => ps.flatMap((p) => flagsFor(p, null).filter((f) => f.kind !== 'age').map((f) => ({ id: `${p.key}${f.kind}`, text: `${surname(p.name)} · ${f.text}`, tone: f.tone }))), [ps]);
  const clubs = [...new Set(ps.map((p) => p.club))];
  return (
    <div className={cn('dk-du__who', right ? 'is-r' : '', ps.length ? (right ? 'mo-run-r' : 'mo-run-l') : 'is-empty')} style={{ '--tc': club ? clubPlate(club).fill : FALLBACK[right ? 1 : 0] } as CSSProperties}>
      <span className="dk-du__logos" aria-hidden="true">{clubs.slice(0, 2).map((c) => <TeamLogo key={c} team={teamOf(c)} size={30} decorative backed />)}</span>
      <span className="dk-du__id">
        <small>{label}</small>
        <b>{ps.length === 0 ? '–' : ps.length === 1 ? ps[0].name : ps.length === 2 ? ps.map((p) => surname(p.name)).join(' + ') : `${ps.length} players`}</b>
        {flags.length > 0 && (
          <ul className="dk-du__flags" aria-label="Context flags">
            {flags.slice(0, 4).map((f) => <li key={f.id} className={cn('dk-flag', `dk-flag--${f.tone}`)}>{f.text}</li>)}
          </ul>
        )}
      </span>
    </div>
  );
};

export const DeskDuel = ({ r, model, labels = ['You send', 'You get'] }: { r: TradeResult; model: TradeModel; labels?: [string, string] }) => {
  const t = r.teams[0];
  const groups = useMemo(() => groupsOf(r, model), [r, model]);
  const ca = clubOfSide(t.sent);
  const cb = clubOfSide(t.received);
  const sameClub = ca && ca === cb;
  const colA = ca && !sameClub ? liftForDarkBg(clubPlate(ca).fill, 46) : FALLBACK[0];
  const colB = cb && !sameClub ? liftForDarkBg(clubPlate(cb).fill, 46) : FALLBACK[1];
  let ord = 0;
  return (
    <section className={cn('dk-du mo-pop', !t.sent.length && !t.received.length && 'is-grey')} aria-label="Trade duel">
      <header className="dk-du__t">
        <span><b>Trade duel</b><i>Side against side</i></span>
        <InfoTip label="How the verdict is made" className="tr-info"><p>{TRADE_METHOD_NOTES.verdict}</p></InfoTip>
      </header>
      <div className="dk-du__top"><Who ps={t.sent} label={labels[0]} club={ca} /><Who ps={t.received} label={labels[1]} club={cb} right /></div>
      <Reveal className="dk-du__body" style={{ '--ca': colA, '--ch': colB } as CSSProperties}>
        {groups.map((g) => (
          <div key={g.title} className="dk-du__grp">
            <p className="dk-du__gh">{g.title}</p>
            {g.rows.map((x) => {
              const i = ord++;
              const u = SHOW[x.u ?? 'int'];
              const none = x.a == null && x.b == null;
              const a = x.a ?? 0;
              const b = x.b ?? 0;
              const win = (p: number, q: number) => !!x.better && p !== q && (x.better === 'hi' ? p > q : p < q);
              const lead = x.a == null || x.b == null || Math.abs(a - b) < 0.05 ? 0 : win(a, b) ? 1 : -1;
              const split = none ? 50 : x.a == null ? 0 : x.b == null ? 100 : splitOf(a, b, x.better);
              const val = (v: number | null) => <Val v={v == null ? null : v * u.mult} dec={u.dec} suffix={u.suffix} />;
              return (
                <div key={x.label} className={cn('dk-du__row mo-rise', none && 'is-empty')} style={stag(i)}>
                  <b className={cn(lead === 1 && 'is-better', lead === -1 && 'is-worse', x.a == null && 'is-nil')}>{val(x.a)}</b>
                  <span className="dk-du__lab">{x.label}{x.better === 'lo' ? ' (lower wins)' : ''}</span>
                  <b className={cn(lead === -1 && 'is-better', lead === 1 && 'is-worse', x.b == null && 'is-nil')}>{val(x.b)}</b>
                  <span className="dk-du__split" aria-hidden="true">
                    <i className={cn('a mo-grow', x.a == null && 'is-off')} style={{ width: x.a == null ? '0%' : `${split}%`, '--i': i + 1 } as CSSProperties} />
                    <i className={cn('h mo-grow mo-grow--r', x.b == null && 'is-off')} style={{ width: x.b == null ? '0%' : `${100 - split}%`, '--i': i + 1 } as CSSProperties} />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </Reveal>
      <p className="dk-du__line">
        {(t.sent.length > 0 || t.received.length > 0) && <span className={cn(t.net < -0.05 && 'is-neg')}>Your net {signed(t.net)}</span>}
        {t.lineup && <span>Lineup {f1(t.lineup.beforeW)} → {f1(t.lineup.afterW)}</span>}
      </p>
    </section>
  );
};
