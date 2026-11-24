import { IS_NFL, seasonLabel } from '@/config/edition';
import { careerRatingOf } from '@/config/ovr';
import InTheNews from '@/components/espn/InTheNews';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CalendarClock, ClipboardList, ChartScatter, Gauge, LineChart, Medal, Milestone, Newspaper, Users } from 'lucide-react';
import type { LeagueData, Player, Position } from '@/types/player';
import {
  POSITIONS,
  SIM_MIN_GAMES,
  buildContext,
  evaluatePosition,
  hasSimilarityData,
  leaguePlayers,
  similarPlayers,
  type AdvContext,
  type SimilarityMode,
} from '@/config/advanced';
import { careerPoolLabel, playerSkillGrades } from '@/config/skillGrades';
import DdSkillsSwitch from './DdSkillsSwitch';
import { useGamePool } from '@/utils/useOfficialOvr';
import { cn } from '@/lib/utils';
import Chips from '../analytics/Chips';
import { usePrefersReducedMotion } from '../analytics/viz';
import { buildRecordBook, keyOf } from '../records';
import CompMap from './CompMap';
import NeighbourhoodChart from './NeighbourhoodChart';
import { familiesFor, familyOfPlayer } from '@/config/families';
import { buildShapeMap } from '../visual/shapeMap';
import DdAdvanced from './DdAdvanced';
import DdAdvancedFactors from './DdAdvancedFactors';
import DdCareer, { type PosStat } from './DdCareer';
import DdEmpty from './DdEmpty';
import DdClock from '../../clock/DdClock';
import DdHero from './DdHero';
import DdRecords from './DdRecords';
import DdGameLog from '../gamelog/DdGameLog';
import DdSkills from './DdSkills';
import DdWhoPlays from './DdWhoPlays';
import DdRealComps, { realCompSets, uniqueRealComps } from './DdRealComps';
import { DdSection } from './ddParts';
import { classicNoteOf, usePlayerExtras } from '@/utils/playerExtras';
import { afterPaint } from '@/hooks/useDeferredStage';
import DeferredSection from '@/components/ui/DeferredSection';
import { MIN_RADAR_AXES, buildPositionModel, buildSimilarityMap, type PositionModel, type SimilarityMap } from './compModel';
import { onCompFinderRequest, openInHeadToHead, takeCompFinderRequest, takeDeepDiveSection } from './compFinderLink';
import DdGraphsLazy from './graphs/DdGraphsLazy';
import { canGoBackInApp } from '../hub/hashRoute';
import { usePageSwipeBack } from '@/hooks/usePageSwipeBack';
import { mergeRefs } from '@/hooks/useSwipeToDismiss';
import './deepDive.css';

type Select = (p: Player) => void;

export interface PlayerDeepDiveProps {
  /** League data (the Stats tab's careerData). Real legends are never included. */
  data?: LeagueData | null;
  /** Or the league players directly (used when `data` is not given). */
  players?: Player[];
  /** Open the full player card (dialog). */
  onSelect: Select;
  /** Player key "POS:Name" to show first (e.g. from the #stats/deepdive?p= hash). A pending openInCompFinder request wins. */
  initialPlayerKey?: string;
  /** Called with the key whenever the user picks a different player (keep the hash in sync). */
  onPlayerChange?: (key: string) => void;
  /** Head-to-Head hand-off; defaults to openInHeadToHead (event 'retrovault:open-head-to-head'). */
  onCompare?: (a: Player, b: Player) => void;
}

const ALL_SECTIONS = [
  { id: 'dd-ratings', label: 'Skill ratings', short: 'Ratings', icon: Gauge },
  { id: 'dd-who', label: 'Who plays like him', short: 'Comps', icon: Users },
  { id: 'dd-map', label: 'Neighbourhood', short: 'Map', icon: ChartScatter },
  { id: 'dd-advanced', label: 'Advanced profile', short: 'Advanced', icon: Activity },
  { id: 'dd-graphs', label: 'Career graphs', short: 'Graphs', icon: LineChart },
  ...(IS_NFL ? [{ id: 'dd-gamelog', label: 'Game log', short: 'Games', icon: ClipboardList }] : []),
  { id: 'dd-career', label: 'Career & legacy', short: 'Career', icon: Milestone },
  { id: 'dd-clock', label: 'Age & clock', short: 'Age', icon: CalendarClock },
  { id: 'dd-records', label: 'Records & awards', short: 'Records', icon: Medal },
] as const;
/** No live save in the NFL edition, so no Age & clock */
const SECTIONS: readonly { id: string; label: string; short: string; icon: typeof Gauge }[] = IS_NFL
  ? [...ALL_SECTIONS.filter((s) => s.id !== 'dd-clock'), { id: 'dd-news', label: 'In the news', short: 'News', icon: Newspaper }]
  : ALL_SECTIONS;

const useMedia = (query: string) => {
  const [on, setOn] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const fn = () => setOn(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return on;
};

// Per-league caches (weakly keyed, so a new league drops them): all-pairs maps per model + mode, metric boards per context + position.
const N_NEAR = 30;
const MAP_CACHE = new WeakMap<PositionModel, Map<SimilarityMode, SimilarityMap>>();
const cachedMap = (model: PositionModel, mode: SimilarityMode) => {
  let byMode = MAP_CACHE.get(model);
  if (!byMode) MAP_CACHE.set(model, (byMode = new Map()));
  let m = byMode.get(mode);
  if (!m) byMode.set(mode, (m = buildSimilarityMap(model, mode)));
  return m;
};
const SHAPE_CACHE = new WeakMap<object, ReturnType<typeof buildShapeMap>>();
const shapeCached = (fams: NonNullable<ReturnType<typeof familiesFor>>) => {
  if (!SHAPE_CACHE.has(fams)) SHAPE_CACHE.set(fams, buildShapeMap(fams));
  return SHAPE_CACHE.get(fams) ?? null;
};
const BOARD_CACHE = new WeakMap<AdvContext, Map<Position, ReturnType<typeof evaluatePosition>>>();
const cachedBoards = (players: Player[], position: Position, ctx: AdvContext) => {
  let byPos = BOARD_CACHE.get(ctx);
  if (!byPos) BOARD_CACHE.set(ctx, (byPos = new Map()));
  let b = byPos.get(position);
  if (!b) byPos.set(position, (b = evaluatePosition(players, position, ctx)));
  return b;
};

/** Mid-rank percentile of `v` in `vals` (0–100). */
const pctIn = (vals: number[], v: number) => {
  if (!vals.length || !Number.isFinite(v)) return null;
  let below = 0;
  let eq = 0;
  vals.forEach((x) => {
    if (x < v) below++;
    else if (x === v) eq++;
  });
  return (100 * (below + eq / 2)) / vals.length;
};

/** Records & awards: the league record book is built when this section mounts, not with the page. */
const RecordsLazy = ({ getBook, ...rest }: { getBook: () => ReturnType<typeof buildRecordBook> } & Omit<React.ComponentProps<typeof DdRecords>, 'book'>) => (
  <DdRecords {...rest} book={getBook()} />
);

/**
 * The Neighbourhood map. Its all-pairs similarity map (and the families map, only when asked for) is the heaviest
 * computation on the page (O(n^2) pairs and an eigen-solve over every qualifier at his position), so it is built when
 * this section mounts (DeferredSection: near the viewport) and cached per model and mode.
 */
const MapSection = ({
  player,
  players,
  model,
  fams,
  mapMode,
  setMapMode,
  famView,
  setFamView,
  insufficient,
  ovrMap,
  careerOvrMap,
  seasonOvrMap,
  mapComps,
  overlay,
  wide,
  onPick,
}: {
  player: Player;
  players: Player[];
  model: PositionModel;
  fams: ReturnType<typeof familiesFor>;
  mapMode: SimilarityMode;
  setMapMode: (m: SimilarityMode) => void;
  famView: boolean;
  setFamView: (v: boolean) => void;
  insufficient: boolean;
  ovrMap: Map<string, number>;
  careerOvrMap: Map<string, number>;
  seasonOvrMap?: Record<string, number> | null;
  mapComps: ReturnType<typeof similarPlayers>;
  overlay: { player: Player } | undefined;
  wide: boolean;
  onPick: (p: Player) => void;
}) => {
  void players;
  // the default chart needs no all-pairs map (that O(n^2) MDS is gone from this view)
  const canMap = !!model && model.axes >= MIN_RADAR_AXES && model.pool.length >= 3;
  // the families map is the costly one: built only once the Families view is chosen
  const famOption = !!fams?.shaped && fams.vectors.length >= 3;
  const shapeMap = useMemo(() => (fams && famView ? shapeCached(fams) : null), [fams, famView]);
  return (
    <>
            {canMap && !insufficient ? (
              <div className="glass-card space-y-2 p-3 sm:p-4">
                <Chips
                  label="Map distance"
                  value={famView && shapeMap ? 'family' : mapMode}
                  onChange={(v) => {
                    if (v === 'family') setFamView(true);
                    else {
                      setFamView(false);
                      setMapMode(v);
                    }
                  }}
                  options={[
                    { value: 'style', label: 'Plays like' },
                    { value: 'level', label: 'Closest overall' },
                    ...(famOption ? [{ value: 'family' as const, label: 'Families' }] : []),
                  ]}
                />
                {famView && shapeMap ? (
                  <CompMap
                    map={shapeMap}
                    zones
                    nnLabel="Closest shape"
                    ovrMap={ovrMap}
                    selectedKey={keyOf(player)}
                    topComps={mapComps}
                    overlayKey={overlay && !overlay.player.isRealLegend ? keyOf(overlay.player) : ''}
                    onPick={onPick}
                    wide={wide}
                    focusZoom={wide ? 1.8 : 1.6}
                  />
                ) : (
                  <NeighbourhoodChart player={player} model={model} mode={mapMode} ovrMap={ovrMap} careerOvrMap={careerOvrMap} seasonOvr={seasonOvrMap} wide={wide} onPick={onPick} />
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold hover:text-foreground">How this map works</summary>
                  <p className="mt-1.5">
                    His {N_NEAR} nearest careers (by the same {mapMode === 'style' ? 'style (shape correlation)' : 'level + style'} score the comps use, over {model.features.map((f) => f.label).join(', ')}) are the squares,
                    in club colours with a gold rim for Hall of Famers; the faint blue pixels are where the rest of the position sits (darker = more players), dashed lines are the position medians.
                    Pick the axes with the presets or the X and Y menus; the filters (era, active or retired, starters) apply to the whole chart and to who counts as a neighbour. Tap a square for his card.
                  </p>
                  <p className="mt-1.5">
                    Families: places every {player.position} by play-style shape instead (his style percentiles with his overall level taken out, so how he plays, not how good
                    he is) and shades a zone for each {player.position} family: k-means clusters of those shapes, named by rule from a fixed label table. Tap or hover a zone or legend entry to
                    highlight it; tap one to list its members. Same families as the League Landscape family map.
                  </p>
                </details>
              </div>
            ) : (
              <p className="glass-card p-4 text-sm text-muted-foreground">
                {insufficient
                  ? `Not enough of ${player.name}'s rates are on record to place him on the map.`
                  : `${player.position}s have ${model.features.length === 1 ? `a single style rate (${model.features[0].label})` : 'too few style rates'}, so there is no 2-D map for this position.`}
              </p>
            )}
    </>
  );
};

/**
 * Player Deep Dive: a one-player scouting report. Hero banner and navigation, skill grades (config/skillGrades),
 * the style hexagon, every advanced metric, his neighbourhood on the per-position similarity map, comps, the career
 * arc and legacy, and records / awards / collection. Heavy work (position models, all-pairs maps, metric boards,
 * record book) is memoised per league / position, never per render.
 */
const PlayerDeepDive = ({ data, players: playersProp, onSelect, initialPlayerKey, onPlayerChange, onCompare }: PlayerDeepDiveProps) => {
  const players = useMemo(() => (data ? leaguePlayers(data) : (playersProp ?? []).filter((p) => !p.isRealLegend)), [data, playersProp]);
  const { ovrMap, careerOvrMap, legends, seasonOvr, ovrBasis } = useGamePool();
  const wide = useMedia('(min-width: 768px)');
  const reduced = usePrefersReducedMotion();
  const sorted = useMemo(() => [...players].sort((a, b) => b.careerLegacy - a.careerLegacy), [players]);
  const byKey = useMemo(() => new Map(players.map((p) => [keyOf(p), p])), [players]);

  // ---------- Selection ----------
  const [selKey, setSelKey] = useState(() => {
    const pending = takeCompFinderRequest();
    return pending ?? initialPlayerKey ?? '';
  });
  // No default player: without a key (link, request or pick) the page shows the search-first empty state.
  const player = byKey.get(selKey);
  const topRef = useRef<HTMLDivElement | null>(null);

  const choose = useCallback(
    (key: string, opts: { scroll?: boolean } = {}) => {
      if (!byKey.has(key)) return;
      setSelKey(key);
      onPlayerChange?.(key);
      if (opts.scroll !== false) {
        window.requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }));
      }
    },
    [byKey, onPlayerChange, reduced],
  );

  useEffect(() => {
    if (initialPlayerKey && byKey.has(initialPlayerKey)) setSelKey(initialPlayerKey);
  }, [initialPlayerKey, byKey]);

  // Open requests from elsewhere (player card, hub search, Map page) while mounted.
  useEffect(
    () =>
      onCompFinderRequest(() => {
        const key = takeCompFinderRequest();
        if (!key) return;
        // Opened from elsewhere (a player card, search): the new player's page starts at its top at once, no travel
        choose(key, { scroll: false });
        const top = topRef.current;
        if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
      }),
    [choose],
  );

  // A request to open at a section (the player card's "Career graphs"): scroll there once the player's page is up
  const [sectionReq, setSectionReq] = useState<string | null>(() => takeDeepDiveSection());
  useEffect(() => onCompFinderRequest(() => setSectionReq(takeDeepDiveSection())), []);
  useEffect(() => {
    if (!sectionReq || !byKey.has(selKey)) return;
    const t = window.setTimeout(() => {
      document.getElementById(sectionReq)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
      setSectionReq(null);
    }, 120);
    return () => window.clearTimeout(t);
  }, [sectionReq, selKey, byKey]);

  // ---------- Memoised league / position computations ----------
  // One position model, built when a player at that position is shown (the other seven are never needed for him)
  const modelCache = useMemo(() => new Map<Position, ReturnType<typeof buildPositionModel>>(), [players]);
  const modelOf = (pos: Position) => {
    let m = modelCache.get(pos);
    if (!m) modelCache.set(pos, (m = buildPositionModel(players, pos)));
    return m;
  };
  // The hero paints first; the comps, metric boards and the sections that read them follow one frame later (they are
  // ~500 ms of work at 7,000+ players and nothing above the fold needs them)
  const [lowerReady, setLowerReady] = useState(false);
  useEffect(() => afterPaint(() => setLowerReady(true)), []);
  const ctx = useMemo(() => (lowerReady ? buildContext(players) : null), [players, lowerReady]);
  // Every qualifier per board: the Record book chips rank from these lists and their pop-ups show the same order.
  // Built when the Records section mounts (it is far down the page and the build sorts the league for every board)
  const getBook = useMemo(() => {
    let b: ReturnType<typeof buildRecordBook> | null = null;
    return () => (b ??= buildRecordBook(data ?? null, Infinity));
  }, [data]);
  const posValues = useMemo(() => {
    const m = new Map<Position, { dom: number[]; tt: number[]; tpg: number[] }>();
    POSITIONS.forEach((pos) => {
      const at = players.filter((p) => p.position === pos && p.games > 0);
      m.set(pos, { dom: at.map((p) => p.dominance), tt: at.map((p) => p.trueTalent), tpg: at.map((p) => p.tpg) });
    });
    return m;
  }, [players]);

  // Similarity mode shared by the comp list and the neighbourhood map.
  const [mapMode, setMapMode] = useState<SimilarityMode>('style');
  // The Neighbourhood can also show the families map (play-style shape, level removed) with its zones.
  const [famView, setFamView] = useState(false);

  const extras = usePlayerExtras();
  const classic = IS_NFL && player ? classicNoteOf(extras, player) : undefined;
  const position = player?.position ?? 'QB';
  const model = useMemo(() => modelOf(position), [modelCache, position]); // eslint-disable-line react-hooks/exhaustive-deps
  const boards = useMemo(() => (ctx ? cachedBoards(players, position, ctx) : null), [players, position, ctx]);
  // Families (k-means over every qualifier at his position, ~300 ms at 10,000 players) are built after the page's first
  // paint: the hero's family chip and the Families map option appear a moment later, nothing waits for them
  const [famsRaw, setFams] = useState<ReturnType<typeof familiesFor>>(null);
  useEffect(() => afterPaint(() => setFams(familiesFor(players, position))), [players, position]);
  const fams = famsRaw && famsRaw.position === position ? famsRaw : null;
  // The Families option and the hero's family link exist when the position has shaped families; the map itself is built
  // when the Neighbourhood section mounts (MapSection), the families map only once it is asked for
  const famAvail = !!fams?.shaped && fams.vectors.length >= 3;

  const grades = useMemo(() => (player ? playerSkillGrades(players, player) : null), [players, player]);
  // Comps: top 10 in each mode (cards show 3 per mode, the numbered list 10 in the chosen mode, the map 5).
  const compSets = useMemo(
    () => (player && lowerReady ? (['style', 'level'] as const).map((mode) => ({ mode, comps: similarPlayers(players, player, 10, mode).filter((c) => c.similarity > 0) })) : []),
    [players, player, lowerReady],
  );
  const topSets = useMemo(() => compSets.map((s) => ({ mode: s.mode, comps: s.comps.slice(0, 3) })), [compSets]);
  // Style needs 4+ shared rates; positions with fewer (OL) fall back to closest overall.
  const listMode: SimilarityMode = model && model.features.length < 4 ? 'level' : mapMode;
  const listComps = compSets.find((s) => s.mode === listMode)?.comps ?? [];
  // Real NFL comps: the Real-life comps lists, and the same players (once each) as a second group on the hexagon list.
  const realSets = useMemo(() => (player && lowerReady ? realCompSets(players, legends, player) : []), [players, legends, player, lowerReady]);
  const realComps = useMemo(() => uniqueRealComps(realSets), [realSets]);
  // Overlay key: "POS:Name" for a league comp, "nfl:POS:Name" for a real one (names can repeat across the two pools).
  const [overlayKey, setOverlayKey] = useState('');
  const realOverlay = overlayKey.startsWith('nfl:') ? realComps.find((c) => `nfl:${keyOf(c.player)}` === overlayKey) : undefined;
  const overlay = listComps.find((c) => keyOf(c.player) === overlayKey) ?? (realOverlay && { ...realOverlay, similarity: realOverlay[listMode] }) ?? listComps[0];
  const mapComps = listComps.slice(0, 5);

  // Prev / next at the position, by official OVR (then legacy).
  const ladder = useMemo(
    () =>
      players
        .filter((p) => p.position === position)
        .sort((a, b) => (ovrMap.get(keyOf(b)) ?? 0) - (ovrMap.get(keyOf(a)) ?? 0) || b.careerLegacy - a.careerLegacy || a.name.localeCompare(b.name)),
    [players, position, ovrMap],
  );

  // ---------- Section index (scroll-spy) ----------
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: '-25% 0px -65% 0px' },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [player]);
  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };

  const random = () => {
    const pool = sorted.filter((p) => p !== player && p.games >= SIM_MIN_GAMES);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) choose(keyOf(pick));
  };

  // Phones: swipe right goes back (to the page that opened the Deep Dive, or the Players page on a cold deep link)
  const { ref: swipeRef, hint: swipeHint } = usePageSwipeBack<HTMLDivElement>({ tab: 'career', sub: 'players' }, canGoBackInApp() ? 'Back' : 'Players');
  const rootRef = useMemo(() => mergeRefs<HTMLDivElement>(topRef, swipeRef), [swipeRef]);

  if (!sorted.length) {
    return <p className="glass-card p-6 text-center text-muted-foreground">No league players to scout yet.</p>;
  }
  if (!player || !model) {
    return (
      <>
        {swipeHint}
        <div ref={rootRef} id="deep-dive" className="scroll-mt-28 py-4 sm:py-8">
          <DdEmpty options={sorted} onChoose={(k) => choose(k, { scroll: false })} onRandom={random} />
        </div>
      </>
    );
  }

  const idx = ladder.findIndex((p) => p === player);
  const prev = idx > 0 ? ladder[idx - 1] : null;
  const next = idx >= 0 && idx < ladder.length - 1 ? ladder[idx + 1] : null;
  const ovr = ovrMap.get(keyOf(player));
  const car = careerOvrMap.get(keyOf(player));
  const seasonShown = ovrBasis.get(keyOf(player)) === 'season' && seasonOvr && ovr != null;
  const cr = IS_NFL ? careerRatingOf(keyOf(player)) : undefined;
  const carTitle =
    car == null
      ? undefined
      : cr
        ? `CAR ${car}: career rating. 50% efficiency (every rate against that season's league average, shrunk by sample size) plus 50% production and honours (MVP 30, OPOY/DPOY 18, SB MVP 12, ring 10, ROY 2), ranked among qualified ${player.position}s.${cr[5] === 1 ? ' Efficiency from career totals (no weekly data).' : ''} Efficiency ${cr[1] == null ? 'n/a' : cr[1].toFixed(0)}, production ${cr[2].toFixed(0)}, honours ${cr[3].toFixed(0)}.`
        : `CAR ${car}: career OVR, his whole career ranked within ${player.position}s (every player, active and retired).`;
  // Two ratings (owner, 2026-11-23): SZN = this season alone, CAR = the whole career. A retired player shows CAR only.
  const ovrTitle = IS_NFL
    ? seasonShown
      ? `How OVR works. SZN ${ovr}: his ${seasonLabel(seasonOvr.season)} season so far ranked within ${player.position}s: per-game production and efficiency (EPA where it applies), scaled by how much he plays (snap share), with small samples pulled toward the position's floor so a few good games do not make a 99. CAR ${car ?? '–'}: his whole career ranked within the position. Price and card tier read 0.8 CAR + 0.2 SZN.`
      : `How OVR works. ${carTitle ?? ''} No ${seasonLabel(seasonOvr?.season ?? 2026)} games, so there is no SZN${player.status === 'Active' ? '' : ' (retired players are rated on their career alone)'}.`
    : seasonShown
    ? `SZN ${ovr}: season OVR for Y${seasonOvr.season}${seasonOvr.live ? ' so far' : ''}, his season line ranked within ${player.position}s who played it (small samples shrunk toward the position mean).`
    : car == null
      ? undefined
      : player.status === 'Active'
        ? `${carTitle} No games in Y${seasonOvr?.season ?? ''}, so there is no season OVR.`
        : `${carTitle} Retired players have no season OVR; their past seasons appear in the career graphs.`;
  const ovrLabel = seasonShown ? 'SZN' : 'CAR';
  const ovrAlt = seasonShown && car != null ? { label: 'CAR', value: car, title: carTitle } : null;
  const insufficient = !hasSimilarityData(player);
  const compare = onCompare ?? openInHeadToHead;
  const vals = posValues.get(position)!;
  const posStats: PosStat[] = [
    { key: 'tt', label: 'True Talent', title: 'Position-normalized production score', value: player.trueTalent, decimals: 0, pct: pctIn(vals.tt, player.trueTalent) },
    { key: 'dom', label: 'Dominance', title: '0.7 × True Talent + award points', value: player.dominance, decimals: 0, pct: pctIn(vals.dom, player.dominance) },
    { key: 'tpg', label: 'TPG', title: 'True Talent per game', value: player.tpg, decimals: 2, pct: pctIn(vals.tpg, player.tpg) },
  ];

  const nav = (
    <nav aria-label="Deep Dive sections">
      <ul className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col lg:overflow-visible">
        {SECTIONS.map((s) => {
          const on = s.id === active;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  jump(s.id);
                }}
                aria-current={on ? 'location' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 font-display text-sm font-bold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  on ? 'bg-gold text-night' : 'text-muted-foreground hover:bg-panel-2 hover:text-foreground',
                )}
              >
                <s.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="lg:hidden">{s.short}</span>
                <span className="hidden lg:inline">{s.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <>
    {swipeHint}
    <div ref={rootRef} className="scroll-mt-28 space-y-5" id="deep-dive">
      <DdHero
        key={`hero-${keyOf(player)}`}
        player={player}
        options={sorted}
        ovr={ovr}
        ovrTitle={ovrTitle}
        ovrLabel={ovrLabel}
        ovrAlt={ovrAlt}
        wide={wide}
        onChoose={(k) => choose(k, { scroll: false })}
        onRandom={random}
        prev={prev}
        next={next}
        onOpenCard={() => onSelect(player)}
        family={fams?.shaped ? familyOfPlayer(fams, player) : null}
        onFamily={
          famAvail
            ? () => {
                setFamView(true);
                document.getElementById('dd-map')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
              }
            : undefined
        }
      />

      {/* Mobile: sticky section chips */}
      <div className="dd-chips chrome-follow sticky z-20 -mx-4 border-y border-line/60 bg-background px-4 py-1.5 lg:hidden">{nav}</div>

      {classic && (
        <p className="mb-4 rounded-md border border-gold/30 bg-gold/5 px-3 py-2 text-xs leading-snug text-gold/90" data-testid="dd-classic-note">
          Season-by-season data starts in 1999; career totals from Wikipedia
          {classic.d ? ` (${classic.d}${classic.l && classic.l !== classic.d ? `–${classic.l}` : ''})` : ''}.
          {classic.c ? ' No weekly data exists for this career, so there are no season graphs or game log.' : ' Graphs and the game log run from 1999.'}
          {classic.m?.length ? ' Graded on the stats that exist: ' + classic.m.join(', ') + ' were not recorded in his era (never counted as zero).' : ''}
          {classic.e ? ' Games are estimated from his seasons.' : ''}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="dd-sticky chrome-follow sticky space-y-3">
            <p className="font-pixel text-[9px] uppercase text-gold">Scouting report</p>
            {nav}
          </div>
        </aside>

        <div key={keyOf(player)} className="min-w-0 space-y-8">
          {!lowerReady && <div style={{ minHeight: 900 }} aria-hidden="true" />}
          {lowerReady && <>
          <DdSection id="dd-ratings" index={0} title="Skill ratings" icon={Gauge} kicker={IS_NFL && careerPoolLabel(player.position) ? `Career letter grades by percentile among qualified ${player.position}s (${careerPoolLabel(player.position)}), on rates shrunk by sample size; S = top 10%. A stat with no between-player signal gets no tile.` : `Letter grades by percentile among ${player.position}s with ${SIM_MIN_GAMES}+ games (S = top 8%). Same grades as Build-a-Legend.`}>
            <DdSkillsSwitch player={player} car={car} players={players} seasonOvr={seasonOvr} onOpenPlayer={(p) => choose(keyOf(p))} />
          </DdSection>

          <DdSection id="dd-who" index={1} title="Who plays like him" icon={Users} kicker="His closest comps by play style and overall, his style hexagon with any comp overlaid, and the full ranked list.">
            <DdWhoPlays
              player={player}
              model={model}
              mode={listMode}
              onMode={setMapMode}
              comps={listComps}
              topSets={topSets}
              overlay={overlay}
              onOverlay={setOverlayKey}
              realComps={realComps}
              ovrMap={ovrMap}
              insufficient={insufficient}
              onDive={(p) => choose(keyOf(p))}
              onCompare={compare}
            />
            <DdRealComps sets={realSets} ovrMap={ovrMap} onSelect={onSelect} />
          </DdSection>

          <DdSection
            id="dd-map"
            index={2}
            title="Neighbourhood"
            icon={ChartScatter}
            kicker="His closest comparable careers over the rest of his position. Closer = plays more alike."
          >
            <DeferredSection ids={[]} minHeight={560}>
              <MapSection
                player={player}
                players={players}
                model={model}
                fams={fams}
                mapMode={mapMode}
                setMapMode={setMapMode}
                famView={famView}
                setFamView={setFamView}
                insufficient={insufficient}
                ovrMap={ovrMap}
                careerOvrMap={careerOvrMap}
                seasonOvrMap={seasonOvr?.ovr}
                mapComps={mapComps}
                overlay={overlay}
                wide={wide}
                onPick={(p) => choose(keyOf(p))}
              />
            </DeferredSection>
          </DdSection>

          <DdSection id="dd-advanced" index={3} title="Advanced profile" icon={Activity} kicker="Every advanced metric for his position: percentile, + index (100 = average qualifier) and rank among qualifiers.">
            <DdAdvanced player={player} boards={boards} />
            {IS_NFL && <DdAdvancedFactors player={player} players={players} picker onOpenPlayer={(p) => choose(keyOf(p))} />}
          </DdSection>

          <DdSection
            id="dd-graphs"
            index={4}
            title="Career graphs"
            icon={LineChart}
            kicker="Season by season: drag through his career on the timeline, every season's box score, rates and percentiles, the trophy shelf, the race to the record and how he stacks up."
          >
            <DdGraphsLazy player={player} players={players} wide={wide} />
          </DdSection>

          {IS_NFL && (
            <DdSection id="dd-gamelog" index={4.5} title="Game log" icon={ClipboardList} kicker="Every game on file: the line, the result, splits, best games, streaks and how steady he is.">
              <DdGameLog player={player} />
            </DdSection>
          )}

          <DdSection id="dd-career" index={5} title="Career & legacy" icon={Milestone}>
            <DdCareer player={player} posStats={posStats} />
          </DdSection>

          {/* Age & clock from the live save (src/components/clock/DdClock.tsx) */}
          {!IS_NFL && <DdSection id="dd-clock" index={6} title="Age & clock" icon={CalendarClock} kicker="His age, retirement clock, growth chance and ratings against his ceilings, from the live save. The game's own rules.">
            <DdClock player={player} players={players} />
          </DdSection>}

          <DdSection id="dd-records" index={7} title="Records & awards" icon={Medal}>
            <DeferredSection ids={[]} minHeight={320}>
              <RecordsLazy player={player} getBook={getBook} ovr={ovr} onOpenPlayer={(p) => choose(keyOf(p))} />
            </DeferredSection>
          </DdSection>

          {IS_NFL && (
            <DdSection id="dd-news" index={8} title="In the news" icon={Newspaper} kicker="The real ESPN articles and clips that tag him, from the latest NFL news and his club's feed.">
              <InTheNews player={player} />
            </DdSection>
          )}
          </>}
        </div>
      </div>
    </div>
    </>
  );
};

export default PlayerDeepDive;
