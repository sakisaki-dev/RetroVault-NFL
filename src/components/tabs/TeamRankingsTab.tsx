import { openPlayerCard } from '@/utils/playerCardLink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, UserX } from 'lucide-react';
import type { Player } from '@/types/player';
import { cn } from '@/lib/utils';
import PositionBadge from '../PositionBadge';
import PlayerDetailCard from '../PlayerDetailCard';
import TeamCard from '../teams/TeamCard';
import CountUp from '../brand/CountUp';
import TeamSheet from '../teams/TeamSheet';
import { OPEN_TEAM_EVENT } from '@/utils/teamSearch';
import PowerRanking from '../teams/PowerRanking';
import DynastyGrid from '../teams/DynastyGrid';
import TeamAdvanced from '../teams/TeamAdvanced';
import { useTeamSummaries } from '../teams/useTeamSummaries';
import { openClub as openClubSheet } from '@/utils/openClub';
import { latestSeasonYear, useLeagueContent } from '@/utils/leagueContent';
import { isHallOfFamer } from '@/config/stats';
import {
  DIVISIONS,
  TEAM_SORTS,
  sortTeams,
  type TeamSortKey,
  type TeamSummary,
} from '../teams/teamStats';
import { buildHash, useHubRoute } from '../stats/hub/hashRoute';
import { peekProps } from '@/components/peek/peekProps';
import { IS_NFL, seasonLabel } from '@/config/edition';
import '../teams/powerBoards.css';
import { StadiumHeader, LedBoard, PixelChip, PixelPanel, SectionHeader } from '../arcade';
import { useSchedule } from '@/utils/schedule';
import BannerRing from '../teams/banner/BannerRing';
import { useBannerData } from '../teams/banner/useBannerData';
import FranchiseWall from '../teams/nfl/FranchiseWall';
import AllTimePower from '../teams/nfl/AllTimePower';
import Dynasties from '../teams/nfl/Dynasties';
import FranchiseLeaders from '../teams/nfl/FranchiseLeaders';
import SuperBowlList from '../teams/nfl/SuperBowlList';
import { GameRecords } from '../season/SeasonGames';
import '@/components/season/season.css';
import { displayName } from '@/utils/displayName';

type ConferenceFilter = 'all' | 'AFC' | 'NFC';
type DivisionFilter = 'all' | (typeof DIVISIONS)[number];

const Segmented = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) => (
  <div role="group" aria-label={label} className="flex items-center gap-2 min-w-0">
    <span className="font-pixel text-[9px] uppercase text-muted-foreground shrink-0 w-9 sm:w-auto">{label}</span>
    <div className="flex min-w-0 gap-1 overflow-x-auto scrollbar-none rounded-lg bg-secondary/50 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'shrink-0 rounded-md px-2.5 py-1 font-display text-xs font-bold uppercase tracking-wide transition-colors max-sm:min-h-10',
            value === o.key ? 'bg-gold text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

const CONF_OPTIONS: { key: ConferenceFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'AFC', label: 'AFC' },
  { key: 'NFC', label: 'NFC' },
];
const DIV_OPTIONS: { key: DivisionFilter; label: string }[] = [{ key: 'all', label: 'All' }, ...DIVISIONS.map((d) => ({ key: d, label: d }))];

const divisionLabel = (t: TeamSummary) => (t.team ? `${t.team.conference} ${t.team.division}` : 'Other');

const TeamRankingsTab = () => {
  const [sortKey, setSortKey] = useState<TeamSortKey>('power');
  const [conference, setConference] = useState<ConferenceFilter>('all');
  const [division, setDivision] = useState<DivisionFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const { content } = useLeagueContent();
  const { careerData, league, teams, unassigned, records, coached, superBowls, ovrFor } = useTeamSummaries();
  const lastSeason = latestSeasonYear(content);
  const firstSeason = superBowls.length ? Math.min(...superBowls.map((sb) => sb.year)) : 0;
  const [allFa, setAllFa] = useState(false);
  const openable = useMemo(() => new Set(teams.map((t) => t.key)), [teams]);

  const visible = useMemo(
    () =>
      sortTeams(
        teams.filter(
          (t) => (conference === 'all' || t.team?.conference === conference) && (division === 'all' || t.team?.division === division),
        ),
        sortKey,
        records,
      ),
    [teams, sortKey, conference, division, records],
  );
  const groups = useMemo(() => {
    if (sortKey !== 'division') return [{ label: null as string | null, teams: visible }];
    const out: { label: string | null; teams: TeamSummary[] }[] = [];
    visible.forEach((t) => {
      const label = divisionLabel(t);
      const last = out.at(-1);
      if (last?.label === label) last.teams.push(t);
      else out.push({ label, teams: [t] });
    });
    return out;
  }, [visible, sortKey]);

  const openSummary = teams.find((t) => t.key === openKey) ?? null;
  /*
   * The club sheet is a page in the history: opening a club pushes #stats/teams?p=<club> (Back and the phone edge swipe
   * close it and return to the Teams page where it was left), closing with the X goes Back to it. A club strip elsewhere
   * (the Season page, a game page) links here the same way, and the header's quick search too (utils/teamSearch.ts).
   */
  const { route, navigate } = useHubRoute();
  const wanted = !IS_NFL && route.sub === 'teams' ? route.p : undefined;
  const pushed = useRef(false);
  useEffect(() => {
    if (!wanted) {
      pushed.current = false;
      setOpenKey(null);
      return;
    }
    const hit = teams.find((t) => t.team?.name === wanted || t.label === wanted);
    if (hit) setOpenKey(hit.key);
  }, [wanted, teams]);
  const openClub = useCallback(
    (key: string) => {
      const hit = teams.find((t) => t.key === key);
      // NFL edition: one club page (the club season sheet), opened on its Franchise tab from this history page
      if (IS_NFL) {
        if (hit) openClubSheet(hit.team?.name ?? hit.label, { tab: 'franchise' });
        return;
      }
      setOpenKey(key);
      if (!hit) return;
      const to = { tab: 'career', sub: 'teams' as const, p: hit.team?.name ?? hit.label };
      if (buildHash(to) !== window.location.hash) pushed.current = true;
      navigate(to);
    },
    [teams, navigate],
  );
  const closeClub = useCallback(() => {
    setOpenKey(null);
    if (!window.location.hash.includes('?p=')) return;
    if (pushed.current) window.history.back();
    else navigate({ tab: 'career', sub: 'teams' }, { replace: true });
  }, [navigate]);
  const totals = useMemo(
    () => ({
      yourTitles: superBowls.filter((sb) => sb.yourResult === 'won').length,
      hof: league.filter(isHallOfFamer).length,
      champions: new Set(superBowls.map((sb) => sb.winner).filter(Boolean)).size,
    }),
    [superBowls, league],
  );

  const schedule = useSchedule();
  const bannerData = useBannerData();
  // the stage: the all-time power No. 1 and its three greatest players
  const stage = useMemo(() => {
    const top = [...teams].filter((t) => t.team).sort((x, y) => (records.get(x.key)?.powerRank ?? 99) - (records.get(y.key)?.powerRank ?? 99))[0];
    const pool = top?.franchisePlayers.slice(0, 3) ?? [];
    const players = pool.length === 3 ? [pool[1], pool[0], pool[2]] : pool;
    return { club: top?.team?.name ?? 'Eagles', players };
  }, [teams, records]);

  if (!careerData) {
    return (
      <div className="container py-16 text-center">
        <Building2 className="mx-auto mb-4 h-12 w-12 text-gold" aria-hidden="true" />
        <h1 className="font-display text-4xl font-extrabold uppercase">Teams</h1>
        <p className="mt-2 text-muted-foreground">Upload your league data to see every franchise and its roster.</p>
      </div>
    );
  }

  const filterLabel = [conference !== 'all' ? conference : null, division !== 'all' ? division : null].filter(Boolean).join(' ');
  let tileIndex = 0;

  return (
    <div className="container py-6 sm:py-8 space-y-6">
      {/* Page header: the power ladder leader's stadium and stars, the franchise counts as scoreboards */}
      {IS_NFL && bannerData ? (
        <BannerRing data={bannerData} onOpenClub={openClub} onOpenPlayer={(p) => openPlayerCard(`${p.position}:${p.name}`)} />
      ) : (
      <StadiumHeader
        club={stage.club}
        players={stage.players}
        kind="figure"
        size="m"
        kicker="League Hub · all time"
        height={290}
        className="teams-stage"
        title="Teams"
        right={
          <div className="flex flex-wrap justify-end gap-1.5 sm:gap-2">
            <LedBoard label="Franchises" value={teams.length} dot={2} />
            <LedBoard label="Super Bowls" value={superBowls.length} dot={2} />
            <LedBoard label="Champions" value={totals.champions} dot={2} />
          </div>
        }
      >
        <p className="sr-only">
          Every franchise {firstSeason && lastSeason ? `from ${seasonLabel(firstSeason)} to ${seasonLabel(lastSeason)}` : 'in the league'}: who won, who built dynasties, and who is on the roster now.
        </p>
      </StadiumHeader>
      )}
      {IS_NFL && (
        <p className="-mt-3 text-sm text-muted-foreground">
          Every franchise since {firstSeason ? seasonLabel(firstSeason) : '1999'}{' · '}
          <a href="#season" className="whitespace-nowrap font-semibold text-gold hover:underline">This season →</a>
        </p>
      )}

      {/* League overview: power ranking + dynasty timeline */}
      {IS_NFL && teams.length > 0 && <FranchiseWall teams={teams} records={records} onOpen={openClub} />}
      {IS_NFL && teams.length > 0 && <AllTimePower teams={teams} records={records} onOpen={openClub} />}
      {!IS_NFL && teams.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7 min-w-0">
            <PowerRanking teams={teams} records={records} lastSeason={lastSeason} onOpen={openClub} highlight={highlight} onHighlight={setHighlight} />
          </div>
          {superBowls.length > 0 && (
            <div className="lg:col-span-5 min-w-0">
              <DynastyGrid superBowls={superBowls} openable={openable} onOpen={openClub} highlight={highlight} onHighlight={setHighlight} />
            </div>
          )}
        </div>
      )}

      {/* The champions, each club's progression across seasons, the all-time game records (the season-by-season views live on the Season page) */}
      {IS_NFL && superBowls.length > 0 && <SuperBowlList superBowls={superBowls} />}
      {IS_NFL && <Dynasties />}
      {IS_NFL && teams.length > 0 && <FranchiseLeaders teams={teams} league={league} />}
      <TeamAdvanced />
      {IS_NFL && !!schedule?.records.length && (
        <section aria-labelledby="alltime-heading" className="season">
          <span id="alltime-heading" className="sr-only">All-time game records</span>
          <GameRecords records={schedule.records} title="All-time game records" />
        </section>
      )}

      {/* Controls */}
      {!IS_NFL && (
      <section aria-labelledby="franchises-heading" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="franchises-heading" className="section-title text-2xl flex-1">
            Franchises
            <span className="font-pixel text-[9px] text-muted-foreground">{visible.length}</span>
          </h2>
        </div>
        <div className="glass-card flex flex-col gap-2.5 p-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6">
          <Segmented<TeamSortKey> label="Sort" value={sortKey} options={TEAM_SORTS} onChange={setSortKey} />
          <Segmented<ConferenceFilter> label="Conf" value={conference} options={CONF_OPTIONS} onChange={setConference} />
          <Segmented<DivisionFilter> label="Div" value={division} options={DIV_OPTIONS} onChange={setDivision} />
        </div>

        {/* Team tiles */}
        {teams.length === 0 ? (
          <div className="glass-card p-6 text-sm text-muted-foreground">
            No players have a team yet. Add a <span className="font-mono text-foreground">Team</span> column to your sheet, or set a team
            from a player's edit dialog.
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-card p-6 text-sm text-muted-foreground">No {filterLabel} franchises in the league yet.</div>
        ) : (
          groups.map((g) => (
            <div key={g.label ?? 'all'} className="space-y-2">
              {g.label && <h3 className="font-display text-lg font-bold uppercase tracking-wide text-gold">{g.label}</h3>}
              <ul
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                aria-label={g.label ? `${g.label} franchises` : 'Franchises'}
              >
                {g.teams.map((summary) => (
                  <li key={summary.key} className="stagger-in" style={{ ['--i' as string]: tileIndex++ }}>
                    <TeamCard
                      summary={summary}
                      record={records.get(summary.key)}
                      onOpen={() => openClub(summary.key)}
                      onHighlight={setHighlight}
                      coached={coached.get(summary.team?.id ?? summary.label)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
      )}

      {/* Players with no club in the league sheet (free agents) */}
      {unassigned.length > 0 && (
        <PixelPanel as="section" aria-labelledby="unassigned-heading">
          <SectionHeader kicker={`${unassigned.length} players`} title={<span id="unassigned-heading">Free agents</span>} />
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...unassigned]
              .sort((a, b) => (b.careerLegacy || 0) - (a.careerLegacy || 0))
              .slice(0, allFa ? undefined : 12)
              .map((p) => (
                <li key={`${displayName(p.name)}-${p.position}`}>
                  <button
                    type="button"
                    {...peekProps(p)}
                    onClick={() => setSelectedPlayer(p)}
                    className="flex w-full items-center gap-3 border-2 border-[hsl(var(--line)/0.7)] bg-card px-3 py-2 text-left hover:border-gold/70"
                  >
                    <PositionBadge position={p.position} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{displayName(p.name)}</span>
                      <span className="block text-xs text-muted-foreground">{p.games} GP</span>
                    </span>
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {Math.round(p.careerLegacy || 0).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
          {unassigned.length > 12 && (
            <PixelChip className="mt-3" pressed={allFa} aria-expanded={allFa} onClick={() => setAllFa((v) => !v)}>
              {allFa ? 'Show the top 12' : `Show all ${unassigned.length}`}
            </PixelChip>
          )}
        </PixelPanel>
      )}

      {!IS_NFL && (
        <TeamSheet
          summary={openSummary}
          record={openSummary ? records.get(openSummary.key) : undefined}
          coached={openSummary ? coached.get(openSummary.team?.id ?? openSummary.label) : undefined}
          league={league}
          ovrFor={ovrFor}
          onClose={closeClub}
        />
      )}
      <PlayerDetailCard player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
    </div>
  );
};

export default TeamRankingsTab;
