import { useMemo, useState, type CSSProperties } from 'react';
import { BarChart3, Scale, Users } from 'lucide-react';
import { InfoTip } from '@/components/ui/InfoTip';
import { ArcadeToggle, LedDigits } from '@/components/arcade';
import { useOpenCard } from '@/components/fantasy/hub/cardContext';
import { peekKeyProps } from '@/components/peek/peekProps';
import { stag } from '@/components/motion/Reveal';
import { clubHue } from '@/components/fantasy/parts';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useTapPick } from '../stats/comps/graphs/graphKit';
import { f1, type FPos } from '@/utils/fantasy';
import { FAIR_PCT, LEAN_PCT, suggestPartner, type TradeModel, type TradeResult } from '@/utils/tradeSim';
import { Fig, pts, signed, TEAM_LABELS, teamVars } from './TradeParts';
import type { Player } from '@/types/player';

const verdictText = (r: TradeResult, n: number) => {
  if (r.verdict === 'Empty') return 'Add players to each side';
  if (r.verdict === 'Fair') return 'Fair trade';
  const who = r.winner != null ? TEAM_LABELS[r.winner] : '';
  return n > 2 || r.verdict === 'Lopsided' ? `${r.verdict} · ${who} wins` : `Leans ${who}`;
};

/** 0..30% track with the Fair, Leans and Lopsided zones and a marker at the gap. */
export const FairMeter = ({ r }: { r: TradeResult }) => {
  const gap = r.gap * 100;
  const at = Math.min(100, (gap / 30) * 100);
  return (
    <div className={cn('tr-meter', `tr-meter--${r.verdict.toLowerCase()}`)}>
      <div className="tr-meter__top">
        <b className="tr-verdict">{verdictText(r, r.teams.length)}</b>
        <span className="tr-gap">{r.verdict === 'Empty' ? '—' : <LedDigits value={`${gap.toFixed(1)}%`} dot={2.6} />}<i>gap</i></span>
      </div>
      <div className="tr-meter__track" role="img" aria-label={`Gap ${gap.toFixed(1)} percent: Fair under ${FAIR_PCT}, Leans to ${LEAN_PCT}, Lopsided above`}>
        <span className="z z--fair" style={{ width: `${(FAIR_PCT / 30) * 100}%` }} />
        <span className="z z--lean" style={{ width: `${((LEAN_PCT - FAIR_PCT) / 30) * 100}%` }} />
        <span className="z z--lop" />
        {r.verdict !== 'Empty' && <i className="tr-meter__mark" style={{ left: `${at}%` }} />}
      </div>
      <div className="tr-meter__ticks" aria-hidden="true"><span>0</span><span>{FAIR_PCT}%</span><span>{LEAN_PCT}%</span><span>30%+</span></div>
    </div>
  );
};

/** Concept A, the balance scale: two pans (what each side gets), the heavier one sinks. */
export const BalanceScale = ({ r, cards }: { r: TradeResult; cards: Map<string, Player> }) => {
  const [a, b] = r.teams;
  const tilt = r.winner == null || r.verdict === 'Empty' ? 0 : Math.min(7, 1.5 + r.gap * 14) * (r.winner === 0 ? -1 : 1);
  const pan = (i: number) => {
    const t = r.teams[i];
    return (
      <div className={cn('tr-pan', r.winner === i && 'is-heavy')} style={teamVars(i)}>
        <span className="tr-pan__k">{TEAM_LABELS[i]} gets</span>
        <b className="tr-pan__v">{pts(t.receivedValue + t.credit, 0)}</b>
        <span className="tr-pan__figs">
          {t.received.slice(0, 4).map((p) => <Fig key={p.key} player={cards.get(p.key)} club={p.club} />)}
          {!t.received.length && <i className="tr-muted">nothing yet</i>}
        </span>
      </div>
    );
  };
  return (
    <div className="tr-scale" aria-label="Balance scale">
      <div className="tr-beam" style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
        <span className="tr-beam__bar" />
        <div className="tr-beam__end tr-beam__end--l" style={{ transform: `rotate(${-tilt}deg)` }}>{pan(0)}</div>
        <div className="tr-beam__end tr-beam__end--r" style={{ transform: `rotate(${-tilt}deg)` }}>{pan(1)}</div>
      </div>
      <span className="tr-post" aria-hidden="true"><Scale className="h-5 w-5" /></span>
      <span className="sr-only">{a.received.length} players to {TEAM_LABELS[0]}, {b.received.length} to {TEAM_LABELS[1]}</span>
    </div>
  );
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

/** Concept B's finder: fair 1-for-1 and 2-for-1 packages for what side one gives, nearest first. */
export const PartnerFinder = ({
  model, giveKeys, partner, onUse, cards,
}: {
  model: TradeModel;
  giveKeys: string[];
  partner: number;
  onUse: (keys: string[]) => void;
  cards: Map<string, Player>;
}) => {
  const [pos, setPos] = useState<FPos | null>(null);
  const [kind, setKind] = useState<'all' | '1' | '2'>('all');
  const [open, setOpen] = useState(false);
  const openCard = useOpenCard();
  const list = useMemo(() => {
    const all = suggestPartner(model, giveKeys, { pos, limit: 30 });
    return all.filter((p) => (kind === 'all' ? true : kind === '1' ? p.keys.length === 1 : p.keys.length === 2)).slice(0, 8);
  }, [model, giveKeys, pos, kind]);
  return (
    <section className="tr-panel tr-finder" aria-labelledby="tr-finder-h">
      <header className="tr-panel__h">
        <h2 id="tr-finder-h">Draft board</h2>
        <InfoTip label="About partner suggestions">
          For the players {TEAM_LABELS[0]} gives, 1-for-1 and 2-for-1 packages from the top of the pool (positive VOR, not on IR), nearest in value first. The side giving two players gets the roster-spot credit. Pick one to fill {TEAM_LABELS[partner]}.
        </InfoTip>
        <button type="button" className="fh-btn fh-btn--go tr-finder__go" onClick={() => setOpen((o) => !o)} disabled={!giveKeys.length} aria-expanded={open}>
          <Users className="h-4 w-4" aria-hidden="true" /> {open ? 'Hide partners' : 'Suggest a partner'}
        </button>
      </header>
      {!giveKeys.length && <p className="tr-muted">Add a player to {TEAM_LABELS[0]} first.</p>}
      {open && giveKeys.length > 0 && (
        <>
          <div className="tr-filters">
            <ArcadeToggle<string> label="Position" size="sm" value={pos ?? 'all'} onChange={(p) => setPos(p === 'all' ? null : (p as FPos))} options={['all', 'QB', 'RB', 'WR', 'TE'].map((p) => ({ value: p, label: p === 'all' ? 'All' : p }))} />
            <ArcadeToggle<string> label="Package size" size="sm" value={kind} onChange={(k) => setKind(k as 'all' | '1' | '2')} options={[{ value: 'all', label: 'Any' }, { value: '1', label: '1-for-1' }, { value: '2', label: '2-for-1' }]} />
          </div>
          {!list.length ? (
            <p className="tr-muted">No package within 25% of that value.</p>
          ) : (
            <ol className="tr-pk tr-pk--board">
              {list.map((pk, i) => (
                <li key={pk.keys.join('+')} className="mo-rise" style={stag(i, 45)}>
                  <span className="tr-pk__rank" aria-hidden="true">{i + 1}</span>
                  <span className="tr-pk__who">
                    {pk.keys.map((k) => {
                      const p = model.players.get(k)!;
                      return (
                        <button key={k} type="button" className="tr-pk__p tr-open" {...peekKeyProps(k)} onClick={() => openCard(k)} style={{ '--tc': clubHue(p.club) } as CSSProperties} aria-label={`Open ${p.name}'s card`}>
                          <Fig player={cards.get(k)} club={p.club} />
                          <span><b>{p.name}</b><i>{p.pos}{p.posRank} · {p.club}</i></span>
                        </button>
                      );
                    })}
                  </span>
                  <span className={cn('tr-pk__gap', pk.gap * 100 < FAIR_PCT ? 'is-fair' : 'is-lean')}>{(pk.gap * 100).toFixed(1)}%<i>{pk.lean ? (pk.lean === 'give' ? `${TEAM_LABELS[0]} ahead` : `${TEAM_LABELS[partner]} ahead`) : 'level'}</i></span>
                  <button type="button" className="tr-use" onClick={() => onUse(pk.keys)}>Use</button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
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

export const BeforeAfter = ({ r, model, open, onOpenChange }: { r: TradeResult; model: TradeModel; open: boolean; onOpenChange: (o: boolean) => void }) => {
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
            <button key={i} type="button" role="tab" aria-selected={idx === i} className={cn('tr-tab', idx === i && 'is-on')} style={teamVars(i)} onClick={() => setT(i)}>{TEAM_LABELS[i]}</button>
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

export const DrawerButton = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <button type="button" className="tr-drawer-btn" onClick={onClick} disabled={disabled}>
    <BarChart3 className="h-4 w-4" aria-hidden="true" /> Before / after
  </button>
);

