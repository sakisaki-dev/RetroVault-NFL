import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, RotateCcw, SlidersHorizontal, Users, X } from 'lucide-react';
import { ArcadeToggle } from '@/components/arcade';
import FootballLoader from '@/components/motion/FootballLoader';
import { useReveal, ViewCount } from '@/components/motion/Reveal';
import { useHubRoute } from '@/components/stats/hub/hashRoute';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ClubChips, ClubMark, fxTone } from '@/components/fantasy/ClubMark';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import { cn } from '@/lib/utils';
import { useCurrentClub } from '@/utils/club';
import { evaluateTrade, suggestPartner, LEAN_PCT, type Package, type TradeModel, type TradeTeam } from '@/utils/tradeSim';
import { DeskCard } from './DeskCard';
import { DeskOffers, DEFAULT_FILTERS, PAGE, type OfferFilters } from './DeskOffers';
import { DeskPicker } from './DeskPicker';
import { DeskVerdict } from './DeskVerdict';
import { BeforeAfter, quickStarts } from './TradeViews';
import { MethodTip, TEAM_LABELS, teamVars } from './TradeParts';
import type { useTradeEnv } from './useTrade';
import './trade.css';
import './desk.css';

/**
 * Fantasy > Trade, the Trade Desk. Two teams: three columns, You send (a locker), the verdict jumbotron, You get (a
 * locker); under them every Fair offer for what you send, filtered by position and number of players, twelve at a time.
 * Either side takes any number of players (no cap anywhere: the engine sums whatever it is given). With players on You
 * send and nothing chosen on You get, the fairest offer is preselected; editing You get by hand makes it Custom, and
 * "Back to suggestions" returns. 3-4 teams: a column per team, each player sent to a chosen team. Rules: src/utils/tradeSim.ts.
 */
interface Side { give: { key: string; to: number }[]; roster: string[] }
const emptySides = (): Side[] => Array.from({ length: 4 }, () => ({ give: [], roster: [] }));
const clubsOf = (keys: string[], model: TradeModel) => [...new Set(keys.map((k) => model.players.get(k)?.club).filter((c): c is string => !!c))];
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const TradeDesk = ({ env, onLeague, leagueSummary }: { env: ReturnType<typeof useTradeEnv>; onLeague?: () => void; leagueSummary?: string }) => {
  const { model, cards, cardValue } = env;
  const { route } = useHubRoute();
  const [n, setN] = useState(2);
  const [sides, setSides] = useState<Side[]>(emptySides);
  const [rosterMode, setRosterMode] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [pickKey, setPickKey] = useState<string | null>(null);
  const [filters, setFilters] = useState<OfferFilters>(DEFAULT_FILTERS);
  const [shown, setShown] = useState(PAGE);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const root = useReveal<HTMLDivElement>(true);

  // ---- offers for what side one sends (two teams) ---------------------------------------------------------------------
  const sendKeys = useMemo(() => sides[0].give.map((g) => g.key), [sides]);
  const sendId = sendKeys.join('|');
  const sizes = filters.size === 'any' ? [1, 2, 3] : filters.size === '3' ? [3, 4] : [Number(filters.size)];
  const offers = useMemo<Package[]>(
    () => (model && n === 2 && sendKeys.length
      ? suggestPartner(model, sendKeys, { pos: filters.pos === 'ALL' ? null : filters.pos, sizes, maxGap: LEAN_PCT / 100, limit: Infinity, sort: filters.sort })
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, n, sendId, filters.pos, filters.size, filters.sort],
  );
  const auto = !custom && n === 2 && sendKeys.length ? offers.find((o) => o.keys.join('+') === pickKey) ?? offers[0] ?? null : null;
  /** the sides as the trade reads them: in two-team mode You get follows the chosen offer until it is edited by hand */
  const eff = useMemo<Side[]>(() => (auto ? sides.map((s, i) => (i === 1 ? { ...s, give: auto.keys.map((key) => ({ key, to: 0 })) } : s)) : sides), [sides, auto]);
  const active = eff.slice(0, n);
  const taken = useMemo(() => new Set(eff.slice(0, n).flatMap((s) => [...s.give.map((g) => g.key), ...s.roster])), [eff, n]);
  const result = useMemo(() => (model ? evaluateTrade(model, active.map<TradeTeam>((s) => ({ give: s.give, roster: s.roster })), rosterMode) : null), [model, active, rosterMode]);

  useEffect(() => setShown(PAGE), [sendId, filters.pos, filters.size, filters.sort]);

  // ---- edits -----------------------------------------------------------------------------------------------------------
  const free = (ss: Side[], key: string) => !ss.some((x) => x.give.some((g) => g.key === key) || x.roster.includes(key));
  const effGet = eff[1].give;
  const addGive = useCallback((i: number, key: string) => {
    if (!free(eff.slice(0, n), key)) return;
    const hand = n === 2 && i === 1;
    if (hand) setCustom(true);
    setSides((ss) => ss.map((s, k) => (k === i ? { ...s, give: [...(hand ? effGet : s.give), { key, to: hand ? 0 : (i + 1) % n }] } : s)));
  }, [n, eff, effGet]);
  const [landKey, setLandKey] = useState(0);
  const removeNow = (i: number, key: string) => {
    if (n === 2 && i === 1) setCustom(true);
    setSides((ss) => ss.map((s, k) => (k === i ? { ...s, give: (n === 2 && i === 1 && auto ? eff[1].give : s.give).filter((g) => g.key !== key) } : s)));
    setLeaving((l) => { const x = new Set(l); x.delete(key); return x; });
  };
  const removeGive = (i: number, key: string) => {
    if (reduced()) return removeNow(i, key);
    setLeaving((l) => new Set(l).add(key));
    window.setTimeout(() => removeNow(i, key), 240);
  };
  const setTo = (i: number, key: string, to: number) => setSides((ss) => ss.map((s, k) => (k === i ? { ...s, give: s.give.map((g) => (g.key === key ? { ...g, to } : g)) } : s)));
  const addRoster = (i: number, key: string) => setSides((ss) => ss.map((s, k) => (k === i ? { ...s, roster: [...s.roster, key] } : s)));
  const removeRoster = (i: number, key: string) => setSides((ss) => ss.map((s, k) => (k === i ? { ...s, roster: s.roster.filter((x) => x !== key) } : s)));
  const setCount = (c: number) => {
    // leaving a hand-picked or suggested two-team trade keeps what is on screen
    setSides(eff.map((s, i) => ({ ...s, give: s.give.map((g) => (g.to < c && g.to !== i ? g : { ...g, to: (i + 1) % c }) ) })));
    setCustom(true);
    setN(c);
  };
  const reset = () => { setSides(emptySides()); setCustom(false); setPickKey(null); setWhyOpen(false); };
  const back = () => { setCustom(false); setPickKey(null); setSides((ss) => ss.map((s, i) => (i === 1 ? { ...s, give: [] } : s))); setLandKey((k) => k + 1); };
  const takeOffer = (o: Package) => { setCustom(false); setPickKey(o.keys.join('+')); setLandKey((k) => k + 1); };
  const quick = (key: string) => { setN(2); setCustom(false); setPickKey(null); setSides(emptySides().map((s, i) => (i === 0 ? { ...s, give: [{ key, to: 1 }] } : s))); };

  // a player sent from his card or the Deep Dive lands on You send
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const p = route.p;
    if (!p || !model || handled.current === p || !model.players.has(p)) return;
    handled.current = p;
    addGive(0, p);
  }, [route.p, model, addGive]);

  const anyPlayers = taken.size > 0 && active.some((s) => s.give.length);
  const starts = useMemo(() => (model && !anyPlayers ? quickStarts(model) : []), [model, anyPlayers]);
  const dflt = useCurrentClub() ?? 'Eagles';
  const stageClub = (model && clubsOf(sendKeys, model)[0]) || dflt;
  const art = useFieldArt(stageClub, 'night');
  const allClubs = model ? clubsOf([...taken], model) : [];
  const stageStyle: CSSProperties = art.crowd ? ({ '--dk-crowd': `url(${art.crowd})` } as CSSProperties) : {};

  const locker = (i: number, label: string) => {
    if (!model) return null;
    const side = eff[i];
    const res = result!.teams[i];
    const clubs = clubsOf(side.give.map((g) => g.key), model);
    const total = n === 2 ? (i === 0 ? res.sentValue : res.receivedValue + res.credit) : res.sentValue;
    const dir = i === 0 || n > 2 ? 'l' : 'r';
    return (
      <section key={`${i}-${i === 1 ? landKey : 0}`} className={cn('dk-lock', `dk-lock--${'abcd'[i]}`)} aria-label={label} style={n > 2 ? teamVars(i) : undefined}>
        <header className={cn('dk-lock__h fx-flat fx-row', clubs.length > 0 && 'has-club')} style={clubs.length === 1 ? fxTone(clubs[0]) : ({ '--tc': i === 0 ? 'hsl(43 70% 40%)' : 'hsl(199 70% 38%)' } as CSSProperties)}>
          {clubs.length === 1 ? <ClubMark club={clubs[0]} size={110} /> : <ClubChips clubs={clubs} />}
          <span className="dk-lock__badge" aria-hidden="true">{n === 2 ? (i === 0 ? '1' : '2') : 'ABCD'[i]}</span>
          <h2>{label}</h2>
          <span className="dk-lock__tot" aria-label="Side value"><ViewCount value={total} /><i>{side.give.length} player{side.give.length === 1 ? '' : 's'}</i></span>
        </header>
        {side.give.length === 0 && (
          <div className="dk-slot">
            <span className="dk-slot__ped" aria-hidden="true" />
            <b>{i === 0 ? 'Who are you trading away?' : n === 2 ? 'Pick an offer or add players' : 'Drop a player here'}</b>
          </div>
        )}
        <ul className="dk-lock__list">
          {side.give.map((g, k) => {
            const p = model.players.get(g.key);
            if (!p) return null;
            return (
              <li key={g.key}>
                <DeskCard
                  p={p} model={model} player={cards.get(g.key)} cardValue={cardValue(g.key)} side={dir} index={k} leaving={leaving.has(g.key)}
                  onRemove={() => removeGive(i, g.key)}
                  dest={n > 2 ? (
                    <button type="button" className="dk-dest" style={teamVars(g.to)} onClick={() => { let t = (g.to + 1) % n; if (t === i) t = (t + 1) % n; setTo(i, g.key, t); }} aria-label={`${p.name} goes to ${TEAM_LABELS[g.to]}. Change`}>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> {TEAM_LABELS[g.to]}
                    </button>
                  ) : undefined}
                />
              </li>
            );
          })}
        </ul>
        {n > 2 && res.received.length > 0 && (
          <p className="dk-recv"><span>Receives</span>{res.received.map((p) => <em key={p.key}>{p.name}</em>)}</p>
        )}
        <DeskPicker model={model} cards={cards} taken={taken} onPick={(k) => addGive(i, k)} label={side.give.length ? 'Add player' : 'Add a player'} big={!side.give.length} />
        {n === 2 && i === 1 && (
          <div className="dk-lock__mode">
            {custom ? <><span className="dk-flag dk-flag--warn">Custom</span><button type="button" className="dk-link" onClick={back} disabled={!sendKeys.length}><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Back to suggestions</button></>
              : auto ? <span className="dk-flag dk-flag--good">Offer #{offers.indexOf(auto) + 1} of {offers.length}</span> : null}
          </div>
        )}
        {rosterMode && (
          <div className="tr-roster dk-roster">
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
            <DeskPicker model={model} cards={cards} taken={taken} onPick={(k) => addRoster(i, k)} label="Add to roster" />
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="dk tr fh-trade min-w-0" ref={root} style={stageStyle}>
      <FootballLoader ready={!!model && !!result} minHeight={420} what="the fantasy data">
        {model && result && (
          <>
            <div className="dk-bar">
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
              {onLeague && (
                <button type="button" className="fh-chip dk-league" onClick={onLeague} aria-label="League format">
                  <span className="fh-chip__k">League</span><b>{leagueSummary}</b>
                </button>
              )}
              {anyPlayers && <button type="button" className="dk-link dk-clear" onClick={reset}><X className="h-3.5 w-3.5" aria-hidden="true" /> Clear</button>}
              <span className="dk-bar__sp" />
              <span className="dk-wk-tag">Week {model.week} · {model.season}</span>
            </div>
            {starts.length > 0 && (
              <div className="tr-quick dk-quick" role="group" aria-label="Quick starts">
                <span className="tr-set__k">Try</span>
                <div className="tr-quick__row">
                  {starts.map((q) => <button key={q.id} type="button" className="tr-qchip" onClick={() => quick(q.a[0])}>Send {(model.players.get(q.a[0])?.name) ?? q.a[0]}</button>)}
                </div>
              </div>
            )}
            <div className={cn('dk-stage', `dk-stage--${n}`)}>
              <span className="dk-stage__crowd" aria-hidden="true" />
              {n === 2 ? (
                <>
                  {locker(0, 'You send')}
                  <DeskVerdict r={result} model={model} cardValue={cardValue} any={anyPlayers} whyOpen={whyOpen} onWhy={() => setWhyOpen((v) => !v)} onDrawer={() => setDrawer(true)} clubs={allClubs} />
                  {locker(1, 'You get')}
                </>
              ) : (
                <>
                  <div className="dk-stage__v">
                    <DeskVerdict r={result} model={model} cardValue={cardValue} any={anyPlayers} whyOpen={whyOpen} onWhy={() => setWhyOpen((v) => !v)} onDrawer={() => setDrawer(true)} clubs={allClubs} />
                  </div>
                  {active.map((_, i) => locker(i, `${TEAM_LABELS[i]} sends`))}
                </>
              )}
            </div>
            {n === 2 && (
              <DeskOffers
                model={model} cards={cards} offers={offers} hasSend={sendKeys.length > 0} f={filters} shown={shown}
                selected={auto ? auto.keys.join('+') : null}
                setF={(p) => setFilters((x) => ({ ...x, ...p }))} onMore={() => setShown((s) => s + PAGE)} onPick={takeOffer}
              />
            )}
            <p className="dk-foot"><MethodTip model={model} /><span>Routes run and red-zone touches are not in the data. Card value never changes the verdict.</span></p>
            <BeforeAfter r={result} model={model} open={drawer} onOpenChange={setDrawer} labels={n === 2 ? ['You', 'Them'] : undefined} />
          </>
        )}
      </FootballLoader>
    </div>
  );
};

export default TradeDesk;
