import { displayName, firstAndLast } from '@/utils/displayName';
import { Fragment, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Clock, Radar, Radio, Search, Shield, Sparkles, Star, GraduationCap } from 'lucide-react';
import InLeague from '@/components/InLeague';
import type { Player, Position } from '@/types/player';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { playerKey } from '@/config/ovr';
import { isHallOfFamer } from '@/config/stats';
import { ovrLabelOf, useGamePool } from '@/utils/useOfficialOvr';
import { useGameSprites } from '@/utils/gameSprites';
import { useJerseyNumbers } from '@/utils/jerseys';
import { useSkillRatings } from '@/utils/useSkillRatings';
import { getTeamColors } from '@/utils/teamColors';
import { findNFLTeam } from '@/utils/nflTeams';
import { openTeamPage } from '@/utils/teamSearch';
import { openSchoolPage, useCollegeSearch } from '@/utils/collegeSearch';
import { CollegeMark } from '@/components/player/DraftTiles';
import { markInfo } from '@/utils/collegeData';
import { clubsOfQuery } from '@/utils/gameFinder';
import { openGame } from '@/utils/nflGames';
import { MeetingItem, useMeetings } from './search/GameMeetings';
import { normalizeName, usePlayerExtras } from '@/utils/playerExtras';
import { useCurrentClub } from '@/utils/club';
import PlayerDetailCard from './PlayerDetailCard';
import { warmPlayerCard } from './player/warmPlayerCard';
import TeamLogo from './brand/TeamLogo';
import GameSprite from './GameSprite';
import { openInCompFinder } from './stats/comps/compFinderLink';
import { parseHash } from './stats/hub/hashRoute';
import { isPhone, usePhone } from '@/hooks/usePhone';
import { buildSearchIndex, pooledIndex, pushRecent, readRecent, searchPlayersScored } from '@/utils/playerSearch';
import { IS_NFL } from '@/config/edition';
import { PEEK_ACTION_EVENT, peekProps } from '@/components/peek/peekProps';
import PlayerSearchSheet, { type SheetGroup } from './search/PlayerSearchSheet';
import './quickSearch.css';
import { bannerTeamOf } from '@/utils/playerExtras';
import { QUICK_SEARCH_EVENT, openQuickSearch } from '@/utils/quickSearchEvent';

export { QUICK_SEARCH_EVENT, openQuickSearch };

/** Rows rendered for a query (the rest is "keep typing") */
const RESULT_LIMIT = 24;

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL', 'K'];

/** True when the key press happens inside something the user is typing in. */
const typingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

const teamVars = (team?: string): CSSProperties => {
  const c = getTeamColors(team);
  return {
    '--qs-1': c ? `hsl(${c.primary})` : 'hsl(var(--line))',
    '--qs-2': c ? `hsl(${c.secondary})` : 'hsl(var(--muted-foreground))',
  } as CSSProperties;
};

const splitName = (rawName: string) => firstAndLast(rawName);

type GradeLike = { grade: string; color: string };

/**
 * One result as a broadcast lower-third in the player's team colours. Highlighted, the whole row fills with his
 * primary colour and the text turns white, so the name always stays readable (no low-contrast highlight).
 */
const ResultRow = ({ player, number, ovr, grade }: { player: Player; number: number; ovr?: number; grade?: GradeLike }) => {
  const { first, last } = splitName(player.name);
  const hof = !player.isRealLegend && isHallOfFamer(player);
  // Sprite-first row (the owner's private Retro Bowl sprites, this Mac only): his full figure leads the row and pops out
  // of its top edge; the slanted number plate shrinks beside the name. Without sprites the row is unchanged.
  const sprites = useGameSprites();
  const staged = !!sprites && !player.isRealLegend;
  const club = bannerTeamOf(player);
  const clubName = findNFLTeam(club)?.name ?? club;
  const right = (
    <span className="relative flex shrink-0 items-center gap-2">
      {grade && (
        <span className="rounded px-1.5 font-display text-sm font-extrabold text-[#0b1020]" style={{ background: grade.color }} title="Skill grade">
          {grade.grade}
        </span>
      )}
      {ovr != null && (
        <span className="qs-ovr flex min-w-[2.4rem] flex-col items-center rounded-md px-1.5 py-1">
          <span className="font-display text-lg font-extrabold leading-none tabular-nums">{ovr}</span>
          <span className="font-pixel text-[8px] uppercase">{ovrLabelOf(player)}</span>
        </span>
      )}
    </span>
  );
  const watermark = club && (
    <span className="qs-watermark pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2" aria-hidden="true">
      <TeamLogo team={club} size={64} decorative />
    </span>
  );

  if (staged) {
    return (
      <span className="qs-row--sprite relative flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-1 pr-2">
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" aria-hidden="true">
          {watermark}
        </span>
        <span className="qs-figure relative h-12 w-14 shrink-0 self-end" aria-hidden="true">
          <span className="qs-floor" />
          <GameSprite player={player} kind="figure" size="s" className="!absolute bottom-[-11px] left-1/2 -translate-x-1/2" />
        </span>
        <span className="relative flex min-w-0 flex-1 flex-col items-start text-left leading-none">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="qs-pos rounded px-1 py-px font-pixel text-[8px]">{player.position}</span>
            <span
              aria-hidden="true"
              className="qs-plate inline-flex h-4 shrink-0 items-center px-1.5 font-display text-[11px] font-extrabold italic tabular-nums [clip-path:polygon(14%_0,100%_0,86%_100%,0_100%)]"
            >
              #{number}
            </span>
            {first && <span className="qs-sub truncate font-pixel text-[9px] uppercase">{first}</span>}
            {hof && <Star className="qs-star h-3 w-3 shrink-0 fill-current" aria-label="Hall of Famer" />}
            <InLeague player={player} />
          </span>
          <span className="qs-name mt-1 max-w-full truncate font-display text-xl font-extrabold uppercase italic tracking-wide">{last}</span>
          <span className="qs-sub mt-0.5 flex max-w-full items-center gap-1 truncate text-[11px]">
            {club && <TeamLogo team={club} size={14} decorative />}
            <span className="truncate">
              {clubName}
              {player.nickname ? <i> · "{player.nickname}"</i> : null}
            </span>
          </span>
        </span>
        {right}
      </span>
    );
  }

  return (
    <span className="relative flex min-w-0 flex-1 items-center gap-3 overflow-hidden py-1.5 pl-1.5 pr-2">
      {watermark}
      <span
        aria-hidden="true"
        className="qs-plate relative flex h-10 w-12 shrink-0 items-center justify-center font-display text-xl font-extrabold italic tabular-nums [clip-path:polygon(14%_0,100%_0,86%_100%,0_100%)]"
      >
        {number}
      </span>
      <span className="relative flex min-w-0 flex-1 flex-col items-start text-left leading-none">
        <span className="flex items-center gap-1.5">
          <span className="qs-pos rounded px-1 py-px font-pixel text-[8px]">{player.position}</span>
          {first && <span className="qs-sub truncate font-pixel text-[9px] uppercase">{first}</span>}
          {hof && <Star className="qs-star h-3 w-3 shrink-0 fill-current" aria-label="Hall of Famer" />}
          {player.isRealLegend && <span className="qs-nfl shrink-0 rounded px-1 py-px font-pixel text-[8px]">NFL</span>}
          <InLeague player={player} />
        </span>
        <span className="qs-name mt-1 max-w-full truncate font-display text-xl font-extrabold uppercase italic tracking-wide">{last}</span>
        {player.nickname && <span className="qs-sub mt-0.5 max-w-full truncate text-[11px] italic">"{player.nickname}"</span>}
      </span>
      {right}
    </span>
  );
};

/**
 * ⌘K / Ctrl+K, "/" and the open event. On a phone the open is flushed inside the tap, so the sheet's input is focused
 * within the user's gesture and iOS raises the keyboard with it.
 */
const useOpenTriggers = (setOpen: (fn: (o: boolean) => boolean) => void) => {
  useEffect(() => {
    const show = () => {
      if (isPhone()) flushSync(() => setOpen(() => true));
      else setOpen(() => true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typingTarget(e.target)) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(QUICK_SEARCH_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(QUICK_SEARCH_EVENT, show);
    };
  }, [setOpen]);
};

/** Is the Deep Dive the page on screen? (read from the hash at the moment it matters) */
const onDeepDive = () => parseHash(window.location.hash)?.sub === 'deepdive';

/**
 * Phones: the full-screen search sheet (search/PlayerSearchSheet.tsx). A pick opens his card; press and hold a row for
 * the quick look (Deep Dive, Head-to-Head...).
 */
const QuickSearchPhone = () => {
  const currentClub = useCurrentClub();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);
  const { league, legends, ovrMap } = useGamePool();
  useOpenTriggers(setOpen);
  const pool = useMemo(() => [...league, ...legends], [league, legends]);
  const suggestions = useMemo((): SheetGroup[] => {
    const ovrOf = (p: Player) => ovrMap.get(playerKey(p)) ?? 0;
    const clubId = findNFLTeam(currentClub)?.id;
    const club = clubId ? league.filter((p) => findNFLTeam(p.team)?.id === clubId && p.status !== 'Retired').sort((a, b) => ovrOf(b) - ovrOf(a)) : [];
    const hof = league.filter((p) => isHallOfFamer(p)).sort((a, b) => b.careerLegacy - a.careerLegacy).slice(0, 8);
    return [
      { id: 'club', label: `${findNFLTeam(currentClub)?.name ?? currentClub ?? 'Club'} roster`, players: club },
      ...(IS_NFL ? [{ id: 'top', label: 'Top players', players: [...league].sort((a, b) => b.careerLegacy - a.careerLegacy).slice(0, 12) }] : []),
      { id: 'hof', label: 'Hall of Fame', players: hof },
    ];
  }, [league, ovrMap, currentClub]);
  return (
    <>
      <PlayerSearchSheet
        open={open}
        onClose={() => setOpen(false)}
        players={pool}
        ovrMap={ovrMap}
        onPick={(p) => {
          setOpen(false);
          // On the Deep Dive the pick loads there (as the desktop hub search does); anywhere else his card opens
          if (onDeepDive() && !p.isRealLegend) openInCompFinder(p);
          else setSelected(p);
        }}
        title={open && onDeepDive() ? 'Deep Dive' : undefined}
        suggestions={suggestions}
        footer={`${league.length} league · ${legends.length} NFL players · 32 clubs`}
        onPickTeam={(t) => {
          setOpen(false);
          openTeamPage(t.name);
        }}
        onPickCollege={(slug) => {
          setOpen(false);
          openSchoolPage(slug);
        }}
        onPickGame={(m) => {
          setOpen(false);
          openGame(m.id);
        }}
      />
      <PlayerDetailCard player={selected} onClose={() => setSelected(null)} />
    </>
  );
};

/** Desktop and tablets: the ⌘K dialog. Phones get the full-screen sheet. */
const QuickPlayerSearch = () => (usePhone() ? <QuickSearchPhone /> : <QuickSearchDialog />);

/**
 * Site-wide player lookup ("scouting terminal"): ⌘K / Ctrl+K or "/" from any page (⌘T belongs to the browser),
 * or the header's search button. Enter opens his card (league cards link to the Deep Dive); Shift+Enter goes
 * straight to the Deep Dive.
 */
const QuickSearchDialog = () => {
  const sprites = useGameSprites();
  // The owner's current club, from the data (coach.json), never hard-coded
  const currentClub = useCurrentClub();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<Position | 'ALL'>('ALL');
  const [active, setActive] = useState('');
  const [recent, setRecent] = useState<string[]>(readRecent);
  // A quick-look action run from a result (press and hold, or right-click) closes the search, like a pick
  useEffect(() => {
    const on = () => setOpen(false);
    window.addEventListener(PEEK_ACTION_EVENT, on);
    return () => window.removeEventListener(PEEK_ACTION_EVENT, on);
  }, []);
  const { league, legends, ovrMap } = useGamePool();
  const { numberFor } = useJerseyNumbers();
  const skills = useSkillRatings();
  const extras = usePlayerExtras();

  useOpenTriggers(setOpen);

  useEffect(() => {
    if (open) setRecent(readRecent());
    else {
      setQuery('');
      setPos('ALL');
    }
  }, [open]);

  // Our own ranked matching (utils/playerSearch.ts): cmdk's filter would score every one of ~3,000 players on each
  // keystroke and render them all. The query is deferred, at most RESULT_LIMIT rows render, and the rest is "keep typing".
  const deferredQuery = useDeferredValue(query);
  const index = useMemo(() => pooledIndex(league, legends, { ovr: ovrMap, formerNames: extras.formerNames }), [league, legends, ovrMap, extras]);
  const byKey = index.byKey;
  const { groups, more } = useMemo(() => {
    const ovrOf = (p: Player) => ovrMap.get(playerKey(p)) ?? 0;
    const byOvr = (a: Player, b: Player) => ovrOf(b) - ovrOf(a) || a.name.localeCompare(b.name);
    const inPos = (p: Player) => pos === 'ALL' || p.position === pos;
    if (!deferredQuery.trim()) {
      const rec = recent.map((k) => byKey.get(k)?.p).filter((p): p is Player => !!p && inPos(p));
      const clubId = findNFLTeam(currentClub)?.id;
      const club = clubId ? league.filter((p) => findNFLTeam(p.team)?.id === clubId && p.status !== 'Retired' && inPos(p)).sort(byOvr).slice(0, 12) : [];
      const hof = league
        .filter((p) => isHallOfFamer(p) && inPos(p))
        .sort((a, b) => b.careerLegacy - a.careerLegacy)
        .slice(0, pos === 'ALL' ? 8 : 12);
      const top = IS_NFL ? league.filter(inPos).sort((a, b) => b.careerLegacy - a.careerLegacy).slice(0, 8) : [];
      return {
        groups: [
          { id: 'recent', label: 'Recently scouted', Icon: Clock, players: rec },
          { id: 'club', label: `Your ${findNFLTeam(currentClub)?.name ?? currentClub}`, Icon: Sparkles, players: club },
          { id: 'top', label: 'Top players', Icon: Star, players: top },
          { id: 'hof', label: 'Hall of Fame', Icon: Star, players: hof },
        ].filter((g) => g.players.length),
        more: 0,
        top: 0,
      };
    }
    const keep = pos === 'ALL' ? undefined : inPos;
    const hits = searchPlayersScored(index, deferredQuery, RESULT_LIMIT + 1, keep);
    const shown = hits.slice(0, RESULT_LIMIT).map((x) => x.e.p);
    return {
      groups: [{ id: 'results', label: 'Players', Icon: Search, players: shown }].filter((g) => g.players.length),
      more: hits.length > RESULT_LIMIT ? 1 : 0,
      top: hits[0]?.s ?? 0,
    };
  }, [deferredQuery, pos, recent, byKey, index, league, ovrMap, currentClub]);

  // Clubs matching the query lead the results; a pick opens its team page (Stats › Teams)
  const clubs = useMemo(() => (pos === 'ALL' ? clubsOfQuery(deferredQuery) : []), [deferredQuery, pos]);

  const meetings = useMeetings(deferredQuery);
  const schools = useCollegeSearch(deferredQuery, pos === 'ALL');
  // Result groups in one fixed order (owner, 2026-11-27): players, then games, then teams, then colleges
  const order = ['players', 'games', 'teams', 'schools'];

  // Typing never scrolls the list (cmdk scrolls its selected item into view when the groups reorder): reset to the
  // top on every query change, and for a moment after it while cmdk re-selects. Arrow keys still scroll the active row.
  const listRef = useRef<HTMLDivElement | null>(null);
  const typedAt = useRef(0);
  const toTop = () => {
    if (listRef.current) listRef.current.scrollTop = 0;
  };
  const onQuery = (v: string) => {
    typedAt.current = performance.now();
    setActive('');
    setQuery(v);
  };
  useLayoutEffect(() => {
    toTop();
    const id = requestAnimationFrame(toTop);
    return () => cancelAnimationFrame(id);
  }, [deferredQuery, meetings.length, clubs.length, schools.length, pos]);

  const activePlayer = active.startsWith('team ') || active.startsWith('game ') || active.startsWith('school ') ? null : byKey.get(active)?.p ?? groups[0]?.players[0] ?? null;

  const choose = (p: Player, deepDive = false) => {
    pushRecent(playerKey(p));
    setOpen(false);
    if (deepDive && !p.isRealLegend) openInCompFinder(p);
    else setSelected(p);
  };

  const blocks: Record<string, ReactNode> = {
    teams: <>
                {clubs.length > 0 && (
                  <CommandGroup
                    heading={
                      <span className="flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-gold" aria-hidden="true" />
                        Teams
                      </span>
                    }
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-pixel [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {clubs.map((t) => (
                      <CommandItem
                        key={`team:${t.id}`}
                        value={`team ${t.name} ${t.city} ${t.fullName} ${t.abbreviation}`}
                        keywords={[t.name]}
                        onSelect={() => {
                          setOpen(false);
                          openTeamPage(t.name);
                        }}
                        className="qs-item my-1 cursor-pointer overflow-hidden rounded-lg p-0"
                        style={teamVars(t.name)}
                      >
                        <span className="relative flex min-w-0 flex-1 items-center gap-3 py-2 pl-2 pr-3">
                          <TeamLogo team={t.name} size={36} decorative />
                          <span className="flex min-w-0 flex-1 flex-col items-start leading-none">
                            <span className="qs-name truncate font-display text-xl font-extrabold uppercase italic tracking-wide">{t.name}</span>
                            <span className="qs-sub mt-1 truncate text-[11px]">
                              {t.city} · {t.conference} {t.division}
                            </span>
                          </span>
                          <span className="qs-sub shrink-0 font-pixel text-[8px] uppercase">Team page</span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
</>,
    schools: <>
                {schools.length > 0 && (
                  <CommandGroup
                    heading={
                      <span className="flex items-center gap-1.5">
                        <GraduationCap className="h-3 w-3 text-gold" aria-hidden="true" />
                        Colleges
                      </span>
                    }
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-pixel [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {schools.map((c) => {
                      const info = markInfo(c);
                      return (
                        <CommandItem
                          key={`school:${c.slug}`}
                          value={`school ${c.name} ${c.s}`}
                          keywords={[c.name]}
                          onSelect={() => {
                            setOpen(false);
                            openSchoolPage(c.slug);
                          }}
                          className="qs-item my-1 cursor-pointer overflow-hidden rounded-lg p-0"
                        >
                          <span className="relative flex min-w-0 flex-1 items-center gap-3 py-2 pl-2 pr-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center">{info && <CollegeMark info={info} size={34} />}</span>
                            <span className="flex min-w-0 flex-1 flex-col items-start leading-none">
                              <span className="qs-name truncate font-display text-xl font-extrabold uppercase italic tracking-wide">{c.name}</span>
                              <span className="qs-sub mt-1 truncate text-[11px]">
                                {c.drafted} drafted · {c.active} active
                              </span>
                            </span>
                            <span className="qs-sub shrink-0 font-pixel text-[8px] uppercase">School page</span>
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
</>,
    games: <>
                {meetings.length > 0 && (
                  <CommandGroup
                    heading={
                      <span className="flex items-center gap-1.5">
                        <Radio className="h-3 w-3 text-gold" aria-hidden="true" />
                        Games
                      </span>
                    }
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-pixel [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {meetings.map((m) => (
                      <MeetingItem
                        key={`game:${m.id}`}
                        m={m}
                        onOpen={() => {
                          setOpen(false);
                          openGame(m.id);
                        }}
                      />
                    ))}
                  </CommandGroup>
                )}
</>,
    players: <>
                {groups.map((g) => (
                  <CommandGroup
                    key={g.id}
                    heading={
                      <span className="flex items-center gap-1.5">
                        <g.Icon className="h-3 w-3 text-gold" aria-hidden="true" />
                        {g.label}
                      </span>
                    }
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:font-pixel [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {g.players.map((p) => {
                      const key = playerKey(p);
                      return (
                        <CommandItem
                          key={`${g.id}:${key}`}
                          value={key}
                          onSelect={() => choose(p)}
                          onPointerDown={() => warmPlayerCard(p)}
                          {...peekProps(p)}
                          className={cn('qs-item my-1 cursor-pointer rounded-lg p-0', sprites && !p.isRealLegend ? 'mt-3 overflow-visible' : 'overflow-hidden')}
                          style={teamVars(bannerTeamOf(p))}
                        >
                          <ResultRow player={p} number={numberFor(p)} ovr={ovrMap.get(key)} grade={skills.get(key)?.grade} />
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}
</>,
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-peek-ok className="qs-root top-[6%] max-h-[calc(var(--safe-h)-3rem)] w-[calc(100vw-1rem)] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:top-[8%]">
          <DialogTitle className="sr-only">Look up a player</DialogTitle>
          <Command
            shouldFilter={false}
            value={active}
            onValueChange={setActive}
            className="bg-transparent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey && activePlayer && !active.startsWith('team ') && !active.startsWith('game ') && !active.startsWith('school ')) {
                e.preventDefault();
                choose(activePlayer, true);
              } else if (e.key === 'Enter' && !e.shiftKey && query.trim() && !listRef.current?.querySelector('[cmdk-item][aria-selected="true"]')) {
                // nothing highlighted yet: Enter takes the top result in the list's order (a player, then a club, then a college)
                e.preventDefault();
                if (activePlayer) choose(activePlayer);
                else if (clubs[0]) {
                  setOpen(false);
                  openTeamPage(clubs[0].name);
                } else if (schools[0]) {
                  setOpen(false);
                  openSchoolPage(schools[0].slug);
                }
              }
            }}
          >
            {/* Header: broadcast-style search bar */}
            <div className="qs-head border-b border-line">
              <div className="flex items-center gap-2 px-4 pr-12 pt-3">
                <span className="font-pixel text-[9px] uppercase text-gold">Retro Vault · Scouting desk</span>
                <span className="ml-auto hidden font-pixel text-[8px] uppercase text-muted-foreground sm:inline">
                  {league.length} league · {legends.length} NFL
                </span>
              </div>
              <CommandInput
                value={query}
                onValueChange={onQuery}
                placeholder="Who are we scouting? A player or a club"
                className="h-12 font-display text-lg tracking-wide placeholder:font-sans placeholder:text-sm"
              />
              <div role="group" aria-label="Filter by position" className="flex gap-1 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none]">
                {(['ALL', ...POSITIONS] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={pos === k}
                    onClick={() => setPos(k)}
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 font-pixel text-[9px] uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                      pos === k ? 'bg-gold text-black' : 'bg-panel-2 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {k === 'ALL' ? 'All' : k}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <CommandList ref={listRef} onScroll={() => performance.now() - typedAt.current < 600 && toTop()} className="max-h-[min(26rem,calc(var(--dvh)*0.55))] overscroll-contain p-1.5">
                <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">No players, clubs, colleges or games match <b>{query.trim()}</b>.</CommandEmpty>
                {order.map((id) => (
                  <Fragment key={id}>{blocks[id]}</Fragment>
                ))}
                {more > 0 && <p className="px-3 py-2 text-center font-pixel text-[9px] uppercase text-muted-foreground">Top {RESULT_LIMIT} shown, keep typing to narrow it</p>}
              </CommandList>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-night/60 px-3 py-2 text-[11px] text-muted-foreground">
              <span>
                <kbd className="rounded border border-line px-1">⌘K</kbd> or <kbd className="rounded border border-line px-1">/</kbd> anywhere
              </span>
              <span>
                <kbd className="rounded border border-line px-1">↵</kbd> card
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-line px-1">⇧↵</kbd> <Radar className="h-3 w-3" aria-hidden="true" /> Deep Dive
              </span>
              <span className="ml-auto">
                <kbd className="rounded border border-line px-1">Esc</kbd> close
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
      <PlayerDetailCard player={selected} onClose={() => setSelected(null)} />
    </>
  );
};

export default QuickPlayerSearch;
