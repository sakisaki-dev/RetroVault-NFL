import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Users, X } from 'lucide-react';
import { ArcadeToggle } from '@/components/arcade';
import FootballLoader from '@/components/motion/FootballLoader';
import { Reveal } from '@/components/motion/Reveal';
import { useHubRoute } from '@/components/stats/hub/hashRoute';
import { stag } from '@/components/motion/Reveal';
import { InfoTip } from '@/components/ui/InfoTip';
import { cn } from '@/lib/utils';
import { evaluateTrade, type TradeTeam } from '@/utils/tradeSim';
import { BalanceScale, BeforeAfter, DrawerButton, FairMeter, NetBars, PartnerFinder, SideTotals } from './TradeViews';
import { MethodTip, PlayerPicker, TEAM_LABELS, TradeCard, teamVars } from './TradeParts';
import type { useTradeEnv } from './useTrade';
import { teamOf } from '@/components/fantasy/parts';
import TeamLogo from '@/components/brand/TeamLogo';
import './trade.css';

/**
 * Team Lab > Trade (#lab/trade): the fantasy trade simulator. 2 to 4 teams, each a column of players (flat club-colour
 * cards with the sprite, position rank, points a game, ROS, VOR, flags and an expandable stat panel); a balance scale
 * (2 teams) or a net bar per team (3-4) with the Fair meter; side totals; "Suggest a partner"; a before / after drawer.
 * Rules and constants: src/utils/tradeSim.ts. Settings are remembered per device.
 */
interface Side { give: { key: string; to: number }[]; roster: string[] }
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
  const useForPartner = (keys: string[]) =>
    setSides((ss) => ss.map((s, i) => (i === 1 ? { ...s, give: keys.filter((k) => !ss.some((x, j) => j !== 1 && (x.give.some((g) => g.key === k) || x.roster.includes(k)))).map((key) => ({ key, to: 0 })) } : s)));
  const reset = () => setSides(emptySides());

  const active = sides.slice(0, n);
  const result = useMemo(() => (model ? evaluateTrade(model, active.map<TradeTeam>((s) => ({ give: s.give, roster: s.roster })), rosterMode) : null), [model, active, rosterMode]);
  const anyPlayers = taken.size > 0;

  return (
    <div className="tr fh-trade min-w-0">
      <div className="min-w-0">
        <FootballLoader ready={!!model && !!result} minHeight={420} what="the fantasy data">
          {model && result && (
            <>
              <div className="fh-actions fh-actions--trade">
                <ArcadeToggle<number> label="Trade sides" size="sm" value={n} onChange={setCount} options={[2, 3, 4].map((c) => ({ value: c, label: `${c} teams` }))} />
                <ArcadeToggle<string> label="Rosters" size="sm" value={rosterMode ? 'r' : 'p'} onChange={(v) => setRosterMode(v === 'r')} options={[{ value: 'p', label: 'Players' }, { value: 'r', label: 'My rosters' }]} />
                <MethodTip model={model} />
              </div>

              <Reveal className="tr-verdict-panel tr-panel" aria-label="Verdict">
                {n === 2 ? <BalanceScale r={result} cards={cards} /> : <NetBars r={result} />}
                <FairMeter r={result} />
                <div className="tr-verdict-panel__f">
                  <DrawerButton onClick={() => setDrawer(true)} disabled={!anyPlayers} />
                  {anyPlayers && <button type="button" className="tr-reset" onClick={reset}><X className="h-4 w-4" aria-hidden="true" /> Clear</button>}
                </div>
                {!anyPlayers && <p className="tr-muted tr-hint">Add players to each side to weigh the trade.</p>}
              </Reveal>

              <div className={cn('tr-cols', `tr-cols--${n}`)}>
                {active.map((side, i) => {
                  const res = result.teams[i];
                  return (
                    <section key={i} className="tr-col tr-locker mo-rise" style={{ ...teamVars(i), ...stag(i, 90) }} aria-label={TEAM_LABELS[i]}>
                      <header className="tr-col__h">
                        <span className="tr-col__badge" aria-hidden="true">{TEAM_LABELS[i].slice(-1)}</span>
                        <h2>{TEAM_LABELS[i]}</h2>
                        <small>gives {side.give.length} · gets {res.received.length}</small>
                      </header>
                      <ul className="tr-col__list">
                        {side.give.map((g) => {
                          const p = model.players.get(g.key);
                          if (!p) return null;
                          return (
                            <li key={g.key} className="mo-pop">
                              <TradeCard
                                p={p} model={model} player={cards.get(g.key)} cardValue={cardValue(g.key)} onRemove={() => removeGive(i, g.key)}
                                dest={n > 2 ? (
                                  <span className="tr-dest" role="group" aria-label={`${p.name} goes to`}>
                                    <i>To</i>
                                    {Array.from({ length: n }, (_, j) => j).filter((j) => j !== i).map((j) => (
                                      <button key={j} type="button" className={cn('tr-dest__b', g.to === j && 'is-on')} style={teamVars(j)} aria-pressed={g.to === j} onClick={() => setTo(i, g.key, j)}>{TEAM_LABELS[j].slice(-1)}</button>
                                    ))}
                                  </span>
                                ) : undefined}
                              />
                            </li>
                          );
                        })}
                      </ul>
                      <PlayerPicker model={model} taken={taken} onPick={(k) => addGive(i, k, n)} label="Give a player" />
                      {res.received.length > 0 && (
                        <div className="tr-gets" aria-label={`${TEAM_LABELS[i]} receives`}>
                          <span className="tr-gets__k">Gets</span>
                          <ul>
                            {res.received.map((p) => (
                              <li key={p.key}><TeamLogo team={teamOf(p.club)} size={16} decorative backed /><b>{p.name}</b><i>{p.pos}{p.posRank}</i></li>
                            ))}
                          </ul>
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

              <PartnerFinder model={model} giveKeys={sides[0].give.map((g) => g.key)} partner={1} cards={cards} onUse={useForPartner} />

              <p className="tr-foot">
                <InfoTip label="What the data cannot say">
                  Routes run and red-zone touches are not in the data, so target share and snap share stand in. Card value is a separate lens and never part of the verdict. Weekly finishes for start-worthy, boom and bust use PPR ranks.
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
