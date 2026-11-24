import { useEffect, useMemo, useState } from 'react';
import { Ban, Calculator, SlidersHorizontal, Dices, Eraser, FastForward, ListOrdered, Lock, LockOpen, Plus, Swords, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TeamLogo from '@/components/brand/TeamLogo';
import { cn } from '@/lib/utils';
import { findNFLTeam, NFL_TEAMS } from '@/utils/nflTeams';
import { bannerTeamOf } from '@/utils/playerExtras';
import { loadGameLog, type GameLog } from '@/utils/gameLogs';
import type { InjuryCode } from '@/utils/injuries';
import {
  DRAFT_ROUNDS,
  FANTASY_IDS,
  F_SLOTS,
  SCORING,
  SCORING_FIELDS,
  SCORING_LABELS,
  boardOf,
  buildBest,
  candidates,
  canDraft,
  canFill,
  costOf,
  cpuPick,
  dstPoints,
  emptyF,
  fFilled,
  fPos,
  isBye,
  lineupFromPicks,
  onClock,
  projectRest,
  projectWeek,
  replay,
  salaryOf,
  setF,
  teamPicks,
  type Cand,
  type Ctx,
  type DraftState,
  type FLineup,
  type Scoring,
  type ScoringId,
} from '@/utils/nflFantasy';
import { fantasySpot } from '@/utils/nflLab';
import { Card } from '../parts';
import NflField, { type FieldItem } from './NflField';
import NflHeader from './NflHeader';
import { SlotRow } from './NflDepthChart';
import NflSaved from './NflSaved';
import { ClubSelect, ModeSwitch, Stands, TurfSelect, openPicker, useStage } from './NflShared';
import { useSavedLabs, type NflLabReady, type Prefs } from './useNflLab';
import { displayName } from '@/utils/displayName';

const f1 = (x: number) => x.toFixed(1);
const nameOf = (key: string) => (key.startsWith('DST:') ? `${findNFLTeam(key.slice(4))?.name ?? key.slice(4)} D/ST` : key.slice(key.indexOf(':') + 1));

/** Game logs of the lineups' players, loaded once each (the replay of what they scored). */
const useLogs = (keys: string[]) => {
  const [logs, setLogs] = useState<Map<string, GameLog | null>>(new Map());
  const sig = keys.filter((k) => k && !k.startsWith('DST:')).sort().join('|');
  useEffect(() => {
    let live = true;
    sig.split('|').filter(Boolean).forEach((k) => {
      void loadGameLog(k).then((l) => live && setLogs((p) => (p.has(k) ? p : new Map(p).set(k, l))));
    });
    return () => {
      live = false;
    };
  }, [sig]);
  return logs;
};

const FantasyMode = ({ nl, prefs, setPrefs, onMode }: { nl: NflLabReady; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; onMode: (m: 'team' | 'fantasy') => void }) => {
  const { ctx, data, injured, sched } = nl;
  const lab = data?.lab ?? null;
  const saved = useSavedLabs();
  const [ctlOpen, setCtlOpen] = useState(false);
  const [fl, setFl] = useState<FLineup>(emptyF);
  const [locks, setLocks] = useState<FLineup>({});
  const [excludes, setExcludes] = useState<Set<string>>(new Set());
  const [posFilter, setPosFilter] = useState<'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'DST'>('ALL');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [oppId, setOppId] = useState('');
  const clubName = findNFLTeam(prefs.club)?.name ?? prefs.club;
  const stage = useStage(clubName);

  const scoring: Scoring = prefs.scoring === 'custom' ? prefs.custom ?? SCORING.ppr : SCORING[prefs.scoring];
  const fctx = useMemo<Ctx | null>(() => (lab && sched ? { lab, sched, scoring, injured } : null), [lab, sched, scoring, injured]);
  const cands = useMemo(() => (fctx ? candidates(fctx) : []), [fctx]);
  const board = useMemo(() => boardOf(cands), [cands]);
  const candBy = useMemo(() => new Map(cands.map((c) => [c.key, c])), [cands]);
  const cap = lab?.cap ?? 150;
  const capMode = prefs.fmode === 'cap';
  const logs = useLogs([...Object.values(fl)]);
  const week = sched?.next ?? 0;
  // the last week most clubs have a result for
  const played = useMemo(() => {
    if (!lab) return 0;
    const per = new Map<number, number>();
    Object.values(lab.dst).forEach((rows) => rows.forEach((r) => per.set(r[0], (per.get(r[0]) ?? 0) + 1)));
    return Math.max(0, ...[...per.entries()].filter(([, n]) => n >= 16).map(([w]) => w));
  }, [lab]);

  const total = (l: FLineup, w: number) => (fctx ? FANTASY_IDS.reduce((s, id) => s + (l[id] ? projectWeek(fctx, l[id], w) : 0), 0) : 0);
  const restOf = (l: FLineup) => (sched ? sched.weeks.slice(0, 4).reduce((s, w) => s + total(l, w), 0) : 0);
  const filled = fFilled(fl);
  const cost = lab ? costOf(lab, fl) : 0;
  const rows = useMemo(() => (fctx && played ? replay(fctx.lab, fl, logs, scoring, played) : []), [fctx, fl, logs, scoring, played]);
  const seasonPts = rows.reduce((s, r) => s + r.total, 0);

  // ----- actions -----
  const place = (key: string) =>
    setFl((l) => {
      if (Object.values(l).includes(key)) return l;
      const slot = F_SLOTS.find((s) => !l[s.id] && canFill(s, key) && s.id !== 'flex') ?? F_SLOTS.find((s) => !l[s.id] && canFill(s, key));
      return slot ? setF(l, slot.id, key) : l;
    });
  const build = () => {
    if (!cands.length) return;
    const r = buildBest(cands, { cap: capMode ? cap : 999, locks, excludes });
    if (r) setFl(r.lineup);
  };
  const toggleLock = (id: string) => setLocks((l) => (l[id] ? Object.fromEntries(Object.entries(l).filter(([k]) => k !== id)) : fl[id] ? { ...l, [id]: fl[id] } : l));
  const exclude = (key: string) => {
    setExcludes((s) => new Set(s).add(key));
    setFl((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v === key ? '' : v])));
  };

  // ----- draft -----
  const startDraft = () => {
    const teams = 8;
    const d: DraftState = { teams, me: Math.floor(Math.random() * teams), picks: [], seed: Math.floor(Math.random() * 1e9) };
    setDraft(runCpu(d));
    setFl({});
  };
  const runCpu = (d: DraftState): DraftState => {
    let cur = d;
    for (let guard = 0; guard < 200; guard += 1) {
      const t = onClock(cur);
      if (t == null || t === cur.me) break;
      const k = cpuPick(cur, board, t);
      if (!k) break;
      cur = { ...cur, picks: [...cur.picks, { round: Math.floor(cur.picks.length / cur.teams), team: t, key: k }] };
    }
    return cur;
  };
  const draftPick = (key: string) => {
    if (!draft || onClock(draft) !== draft.me || !canDraft(draft, draft.me, key)) return;
    const next = runCpu({ ...draft, picks: [...draft.picks, { round: Math.floor(draft.picks.length / draft.teams), team: draft.me, key }] });
    setDraft(next);
    if (onClock(next) == null) finishDraft(next);
  };
  const simToEnd = () => {
    if (!draft) return;
    let cur = draft;
    for (let guard = 0; guard < 200 && onClock(cur) != null; guard += 1) {
      const t = onClock(cur)!;
      const k = cpuPick(cur, board, t);
      if (!k) break;
      cur = { ...cur, picks: [...cur.picks, { round: Math.floor(cur.picks.length / cur.teams), team: t, key: k }] };
    }
    setDraft(cur);
    finishDraft(cur);
  };
  const finishDraft = (d: DraftState) => setFl(lineupFromPicks(teamPicks(d, d.me), (k) => candBy.get(k)?.value ?? 0));
  const draftTaken = useMemo(() => new Set(draft?.picks.map((p) => p.key) ?? []), [draft]);
  const drafting = prefs.fmode === 'draft' && !!draft && onClock(draft) != null;
  const myTurn = !!draft && onClock(draft) === draft.me;

  // ----- opponents for the head-to-head -----
  const opponents = useMemo(() => {
    const out: { id: string; name: string; lineup: FLineup }[] = [];
    saved.list.filter((s) => s.kind === 'fantasy').forEach((s) => out.push({ id: `saved:${s.id}`, name: s.name, lineup: s.lineup as FLineup }));
    if (draft && onClock(draft) == null)
      for (let t = 0; t < draft.teams; t += 1) if (t !== draft.me) out.push({ id: `cpu:${t}`, name: `Draft team ${t + 1}`, lineup: lineupFromPicks(teamPicks(draft, t), (k) => candBy.get(k)?.value ?? 0) });
    if (cands.length) {
      const r = buildBest(cands, { cap, locks: {}, excludes: new Set() });
      if (r) out.push({ id: 'best-cap', name: `Best lineup under the ${cap} cap`, lineup: r.lineup });
      const free = buildBest(cands, { cap: 999, locks: {}, excludes: new Set() });
      if (free) out.push({ id: 'best-free', name: 'Best lineup, no cap', lineup: free.lineup });
    }
    return out;
  }, [saved.list, draft, cands, cap, candBy]);
  const same = (a: FLineup, b: FLineup) => FANTASY_IDS.every((id) => (a[id] ?? '') === (b[id] ?? ''));
  const opp = opponents.find((o) => o.id === oppId) ?? opponents.find((o) => !same(o.lineup, fl)) ?? opponents[0];
  const oppLogs = useLogs(opp ? Object.values(opp.lineup) : []);

  // ----- field -----
  const items: FieldItem[] = F_SLOTS.map((s) => {
    const k = fl[s.id];
    const at = fantasySpot(s.id, stage.tall);
    const prof = k && !k.startsWith('DST:') ? ctx.profiles.get(k) : undefined;
    const pts = k && fctx ? projectWeek(fctx, k, week) : 0;
    const bye = !!k && !!sched && !!lab && isBye(sched, k.startsWith('DST:') ? k.slice(4) : lab.p[k]?.t ?? '', week);
    return {
      id: s.id,
      x: at.x,
      y: at.y,
      label: s.label,
      profile: prof,
      dst: k?.startsWith('DST:') ? k.slice(4) : undefined,
      injury: k ? injured.get(k) : undefined,
      kit: prof ? findNFLTeam(bannerTeamOf(prof.player))?.name : undefined,
      badge: k ? (bye ? 'BYE' : capMode ? `$${salaryOf(lab!, k)}` : f1(pts)) : undefined,
    };
  });
  const emptyDst = !fl.dst;
  if (emptyDst) items.find((i) => i.id === 'dst')!.dst = undefined;

  // ----- board table -----
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board
      .filter((c) => (posFilter === 'ALL' || c.pos === posFilter) && !excludes.has(c.key) && (!draft || prefs.fmode !== 'draft' || !draftTaken.has(c.key)) && (!q || nameOf(c.key).toLowerCase().includes(q)))
      .slice(0, 40);
  }, [board, posFilter, query, excludes, draft, draftTaken, prefs.fmode]);
  const nextOf = (c: Cand) => (fctx ? projectWeek(fctx, c.key, week) : 0);

  const slotPlayers = (slotId: string, value: string) => {
    const slot = F_SLOTS.find((x) => x.id === slotId)!;
    const used = new Set(Object.values(fl).filter(Boolean));
    return (slot.positions as string[])
      .flatMap((pos) => ctx.byPos.get(pos as never) ?? [])
      .filter((p) => lab?.p[p.key] && !excludes.has(p.key) && (!used.has(p.key) || p.key === value))
      .map((p) => p.player);
  };

  const subs: Record<string, string> = {
    free: 'Pick any lineup: QB, 2 RB, 2 WR, TE, FLEX and a team defence, projected week by week from recent form.',
    cap: `Salary cap: the game's salaries against a ${cap} cap. Lock the players you want, then build the best lineup the cap allows.`,
    draft: 'Snake draft against seven computer owners: take the best available at each turn, one player a round.',
  };

  return (
    <div className="lab nfl-lab nfl-fantasy rv-load-in container min-w-0 py-3 sm:py-4" style={stage.vars}>
      <div className="lab-stadium">
        <NflHeader
          kitClub={clubName}
          kicker="Team Lab · Fantasy"
          title={
            <>
              Fantasy <span className="text-gold">{capMode ? 'cap' : prefs.fmode === 'draft' ? 'draft' : 'lineup'}</span>
            </>
          }
          sub={subs[prefs.fmode]}
          leds={[
            { label: week ? `Wk ${week} proj` : 'Projection', value: filled ? f1(total(fl, week)) : undefined, title: 'Projected points for the next full week, scoring rules applied' },
            { label: 'Next 4 wks', value: filled ? f1(restOf(fl)) : undefined, title: 'Projected points over the next four weeks (byes count as zero)' },
            { label: `Wk 1-${played || '?'}`, value: filled && rows.length ? f1(seasonPts) : undefined, title: 'What this lineup would have scored so far this season, week by week' },
            { label: capMode ? 'Salary' : 'Scoring', value: capMode ? `${cost}/${cap}` : SCORING_LABELS[prefs.scoring], game: true, title: capMode ? "The game's salaries against its cap" : 'Scoring rules' },
          ]}
        >
          <div className={cn('lab-toolbar nfl-toolbar', ctlOpen && 'is-open')}>
            <ModeSwitch mode="fantasy" onMode={onMode} />
            {prefs.fmode !== 'draft' ? (
              <Button type="button" size="sm" onClick={build} disabled={!cands.length} className="bg-gold font-display text-[15px] font-bold uppercase text-black hover:bg-gold/90" title="Best projected lineup for the next four weeks, honouring locks and removed players">
                <Wallet className="mr-1 h-4 w-4" aria-hidden="true" /> {capMode ? `Build under ${cap}` : 'Best lineup'}
              </Button>
            ) : (
              <>
                <Button type="button" size="sm" onClick={startDraft} className="bg-gold font-display text-[15px] font-bold uppercase text-black hover:bg-gold/90">
                  <Dices className="mr-1 h-4 w-4" aria-hidden="true" /> {draft ? 'Redraft' : 'Start the draft'}
                </Button>
              </>
            )}
            <button type="button" className="nfl-ctl-toggle" onClick={() => setCtlOpen((v) => !v)} aria-expanded={ctlOpen} aria-controls="nfl-ctl">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> {ctlOpen ? 'Hide controls' : 'Format, scoring and more'}
            </button>
            <div className="nfl-ctl" id="nfl-ctl">
            <div className="nfl-seg nfl-seg--sm nfl-ctl-wide" role="group" aria-label="Fantasy format">
              {([['free', 'Free pick'], ['cap', 'Salary cap'], ['draft', 'Draft']] as const).map(([id, label]) => (
                <button key={id} type="button" className={cn('nfl-seg-btn', prefs.fmode === id && 'is-on')} onClick={() => setPrefs({ fmode: id })} aria-pressed={prefs.fmode === id}>
                  {label}
                </button>
              ))}
            </div>
            <Select value={prefs.scoring} onValueChange={(v) => setPrefs({ scoring: v as ScoringId, custom: prefs.custom ?? { ...SCORING.ppr } })}>
              <SelectTrigger className="lab-btn h-9 w-auto min-w-[8.5rem]" aria-label="Scoring">
                <Calculator className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[70]">
                {(Object.keys(SCORING_LABELS) as ScoringId[]).map((s) => (
                  <SelectItem key={s} value={s}>{SCORING_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
                {drafting && (
                  <Button type="button" size="sm" variant="outline" className="lab-btn" onClick={simToEnd}>
                    <FastForward className="mr-1 h-4 w-4" aria-hidden="true" /> Auto-finish
                  </Button>
                )}
            <ClubSelect value={prefs.club} onChange={(c) => setPrefs({ club: c })} label="Stadium" />
            <TurfSelect turf={stage.turf} onTurf={stage.setTurf} />
            {(filled > 0 || excludes.size > 0) && (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setFl({}); setLocks({}); setExcludes(new Set()); setDraft(null); }} className="font-display text-[15px] font-bold uppercase text-muted-foreground">
                <Eraser className="mr-1 h-4 w-4" aria-hidden="true" /> Clear
              </Button>
            )}
            </div>
          </div>
        </NflHeader>
        <Stands art={stage.art} />
        <div className="lab-pitch">
          <NflField
            items={items}
            kitClub={clubName}
            turf={stage.turf}
            art={stage.art}
            tall={stage.tall}
            size={stage.tall ? 's' : 'm'}
            sides={false}
            onPick={openPicker}
            className="nfl-field--fantasy"
          />
          <section aria-labelledby="lab-depth" className="lab-panel lab-depth nfl-depth">
            <header className="lab-panel-head">
              <h2 id="lab-depth" className="lab-panel-title">Lineup</h2>
              <span className="lamp" aria-label={`${filled} of 8 slots filled`}><b>{filled}</b>/8</span>
            </header>
            <ul className="lab-rows">
              {F_SLOTS.map((s) => {
                const v = fl[s.id] ?? '';
                const pts = v && fctx ? projectWeek(fctx, v, week) : 0;
                const end = v ? (
                  <span className="nfl-proj" title={`Projected week ${week}, salary`}>
                    <b>{f1(pts)}</b>
                    <i>${lab ? salaryOf(lab, v) : 0}</i>
                  </span>
                ) : undefined;
                const lock = capMode && v ? (
                  <button type="button" className={cn('nfl-lock', locks[s.id] && 'is-on')} onClick={() => toggleLock(s.id)} aria-pressed={!!locks[s.id]} aria-label={locks[s.id] ? `Unlock ${s.label}` : `Lock ${s.label}`}>
                    {locks[s.id] ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                ) : null;
                if (s.id === 'dst')
                  return (
                    <li key={s.id} id="lab-slot-dst" className="lab-row" data-side="defense">
                      <span className="lab-row-pos" aria-hidden="true">D/ST</span>
                      <div className="min-w-0 flex-1">
                        <Select value={v.slice(4)} onValueChange={(t) => setFl((l) => setF(l, 'dst', `DST:${t}`))}>
                          <SelectTrigger className="h-9 w-full border-line text-sm" aria-label="Team defence" role="combobox">
                            <SelectValue placeholder="Pick a defence" />
                          </SelectTrigger>
                          <SelectContent className="z-[70] max-h-80">
                            {[...NFL_TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                              <SelectItem key={t.id} value={t.abbreviation}>
                                <span className="inline-flex items-center gap-2"><TeamLogo team={t} size={16} decorative /> {t.fullName} <span className="text-muted-foreground">${lab ? salaryOf(lab, `DST:${t.abbreviation}`) : 0}</span></span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <span className="lab-row-end">{lock}{end}</span>
                    </li>
                  );
                return (
                  <SlotRow
                    key={s.id}
                    id={s.id}
                    label={s.label}
                    side="offense"
                    players={slotPlayers(s.id, v)}
                    value={v}
                    profile={v ? ctx.profiles.get(v) : undefined}
                    injury={v ? injured.get(v) : undefined}
                    end={<>{lock}{end}</>}
                    onChange={(k) => setFl((l) => setF(l, s.id, k))}
                  />
                );
              })}
            </ul>
            {capMode && (
              <div className="nfl-cap" aria-label={`Payroll ${cost} of ${cap}`}>
                <span className="nfl-cap-bar"><i className={cn(cost > cap && 'over')} style={{ width: `${Math.min(100, (cost / cap) * 100)}%` }} /></span>
                <span className={cn('nfl-cap-txt', cost > cap && 'text-destructive')}>${cost} of ${cap} · {cost > cap ? `$${cost - cap} over` : `$${cap - cost} room`}</span>
              </div>
            )}
          </section>
        </div>
      </div>

      {prefs.scoring === 'custom' && (
        <Card title="Custom scoring" icon={<Calculator className="h-5 w-5 text-gold" aria-hidden="true" />}>
          <div className="nfl-scoring">
            {SCORING_FIELDS.map((f) => (
              <label key={f.id} className="nfl-scoring-f">
                <span>{f.label}</span>
                <Input type="number" step={f.step} value={scoring[f.id]} onChange={(e) => setPrefs({ custom: { ...scoring, [f.id]: Number(e.target.value) || 0 } })} className="h-8 border-line bg-night/60 text-sm" />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Team defences score the standard way: sack 1, INT 2, fumble recovery 2, TD 6, safety 2, block 2, points allowed 10 down to −4.</p>
        </Card>
      )}

      {prefs.fmode === 'draft' && (
        <DraftPanel draft={draft} board={shown} onPick={draftPick} myTurn={myTurn} />
      )}

      <Card
        title={prefs.fmode === 'draft' ? 'Draft board' : 'Players board'}
        icon={<ListOrdered className="h-5 w-5 text-gold" aria-hidden="true" />}
        action={
          <div className="flex items-center gap-1.5">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search players" className="h-8 w-32 border-line bg-night/60 text-sm" />
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Position">
          {(['ALL', 'QB', 'RB', 'WR', 'TE', 'DST'] as const).map((p) => (
            <button key={p} type="button" className={cn('nfl-chip', posFilter === p && 'is-on')} onClick={() => setPosFilter(p)} aria-pressed={posFilter === p}>
              {p === 'DST' ? 'D/ST' : p}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="stats-table nfl-board">
            <caption className="sr-only">Projected points board</caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col" className="num">Wk {week}</th>
                <th scope="col" className="num">Next 4</th>
                <th scope="col" className="num">Salary</th>
                <th scope="col" className="num">Pts/$</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const inLineup = Object.values(fl).includes(c.key);
                const inj = injured.get(c.key);
                return (
                  <tr key={c.key} className={cn(inLineup && 'is-in')}>
                    <th scope="row" className="text-left normal-case">
                      <span className="inline-flex items-center gap-2">
                        <TeamLogo team={c.club} size={18} decorative />
                        <span className="nfl-board-pos">{c.pos === 'DST' ? 'D/ST' : c.pos}</span>
                        <span className="text-chalk">{nameOf(c.key)}</span>
                        {inj && <InjMini code={inj} />}
                      </span>
                    </th>
                    <td className="num">{f1(nextOf(c))}</td>
                    <td className="num">{f1(c.value)}</td>
                    <td className="num">${c.salary}</td>
                    <td className="num">{c.salary ? (c.value / c.salary).toFixed(2) : '—'}</td>
                    <td className="nfl-board-act">
                      {prefs.fmode === 'draft' ? (
                        <Button type="button" size="sm" className="h-7 px-2 font-display font-bold uppercase" disabled={!myTurn || !draft || !canDraft(draft, draft.me, c.key)} onClick={() => draftPick(c.key)}>
                          Draft
                        </Button>
                      ) : (
                        <>
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => place(c.key)} disabled={inLineup} aria-label={`Add ${nameOf(c.key)}`}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => exclude(c.key)} aria-label={`Remove ${nameOf(c.key)} from the pool`} title="Remove from the pool (the builder skips him)">
                            <Ban className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Projection: his last 12 games, recent ones weighted heavier, times how the opponent defends his position, with injury reports and byes applied.
          {excludes.size > 0 && (
            <button type="button" className="ml-2 underline" onClick={() => setExcludes(new Set())}>
              Restore {excludes.size} removed
            </button>
          )}
        </p>
      </Card>

      {filled > 0 && fctx && (
        <FantasyH2H
          lineup={fl}
          opp={opp}
          opponents={opponents}
          oppId={opp?.id ?? ''}
          onOpp={setOppId}
          fctx={fctx}
          logs={logs}
          oppLogs={oppLogs}
          played={played}
          scoring={scoring}
        />
      )}

      <NflSaved
        kind="fantasy"
        list={saved.list}
        canSave={filled > 0}
        onSave={(name) => saved.add({ name, kind: 'fantasy', lineup: fl })}
        onLoad={(s) => s.kind === 'fantasy' && setFl(s.lineup)}
        onRename={saved.rename}
        onDelete={saved.remove}
        summary={(s) => (s.kind === 'fantasy' && fctx ? `${f1(total(s.lineup, week))} proj · ${fFilled(s.lineup)}/8` : '')}
      />
    </div>
  );
};

const InjMini = ({ code }: { code: InjuryCode }) => <span className={`nfl-injchip nfl-injchip--${code.toLowerCase()}`}>{code === 'Questionable' ? 'Q' : code === 'Doubtful' ? 'Dbt' : code}</span>;

// ---------- Draft panel ----------

const DraftPanel = ({ draft, onPick, myTurn }: { draft: DraftState | null; board: Cand[]; onPick: (k: string) => void; myTurn: boolean }) => {
  void onPick;
  if (!draft) return (
    <Card title="Snake draft" icon={<ListOrdered className="h-5 w-5 text-gold" aria-hidden="true" />}>
      <p className="text-sm text-muted-foreground">Eight owners, {DRAFT_ROUNDS} rounds, one player each round: QB, two RB, two WR, TE, a FLEX and a defence. Press “Start the draft”; the computer owners pick best-value-first with a taste of their own.</p>
    </Card>
  );
  const clock = onClock(draft);
  const round = Math.floor(draft.picks.length / draft.teams) + 1;
  const mine = teamPicks(draft, draft.me);
  return (
    <Card title="Snake draft" icon={<ListOrdered className="h-5 w-5 text-gold" aria-hidden="true" />}>
      <p className="text-sm text-chalk" role="status">
        {clock == null ? 'The draft is complete: your squad is in the lineup.' : myTurn ? `Your pick: round ${Math.min(DRAFT_ROUNDS, round)}, pick ${draft.picks.length + 1}.` : `Draft team ${clock + 1} is on the clock.`}
        <span className="ml-2 text-xs text-muted-foreground">You pick {draft.me + 1}{['st', 'nd', 'rd'][draft.me] ?? 'th'} in odd rounds.</span>
      </p>
      <div className="nfl-draft">
        <div>
          <p className="font-pixel text-[9px] uppercase text-gold">Your picks ({mine.length}/{DRAFT_ROUNDS})</p>
          <ol className="nfl-picks">{mine.map((k, i) => <li key={k}><b>{i + 1}</b> {nameOf(k)}</li>)}</ol>
        </div>
        <div>
          <p className="font-pixel text-[9px] uppercase text-muted-foreground">Latest picks</p>
          <ol className="nfl-picks nfl-picks--log">
            {draft.picks.slice(-8).reverse().map((p, i) => (
              <li key={`${p.key}-${i}`} className={cn(p.team === draft.me && 'text-gold')}><b>{draft.picks.indexOf(p) + 1}</b> T{p.team + 1}: {nameOf(p.key)}</li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
};

// ---------- Head-to-head, week by week ----------

const FantasyH2H = ({
  lineup,
  opp,
  opponents,
  oppId,
  onOpp,
  fctx,
  logs,
  oppLogs,
  played,
  scoring,
}: {
  lineup: FLineup;
  opp: { id: string; name: string; lineup: FLineup } | undefined;
  opponents: { id: string; name: string; lineup: FLineup }[];
  oppId: string;
  onOpp: (id: string) => void;
  fctx: Ctx;
  logs: Map<string, GameLog | null>;
  oppLogs: Map<string, GameLog | null>;
  played: number;
  scoring: Scoring;
}) => {
  const mine = useMemo(() => replay(fctx.lab, lineup, logs, scoring, played), [fctx, lineup, logs, scoring, played]);
  const theirs = useMemo(() => (opp ? replay(fctx.lab, opp.lineup, oppLogs, scoring, played) : []), [fctx, opp, oppLogs, scoring, played]);
  const proj = (l: FLineup, w: number) => FANTASY_IDS.reduce((s, id) => s + (l[id] ? projectWeek(fctx, l[id], w) : 0), 0);
  const rowsA = [
    ...mine.map((r, i) => ({ week: r.week, a: r.total, b: theirs[i]?.total ?? 0, kind: 'played' as const })),
    ...fctx.sched.weeks.slice(0, 5).map((w) => ({ week: w, a: proj(lineup, w), b: opp ? proj(opp.lineup, w) : 0, kind: 'proj' as const })),
  ];
  const wins = rowsA.filter((r) => r.kind === 'played' && r.a > r.b).length;
  const losses = rowsA.filter((r) => r.kind === 'played' && r.a < r.b).length;
  const sumA = rowsA.filter((r) => r.kind === 'played').reduce((s, r) => s + r.a, 0);
  const sumB = rowsA.filter((r) => r.kind === 'played').reduce((s, r) => s + r.b, 0);
  const max = Math.max(1, ...rowsA.map((r) => Math.max(r.a, r.b)));
  return (
    <Card
      title="Head-to-head"
      icon={<Swords className="h-5 w-5 text-gold" aria-hidden="true" />}
      action={
        <Select value={oppId} onValueChange={onOpp}>
          <SelectTrigger className="h-8 w-[min(15rem,56vw)] border-line text-sm" aria-label="Opponent lineup">
            <SelectValue placeholder="Opponent" />
          </SelectTrigger>
          <SelectContent className="z-[70] max-h-80">
            {opponents.map((o) => (
              <SelectItem key={o.id} value={o.id}>{displayName(o.name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {!opp ? (
        <p className="text-sm text-muted-foreground">Save a lineup or finish a draft for an opponent.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-chalk">
            Replaying weeks 1-{played} with the real games: <b className="text-gold">{wins}-{losses}</b> against {opp.name}, {sumA.toFixed(1)} to {sumB.toFixed(1)} points. Projected weeks follow.
          </p>
          <div className="overflow-x-auto">
            <table className="stats-table nfl-h2h">
              <thead>
                <tr><th scope="col">Week</th><th scope="col" className="num">You</th><th scope="col" /><th scope="col" className="num">Them</th></tr>
              </thead>
              <tbody>
                {rowsA.map((r) => (
                  <tr key={`${r.kind}-${r.week}`} className={r.kind === 'proj' ? 'is-proj' : undefined}>
                    <th scope="row" className="text-left normal-case">{r.kind === 'proj' ? `Wk ${r.week} (proj)` : `Wk ${r.week}`}</th>
                    <td className={cn('num', r.a > r.b && 'is-win')}>{r.a.toFixed(1)}</td>
                    <td className="nfl-h2h-bar" aria-hidden="true">
                      <span className="nfl-h2h-l"><i style={{ width: `${(r.a / max) * 100}%` }} /></span>
                      <span className="nfl-h2h-r"><i style={{ width: `${(r.b / max) * 100}%` }} /></span>
                    </td>
                    <td className={cn('num', r.b > r.a && 'is-win')}>{r.b.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Played weeks use each player's actual game that week (zero on a bye or when he did not play), defences their real stat line.</p>
        </>
      )}
    </Card>
  );
};

export default FantasyMode;
