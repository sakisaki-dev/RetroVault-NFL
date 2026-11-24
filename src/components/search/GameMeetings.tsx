import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Radio } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { CommandItem } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { findNFLTeam } from '@/utils/nflTeams';
import { loadGameIds, useSeasonGames, type GameIds } from '@/utils/nflGames';
import { clubPairOf, meetingsOf, weekLabelOf, type Meeting } from '@/utils/gameFinder';
import { IS_NFL } from '@/config/edition';

/**
 * Quick search, NFL edition: two club names or abbreviations ("bengals commanders", "cin was") list their most recent
 * meetings, newest first. Built from ids.json only (loaded once, 230 KB), so no season file loads for a search.
 */
export const useMeetings = (query: string, limit = 5): Meeting[] => {
  const pair = useMemo(() => (IS_NFL ? clubPairOf(query) : null), [query]);
  const [ids, setIds] = useState<GameIds | null>(null);
  useEffect(() => {
    if (!pair) return;
    let live = true;
    void loadGameIds().then((v) => live && setIds(v));
    return () => {
      live = false;
    };
  }, [pair]);
  return useMemo(() => (pair && ids ? meetingsOf(ids, pair[0], pair[1], limit).map((m) => ({ ...m, first: pair[0] })) : []), [pair, ids, limit]);
};

/** A meeting's score from its season file, and the colour of the winning club (the home club until it is played). */
const useMeetingResult = (m: Meeting) => {
  const games = useSeasonGames(m.season);
  const g = games?.find((x) => x.id === m.id);
  const done = g?.awayScore !== undefined && g?.homeScore !== undefined;
  const a = g?.awayScore ?? 0;
  const h = g?.homeScore ?? 0;
  const win: 'away' | 'home' | null = done && a !== h ? (a > h ? 'away' : 'home') : null;
  const tone = win === 'away' ? m.away : m.home;
  const colors = findNFLTeam(tone);
  return { done, a, h, win, colors };
};
const abbr = (club: string) => findNFLTeam(club)?.abbreviation ?? club;

/** The row's content, shaped like the Teams rows: logos, a Barlow main line ("CIN 20 · WAS 22", the winner bold) and a small secondary line. */
const MeetingBody = ({ m, r, sheet }: { m: Meeting; r: ReturnType<typeof useMeetingResult>; sheet?: boolean }) => (
  <>
    <span className="flex flex-none items-center gap-1" aria-hidden>
      <TeamLogo team={m.away} size={sheet ? 28 : 30} decorative />
      <TeamLogo team={m.home} size={sheet ? 28 : 30} decorative />
    </span>
    <span className={cn('flex min-w-0 flex-1 flex-col items-start leading-none', sheet && 'ss-team__text')}>
      <span className={cn('truncate font-display text-xl uppercase tracking-wide', sheet && 'ss-team__name', !sheet && 'qs-name')} style={{ fontStyle: 'normal' }}>
        <span className={r.win === 'away' ? 'font-extrabold' : 'font-medium opacity-80'}>
          {abbr(m.away)}
          {r.done ? ` ${r.a}` : ''}
        </span>
        <span className="font-medium opacity-60">{r.done ? ' · ' : ' at '}</span>
        <span className={r.win === 'home' ? 'font-extrabold' : 'font-medium opacity-80'}>
          {abbr(m.home)}
          {r.done ? ` ${r.h}` : ''}
        </span>
      </span>
      <span className={cn('mt-1 truncate text-[11px]', sheet ? 'ss-team__sub' : 'qs-sub')} style={sheet ? { fontSize: 12 } : undefined}>
        {m.season} · {weekLabelOf(m.season, m.week)}
        {r.done ? ' · Final' : ''}
      </span>
    </span>
  </>
);

const toneVars = (r: ReturnType<typeof useMeetingResult>, key: '--qs-1' | '--ss-1') =>
  ({ [key]: r.colors ? `hsl(${r.colors.primaryColor})` : 'hsl(var(--line))' }) as CSSProperties;

/** Dialog row (inside a cmdk group). */
export const MeetingItem = ({ m, onOpen }: { m: Meeting; onOpen: () => void }) => {
  const r = useMeetingResult(m);
  return (
    <CommandItem value={`game ${m.id}`} aria-label={meetingLabel(m)} onSelect={onOpen} className="qs-item my-1 cursor-pointer overflow-hidden rounded-lg p-0" style={toneVars(r, '--qs-1')}>
      <span className="relative flex min-w-0 flex-1 items-center gap-3 py-2 pl-2 pr-3">
        <MeetingBody m={m} r={r} />
        <span className="qs-sub shrink-0 font-pixel text-[8px] uppercase">Game</span>
      </span>
    </CommandItem>
  );
};

/** Phone sheet row. */
export const MeetingButton = ({ m, onOpen }: { m: Meeting; onOpen: () => void }) => {
  const r = useMeetingResult(m);
  return (
    <button type="button" className="ss-team" style={toneVars(r, '--ss-1')} aria-label={meetingLabel(m)} onClick={onOpen}>
      <MeetingBody m={m} r={r} sheet />
      <span className="ss-team__go">Game</span>
    </button>
  );
};

export const meetingLabel = (m: Meeting) => `${findNFLTeam(m.away)?.fullName ?? m.away} at ${findNFLTeam(m.home)?.fullName ?? m.home}, ${m.season} ${weekLabelOf(m.season, m.week)}`;
export const GamesIcon = Radio;
