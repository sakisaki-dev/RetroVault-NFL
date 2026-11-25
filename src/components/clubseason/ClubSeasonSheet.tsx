import PixelLoader from '@/components/ui/PixelLoader';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Player } from '@/types/player';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import PlayerDetailCard from '@/components/PlayerDetailCard';
import { COMP_FINDER_EVENT, HEAD_TO_HEAD_EVENT } from '@/components/stats/comps/compFinderLink';
import { clubPlate } from '@/components/arcade/clubInk';
import { Reveal } from '@/components/motion/Reveal';
import { useLeague } from '@/context/LeagueContext';
import { displayName } from '@/utils/displayName';
import { findNFLTeam } from '@/utils/nflTeams';
import { openGame, useGameIds } from '@/utils/nflGames';
import { Choice } from '@/components/controls';
import type { ClubTab } from '@/utils/openClub';
import { mirrorClubHash } from './clubRoute';
import { realNumberOf } from '@/utils/gameSprites';
import { resultOf, ticketsOf, useClubSeason } from '@/utils/clubSeason';
import ClubSeasonHero from './ClubSeasonHero';
import ClubSeasonFacing from './ClubSeasonFacing';
import ClubSeasonLineup from './ClubSeasonLineup';
import ClubSeasonInk from './ClubSeasonInk';
import ClubSeasonDraft from './ClubSeasonDraft';
import { openCollege } from '@/utils/collegeData';
import { Section, accentOn, inkOn, liftOnNight } from './ClubSeasonSection';
import { CapBreakdown, Fixtures, Leaders, Yearbook, type RosterEntry } from './ClubSeasonParts';
import './clubSeason.css';
import '@/components/season/seaPhone.css';

const FranchiseTab = lazy(() => import('./FranchiseTab'));

const TAB_OPTIONS: { value: ClubTab; label: string }[] = [
  { value: 'season', label: 'This season' },
  { value: 'franchise', label: 'Franchise' },
];

interface Props {
  club: string;
  season?: number;
  /** The tab to show when the sheet opens */
  tab?: ClubTab;
  /** Scroll to a part of the Franchise tab */
  section?: 'rafters';
  /** Changes with every open request, so asking for the same club again resets the tab */
  nonce?: number;
  open: boolean;
  onClose: () => void;
}

/** The sheet's own close: the dialog animates out before whatever it opens takes the screen */
const AFTER_CLOSE_MS = 60;

/**
 * The club season sheet as a game-day programme (concept C): full screen on a phone (swipe down to close, a history
 * entry like the other sheets), a centred card from 640px. The cover and the facing page (at a glance, the division
 * table, splits, postseason), the starting lineup as the centre spread, then a two-column magazine (the schedule as a
 * fixture list; stat leaders, black ink and the cap) and the roster as a yearbook. Every season 1999 on.
 * Anything that leaves the sheet (a player card, a game, the club's all-time page) closes it first.
 */
const ClubSeasonSheet = ({ club, season, tab: tabProp = 'season', section, nonce, open, onClose }: Props) => {
  const team = findNFLTeam(club);
  const abbr = team?.abbreviation;
  const ids = useGameIds(true);
  const years = useMemo(() => (ids ? Object.keys(ids).map(Number).sort((a, b) => b - a) : []), [ids]);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [club, season, nonce]);
  const [tab, setTab] = useState<ClubTab>(tabProp);
  useEffect(() => setTab(tabProp), [tabProp, club, nonce]);
  const year = picked ?? season ?? years[0] ?? 2026;
  const data = useClubSeason(abbr, year);
  const { getAllPlayers, dataVersion } = useLeague();
  const [card, setCard] = useState<Player | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const byKey = useMemo(() => {
    const m = new Map<string, Player>();
    getAllPlayers().forEach((p) => {
      if (p.isRealLegend) return;
      m.set(`${p.position}:${p.name}`, p);
      m.set(`${p.position}:${displayName(p.name)}`, p);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAllPlayers, dataVersion]);
  // The player card opens over the sheet; closing it lands back on the sheet (owner: "they should dismiss to go back to
  // the season popup"). Leaving for his Deep Dive closes both (the card changes the route; see onCardLeave).
  const pick = useCallback(
    (key: string) => {
      const p = byKey.get(key);
      if (p) setCard(p);
    },
    [byKey],
  );
  const rows = useMemo<RosterEntry[]>(
    () => (data?.roster ?? []).map((r) => {
      const [pos, ...rest] = r.k.split(':');
      return { ...r, pos, name: rest.join(':'), number: r.no ?? realNumberOf(r.k) };
    }),
    [data?.roster],
  );
  const tickets = useMemo(() => (data?.games && abbr ? ticketsOf(data.games, abbr) : []), [data?.games, abbr]);
  const result = useMemo(() => (abbr ? resultOf(data?.games ?? null, abbr, data?.schedule ?? null) : { text: '', champion: false, playoffs: false, live: false }), [data, abbr]);
  const lastPost = useMemo(() => [...tickets].reverse().find((t) => t.type !== 'REG' && t.r) ?? null, [tickets]);
  const record = useMemo(() => {
    if (data?.cell) return data.cell.record;
    const reg = tickets.filter((t) => t.type === 'REG' && t.r);
    const w = reg.filter((t) => t.r === 'W').length;
    const l = reg.filter((t) => t.r === 'L').length;
    const t = reg.filter((x) => x.r === 'T').length;
    return reg.length ? `${w}-${l}${t ? `-${t}` : ''}` : '';
  }, [data?.cell, tickets]);
  const plate = clubPlate(club);
  const lift = liftOnNight(plate.fill);
  const liftEdge = liftOnNight(plate.edge);
  const vars = {
    '--cs-fill': plate.fill,
    '--cs-edge': plate.edge,
    '--cs-ink': plate.ink,
    // the masthead and the cover's accents: the secondary where it reads on the fill, else the fill's own ink
    '--cs-acc': accentOn(plate.fill, plate.edge, plate.ink),
    '--cs-acc-ink': plate.fill,
    // the club colour lifted to read on the night page (win bars, rules), and its secondary the same way
    '--cs-lift': lift,
    '--cs-lift2': liftEdge,
    '--cs-lift-ink': inkOn(plate.fill),
    '--ax-c1': plate.fill,
    '--ax-c2': plate.edge,
    '--ax-ink': plate.ink,
  } as CSSProperties;

  useEffect(() => {
    // keep the picked season's tab in view
    const el = strip.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (el && strip.current) strip.current.scrollLeft = el.offsetLeft - (strip.current.clientWidth - el.offsetWidth) / 2;
  }, [year, years.length, open]);
  useEffect(() => {
    // a new season starts at the cover
    scroller.current?.scrollTo({ top: 0 });
  }, [year, club]);

  // the URL follows the tab and the season (utils/openClub: #season/club?c=…&tab=…&y=…)
  const mirrored = useRef(false);
  useEffect(() => {
    if (!open || !team) {
      mirrored.current = false;
      return;
    }
    // a phone's sheet pushes its history entry as it mounts: the first rewrite of the URL waits for that
    const t = window.setTimeout(() => {
      mirrored.current = true;
      mirrorClubHash(team.name, tab, tab === 'season' ? year : undefined);
    }, mirrored.current ? 0 : 160);
    return () => window.clearTimeout(t);
  }, [open, team, tab, year]);
  const openPlayer = useCallback((p: Player) => setCard(p), []);
  // Leaving the sheet's route (the player card's Deep Dive, a link inside it) closes the sheet and the card with it
  useEffect(() => {
    if (!open) return;
    const away = () => {
      if (!/club\?/.test(window.location.hash)) {
        setCard(null);
        onClose();
      }
    };
    const leave = () => {
      setCard(null);
      onClose();
    };
    window.addEventListener('hashchange', away);
    window.addEventListener(COMP_FINDER_EVENT, leave);
    window.addEventListener(HEAD_TO_HEAD_EVENT, leave);
    return () => {
      window.removeEventListener('hashchange', away);
      window.removeEventListener(COMP_FINDER_EVENT, leave);
      window.removeEventListener(HEAD_TO_HEAD_EVENT, leave);
    };
  }, [open, onClose]);
  useEffect(() => {
    // a new tab starts at its top
    scroller.current?.scrollTo({ top: 0 });
  }, [tab]);

  const openGameFromSheet = (id: string) => {
    onClose();
    window.setTimeout(() => openGame(id), AFTER_CLOSE_MS);
  };
  // the Draft outlook's link: the College tab's war room, this club in focus
  const toCollege = (section: 'warroom') => {
    onClose();
    window.setTimeout(() => openCollege(section, { club: abbr ?? '' }), AFTER_CLOSE_MS);
  };
  return (
    <>
      <Dialog open={open && !!team} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          ref={scroller}
          phoneSheet
          data-peek-ok
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            scroller.current?.focus({ preventScroll: true });
          }}
          style={vars}
          className="cs-sheet grid-cols-[minmax(0,1fr)] w-screen max-w-none h-[var(--safe-h,100dvh)] max-h-none overflow-y-auto overflow-x-hidden rounded-none border-0 gap-0 p-0 sm:h-auto sm:max-h-[calc(var(--safe-h,100dvh)-2rem)] sm:w-[min(1080px,calc(100vw-2rem))] sm:rounded-2xl sm:border [&_.dlg-x]:border-white/20 [&_.dlg-x]:bg-black/55 [&_.dlg-x]:text-white"
        >
          <DialogTitle className="sr-only">{year} {team?.fullName}</DialogTitle>
          <DialogDescription className="sr-only">The {year} {team?.name} season programme: the cover, the season at a glance, the starting lineup, the schedule, stat leaders, the cap and the roster.</DialogDescription>
          {team && abbr && (
            <div className="cs">
              <div className="cs-bar-top">
                <Choice<ClubTab> label="Club page" size="md" club={team.name} className="cs-tabs" value={tab} onChange={setTab} options={TAB_OPTIONS} />
              </div>
              {tab === 'franchise' ? (
                <Suspense fallback={<PixelLoader what={`the ${team.name} franchise`} minHeight={420} />}>
                  <FranchiseTab club={team.name} onPlayer={openPlayer} section={section} />
                </Suspense>
              ) : (
                <>
                <div className="cs-years" ref={strip} role="tablist" aria-label="Season">
                  {years.map((y) => (
                    <button key={y} type="button" role="tab" aria-selected={y === year} aria-current={y === year ? 'true' : undefined} className={y === year ? 'is-on' : ''} onClick={() => setPicked(y)}>{y}</button>
                  ))}
                </div>
              {data === undefined ? (
                <PixelLoader what={`the ${year} ${team.name}`} minHeight={420} />
              ) : (
                <div className="pg" key={`${abbr}-${year}`}>
                  <Reveal className="pg-front">
                    <ClubSeasonHero club={club} year={year} record={record || '–'} cell={data.cell} result={result} lastPost={lastPost} rows={rows} onPick={pick} />
                    <ClubSeasonFacing abbr={abbr} year={year} cell={data.cell} table={data.schedule?.table ?? null} tickets={tickets} result={result} onOpenGame={openGameFromSheet} />
                  </Reveal>
                  <ClubSeasonLineup rows={rows} lineup={data.lineup} club={club} clubName={team.name} year={year} onPick={pick} />
                  <ClubSeasonDraft abbr={abbr} clubName={team.name} year={year} onOpen={toCollege} />
                  <div className="pg-mag">
                    <div className="pg-col">
                      <Section title="The schedule" note={tickets.length ? `${tickets.filter((t) => !t.bye).length} games` : undefined}>
                        {tickets.length ? <Fixtures tickets={tickets} onOpen={openGameFromSheet} /> : <p className="pg-note">No games on file for {year}.</p>}
                        {tickets.some((t) => t.upset) && <p className="pg-note">Upset: 3+ points against the closing line</p>}
                      </Section>
                    </div>
                    <div className="pg-col">
                      <Section title="Stat leaders">
                        <Leaders rows={rows} club={club} year={year} onPick={pick} />
                      </Section>
                      <ClubSeasonInk club={abbr} season={year} onPick={pick} />
                      {data.cap?.clubs[abbr] && year <= data.cap.lastSigned && (
                        <Section title="The cap" note="contracts in force">
                          <CapBreakdown cap={data.cap} club={abbr} clubName={team.name} year={year} />
                        </Section>
                      )}
                    </div>
                  </div>
                  <Section title="The roster · yearbook" note={rows.length ? `${rows.length} players` : undefined} className="pg-roster">
                    {rows.length ? <Yearbook rows={rows} club={club} year={year} onPick={pick} /> : <p className="pg-note">No roster lines on file for {year}.</p>}
                  </Section>
                </div>
              )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <PlayerDetailCard player={card} onClose={() => setCard(null)} />
    </>
  );
};

export default ClubSeasonSheet;
