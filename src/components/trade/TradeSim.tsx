import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, SlidersHorizontal, Users, X } from 'lucide-react';
import { ArcadeToggle } from '@/components/arcade';
import FootballLoader from '@/components/motion/FootballLoader';
import { useHubRoute } from '@/components/stats/hub/hashRoute';
import { stag } from '@/components/motion/Reveal';
import { InfoTip } from '@/components/ui/InfoTip';
import { cn } from '@/lib/utils';
import { evaluateTrade, type TradeTeam } from '@/utils/tradeSim';
import { BeforeAfter, FindDeal, quickStarts, SideTotals, VerdictBar } from './TradeViews';
import { ClubChips, ClubMark, fxTone } from '@/components/fantasy/ClubMark';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AddSearch, MethodTip, PlayerPicker, RecvRow, TEAM_LABELS, TradeCard, teamVars } from './TradeParts';
import type { useTradeEnv } from './useTrade';
import './trade.css';

/**
 * Team Lab > Trade (#lab/trade): the fantasy trade simulator. 2 to 4 teams, each a column of players (flat club-colour
 * cards with the sprite, position rank, points a game, ROS, VOR, flags and an expandable stat panel); a balance scale
 * (2 teams) or a net bar per team (3-4) with the Fair meter; side totals; "Suggest a partner"; a before / after drawer.
 * Rules and constants: src/utils/tradeSim.ts. Settings are remembered per device.
 */
interface Side { give: { key: string; to: number }[]; roster: string[] }
/** The distinct clubs a side sends (his column's header wears them). */
const hdrClubs = (side: { give: { key: string }[] }, model: { players: Map<string, { club: string }> }) =>
  [...new Set(side.give.map((g) => model.players.get(g.key)?.club).filter((c): c is string => !!c))];

const emptySides = (): Side[] => Array.from({ length: 4 }, () => ({ give: [], roster: [] }));

/** The Fantasy page's Trade sub-page: `env` is the page's one trade environment (model, league format, card players). */
const TradeSim = ({ env }: { env: ReturnType<typeof useTradeEnv> }) => {
  const { model, cards, cardValue } = env;
  const { route } = useHubRoute();
  const [n, setN] = useState(2);
  const [sides, setSides] = useState<Side[]>(emptySides);
  const [rosterMode, setRosterMode] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const taken = useMemo(() => new Set(sides.flatMap((s) => [...s.give.map((g) => g.key), ...s.roster])), [sides]);
  const addGive = useCallback((i: number, key: string, sideCount = 2) => setSides((ss) => ss.map((s, k) => (k === i && !ss.some((x) => x.give.some((g) => g.key === key) || x.roster.includes(key)) ? { ...s, give: [...s.give, { key, to: (i + 1) % sideCount }] } : s))), []);

  // a player sent from his card or the Deep Dive lands on side one
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const p = route.p;
    if (!p || !model || handled.current === p || !model.players.has(p)) return;
    handled.current = p;
    addGive(0, p);
  }, [route.p, model, addGive]);

  const setCount = (c: number) => {
    setN(c);
    // a player's destination must be another side that exists
    setSides((ss) => ss.map((s, i) => ({ ...s, give: s.give.map((g) => (g.to < c && g.to !== i ? g : { ...g, to: (i + 1) % c })) })));
  };
  const setTo = (i: number, key: string, to: number) => setSides((ss) => ss.map((s, k) => (k === i ? { ...s, give: s.give.map((g) => (g.key === key ? { ...g, to } : g)) } : s)));
  const removeGive = (i: number, key: string) => setSides((ss) => ss.map((s, k) => (k === i ? { ...s, give: s.give.filter((g) => g.key !== key) } : s)));
  const addRoster = (i: number, key: string) => setSides((ss) => ss.map((s, k) => (k === i ? { ...s, roster: [...s.roster, key] } : s)));
  const removeRoster = (i: number, key: string) => setSides((ss) => ss.map((s, k) => (k === i ? { ...s, roster: s.roster.filter((x) => x !== key) } : s)));
  /** a package from "Find a fair deal" lands in another column (the next team), replacing what that team was sending */
  const dropPackage = (from: number, keys: string[]) =>
    setSides((ss) => {
      const target = (from + 1) % n;
      return ss.map((s, i) => (i === target ? { ...s, give: keys.filter((k) => !ss.some((x, j) => j !== target && (x.give.some((g) => g.key === k) || x.roster.includes(k)))).map((key) => ({ key, to: from })) } : s));
    });
  const reset = () => setSides(emptySides());
  const quick = (a: string[], b: string[]) => {
    setN(2);
    setSides(() => emptySides().map((s, i) => (i === 0 ? { ...s, give: a.map((key) => ({ key, to: 1 })) } : i === 1 ? { ...s, give: b.map((key) => ({ key, to: 0 })) } : s)));
  };

  const active = sides.slice(0, n);
  const result = useMemo(() => (model ? evaluateTrade(model, active.map<TradeTeam>((s) => ({ give: s.give, roster: s.roster })), rosterMode) : null), [model, active, rosterMode]);
  const anyPlayers = taken.size > 0;
  const starts = useMemo(() => (model && !anyPlayers ? quickStarts(model) : []), [model, anyPlayers]);

  return (
    <div className="tr fh-trade min-w-0">
      <div className="min-w-0">
        <FootballLoader ready={!!model && !!result} minHeight={420} what="the fantasy data">
          {model && result && (
            <>
              <div className="fh-actions fh-actions--trade">
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="fh-chip tr-setup" aria-haspopup="dialog" aria-label="Trade setup: team count and players or rosters">
                      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                      <span className="fh-chip__k">Setup</span>
                      <b>{n} teams · {rosterMode ? 'Rosters' : 'Players'}</b>
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="tr-pop tr-setpop z-[70] w-[min(92vw,19rem)] p-3">
                    <p className="tr-set__k">Teams in the trade</p>
                    <ArcadeToggle<number> label="Trade sides" size="sm" value={n} onChange={setCount} options={[2, 3, 4].map((c) => ({ value: c, label: `${c} teams` }))} />
                    <p className="tr-set__k mt-2">Trade with</p>
                    <ArcadeToggle<string> label="Rosters" size="sm" value={rosterMode ? 'r' : 'p'} onChange={(v) => setRosterMode(v === 'r')} options={[{ value: 'p', label: 'Players' }, { value: 'r', label: 'My rosters' }]} />
                  </PopoverContent>
                </Popover>
                <MethodTip model={model} />
              </div>
              {starts.length > 0 && (
                <div className="tr-quick" role="group" aria-label="Quick starts">
                  <span className="tr-set__k">Try</span>
                  <div className="tr-quick__row">
                    {starts.map((q) => <button key={q.id} type="button" className="tr-qchip" onClick={() => quick(q.a, q.b)}>{q.label}</button>)}
                  </div>
                </div>
              )}

              <div className={cn('tr-stage', `tr-stage--${n}`)}>
                <VerdictBar r={result} cards={cards} any={anyPlayers} onDrawer={() => setDrawer(true)} onClear={reset} />
                {active.map((side, i) => {
                  const res = result.teams[i];
                  const mirror = n === 2 ? res.received : [];
                  return (
                    <section key={i} className={cn('tr-col tr-locker mo-rise', `tr-col--${'abcd'[i]}`)} style={{ ...teamVars(i), ...stag(i, 90) }} aria-label={TEAM_LABELS[i]}>
                      <header className={cn('tr-col__h', hdrClubs(side, model).length && 'fx-flat fx-row')} style={hdrClubs(side, model).length === 1 ? fxTone(hdrClubs(side, model)[0]) : { '--tc': 'var(--tm)' } as CSSProperties}>
                        {hdrClubs(side, model).length === 1 ? <ClubMark club={hdrClubs(side, model)[0]} size={90} /> : <ClubChips clubs={hdrClubs(side, model)} />}
                        <span className="tr-col__badge" aria-hidden="true">{TEAM_LABELS[i].slice(-1)}</span>
                        <h2>{TEAM_LABELS[i]} sends</h2>
                        <small>{side.give.length ? `${side.give.length} player${side.give.length > 1 ? 's' : ''}` : 'nobody yet'}</small>
                      </header>
                      <AddSearch model={model} taken={taken} cards={cards} big={!side.give.length} onPick={(k) => addGive(i, k, n)} />
                      <ul className="tr-col__list">
                        {side.give.map((g) => {
                          const p = model.players.get(g.key);
                          if (!p) return null;
                          return (
                            <li key={g.key} className="mo-pop">
                              <TradeCard
                                p={p} model={model} player={cards.get(g.key)} cardValue={cardValue(g.key)} onRemove={() => removeGive(i, g.key)}
                                dest={n > 2 ? (
                                  <button type="button" className="tr-destchip" style={teamVars(g.to)} onClick={() => { let t = (g.to + 1) % n; if (t === i) t = (t + 1) % n; setTo(i, g.key, t); }} aria-label={`${p.name} goes to ${TEAM_LABELS[g.to]}. Change`}>
                                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> {TEAM_LABELS[g.to]}
                                  </button>
                                ) : undefined}
                                actions={<FindDeal model={model} playerKey={g.key} cards={cards} partnerLabel={TEAM_LABELS[(i + 1) % n]} onUse={(keys) => dropPackage(i, keys)} />}
                              />
                            </li>
                          );
                        })}
                      </ul>
                      {n === 2 ? (
                        <div className="tr-gets" aria-label={`${TEAM_LABELS[i]} receives`}>
                          <span className="tr-gets__k">{TEAM_LABELS[i]} receives</span>
                          {mirror.length ? mirror.map((p) => <RecvRow key={p.key} p={p} player={cards.get(p.key)} model={model} />) : <span className="tr-muted">what {TEAM_LABELS[1 - i]} sends shows here</span>}
                        </div>
                      ) : res.received.length > 0 && (
                        <div className="tr-gets" aria-label={`${TEAM_LABELS[i]} receives`}>
                          <span className="tr-gets__k">{TEAM_LABELS[i]} receives</span>
                          {res.received.map((p) => <RecvRow key={p.key} p={p} player={cards.get(p.key)} model={model} />)}
                        </div>
                      )}
                      {rosterMode && (
                        <div className="tr-roster">
                          <span className="tr-gets__k"><Users className="h-3.5 w-3.5" aria-hidden="true" /> Rest of roster</span>
                          <ul>
                            {side.roster.map((k) => {
                              const p = model.players.get(k);
                              return (
                                <li key={k}>
                                  <span>{p?.name ?? k}</span><i>{p?.pos}</i>
                                  <button type="button" onClick={() => removeRoster(i, k)} aria-label={`Remove ${p?.name ?? k} from the roster`}><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
                                </li>
                              );
                            })}
                          </ul>
                          <PlayerPicker model={model} taken={taken} onPick={(k) => addRoster(i, k)} label="Add to roster" />
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              <SideTotals r={result} model={model} cardValue={cardValue} />

              <p className="tr-foot">
                <InfoTip label="What the data cannot say">
                  Routes run and red-zone touches are not in the data, so target share and snap share stand in. Card value is a separate lens and never part of the verdict. Weekly finishes for start-worthy, boom and bust follow the chosen scoring.
                </InfoTip>
                <span>Week {model.week} data · {model.season}</span>
              </p>
              <BeforeAfter r={result} model={model} open={drawer} onOpenChange={setDrawer} />
            </>
          )}
        </FootballLoader>
      </div>
    </div>
  );
};

export default TradeSim;
