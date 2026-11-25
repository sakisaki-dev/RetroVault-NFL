import { useMemo, useState, type CSSProperties } from 'react';
import { BarChart3, MoreHorizontal, Scale, Users, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InfoTip } from '@/components/ui/InfoTip';
import { LedDigits } from '@/components/arcade';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useTapPick } from '../stats/comps/graphs/graphKit';
import { f1, type FPos } from '@/utils/fantasy';
import { FAIR_PCT, LEAN_PCT, suggestPartner, type TradeModel, type TradeResult } from '@/utils/tradeSim';
import { ClubMark, fxTone } from '@/components/fantasy/ClubMark';
import { Fig, pts, signed, TEAM_LABELS, teamVars } from './TradeParts';
import type { Player } from '@/types/player';

const verdictText = (r: TradeResult, n: number) => {
  if (r.verdict === 'Empty') return 'Add players to each side';
  if (r.verdict === 'Fair') return 'Fair trade';
  const who = r.winner != null ? TEAM_LABELS[r.winner] : '';
  return n > 2 || r.verdict === 'Lopsided' ? `${r.verdict} · ${who} wins` : `Leans ${who}`;
};

/** 3-4 teams: each team's own net change, one bar per team around zero. */
export const NetBars = ({ r }: { r: TradeResult }) => {
  const max = Math.max(1e-9, ...r.teams.map((t) => Math.abs(t.net)));
  return (
    <ul className="tr-nets" aria-label="Net change per team">
      {r.teams.map((t, i) => (
        <li key={i} style={teamVars(i)} className={cn(r.winner === i && 'is-win')}>
          <span className="tr-nets__n">{TEAM_LABELS[i]}</span>
          <span className="tr-nets__bar" aria-hidden="true">
            <i className={cn(t.net >= 0 ? 'is-pos' : 'is-neg')} style={{ width: `${(Math.abs(t.net) / max) * 50}%` }} />
          </span>
          <b className={cn('tr-nets__v', t.net < -0.05 && 'is-neg')}>{signed(t.net)}</b>
        </li>
      ))}
    </ul>
  );
};

const Row = ({ k, a, b, hint }: { k: string; a: string; b: string; hint?: string }) => (
  <tr title={hint}>
    <th scope="row">{k}</th>
    <td>{a}</td>
    <td>{b}</td>
  </tr>
);

const cardSum = (ps: { key: string }[], cardValue: (key: string) => number | null) => {
  const v = ps.map((p) => cardValue(p.key)).filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0)).toLocaleString() : '—';
};

/** Side totals per team: VOR, ROS, weeks 15-17, the roster-spot line and the net. */
export const SideTotals = ({ r, model, cardValue }: { r: TradeResult; model: TradeModel; cardValue: (key: string) => number | null }) => (
  <div className="tr-totals">
    {r.teams.map((t, i) => (
      <section key={i} className="tr-tot" style={teamVars(i)} aria-label={`${TEAM_LABELS[i]} totals`}>
        <h3>{TEAM_LABELS[i]}</h3>
        <table>
          <thead><tr><th /><th scope="col">Gives</th><th scope="col">Gets</th></tr></thead>
          <tbody>
            <Row k="VOR" a={pts(t.sentVor, 0)} b={pts(t.receivedVor, 0)} hint="Weighted rest-of-season points over replacement, players above it" />
            <Row k="ROS" a={t.sentRos.toFixed(0)} b={t.receivedRos.toFixed(0)} hint="Projected points over the remaining weeks" />
            <Row k="Wk 15–17" a={t.sentPo.toFixed(0)} b={t.receivedPo.toFixed(0)} hint="Projected points in the fantasy playoff weeks" />
            <Row k="Players" a={`${t.sent.length}`} b={`${t.received.length}`} />
            <Row k="Card value" a={cardSum(t.sent, cardValue)} b={cardSum(t.received, cardValue)} hint="The collectible card market's value: a separate lens, never part of the verdict" />
            <Row k="Stud value" a={pts(t.sentValue, 0)} b={pts(t.receivedValue, 0)} hint="VOR with the stud premium, the unit the verdict uses" />
          </tbody>
        </table>
        <p className="tr-tot__line">
          <span>Roster spots {t.spots ? `+${t.spots}` : '0'}</span>
          <span>Consolidation {t.credit > 0 ? `+${t.credit.toFixed(1)}` : '0.0'}</span>
        </p>
        {t.lineup && (
          <p className="tr-tot__line">
            <span>Lineup {f1(t.lineup.beforeW)} → {f1(t.lineup.afterW)}</span>
          </p>
        )}
        <p className={cn('tr-tot__net', t.net < -0.05 && 'is-neg')}>Net {signed(t.net)}</p>
      </section>
    ))}
    <span className="sr-only">{model.season}</span>
  </div>
);

/** Quick starts for an empty page, from today's top players (nothing typed in): a 1-for-1, a 2-for-1 and a sell-high. */
export const quickStarts = (model: TradeModel): { id: string; label: string; a: string[]; b: string[] }[] => {
  const out: { id: string; label: string; a: string[]; b: string[] }[] = [];
  const sur = (k: string) => (model.players.get(k)?.name ?? k).split(' ').slice(1).join(' ') || (model.players.get(k)?.name ?? k);
  const top = (pos: FPos) => model.ranked.filter((p) => p.pos === pos)[0];
  const pkg = (key: string, size: 1 | 2, pos?: FPos) => suggestPartner(model, [key], { limit: 200, pos: pos ?? null }).find((x) => x.keys.length === size) ?? suggestPartner(model, [key], { limit: 200 }).find((x) => x.keys.length === size);
  const wr = top('WR');
  const one = wr && pkg(wr.key, 1, 'WR');
  if (wr && one) out.push({ id: '1', label: `1-for-1: ${sur(wr.key)} for ${sur(one.keys[0])}`, a: [wr.key], b: one.keys });
  const rb = top('RB');
  const two = rb && pkg(rb.key, 2);
  if (rb && two) out.push({ id: '2', label: `2-for-1: ${sur(rb.key)} for ${two.keys.map(sur).join(' + ')}`, a: [rb.key], b: two.keys });
  const luck = model.ranked.slice(0, 40).filter((p) => p.tdObs - p.tdExp > 0).sort((x, y) => y.tdObs - y.tdExp - (x.tdObs - x.tdExp))[0];
  const sold = luck && pkg(luck.key, 1, luck.pos);
  if (luck && sold) out.push({ id: 's', label: `Sell high: ${sur(luck.key)}`, a: [luck.key], b: sold.keys });
  return out;
};

/** Before / after: weekly projected points, a pair of bars a week; tap a week for the figures (graphKit's tap-to-pick). */
const WeekPairs = ({ weeks, a, b, aLabel, bLabel, tint }: { weeks: number[]; a: number[]; b: number[]; aLabel: string; bLabel: string; tint: string }) => {
  const { picked, pick, boxProps } = useTapPick<number>();
  const top = Math.max(10, Math.ceil(Math.max(...a, ...b) / 10) * 10);
  const h = (v: number) => `${Math.max(0, v / top) * 100}%`;
  const i = picked != null ? weeks.indexOf(picked) : -1;
  return (
    <div className="tr-chart-box" {...boxProps}>
      <div className="tr-chart" role="list" aria-label="Projected points by week">
        <div className="tr-chart__grid" aria-hidden="true">
          {[0, 0.5, 1].map((x) => <span key={x} style={{ bottom: `${x * 100}%` }}><i>{Math.round(top * x)}</i></span>)}
        </div>
        {weeks.map((w, k) => (
          <button key={w} type="button" role="listitem" className={cn('tr-chart__col', picked === w && 'is-sel')} onClick={() => pick(picked === w ? null : w)} aria-label={`Week ${w}: ${aLabel} ${a[k].toFixed(1)}, ${bLabel} ${b[k].toFixed(1)}`}>
            <span className="tr-chart__pair">
              <i className="tr-bar tr-bar--a" style={{ height: h(a[k]) }} />
              <i className="tr-bar tr-bar--b" style={{ height: h(b[k]), background: tint }} />
            </span>
            <span className="tr-chart__wk">{w}</span>
          </button>
        ))}
      </div>
      <div className="tr-pickbar" aria-live="polite">
        {i >= 0 ? (
          <>
            <b>Week {weeks[i]}</b>
            <span><em>{aLabel}</em> {a[i].toFixed(1)}</span>
            <span><em>{bLabel}</em> {b[i].toFixed(1)}</span>
            <span className={cn('tr-pickbar__d', b[i] - a[i] < -0.05 && 'is-neg')}>{signed(b[i] - a[i])}</span>
          </>
        ) : (
          <span className="tr-muted">Tap a week for the figures</span>
        )}
      </div>
      <ul className="tr-legend">
        <li><i className="tr-bar tr-bar--a" />{aLabel}</li>
        <li><i className="tr-bar tr-bar--b" style={{ background: tint }} />{bLabel}</li>
      </ul>
    </div>
  );
};

export const BeforeAfter = ({ r, model, open, onOpenChange, labels }: { r: TradeResult; model: TradeModel; open: boolean; onOpenChange: (o: boolean) => void; labels?: string[] }) => {
  const [t, setT] = useState(0);
  const idx = Math.min(t, r.teams.length - 1);
  const team = r.teams[idx];
  const roster = !!team.lineup;
  const a = roster ? team.lineup!.before : team.weeklyGive;
  const b = roster ? team.lineup!.after : team.weeklyGet;
  const sumA = a.reduce((x, y) => x + y, 0);
  const sumB = b.reduce((x, y) => x + y, 0);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="tr-drawer max-h-[88dvh] overflow-y-auto" style={teamVars(idx)}>
        <SheetTitle className="font-display text-xl uppercase">{roster ? 'Lineup before and after' : 'What goes and what comes'}</SheetTitle>
        <SheetDescription className="tr-muted">{roster ? 'Best starting lineup each week, projected points.' : 'Projected points a week for the players each side gives and gets.'}</SheetDescription>
        <div className="tr-tabs" role="tablist" aria-label="Team">
          {r.teams.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={idx === i} className={cn('tr-tab', idx === i && 'is-on')} style={teamVars(i)} onClick={() => setT(i)}>{labels?.[i] ?? TEAM_LABELS[i]}</button>
          ))}
        </div>
        <WeekPairs weeks={model.weeks} a={a} b={b} aLabel={roster ? 'Before' : 'Gives'} bLabel={roster ? 'After' : 'Gets'} tint="var(--tm)" />
        <p className="tr-drawer__sum">
          <span>{roster ? 'Before' : 'Gives'} <b>{f1(sumA)}</b></span>
          <span>{roster ? 'After' : 'Gets'} <b>{f1(sumB)}</b></span>
          <span className={cn(sumB - sumA < -0.05 && 'is-neg')}>Change <b>{signed(sumB - sumA)}</b></span>
        </p>
      </SheetContent>
    </Sheet>
  );
};

