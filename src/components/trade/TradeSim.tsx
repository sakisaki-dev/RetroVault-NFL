import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Users, X } from 'lucide-react';
import FootballLoader from '@/components/motion/FootballLoader';
import { Reveal } from '@/components/motion/Reveal';
import { useHubRoute } from '@/components/stats/hub/hashRoute';
import { InfoTip } from '@/components/ui/InfoTip';
import { ModeSwitch, type LabMode } from '@/components/teamlab/nfl/NflShared';
import { usePrefs } from '@/components/teamlab/nfl/useNflLab';
import { usePhone } from '@/hooks/usePhone';
import { cn } from '@/lib/utils';
import { evaluateTrade, SCORING_LABEL, SCORING_KINDS, type TradeSettings, type TradeTeam } from '@/utils/tradeSim';
import { BalanceScale, BeforeAfter, DrawerButton, FairMeter, NetBars, PartnerFinder, SideTotals } from './TradeViews';
import { MethodTip, PlayerPicker, TEAM_LABELS, TradeCard, teamVars } from './TradeParts';
import { useTradeEnv } from './useTrade';
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

const Seg = <T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) => (
  <div className="tr-set">
    <span className="tr-set__k">{label}</span>
    <div className="tr-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" className={cn('tr-seg__b', value === o.v && 'is-on')} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  </div>
);
const Toggle = ({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <button type="button" className={cn('tr-tog', on && 'is-on')} aria-pressed={on} onClick={() => onChange(!on)} title={hint}>
    <i aria-hidden="true" />{label}
  </button>
);

const summary = (s: TradeSettings, n: number, roster: boolean) =>
  [SCORING_LABEL[s.scoring], `${s.teams} teams`, s.superflex && 'Superflex', s.tePremium && 'TE premium', s.playoffWeight > 1 && `Wk 15–17 ×${s.playoffWeight}`, `${n} sides`, roster && 'Rosters'].filter(Boolean).join(' · ');

const TradeSim = () => {
  const env = useTradeEnv();
  const { model, settings, setSettings, cards, cardValue } = env;
  const phone = usePhone();
  const { route, navigate } = useHubRoute();
  const [, setPrefs] = usePrefs();
  const [n, setN] = useState(2);
  const [sides, setSides] = useState<Side[]>(emptySides);
  const [rosterMode, setRosterMode] = useState(false);
  const [fmt, setFmt] = useState(!phone);
  const [drawer, setDrawer] = useState(false);
  const fmtTouched = useRef(false);
  useEffect(() => { if (!fmtTouched.current) setFmt(!phone); }, [phone]);

  const toMode = (m: LabMode) => {
    if (m === 'trade') return;
    setPrefs({ mode: m });
    navigate({ tab: 'lab' });
  };

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

  const head: ReactNode = (
    <header className="tr-head">
      <div className="tr-head__t">
        <p className="tr-kicker">Team Lab · Fantasy</p>
        <h1 className="tr-title">Trade <span>simulator</span></h1>
      </div>
      <div className="tr-head__r">
        <ModeSwitch mode="trade" onMode={toMode} />
        {model && <MethodTip model={model} />}
      </div>
    </header>
  );

  return (
    <div className="tr rv-ix min-w-0 py-3 sm:py-4">
      <div className="container min-w-0">
        {head}
        <FootballLoader ready={!!model && !!result} minHeight={420} what="the fantasy data">
          {model && result && (
            <>
              <section className="tr-panel tr-format" aria-label="League format">
                <button type="button" className="tr-format__h" aria-expanded={fmt} onClick={() => { fmtTouched.current = true; setFmt((v) => !v); }}>
                  <span className="tr-set__k">Format</span>
                  <span className="tr-format__sum">{summary(settings, n, rosterMode)}</span>
                  <span className="tr-format__c" aria-hidden="true">{fmt ? 'Hide' : 'Edit'}</span>
                </button>
                {fmt && (
                  <div className="tr-format__b">
                    <Seg label="Scoring" value={settings.scoring} options={SCORING_KINDS.map((k) => ({ v: k, l: k === 'ppr' ? 'PPR' : k === 'half' ? 'Half' : 'Std' }))} onChange={(v) => setSettings({ scoring: v })} />
                    <Seg label="League" value={settings.teams} options={[10, 12, 14].map((t) => ({ v: t as 10 | 12 | 14, l: `${t} teams` }))} onChange={(v) => setSettings({ teams: v })} />
                    <Seg label="Weeks 15–17" value={settings.playoffWeight} options={[{ v: 1, l: 'Off' }, { v: 1.5, l: '×1.5' }, { v: 2, l: '×2' }] as { v: 1 | 1.5 | 2; l: string }[]} onChange={(v) => setSettings({ playoffWeight: v })} />
                    <Seg label="Trade sides" value={n} options={[2, 3, 4].map((c) => ({ v: c, l: `${c} teams` }))} onChange={setCount} />
                    <div className="tr-set tr-set--tog">
                      <Toggle label="Superflex" on={settings.superflex} onChange={(v) => setSettings({ superflex: v })} hint="A second QB slot: the QB replacement line moves" />
                      <Toggle label="TE premium" on={settings.tePremium} onChange={(v) => setSettings({ tePremium: v })} hint="+0.5 per TE reception on top of the scoring" />
                      <Toggle label="My rosters" on={rosterMode} onChange={setRosterMode} hint="Enter each side's roster: the verdict becomes each lineup's change" />
                    </div>
                  </div>
                )}
              </section>

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
                    <section key={i} className="tr-col" style={teamVars(i)} aria-label={TEAM_LABELS[i]}>
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
                            <li key={g.key}>
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
