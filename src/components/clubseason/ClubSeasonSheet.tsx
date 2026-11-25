import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Player } from '@/types/player';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import PlayerDetailCard from '@/components/PlayerDetailCard';
import TeamLogo from '@/components/brand/TeamLogo';
import { clubPlate } from '@/components/arcade/clubInk';
import { useLeague } from '@/context/LeagueContext';
import { displayName } from '@/utils/displayName';
import { findNFLTeam } from '@/utils/nflTeams';
import { openGame, useGameIds } from '@/utils/nflGames';
import { openTeamPage } from '@/utils/teamSearch';
import { realNumberOf } from '@/utils/gameSprites';
import { resultOf, ticketsOf, useClubSeason } from '@/utils/clubSeason';
import ClubSeasonHero, { type HeroPlayer } from './ClubSeasonHero';
import ClubSeasonInk from './ClubSeasonInk';
import { CapBreakdown, Leaders, Roster, Tickets, type RosterEntry } from './ClubSeasonParts';
import './clubSeason.css';

interface Props {
  club: string;
  season?: number;
  open: boolean;
  onClose: () => void;
}

const Block = ({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) => (
  <section className="cs-block">
    <header className="cs-block__h"><span>{kicker}</span><h3>{title}</h3></header>
    {children}
  </section>
);

/**
 * The club season sheet (concept 6): full screen on a phone (swipe down to close, a history entry like the other
 * sheets), a centred card from 640px. A locker-room hero, the game log as tickets, the roster with season lines, team
 * leaders, a slot for black ink and streaks, and the season's contracts (cap) breakdown. Every season 1999 on.
 */
const ClubSeasonSheet = ({ club, season, open, onClose }: Props) => {
  const team = findNFLTeam(club);
  const abbr = team?.abbreviation;
  const ids = useGameIds(true);
  const years = useMemo(() => (ids ? Object.keys(ids).map(Number).sort((a, b) => b - a) : []), [ids]);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [club, season]);
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
  const pick = useCallback((key: string) => {
    const p = byKey.get(key);
    if (p) setCard(p);
  }, [byKey]);
  const rows = useMemo<RosterEntry[]>(
    () => (data?.roster ?? []).map((r) => {
      const [pos, ...rest] = r.k.split(':');
      return { ...r, pos, name: rest.join(':'), number: r.no ?? realNumberOf(r.k) };
    }),
    [data?.roster],
  );
  const hero = useMemo<HeroPlayer[]>(
    () => rows.filter((r) => r.szn != null).slice(0, 5).map((r) => ({ key: r.k, name: r.name, number: r.number, szn: r.szn })),
    [rows],
  );
  const tickets = useMemo(() => (data?.games && abbr ? ticketsOf(data.games, abbr) : []), [data?.games, abbr]);
  const result = useMemo(() => (abbr ? resultOf(data?.games ?? null, abbr, data?.schedule ?? null) : { text: '', champion: false, playoffs: false, live: false }), [data, abbr]);
  const record = useMemo(() => {
    if (data?.cell) return data.cell.record;
    const reg = tickets.filter((t) => t.type === 'REG' && t.r);
    const w = reg.filter((t) => t.r === 'W').length;
    const l = reg.filter((t) => t.r === 'L').length;
    const t = reg.filter((x) => x.r === 'T').length;
    return reg.length ? `${w}-${l}${t ? `-${t}` : ''}` : '';
  }, [data?.cell, tickets]);
  const plate = clubPlate(club);
  const vars = { ['--cs-fill' as string]: plate.fill, ['--cs-edge' as string]: plate.edge } as CSSProperties;

  useEffect(() => {
    // keep the picked season's tab in view
    const el = strip.current?.querySelector<HTMLElement>('[aria-current="true"]');
    if (el && strip.current) strip.current.scrollLeft = el.offsetLeft - (strip.current.clientWidth - el.offsetWidth) / 2;
  }, [year, years.length, open]);

  const openGameFromSheet = (id: string) => {
    onClose();
    window.setTimeout(() => openGame(id), 60);
  };
  const allTime = () => {
    onClose();
    window.setTimeout(() => openTeamPage(club), 60);
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
          className="cs-sheet grid-cols-[minmax(0,1fr)] w-screen max-w-none h-[var(--safe-h,100dvh)] max-h-none overflow-y-auto overflow-x-hidden rounded-none border-0 gap-0 p-0 sm:h-auto sm:max-h-[calc(var(--safe-h,100dvh)-2rem)] sm:w-[min(1040px,calc(100vw-2rem))] sm:rounded-2xl sm:border [&_.dlg-x]:border-white/20 [&_.dlg-x]:bg-black/55 [&_.dlg-x]:text-white"
        >
          <DialogTitle className="sr-only">{year} {team?.fullName}</DialogTitle>
          <DialogDescription className="sr-only">The {year} {team?.name} season: locker room, game log, roster with season lines, team leaders and contracts.</DialogDescription>
          {team && abbr && (
            <div className="cs">
              <div className="cs-bar-top">
                <div className="cs-years" ref={strip} role="tablist" aria-label="Season">
                  {years.map((y) => (
                    <button key={y} type="button" role="tab" aria-selected={y === year} aria-current={y === year ? 'true' : undefined} className={y === year ? 'is-on' : ''} onClick={() => setPicked(y)}>{y}</button>
                  ))}
                </div>
                <button type="button" className="cs-all" onClick={allTime}>
                  <TeamLogo team={club} size={16} decorative className="cs-logo-plate" />All-time <span aria-hidden="true">→</span>
                </button>
              </div>
              {data === undefined ? (
                <p className="cs-loading" role="status">Loading the {year} {team.name}…</p>
              ) : (
                <>
                  <ClubSeasonHero
                    club={club}
                    year={year}
                    players={hero}
                    record={record || '–'}
                    pf={data.cell?.pf}
                    pa={data.cell?.pa}
                    power={data.cell?.power}
                    result={result}
                    onPick={pick}
                  />
                  <div className="cs-body">
                    <Block kicker="Every game" title="Game log">
                      {tickets.length ? <Tickets tickets={tickets} onOpen={openGameFromSheet} /> : <p className="cs-note">No games on file for {year}.</p>}
                    </Block>
                    <ClubSeasonInk club={abbr} season={year} />
                    <Block kicker="Season lines" title="Roster">
                      {rows.length ? <Roster rows={rows} club={club} onPick={pick} /> : <p className="cs-note">No roster lines on file for {year}.</p>}
                    </Block>
                    <Block kicker="Best on the team" title="Team leaders">
                      <Leaders rows={rows} club={club} onPick={pick} />
                    </Block>
                    <Block kicker="Contracts" title="Season cap breakdown">
                      <CapBreakdown cap={data.cap} club={abbr} year={year} />
                    </Block>
                  </div>
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
