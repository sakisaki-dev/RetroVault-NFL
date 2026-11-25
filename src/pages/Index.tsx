import { useAutoReveal } from '@/components/motion/Reveal';
import '@/styles/interact.css';
import '@/components/phoneTargets.css';
import { Suspense, useEffect, useMemo } from 'react';
import { lazyRetry } from '@/utils/lazyRetry';
import TabBoundary from '@/components/TabBoundary';
import { toast } from 'sonner';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import PullToSearch from '@/components/PullToSearch';
import AddToHomeScreen from '@/components/homescreen/AddToHomeScreen';
import TabFallback from '@/components/TabFallback';
import LazyHost, { whenSettled } from '@/components/LazyHost';
import { OPEN_PLAYER_CARD_EVENT } from '@/utils/playerCardLink';
import { QUICK_SEARCH_EVENT } from '@/utils/quickSearchEvent';
import CeremonyHost from '@/components/ceremony/CeremonyHost';
import TributeHost from '@/components/tribute/TributeHost';
import RivalryHost from '@/components/rivalry/RivalryHost';
import ClubSeasonHost from '@/components/clubseason/ClubSeasonHost';
import ScreensaverHost from '@/components/screensaver/ScreensaverHost';
import { LeagueProvider } from '@/context/LeagueContext';
import { onCompFinderRequest, onHeadToHeadRequest } from '@/components/stats/comps/compFinderLink';
import { HubRouteContext, useHashRoute } from '@/components/stats/hub/hashRoute';
import { Helmet } from 'react-helmet-async';
import { IS_NFL } from '@/config/edition';
import { getNFLTeamById } from '@/utils/nflTeams';
import { openTeamPage } from '@/utils/teamSearch';
import { onRaftersRequest, scrollToTeamRafters, takeRaftersRequest } from '@/utils/raftersLink';
import { decodeProgress, importProgress } from '@/utils/deviceSync';

// Every tab is its own chunk, loaded the first time it is opened (the Collection one carries the card art and
// pack opening; the Art lab and Card designs split off again inside it).
// Hosts nothing needs at first paint: separate chunks, loaded when the browser is idle (components/LazyHost.tsx)
const loadQuickSearch = () => import('@/components/QuickPlayerSearch');
const PEEK_WAKE = [OPEN_PLAYER_CARD_EVENT];
const loadPeekLayer = () => import('@/components/peek/PlayerPeek');
const loadUnlockToasts = () => import('@/components/collection/CardUnlockToasts');
const loadLegendExchange = () => import('@/components/collection/LegendExchange');
const QUICK_SEARCH_WAKE = [QUICK_SEARCH_EVENT];
const quickSearchKey = (e: KeyboardEvent) => ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' ? QUICK_SEARCH_EVENT : null);

const CareerTab = lazyRetry(() => import('@/components/tabs/CareerTab'));
const HallOfFameTab = lazyRetry(() => import('@/components/tabs/HallOfFameTab'));
const GamesTab = lazyRetry(() => import('@/components/tabs/GamesTab'));
const TimelineTab = lazyRetry(() => import('@/components/tabs/TimelineTab'));
const NewsTab = lazyRetry(() => import('@/components/espn/NewsTab'));
const SeasonTab = lazyRetry(() => import('@/components/tabs/SeasonTab'));
const FrontOfficeTab = lazyRetry(() => import('@/components/tabs/FrontOfficeTab'));
const CollectionTab = lazyRetry(() => import('@/components/tabs/CollectionTab'));
const BannerLab = import.meta.env.DEV ? lazyRetry(() => import('@/components/teams/banner/BannerLab')) : null;
const ArcadeKitDemo = import.meta.env.DEV ? lazyRetry(() => import('@/components/arcade/ArcadeKitDemo')) : null;
const FantasyHub = lazyRetry(() => import('@/components/fantasy/hub/FantasyHub'));
const TeamLabTab = lazyRetry(() => import('@/components/teamlab/TeamLabTab'));
const CollegeTab = lazyRetry(() => import('@/components/college/CollegeTab'));

/** Pages whose sections rise in as they scroll into view (the Players page does it itself; the Arcade, Collection and Team Lab are tools, never animated this way). */
const SCROLL_IN_TABS = new Set(['season', 'timeline', 'news', 'college', 'office', 'hof']);

const IndexContent = () => {
  const scrollIn = useAutoReveal<HTMLDivElement>();
  // The visible page lives in the URL hash (#stats/teams, #stats/deepdive?p=…) so it is linkable and Back works.
  const { route, target, navigate } = useHashRoute(IS_NFL ? 'season' : 'games');
  const activeTab = route.tab;
  const hub = useMemo(() => ({ route, target, navigate }), [route, target, navigate]);
  // "Deep Dive" requests (player card, Map, Stats search) open Stats › Deep Dive on that player; the view consumes the
  // pending request itself. Head-to-Head hand-offs open Stats › Head-to-Head.
  // A shared transfer link (#sync=<code>) imports progress from another device, after confirmation
  useEffect(() => {
    const check = () => {
      if (!window.location.hash.startsWith('#sync=')) return;
      const code = window.location.hash;
      navigate({ tab: 'office' }, { replace: true });
      decodeProgress(code)
        .then((data) => {
          const n = Object.keys(data).length;
          if (
            window.confirm(
              `Import ${n} saved item${n === 1 ? '' : 's'} (collection, scores, saved teams) from your other device? This replaces this device's progress.`,
            )
          ) {
            importProgress(data);
            window.location.reload();
          }
        })
        .catch(() => window.alert('That transfer link could not be read.'));
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
    // Subscribes once; navigate is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time pack gifts (collection.ts AUTO_GIFTS): granted once per device on the first load of a build that has them
  useEffect(() => {
    // the collection module (cards, packs, autographs) is not in the entry bundle: asked for once the page is up
    let dead = false;
    const cancel = whenSettled(() => import('@/utils/collection').then(({ GIFTS, giftSummary, redeemAutoGifts }) => {
      if (dead) return;
      redeemAutoGifts().forEach((id) =>
        toast.success(`New packs added: ${giftSummary(id)}`, {
          description: `${GIFTS[id].label} for the new card art, uniforms and poses.`,
          duration: 12000,
          action: { label: 'Open', onClick: () => navigate({ tab: 'collection' }) },
        }),
      );
    }));
    return () => {
      dead = true;
      cancel();
    };
    // Once per load; navigate is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const offDive = onCompFinderRequest((key) => {
      navigate({ tab: 'career', sub: 'deepdive', p: key || undefined });
    });
    const offH2H = onHeadToHeadRequest(() => navigate({ tab: 'career', sub: 'h2h' }));
    // A retired number's strip on the player card opens that club's rafters (Hall of Fame tab, Rafters section)
    // The NFL edition has no Hall of Fame tab: the club's own page (Stats > Teams), scrolled to its rafters
    const offRafters = onRaftersRequest((id) => {
      if (!IS_NFL) return navigate({ tab: 'hof' });
      const club = getNFLTeamById(id);
      if (!club) return navigate({ tab: 'career', sub: 'teams' });
      takeRaftersRequest();
      openTeamPage(club.name, { tab: 'franchise', section: 'rafters' });
      scrollToTeamRafters();
    });
    return () => {
      offDive();
      offH2H();
      offRafters();
    };
  }, [navigate]);

  return (
    <>
      <Helmet>
        <title>{IS_NFL ? 'Retro Vault NFL — League Hub' : 'Retro Vault — League Hub'}</title>
        <meta
          name="description"
          content="Retro Vault is the league hub for your Retro Bowl franchise: career stats, team pages, records and the Hall of Fame."
        />
      </Helmet>

      <div className="min-h-screen flex flex-col">
        <Header activeTab={target.tab} onTabChange={(tab) => navigate({ tab })} />

        <HubRouteContext.Provider value={hub}>
          <main id="main" tabIndex={-1} className="rv-ix flex-1 focus:outline-none">
            {/* Tab changes are transitions (hashRoute), so the old tab stays until the new one is ready; it then
                cross-fades in (.rv-view-in). The fallback only shows on a cold first load, after ~150 ms. */}
            <TabBoundary key={activeTab}><Suspense fallback={<TabFallback />}>
              <div key={activeTab} ref={SCROLL_IN_TABS.has(activeTab) ? scrollIn : undefined} className="rv-view-in">
                {activeTab === 'career' && <CareerTab />}
                {activeTab === 'lab' && <TeamLabTab />}
                {IS_NFL && activeTab === 'fantasy' && <FantasyHub />}
                {!IS_NFL && activeTab === 'hof' && <HallOfFameTab />}
                {activeTab === 'collection' && <CollectionTab />}
                {activeTab === 'season' && <SeasonTab />}
                {activeTab === 'timeline' && <TimelineTab />}
                {IS_NFL && activeTab === 'news' && <NewsTab />}
                {IS_NFL && activeTab === 'college' && <CollegeTab />}
                {activeTab === 'office' && <FrontOfficeTab />}
                {activeTab === 'games' && <GamesTab />}
                {ArcadeKitDemo && activeTab === 'arcadekit' && <ArcadeKitDemo />}
                {BannerLab && activeTab === 'bannerlab' && <BannerLab />}
              </div>
            </Suspense></TabBoundary>
          </main>
        </HubRouteContext.Provider>

        <PullToSearch />
        <BottomNav activeTab={target.tab} onTabChange={(tab) => navigate({ tab })} onRoute={(to) => navigate(to)} />
        <AddToHomeScreen />
        {!IS_NFL && <CeremonyHost />}
        {!IS_NFL && <TributeHost />}
        {IS_NFL && <ClubSeasonHost />}
        {!IS_NFL && <RivalryHost onTimeline={() => navigate({ tab: 'timeline' })} />}
        <LazyHost load={loadQuickSearch} wake={QUICK_SEARCH_WAKE} wakeKey={quickSearchKey} />
        <LazyHost load={loadPeekLayer} wake={PEEK_WAKE} />
        <ScreensaverHost />
        <LazyHost load={loadUnlockToasts} />
        <LazyHost load={loadLegendExchange} />
        <footer className="mt-12 border-t border-line/70 bg-night">
          <div className="h-1 turf-stripes" aria-hidden="true" />
          <div className="container py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
            <p className="font-display text-lg font-bold italic uppercase tracking-tight text-chalk">
              Retro <span className="text-gold">Vault</span>
            </p>
            <p className="text-xs text-center sm:text-right max-w-md">
              Fan-made league hub for {IS_NFL ? 'the NFL' : 'Retro Bowl'}. Team names and logos belong to their respective owners; this site is not affiliated with
              or endorsed by any league or team.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
};

const Index = () => {
  return (
    <LeagueProvider>
      <IndexContent />
    </LeagueProvider>
  );
};

export default Index;
