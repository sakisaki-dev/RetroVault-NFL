import { useEffect, useMemo, useState } from 'react';
import { findNFLTeam } from '@/utils/nflTeams';
import { loadGameLog, type GameLog } from '@/utils/gameLogs';
import {
  FANTASY_IDS, F_SLOTS, SCORING, boardOf, buildBest, candidates, canDraft, canFill, costOf, cpuPick, emptyF, fFilled, isBye,
  lineupFromPicks, onClock, projectWeek, replay, salaryOf, setF, teamPicks,
  type Ctx, type DraftState, type FLineup, type Scoring,
} from '@/utils/nflFantasy';
import { useSavedLabs, type NflLabReady, type Prefs } from '@/components/teamlab/nfl/useNflLab';

/** The bench: slot ids b1..bN stored in the same lineup object as the starters (old saved lineups have none = an empty bench). */
export const BENCH_DEFAULT = 6;
export const BENCH_MAX = 12;
export const isBenchId = (id: string) => /^b\d+$/.test(id);
export const benchIdsOf = (n: number) => Array.from({ length: n }, (_, i) => `b${i + 1}`);
const BENCH_LS = 'retroVault:fantasy:bench';
const BENCH_N_LS = 'retroVault:fantasy:benchN';
const readBench = (): FLineup => {
  try {
    const o = JSON.parse(localStorage.getItem(BENCH_LS) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(o).filter(([k, v]) => isBenchId(k) && typeof v === 'string' && v)) as FLineup;
  } catch {
    return {};
  }
};
const readBenchN = () => {
  try {
    const n = Number(localStorage.getItem(BENCH_N_LS));
    return Number.isInteger(n) && n >= 1 && n <= BENCH_MAX ? n : BENCH_DEFAULT;
  } catch {
    return BENCH_DEFAULT;
  }
};
/** next starters, keeping the bench players of prev that next does not use. */
const keepBench = (next: FLineup, prev: FLineup): FLineup => {
  if (Object.keys(next).some(isBenchId)) return next;
  const used = new Set(Object.values(next));
  const out = { ...next };
  Object.entries(prev).forEach(([k, v]) => { if (isBenchId(k) && v && !used.has(v)) out[k] = v; });
  return out;
};

export const f1 = (x: number) => x.toFixed(1);
export const nameOf = (key: string) => (key.startsWith('DST:') ? `${findNFLTeam(key.slice(4))?.name ?? key.slice(4)} D/ST` : key.slice(key.indexOf(':') + 1));

/** Game logs of the lineups' players, loaded once each (the replay of what they scored). */
export /** Game logs of the lineups' players, loaded once each (the replay of what they scored). */
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

/** Everything the Fantasy page's sub-pages share: the lineup, locks, removed players, the draft, saved lineups, the projections. */
export const useFantasyHub = (nl: NflLabReady, prefs: Prefs, needOpponents = true) => {
  const { ctx, data, injured, sched } = nl;
  const lab = data?.lab ?? null;
  const saved = useSavedLabs();
  const [fl, setFl] = useState<FLineup>(() => ({ ...emptyF(), ...readBench() }));
  const [benchN, setBenchNRaw] = useState(readBenchN);
  const setBenchN = (n: number) => {
    const v = Math.max(1, Math.min(BENCH_MAX, n));
    setBenchNRaw(v);
    try { localStorage.setItem(BENCH_N_LS, String(v)); } catch { /* private mode */ }
  };
  useEffect(() => {
    try { localStorage.setItem(BENCH_LS, JSON.stringify(Object.fromEntries(Object.entries(fl).filter(([k, v]) => isBenchId(k) && v)))); } catch { /* private mode */ }
  }, [fl]);
  const bench = useMemo(() => benchIdsOf(benchN).map((id) => ({ id, key: fl[id] ?? '' })), [fl, benchN]);
  const clearStarters = () => setFl((l) => Object.fromEntries(Object.entries(l).filter(([k]) => isBenchId(k))));
  const loadLineup = (l: FLineup) => setFl((p) => keepBench(l, p));
  /** the starter in `slotId` and the bench player in `benchId` trade places */
  const startFromBench = (slotId: string, benchId: string) =>
    setFl((l) => {
      const n = { ...l };
      const old = n[slotId] ?? '';
      n[slotId] = n[benchId] ?? '';
      n[benchId] = old;
      return n;
    });
  const [locks, setLocks] = useState<FLineup>({});
  const [excludes, setExcludes] = useState<Set<string>>(new Set());
  const [posFilter, setPosFilter] = useState<'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'DST'>('ALL');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [oppId, setOppId] = useState('');
  const clubName = findNFLTeam(prefs.club)?.name ?? prefs.club;

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
      if (slot) return setF(l, slot.id, key);
      const spot = benchIdsOf(benchN).find((id) => !l[id]);
      return spot ? setF(l, spot, key) : l;
    });
  const build = () => {
    if (!cands.length) return;
    const r = buildBest(cands, { cap: capMode ? cap : 999, locks, excludes });
    if (r) setFl((p) => keepBench(r.lineup, p));
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
    clearStarters();
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
  const finishDraft = (d: DraftState) => setFl((p) => keepBench(lineupFromPicks(teamPicks(d, d.me), (k) => candBy.get(k)?.value ?? 0), p));
  const draftTaken = useMemo(() => new Set(draft?.picks.map((p) => p.key) ?? []), [draft]);
  const drafting = prefs.fmode === 'draft' && !!draft && onClock(draft) != null;
  const myTurn = !!draft && onClock(draft) === draft.me;

  // ----- opponents for the head-to-head -----
  // (two beam searches and the opponent's game logs: only the head-to-head page reads them, so only it pays)
  const opponents = useMemo(() => {
    const out: { id: string; name: string; lineup: FLineup }[] = [];
    if (!needOpponents) return out;
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
  }, [saved.list, draft, cands, cap, candBy, needOpponents]);
  const same = (a: FLineup, b: FLineup) => FANTASY_IDS.every((id) => (a[id] ?? '') === (b[id] ?? ''));
  const opp = opponents.find((o) => o.id === oppId) ?? opponents.find((o) => !same(o.lineup, fl)) ?? opponents[0];
  const oppLogs = useLogs(opp ? Object.values(opp.lineup) : []);
  const filledCount = filled;
  void filledCount;
  return {
    ctx, lab, injured, sched, saved, fl, setFl, bench, benchN, setBenchN, clearStarters, loadLineup, startFromBench, locks, setLocks, excludes, setExcludes, draft, setDraft, oppId, setOppId,
    clubName, scoring, fctx, cands, board, candBy, cap, capMode, logs, week, played, total, restOf, filled, cost, rows, seasonPts,
    place, build, toggleLock, exclude, startDraft, draftPick, simToEnd, draftTaken, drafting, myTurn, opponents, opp, oppLogs,
    posFilter, setPosFilter, query, setQuery, isBye, salaryOf, F_SLOTS, canFill, projectWeek, setF, canDraft, fFilled,
  };
};
export type FantasyHub = ReturnType<typeof useFantasyHub>;
