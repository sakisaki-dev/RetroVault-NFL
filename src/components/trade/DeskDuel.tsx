import { useMemo, type CSSProperties } from 'react';
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

/**
 * The Trade duel: the Game page's QB duel (gameSections.tsx QbDuel; same header, grouped rows, mirrored bars that grow in,
 * winner highlight and staggered rise) for the two sides of a trade. Each row is left value, label, right value; the
 * bar splits by who leads (the lower value leads where lower wins). It updates live: the bars slide as players change.
 */
interface Row { label: string; a: number | null; b: number | null; fmt?: (n: number) => string; better?: 'hi' | 'lo' }
interface Group { title: string; rows: Row[] }

const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const has = (xs: (number | null | undefined)[]) => xs.some((x) => x != null);
const total = (ps: TradePlayer[], f: (p: TradePlayer) => number | null | undefined): number | null => (ps.length && has(ps.map(f)) ? sum(ps.map(f)) : null);
const mean = (ps: TradePlayer[], f: (p: TradePlayer) => number | null | undefined): number | null => {
  const xs = ps.map(f).filter((x): x is number => x != null);
  return xs.length ? sum(xs) / xs.length : null;
};
const int = (n: number) => n.toFixed(0);
const one = (n: number) => n.toFixed(1);
const pc = (n: number) => `${Math.round(n * 100)}%`;
const pc100 = (n: number) => `${n.toFixed(0)}%`;

/** The share of the bar the left side takes: 50% level, more when it leads (the lower value leads where lower wins). */
export const splitOf = (a: number, b: number, better?: 'hi' | 'lo'): number => {
  const tot = Math.abs(a) + Math.abs(b);
  if (!tot) return 50;
  if (!better) return Math.max(8, Math.min(92, (Math.abs(a) / tot) * 100));
  const d = (better === 'hi' ? a - b : b - a) / tot;
  return Math.max(8, Math.min(92, 50 + 50 * d));
};

const groupsOf = (r: TradeResult, model: TradeModel): Group[] => {
  const t = r.teams[0];
  const L = t.sent;
  const R = t.received;
  const unit = SCORING_LABEL[model.settings.scoring];
  return [
    { title: 'Value', rows: [
      { label: 'Trade value', a: t.sentValue, b: t.receivedValue, fmt: int, better: 'hi' },
      { label: 'Value over replacement', a: t.sentVor, b: t.receivedVor, fmt: int, better: 'hi' },
      { label: 'Consolidation', a: 0, b: t.credit, fmt: one, better: 'hi' },
      { label: 'Roster spots', a: 0, b: t.spots, fmt: int, better: 'hi' },
    ] },
    { title: 'Season', rows: [
      { label: 'Rest of season', a: t.sentRos, b: t.receivedRos, fmt: int, better: 'hi' },
      { label: 'Weeks 15–17', a: t.sentPo, b: t.receivedPo, fmt: int, better: 'hi' },
      { label: `${unit} / game`, a: total(L, (p) => p.ppg), b: total(R, (p) => p.ppg), fmt: one, better: 'hi' },
    ] },
    { title: 'Floor & ceiling', rows: [
      { label: 'Floor', a: total(L, (p) => p.fl), b: total(R, (p) => p.fl), fmt: one, better: 'hi' },
      { label: 'Ceiling', a: total(L, (p) => p.ce), b: total(R, (p) => p.ce), fmt: one, better: 'hi' },
      { label: 'Start-worthy', a: mean(L, (p) => p.startRate), b: mean(R, (p) => p.startRate), fmt: pc, better: 'hi' },
      { label: 'Bust weeks', a: mean(L, (p) => p.bustRate), b: mean(R, (p) => p.bustRate), fmt: pc, better: 'lo' },
    ] },
    { title: 'Usage', rows: [
      { label: 'Opportunities / game', a: total(L, (p) => p.rec.op?.og?.[0]), b: total(R, (p) => p.rec.op?.og?.[0]), fmt: one, better: 'hi' },
      { label: 'Target share', a: total(L, (p) => p.rec.op?.ts?.[0]), b: total(R, (p) => p.rec.op?.ts?.[0]), fmt: pc100, better: 'hi' },
    ] },
  ];
};

const surname = (n: string) => n.split(' ').slice(-1)[0];
const clubOfSide = (ps: TradePlayer[]) => ps[0]?.club ?? null;
const FALLBACK = ['hsl(43 90% 58%)', 'hsl(199 80% 58%)'];

const Who = ({ ps, label, club, right }: { ps: TradePlayer[]; label: string; club: string | null; right?: boolean }) => {
  const flags = useMemo(() => ps.flatMap((p) => flagsFor(p, null).filter((f) => f.kind !== 'age').map((f) => ({ id: `${p.key}${f.kind}`, text: `${surname(p.name)} · ${f.text}`, tone: f.tone }))), [ps]);
  const clubs = [...new Set(ps.map((p) => p.club))];
  return (
    <div className={cn('dk-du__who', right ? 'is-r mo-run-r' : 'mo-run-l')} style={{ '--tc': club ? clubPlate(club).fill : FALLBACK[right ? 1 : 0] } as CSSProperties}>
      <span className="dk-du__logos" aria-hidden="true">{clubs.slice(0, 2).map((c) => <TeamLogo key={c} team={teamOf(c)} size={30} decorative backed />)}</span>
      <span className="dk-du__id">
        <small>{label}</small>
        <b>{ps.length === 0 ? 'Nobody yet' : ps.length === 1 ? ps[0].name : ps.length === 2 ? ps.map((p) => surname(p.name)).join(' + ') : `${ps.length} players`}</b>
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
    <section className="dk-du mo-pop" aria-label="Trade duel">
      <header className="dk-du__t">
        <span><b>Trade duel</b><i>Side against side</i></span>
        <InfoTip label="How the verdict is made" className="tr-info"><p>{TRADE_METHOD_NOTES.verdict}</p></InfoTip>
      </header>
      <div className="dk-du__top"><Who ps={t.sent} label={labels[0]} club={ca} /><Who ps={t.received} label={labels[1]} club={cb} right /></div>
      <Reveal className="dk-du__body" style={{ '--ca': colA, '--ch': colB } as CSSProperties}>
        {groups.map((g) => (
          <div key={g.title} className="dk-du__grp">
            <p className="dk-du__gh">{g.title}</p>
            {g.rows.filter((x) => x.a != null || x.b != null).map((x) => {
              const i = ord++;
              const f = x.fmt ?? int;
              const a = x.a ?? 0;
              const b = x.b ?? 0;
              const win = (p: number, q: number) => !!x.better && p !== q && (x.better === 'hi' ? p > q : p < q);
              const lead = Math.abs(a - b) < 0.05 ? 0 : win(a, b) ? 1 : -1;
              const split = x.a != null && x.b != null ? splitOf(a, b, x.better) : 50;
              return (
                <div key={x.label} className="dk-du__row mo-rise" style={stag(i)}>
                  <b className={cn(lead === 1 && 'is-better', lead === -1 && 'is-worse')}>{x.a == null ? '–' : f(a)}</b>
                  <span className="dk-du__lab">{x.label}{x.better === 'lo' ? ' (lower wins)' : ''}</span>
                  <b className={cn(lead === -1 && 'is-better', lead === 1 && 'is-worse')}>{x.b == null ? '–' : f(b)}</b>
                  <span className="dk-du__split" aria-hidden="true">
                    <i className="a mo-grow" style={{ width: `${split}%`, '--i': i + 1 } as CSSProperties} />
                    <i className="h mo-grow mo-grow--r" style={{ width: `${100 - split}%`, '--i': i + 1 } as CSSProperties} />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </Reveal>
      <p className="dk-du__line">
        <span className={cn(t.net < -0.05 && 'is-neg')}>Your net {signed(t.net)}</span>
        {t.lineup && <span>Lineup {f1(t.lineup.beforeW)} → {f1(t.lineup.afterW)}</span>}
      </p>
    </section>
  );
};
