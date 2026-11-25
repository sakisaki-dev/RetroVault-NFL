import { IS_NFL } from '@/config/edition';
import type { Player, Position } from '@/types/player';
import { fmtFixed } from '@/utils/numberFormat';
import { careerRatingMeta, careerExposure, isCareerQualified, CAREER_QUALIFY } from './ovr';
import { METRIC_BY_ID, SIM_MIN_GAMES, compFeatures, similarityBaseline, type CompFeature } from './advanced';

/**
 * Skill grades: the play-style traits (config/advanced.ts compFeatures, the similarity features) with football
 * names, graded by per-position percentile → S / A+ … D− / F, and the overall mapping onto the official OVR curve.
 * Pure and React-free; shared by Build-a-Legend and the Player Deep Dive so both always show the same grades.
 * Percentiles are against league players at the position with ≥ 8 games (similarityBaseline).
 */

/** Football names for the play-style features (config/advanced.ts compFeatures ids). */
const TRAIT_NAMES: Record<string, Record<string, string>> = {
  QB: { ya: 'Arm', cmp: 'Accuracy', tdPct: 'Gunslinger', intPct: 'Decision making', rating: 'Clutch rating', passYdsG: 'Volume', rushYdsG: 'Legs', rushShare: 'Scrambler' },
  RB: { ypc: 'Vision', rushYdsG: 'Workhorse', recYdsG: 'Pass catching', recShare: 'Dual threat', td16: 'Nose for the end zone', fumRate: 'Ball security', ypt: 'Explosiveness' },
  REC: { recG: 'Hands', recYdsG: 'Production', ypr: 'Big play', tdPerRec: 'Red zone', fumRate: 'Ball security' },
  DEF: { tklG: 'Tackling', sackG: 'Pass rush', intG: 'Ball hawk', ffG: 'Strip', impactG: 'Playmaker' },
};
const traitGroup = (pos: Position) => (pos === 'WR' || pos === 'TE' ? 'REC' : pos === 'LB' || pos === 'DB' || pos === 'DL' ? 'DEF' : pos);
export const traitName = (pos: Position, f: CompFeature) => TRAIT_NAMES[traitGroup(pos)]?.[f.id] ?? f.label;

export interface SkillTrait extends CompFeature {
  /** Football name, e.g. "Accuracy" for Cmp% */
  name: string;
}

/** The graded traits for a position, in similarity-feature order. */
export const skillTraits = (pos: Position): SkillTrait[] => compFeatures(pos).map((f) => ({ ...f, name: traitName(pos, f) }));

/** Display string for a raw feature value. */
export const fmtFeature = (f: CompFeature, v: number) =>
  Number.isFinite(v) ? `${fmtFixed((f.scale ?? 1) * v, f.decimals)}${f.suffix ?? ''}` : '—';

/** Percentile (0–100, share of qualified players at or below) of a raw value among the position baseline. */
export const percentileOf = (sortedVals: number[], v: number) => {
  if (!sortedVals.length || !Number.isFinite(v)) return NaN;
  // Mid-rank: share strictly below plus half the ties, so flipping a lower-is-better stat (100 − pct) stays symmetric
  const bound = (strict: boolean) => {
    let lo = 0;
    let hi = sortedVals.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (strict ? sortedVals[mid] < v : sortedVals[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const n = sortedVals.length;
  const below = bound(true);
  const ties = bound(false) - below;
  if (n <= 1) return 100;
  // Same mid-rank formula as the Advanced boards (config/advanced.ts): a player in the pool is ranked against the
  // others, so the best is exactly 100 and the worst 0. A value outside the pool (a build) slots in between.
  return ties > 0 ? (100 * (below + (ties - 1) / 2)) / (n - 1) : (100 * below) / n;
};

/** Percentile where higher is always better: lower-is-better features (INT%, fumble rates) are flipped. */
export const skillPct = (f: CompFeature, sortedVals: number[], v: number) => {
  const pct = percentileOf(sortedVals, v);
  return f.lowerIsBetter && Number.isFinite(pct) ? 100 - pct : pct;
};

/**
 * Traits that are the same stat as an Advanced board: they use that board's qualifier pool, so the trait's
 * percentile equals the board's (Deep Dive shows both side by side).
 */
const SAME_AS_METRIC: Partial<Record<Position, Record<string, string>>> = {
  QB: { tdPct: 'tdPct', intPct: 'intPct', rating: 'passerRating' },
  RB: { td16: 'tdPer16', fumRate: 'fumbleRate', ypt: 'ydsPerTouch' },
  LB: { tklG: 'tacklesPerGame', impactG: 'impactPerGame' },
  DB: { tklG: 'tacklesPerGame', impactG: 'impactPerGame' },
  DL: { tklG: 'tacklesPerGame', impactG: 'impactPerGame' },
};

/**
 * The qualifier pool per feature id, with its label. Traits that match an Advanced board use that board's
 * qualifiers; the rest use league players at the position with ≥ SIM_MIN_GAMES games (similarityBaseline).
 */
export const traitPools = (players: Player[], position: Position): Map<string, { pool: Player[]; label: string }> =>
  memoByPlayers(poolCache, players, position, () => buildTraitPools(players, position));
const buildTraitPools = (players: Player[], position: Position): Map<string, { pool: Player[]; label: string }> => {
  const base = similarityBaseline(players, position);
  const atPos = players.filter((p) => p.position === position && !p.isRealLegend);
  return new Map(
    compFeatures(position).map((f) => {
      const metric = METRIC_BY_ID.get(SAME_AS_METRIC[position]?.[f.id] ?? '');
      return [f.id, metric ? { pool: atPos.filter(metric.qualifies), label: metric.minLabel } : { pool: base, label: `${SIM_MIN_GAMES}+ games` }];
    }),
  );
};

/** Sorted baseline values per feature id, over each trait's qualifier pool (traitPools). */
export const positionBaseline = (players: Player[], position: Position): Map<string, number[]> =>
  memoByPlayers(baselineCache, players, position, () => {
    const pools = traitPools(players, position);
    return new Map(compFeatures(position).map((f) => [f.id, (pools.get(f.id)?.pool ?? []).map(f.get).filter(Number.isFinite).sort((a, b) => a - b)]));
  });

/*
 * Pools and baselines depend only on the league array and the position, but grading every player asks for them once
 * per player (O(n²) over the league: about 1.5 s at 4x CPU throttle for the Stats page skill ratings). They are cached per
 * array (a WeakMap, so a reloaded or edited league, which is a new array, starts afresh and the old one is collected).
 * Callers treat the results as read-only.
 */
type PosCache<T> = WeakMap<readonly Player[], Map<Position, T>>;
const poolCache: PosCache<Map<string, { pool: Player[]; label: string }>> = new WeakMap();
const baselineCache: PosCache<Map<string, number[]>> = new WeakMap();
const memoByPlayers = <T,>(cache: PosCache<T>, players: Player[], position: Position, build: () => T): T => {
  let byPos = cache.get(players);
  if (!byPos) cache.set(players, (byPos = new Map()));
  let v = byPos.get(position);
  if (v === undefined) byPos.set(position, (v = build()));
  return v;
};

// ---------- Letter grades ----------

export interface GradeStep {
  /** Inclusive minimum direction-aware percentile (0–100) */
  min: number;
  grade: string;
  /** Chip background; text is always dark (#0b1020) for contrast */
  color: string;
}

/**
 * Percentile → letter grade, best first, on a generous curve: S top 10%, A next 15%, B next 25%, C next 25%,
 * D next 15%, F bottom 10%; each of A–D is split into +/plain/− thirds by percentile (S and F have no modifier).
 * Percentiles are per-position rate percentiles (no career volume) and direction-aware (skillPct): INT% and fumble
 * rates are inverted. The overall blends trait percentiles (overallFor), which compresses the top, so S at 90 lands
 * on about the top 5% of the league overall (owner: "the S grade bar should come down").
 */
export const GRADE_SCALE: GradeStep[] = [
  { min: 90, grade: 'S', color: '#ffd84a' },
  { min: 85, grade: 'A+', color: '#3ddc84' },
  { min: 80, grade: 'A', color: '#5fdc78' },
  { min: 75, grade: 'A−', color: '#7fd86c' },
  { min: 66.67, grade: 'B+', color: '#a3d85e' },
  { min: 58.33, grade: 'B', color: '#c2d652' },
  { min: 50, grade: 'B−', color: '#dcd04a' },
  { min: 41.67, grade: 'C+', color: '#ffc83d' },
  { min: 33.33, grade: 'C', color: '#ffb43d' },
  { min: 25, grade: 'C−', color: '#ffa03d' },
  { min: 20.0, grade: 'D+', color: '#ff8a45' },
  { min: 15.0, grade: 'D', color: '#ff7a4a' },
  { min: 10, grade: 'D−', color: '#ff6c50' },
  { min: 0, grade: 'F', color: '#ff5a61' },
];

export const gradeFor = (pct: number): GradeStep | null =>
  Number.isFinite(pct) ? (GRADE_SCALE.find((g) => pct >= g.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1]) : null;

export interface Overall {
  /** Weighted mean of the filled traits' direction-aware percentiles: the single source for the rating and letter */
  pct: number;
  /** Official OVR curve (config/ovr.ts): round(62 + 37·(pct/100)^0.85), 62–99 */
  rating: number;
  grade: GradeStep;
  tier: string;
}

/** Official OVR curve (config/ovr.ts): round(62 + 37·(pct/100)^0.85). */
export const ovrFromPercentile = (pct: number) => Math.round(62 + 37 * (Math.min(100, Math.max(0, pct)) / 100) ** (IS_NFL ? 2.5 : 0.85));

/** Tier label from the grade family, so the letter and the label never disagree. */
const TIERS: Record<string, string> = { S: 'Generational', A: 'All-Pro', B: 'Pro Bowl', C: 'Starter', D: 'Backup', F: 'Depth chart' };
export const tierFor = (grade: GradeStep) => TIERS[grade.grade[0]] ?? 'Depth chart';

/**
 * Value weights for the OVERALL only (independent of the similarity weights, which are style-matching weights).
 * Pure style descriptors (rush share, receiving share) weigh 0; a missing id weighs 0.
 */
export const VALUE_WEIGHTS: Record<string, Record<string, number>> = {
  QB: { ya: 0.2, tdPct: 0.2, intPct: 0.15, cmp: 0.15, rating: 0.1, passYdsG: 0.15, rushYdsG: 0.05, rushShare: 0 },
  RB: { ypc: 0.2, td16: 0.25, rushYdsG: 0.3, fumRate: 0.1, recYdsG: 0.1, ypt: 0.05, recShare: 0 },
  REC: { recYdsG: 0.35, ypr: 0.2, tdPerRec: 0.2, recG: 0.15, fumRate: 0.1 },
  DEF: { impactG: 0.35, tklG: 0.2, sackG: 0.15, intG: 0.15, ffG: 0.15 },
  OL: { blocksG: 1 },
};
/**
 * NFL season grades (owner, 2026-11-24: "count fumbles and learn the weights from the data"): the weights are fitted by
 * scripts/nfl/season_skill_weights.py (non-negative ridge on 1999-2025 player-seasons against total EPA per game; defenders a
 * playmaking composite) and read from career_rating.json `seasonWeights`. A trait the fit leaves out (receiving share, rush
 * share) weighs 0. Without the file the career weights stand in.
 */
const valueWeight = (pos: Position, id: string, season = false) => {
  if (isNoSignal(pos, id, season)) return 0;
  const learned = season ? careerRatingMeta()?.seasonWeights?.[pos] : undefined;
  if (learned) return learned[id] ?? 0;
  return VALUE_WEIGHTS[traitGroup(pos)]?.[id] ?? VALUE_WEIGHTS[pos]?.[id] ?? 0;
};
/** Share of the overall that comes from the player's three best traits, so excellence isn't averaged away. */
export const OVERALL_TOP3_MIX = 0.4;


// ---------- NFL edition: career grades on the qualified pool, shrunk rates, no tile without signal ----------
/*
 * Owner (2026-11-23: "Achane has hella S ratings and so many people have S ratings"): a career tile is graded against the
 * QUALIFIED pool at the position (QB 1,500 attempts, RB 500 carries, WR/TE 150 catches, LB/DB/DL 48 games; the same pool
 * as the career rating), on SHRUNK rates (rate pulled toward the pool mean by n / (n + k), k from scripts/nfl/career_rating.py:
 * the stat's sampling noise against its between-player signal), and a stat with no signal (k of 5,000 or more: RB and
 * WR/TE fumbles, DL interceptions) gets no tile ("not enough signal") and no weight. The overall is re-ranked inside the
 * qualified pool, so S is the top 10% of starters. A season line (this-season grades) keeps the old pools. OL keeps its
 * single trait on the old pool.
 */
const SHRINK: Record<string, Record<string, { stat: string; n: 'att' | 'carries' | 'touches' | 'rec' | 'g' }>> = {
  QB: { ya: { stat: 'ya', n: 'att' }, cmp: { stat: 'cmp', n: 'att' }, tdPct: { stat: 'td', n: 'att' }, intPct: { stat: 'int', n: 'att' }, rating: { stat: 'ya', n: 'att' } },
  RB: { ypc: { stat: 'ypc', n: 'carries' }, td16: { stat: 'td_touch', n: 'touches' }, fumRate: { stat: 'fum_touch', n: 'touches' }, ypt: { stat: 'ypt', n: 'touches' } },
  WR: { ypr: { stat: 'ypr', n: 'rec' }, tdPerRec: { stat: 'td_rec', n: 'rec' }, fumRate: { stat: 'fum_rec', n: 'rec' } },
  TE: { ypr: { stat: 'ypr', n: 'rec' }, tdPerRec: { stat: 'td_rec', n: 'rec' }, fumRate: { stat: 'fum_rec', n: 'rec' } },
  LB: { tklG: { stat: 'tkl_g', n: 'g' }, sackG: { stat: 'sack_g', n: 'g' }, intG: { stat: 'int_g', n: 'g' }, ffG: { stat: 'ff_g', n: 'g' }, impactG: { stat: 'sack_g', n: 'g' } },
};
SHRINK.DB = SHRINK.LB;
SHRINK.DL = SHRINK.LB;
const NO_SIGNAL_K = 5000;
const shrinkSpec = (pos: Position, id: string) => (IS_NFL && careerRatingMeta() ? SHRINK[pos]?.[id] : undefined);
const kOf = (pos: Position, id: string, season = false): number | null | undefined => {
  const s = shrinkSpec(pos, id);
  if (!s) return undefined;
  // a season grade counts fumbles lost (career_rating.json seasonK): over a career they are noise, over a season a real penalty
  const sk = season ? careerRatingMeta()!.seasonK?.[`${pos}:${s.stat}`] : undefined;
  return sk ?? careerRatingMeta()!.k[pos]?.[s.stat];
};
/** True for a trait whose stat has no between-player signal in the data (NFL career grades): no tile, no weight. */
export const isNoSignal = (pos: Position, id: string, season = false): boolean => {
  const k = kOf(pos, id, season);
  return k !== undefined && (k === null || k >= NO_SIGNAL_K);
};
const exposureOf = (p: Player, n: 'att' | 'carries' | 'touches' | 'rec' | 'g') => {
  const v = (k: string) => {
    const x = (p as unknown as Record<string, unknown>)[k];
    return typeof x === 'number' && Number.isFinite(x) ? x : 0;
  };
  return n === 'att' ? v('attempts') : n === 'carries' ? v('rushAtt') : n === 'touches' ? v('rushAtt') + v('receptions') : n === 'rec' ? v('receptions') : v('games');
};
/**
 * NFL season pools (owner, 2026-11-24): a season is graded against the players who qualified for it so far, scaled to the weeks
 * played (the most games anyone has): QB 10 attempts a week, RB 6 carries, WR / TE 2.5 catches, defenders 40% of the weeks
 * (at 10 weeks: 100 attempts, 60 carries, 25 catches, 4 games).
 */
const SEASON_QUALIFY: Record<string, { field: 'attempts' | 'rushAtt' | 'receptions' | 'games'; per: number; noun: string }> = {
  QB: { field: 'attempts', per: 10, noun: 'attempts' },
  RB: { field: 'rushAtt', per: 6, noun: 'carries' },
  WR: { field: 'receptions', per: 2.5, noun: 'catches' },
  TE: { field: 'receptions', per: 2.5, noun: 'catches' },
  LB: { field: 'games', per: 0.4, noun: 'games' },
  DB: { field: 'games', per: 0.4, noun: 'games' },
  DL: { field: 'games', per: 0.4, noun: 'games' },
};
const weeksCache = new WeakMap<readonly Player[], number>();
const seasonWeeks = (players: Player[]) => {
  let w = weeksCache.get(players);
  if (w === undefined) weeksCache.set(players, (w = players.reduce<number>((m, p) => (Number.isFinite(p.games) && p.games > m ? p.games : m), 0)));
  return w;
};
const seasonMin = (players: Player[], pos: Position) => {
  const q = SEASON_QUALIFY[pos];
  return q ? Math.max(q.field === 'games' ? 2 : 5, Math.round(q.per * seasonWeeks(players))) : 0;
};
const isSeasonSet = (players: Player[]) => players.length > 0 && !!(players[0] as unknown as { __season?: boolean }).__season;

interface CareerCtx {
  features: CompFeature[];
  pool: Player[];
  mean: Map<string, number>;
  baseline: Map<string, number[]>;
  /** raw overall percentile of every qualified player, sorted: the overall is re-ranked inside it */
  overallSorted: number[];
  season: boolean;
  label: string;
}
const careerCache = new WeakMap<readonly Player[], Map<Position, CareerCtx | null>>();
const shrunkOf = (ctx: Pick<CareerCtx, 'mean' | 'season'>, pos: Position, f: CompFeature, p: Player): number => {
  const v = f.get(p);
  const s = shrinkSpec(pos, f.id);
  const k = kOf(pos, f.id, ctx.season);
  if (!s || !Number.isFinite(v) || k == null || k >= NO_SIGNAL_K) return v;
  const mu = ctx.mean.get(f.id);
  if (mu == null) return v;
  const n = exposureOf(p, s.n);
  return mu + (v - mu) * (n / (n + k));
};
const careerCtx = (players: Player[], pos: Position): CareerCtx | null => {
  const season = isSeasonSet(players);
  if (!IS_NFL || !careerRatingMeta() || !(season ? SEASON_QUALIFY[pos] : CAREER_QUALIFY[pos])) return null;
  let byPos = careerCache.get(players);
  if (!byPos) careerCache.set(players, (byPos = new Map()));
  if (byPos.has(pos)) return byPos.get(pos)!;
  const min = season ? seasonMin(players, pos) : 0;
  const qualifies = (p: Player) => (season ? exposureOf(p, SEASON_QUALIFY[pos].field === 'games' ? 'g' : SEASON_QUALIFY[pos].field === 'attempts' ? 'att' : SEASON_QUALIFY[pos].field === 'rushAtt' ? 'carries' : 'rec') >= min : isCareerQualified(p));
  const label = season ? `${min} ${SEASON_QUALIFY[pos].noun} this season` : CAREER_QUALIFY[pos].label;
  const pool = players.filter((p) => p.position === pos && !p.isRealLegend && qualifies(p));
  const features = compFeatures(pos);
  if (pool.length < 12) {
    byPos.set(pos, null);
    return null;
  }
  const mean = new Map<string, number>();
  features.forEach((f) => {
    const v = pool.map(f.get).filter(Number.isFinite);
    if (v.length) mean.set(f.id, v.reduce((a, b) => a + b, 0) / v.length);
  });
  const ctx: CareerCtx = { features, pool, mean, baseline: new Map(), overallSorted: [], season, label };
  features.forEach((f) =>
    ctx.baseline.set(f.id, isNoSignal(pos, f.id, ctx.season) ? [] : pool.map((p) => shrunkOf(ctx, pos, f, p)).filter(Number.isFinite).sort((a, b) => a - b)),
  );
  ctx.overallSorted = pool
    .map((p) => overallFor(features, ctx.baseline, features.map((f) => (isNoSignal(pos, f.id, ctx.season) ? null : finiteOrNull(shrunkOf(ctx, pos, f, p)))), pos, season)?.pct)
    .filter((x): x is number => typeof x === 'number')
    .sort((a, b) => a - b);
  byPos.set(pos, ctx);
  return ctx;
};
const finiteOrNull = (x: number) => (Number.isFinite(x) ? x : null);

/** The qualified players a position's career grades are ranked in (NFL career mode), or null. */
export const careerPool = (players: Player[], pos: Position): Player[] | null => careerCtx(players, pos)?.pool ?? null;

/** The qualifier label for a position's career pool ("500 career carries"). */
export const careerPoolLabel = (pos: Position) => CAREER_QUALIFY[pos]?.label;
/** The qualifier label for a season set's pool ("60 carries this season"), or undefined. */
export const seasonPoolLabel = (players: Player[], pos: Position) => (SEASON_QUALIFY[pos] ? `${seasonMin(players, pos)} ${SEASON_QUALIFY[pos].noun} this season` : undefined);

/**
 * THE overall (Build-a-Legend header, build panel, results; Player Deep Dive): value-weighted mean percentile
 * blended with the mean of the three best traits (OVERALL_TOP3_MIX) → OVR on the official 62–99 curve, letter
 * grade (same GRADE_SCALE) and tier from the grade. Null before any valued trait.
 */
export const overallFor = (features: CompFeature[], baseline: Map<string, number[]>, values: (number | null)[], position: Position, season = false): Overall | null => {
  const items: { w: number; pct: number }[] = [];
  features.forEach((f, i) => {
    const v = values[i];
    const w = valueWeight(position, f.id, season);
    if (v == null || w <= 0) return;
    const pct = skillPct(f, baseline.get(f.id) ?? [], v);
    if (Number.isFinite(pct)) items.push({ w, pct });
  });
  if (!items.length) return null;
  const W = items.reduce((a, x) => a + x.w, 0);
  const mean = items.reduce((a, x) => a + x.w * x.pct, 0) / W;
  const top = [...items].sort((a, b) => b.pct - a.pct).slice(0, 3);
  const topMean = top.reduce((a, x) => a + x.pct, 0) / top.length;
  const pct = (1 - OVERALL_TOP3_MIX) * mean + OVERALL_TOP3_MIX * topMean;
  const grade = gradeFor(pct) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
  return { pct, rating: ovrFromPercentile(pct), grade, tier: tierFor(grade) };
};

/**
 * NFL edition (owner: "feel free to add more factors to the grade"): the advanced-stat factors (nflAdvanced.ts: EPA,
 * CPOE, target share, separation, pressures, missed tackles...; style traits like time to throw and aDOT left out)
 * count as much as the classic traits combined: the overall percentile is the mean of the classic overall and the mean
 * of the advanced percentiles. A metric the player or the source lacks (before 2018, no NGS) is skipped, never a zero;
 * with none, the classic overall stands.
 */
export const ADVANCED_SHARE = 0.5;
export const foldAdvanced = (overall: Overall | null, advancedPcts: number[]): Overall | null => {
  const pcts = advancedPcts.filter(Number.isFinite);
  if (!overall || !pcts.length) return overall;
  const pct = (1 - ADVANCED_SHARE) * overall.pct + ADVANCED_SHARE * (pcts.reduce((a, b) => a + b, 0) / pcts.length);
  const grade = gradeFor(pct) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
  return { pct, rating: ovrFromPercentile(pct), grade, tier: tierFor(grade) };
};

/**
 * THE career skill rating, computed once and read by the Players table, search, cards and the Deep Dive's Career scope
 * (so the two can never disagree). Per position: each player's classic overall is folded with his advanced factors
 * (`foldAdvanced`) where he has any, then re-ranked in the qualified pool (the fold of two percentiles squeezes toward
 * the middle, so without it S would be rare).
 *
 * Fairness: grade on the stats that exist, never impute. A player with no advanced data (pre-2016 careers such as
 * Newsome's) is scored on his classic traits only, so he is re-ranked against the qualified players with the SAME data
 * coverage: folded scores against folded scores, classic-only against classic-only. Each group keeps its own
 * top 10% S. A group under 12 qualified players keeps its un-reranked percentile. A player outside the pool (small
 * sample) is slotted into his group's scale the same way.
 *
 * `advPctsOf(key)` gives his graded advanced percentiles for the career scope; `advReady(pos)` says whether that
 * position's advanced data has loaded (not yet: classic overalls stand, so nothing is mis-grouped while it loads).
 */
export const careerSkillOveralls = (players: Player[], advPctsOf: (key: string) => number[], advReady: (pos: Position) => boolean): Map<string, Overall> => {
  const out = new Map<string, Overall>();
  const byPos = new Map<Position, Player[]>();
  players.forEach((p) => {
    if (p.isRealLegend) return;
    const a = byPos.get(p.position);
    if (a) a.push(p);
    else byPos.set(p.position, [p]);
  });
  byPos.forEach((group, pos) => {
    const ctx = IS_NFL && advReady(pos) ? careerCtx(players, pos) : null;
    const poolSet = ctx ? new Set(ctx.pool) : null;
    const rows = group.flatMap((p) => {
      const base = playerOverallOnly(players, p);
      if (!base) return [];
      const key = `${p.position}:${p.name}`;
      const pcts = ctx ? advPctsOf(key).filter(Number.isFinite) : [];
      const folded = pcts.length ? foldAdvanced(base, pcts)! : base;
      return [{ key, folded, cover: pcts.length > 0, q: !!poolSet && poolSet.has(p) }];
    });
    const withAdv: number[] = [];
    const classic: number[] = [];
    if (ctx) rows.forEach((r) => r.q && (r.cover ? withAdv : classic).push(r.folded.pct));
    withAdv.sort((a, b) => a - b);
    classic.sort((a, b) => a - b);
    rows.forEach((r) => {
      const ref = ctx ? (r.cover ? withAdv : classic) : [];
      if (ref.length < 12) return void out.set(r.key, r.folded);
      const pct = percentileOf(ref, r.folded.pct);
      const grade = gradeFor(pct) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
      out.set(r.key, { pct, rating: ovrFromPercentile(pct), grade, tier: tierFor(grade) });
    });
  });
  return out;
};

export interface SkillGrade {
  trait: SkillTrait;
  /** Raw stat value (NaN when missing) and its display string */
  value: number;
  display: string;
  /** Direction-aware percentile within the position (higher = better), NaN when missing */
  percentile: number;
  grade: GradeStep | null;
  /** NFL career grades: the stat has no between-player signal, so there is no tile ("not enough signal") */
  noSignal?: boolean;
}

/**
 * Just his overall, for the bulk grade pass over every player (careerSkillOveralls): the same maths as playerSkillGrades
 * but without the per-trait rows and their display strings (7,000 players × ~12 traits of Intl formatting).
 */
const playerOverallOnly = (players: Player[], player: Player): Overall | null => {
  const cc = careerCtx(players, player.position);
  if (!cc) return playerSkillGrades(players, player).overall;
  const pos = player.position;
  const traits = cc.features;
  const raw = overallFor(traits, cc.baseline, traits.map((t) => (isNoSignal(pos, t.id, cc.season) ? null : finiteOrNull(shrunkOf(cc, pos, t, player)))), pos, cc.season);
  if (!raw) return null;
  const pct = percentileOf(cc.overallSorted, raw.pct);
  const grade = gradeFor(pct) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
  return { pct, rating: ovrFromPercentile(pct), grade, tier: tierFor(grade) };
};

/** Every trait of one player: value, percentile and letter grade, plus his overall on the same mapping. */
export const playerSkillGrades = (players: Player[], player: Player): { traits: SkillGrade[]; overall: Overall | null; smallSample?: boolean } => {
  const traits = skillTraits(player.position);
  const cc = careerCtx(players, player.position);
  if (cc) {
    const pos = player.position;
    const rows = traits.map((t): SkillGrade => {
      const value = t.get(player);
      if (isNoSignal(pos, t.id, cc.season)) return { trait: t, value, display: fmtFeature(t, value), percentile: NaN, grade: null, noSignal: true };
      const percentile = skillPct(t, cc.baseline.get(t.id) ?? [], shrunkOf(cc, pos, t, player));
      return { trait: t, value, display: fmtFeature(t, value), percentile, grade: gradeFor(percentile) };
    });
    const raw = overallFor(traits, cc.baseline, traits.map((t) => (isNoSignal(pos, t.id, cc.season) ? null : finiteOrNull(shrunkOf(cc, pos, t, player)))), pos, cc.season);
    let overall: Overall | null = null;
    if (raw) {
      const pct = percentileOf(cc.overallSorted, raw.pct);
      const grade = gradeFor(pct) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
      overall = { pct, rating: ovrFromPercentile(pct), grade, tier: tierFor(grade) };
    }
    return { traits: rows, overall, smallSample: cc.season ? !cc.pool.includes(player) : !isCareerQualified(player) };
  }
  const baseline = positionBaseline(players, player.position);
  const rows = traits.map((t) => {
    const value = t.get(player);
    const percentile = skillPct(t, baseline.get(t.id) ?? [], value);
    return { trait: t, value, display: fmtFeature(t, value), percentile, grade: gradeFor(percentile) };
  });
  const overall = overallFor(traits, baseline, rows.map((r) => (Number.isFinite(r.value) ? r.value : null)), player.position);
  return { traits: rows, overall };
};

// ---------- Leaderboards (Deep Dive skill tiles) ----------

export interface SkillLeader {
  player: Player;
  value: number;
  display: string;
  percentile: number;
  grade: GradeStep | null;
}

export interface SkillBoard {
  /** Qualifier pool label, e.g. "8+ games" or "min 50 touches" */
  poolLabel: string;
  lowerIsBetter: boolean;
  /** Every qualifier, best first (lower-is-better traits ascending; ties by name) */
  entries: SkillLeader[];
}

const byName = (a: SkillLeader, b: SkillLeader) => a.player.name.localeCompare(b.player.name);

/** One trait's leaderboard over the same pool and percentile as its grade, so place, value, pct and grade agree. */
export const skillBoard = (players: Player[], position: Position, traitId: string): SkillBoard | null => {
  const t = skillTraits(position).find((x) => x.id === traitId);
  const cc = careerCtx(players, position);
  if (cc && t) {
    if (isNoSignal(position, traitId, cc.season)) return null;
    const sorted = cc.baseline.get(traitId) ?? [];
    const entries = cc.pool
      .map((p) => {
        const value = t.get(p);
        const percentile = skillPct(t, sorted, shrunkOf(cc, position, t, p));
        return { player: p, value, display: fmtFeature(t, value), percentile, grade: gradeFor(percentile) };
      })
      .filter((e) => Number.isFinite(e.value))
      .sort((a, b) => b.percentile - a.percentile || byName(a, b));
    return { poolLabel: cc.label, lowerIsBetter: !!t.lowerIsBetter, entries };
  }
  const pool = traitPools(players, position).get(traitId);
  if (!t || !pool) return null;
  const sorted = positionBaseline(players, position).get(traitId) ?? [];
  const entries = pool.pool
    .map((p) => {
      const value = t.get(p);
      const percentile = skillPct(t, sorted, value);
      return { player: p, value, display: fmtFeature(t, value), percentile, grade: gradeFor(percentile) };
    })
    .filter((e) => Number.isFinite(e.value))
    .sort((a, b) => (t.lowerIsBetter ? a.value - b.value : b.value - a.value) || byName(a, b));
  return { poolLabel: pool.label, lowerIsBetter: !!t.lowerIsBetter, entries };
};

/** Overall skill rating leaderboard for a position: players with ≥ SIM_MIN_GAMES games (the grade baseline). */
export const overallBoard = (players: Player[], position: Position): SkillBoard => {
  const cc = careerCtx(players, position);
  const entries = (cc ? cc.pool : similarityBaseline(players, position))
    .map((p) => ({ p, o: playerSkillGrades(players, p).overall }))
    .filter((x): x is { p: Player; o: Overall } => !!x.o)
    .map(({ p, o }) => ({ player: p, value: o.rating, display: String(o.rating), percentile: o.pct, grade: o.grade }))
    .sort((a, b) => b.value - a.value || b.percentile - a.percentile || byName(a, b));
  return { poolLabel: cc ? cc.label : `${SIM_MIN_GAMES}+ games`, lowerIsBetter: false, entries };
};
