import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArcadeToggle, StadiumHeader } from '@/components/arcade';
import FootballLoader from '@/components/motion/FootballLoader';
import { ViewCount } from '@/components/motion/Reveal';
import { FANTASY_SUBS, useHubRoute } from '@/components/stats/hub/hashRoute';
import { InfoTip } from '@/components/ui/InfoTip';
import { useNflLab, usePrefs, type NflLabReady } from '@/components/teamlab/nfl/useNflLab';
import type { Turf } from '@/components/teamlab/fieldArt';
import { useTradeEnv } from '@/components/trade/useTrade';
import { SCORING_LABELS } from '@/utils/nflFantasy';
import { bannerTeamOf } from '@/utils/playerExtras';
import { useFantasyHub, type FantasyHub } from './useFantasyHub';
import LeagueSheet, { LeagueChip, leagueSummary } from './LeagueSheet';
import LineupPage from './LineupPage';
import StartSitPage from './StartSitPage';
import HeadToHeadPage from './HeadToHeadPage';
import { CardHost } from './cardContext';
import './fantasyHub.css';
import '@/components/teamlab/teamlab.css';
import '@/components/teamlab/nfl/nflLab.css';
import '@/components/trade/trade.css';

const TradePage = lazy(() => import('./TradePage'));

export type Sub = 'lineup' | 'startsit' | 'h2h' | 'trade';
const SUBS: { value: Sub; label: string; short: string }[] = [
  // owner: "move trade to be the first tab" (and the page opens on it)
  { value: 'trade', label: 'Trade', short: 'Trade' },
  { value: 'lineup', label: 'Lineup', short: 'Lineup' },
  { value: 'startsit', label: 'Start / sit', short: 'Start/sit' },
  { value: 'h2h', label: 'Head-to-head', short: 'H2H' },
];
const SUB_TITLE: Record<Sub, string> = { lineup: 'Lineup', startsit: 'Start / sit', h2h: 'Head-to-head', trade: 'Trade' };

/** The hero: the stadium painted to a club, the lineup's stars (else the week's top projected scorers) on the turf, a jumbotron total. */
const Hero = ({ hub, sub, turf, onLeague, summary }: { hub: FantasyHub; sub: Sub; turf: Turf; onLeague: () => void; summary: string }) => {
  const { ctx, fctx, cands, fl, week, total, filled, clubName } = hub;
  const stars = useMemo(() => {
    const keys = filled
      ? Object.values(fl).filter((k) => k && !k.startsWith('DST:'))
      : fctx ? cands.filter((c) => c.pos !== 'DST').map((c) => ({ k: c.key, v: fctx ? hub.projectWeek(fctx, c.key, week) : 0 })).sort((a, b) => b.v - a.v).slice(0, 5).map((x) => x.k) : [];
    const ranked = filled && fctx ? [...keys].sort((a, b) => hub.projectWeek(fctx, b, week) - hub.projectWeek(fctx, a, week)) : keys;
    const five = ranked.slice(0, 5);
    // best in the middle, the rest alternating outward
    const order: string[] = [];
    five.forEach((k, i) => (i % 2 ? order.unshift(k) : order.push(k)));
    return order.map((k) => ctx.profiles.get(k)?.player).filter((p): p is NonNullable<typeof p> => !!p).map((player) => ({ player, club: bannerTeamOf(player) }));
  }, [ctx, fctx, cands, fl, week, filled, hub.projectWeek]);
  const proj = filled ? total(fl, week) : 0;
  return (
    <StadiumHeader
      club={clubName}
      time={turf === 'day' ? 'day' : 'night'}
      size="m"
      players={stars}
      maxMobile={3}
      kicker={`${week ? `Week ${week} · ` : ''}${SUB_TITLE[sub]}`}
      title={<>Fantasy <span className="text-gold">hub</span></>}
      right={filled ? (
        <div className="fh-led" aria-label="Projected total">
          <span className="ax-kicker">Projected</span>
          <ViewCount className="fh-led__n" value={proj} decimals={1} />
        </div>
      ) : undefined}
    >
      <div className="fh-hero-chip"><LeagueChip summary={summary} onClick={onLeague} /></div>
    </StadiumHeader>
  );
};

const Ready = ({ nl }: { nl: NflLabReady }) => {
  const { route, navigate } = useHubRoute();
  const sub: Sub = (FANTASY_SUBS.includes(route.section ?? '') ? route.section : 'trade') as Sub;
  const [prefs, setPrefs] = usePrefs();
  const env = useTradeEnv(sub === 'trade');
  const hub = useFantasyHub(nl, prefs, sub === 'h2h');
  const [open, setOpen] = useState(false);
  const [turf, setTurf] = useState<Turf>('day');
  // old links (#lab/trade, #lab?mode=fantasy) land here: give the address its new form
  useEffect(() => {
    if (!window.location.hash.startsWith('#fantasy')) navigate({ tab: 'fantasy', section: sub, p: route.p }, { replace: true });
  }, [navigate, sub, route.p]);
  const go = (s: Sub) => navigate({ tab: 'fantasy', section: s });
  const find = useCallback((key: string) => env.cards.get(key) ?? nl.ctx.profiles.get(key)?.player, [env.cards, nl.ctx]);
  const summary = leagueSummary(prefs, env.settings);
  return (
    <CardHost find={find}>
    <div className="fh rv-ix min-w-0" data-sub={sub}>
      <div className="container min-w-0 py-3 sm:py-4">
        <Hero hub={hub} sub={sub} turf={turf} onLeague={() => setOpen(true)} summary={summary} />
        <div className="fh-bar" role="navigation" aria-label="Fantasy pages">
          <ArcadeToggle<Sub> label="Fantasy page" value={sub} onChange={go} options={SUBS.map((s) => ({ value: s.value, label: <><span className="fh-lg">{s.label}</span><span className="fh-sm">{s.short}</span></> }))} />
          <InfoTip label="About the fantasy page" className="fh-info">
            Projections blend each player's recent games and season with how the opponent defends his position, from nflverse weekly lines. Start / sit and head-to-head read the lineup you build; trades are weighed on rest-of-season value.
          </InfoTip>
        </div>
        <div key={sub} className="fh-view">
          {sub === 'lineup' && <LineupPage hub={hub} prefs={prefs} setPrefs={setPrefs} turf={turf} />}
          {sub === 'startsit' && <StartSitPage hub={hub} onGo={go} />}
          {sub === 'h2h' && <HeadToHeadPage hub={hub} onGo={go} />}
          {sub === 'trade' && (
            <Suspense fallback={<FootballLoader ready={false} minHeight={420} what="the trade desk" />}>
              <TradePage env={env} onLeague={() => setOpen(true)} leagueSummary={summary} />
            </Suspense>
          )}
        </div>
      </div>
      <LeagueSheet open={open} onOpenChange={setOpen} prefs={prefs} setPrefs={setPrefs} settings={env.settings} setSettings={env.setSettings} scoring={hub.scoring} turf={turf} setTurf={setTurf} lab={hub.lab} summary={summary} />
      <span className="sr-only">{SCORING_LABELS[prefs.scoring]}</span>
    </div>
    </CardHost>
  );
};

/** The Fantasy page (#fantasy): lineup, start / sit, head-to-head and trade, with one shared lineup and league format. */
const FantasyHub = () => {
  const nl = useNflLab();
  // (the lab files too: the page rendered once on the bare league and again when they landed)
  if (!nl.ctx || !nl.data) return <div className="container"><FootballLoader ready={false} minHeight="60vh" what="the league" label="Fantasy" /></div>;
  return <Ready nl={nl as NflLabReady} />;
};

export default FantasyHub;
