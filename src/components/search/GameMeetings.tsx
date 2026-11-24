import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { ClubBadge, LedDigits } from '@/components/arcade';
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

export const MeetingRow = ({ m }: { m: Meeting }) => {
  const games = useSeasonGames(m.season);
  const g = games?.find((x) => x.id === m.id);
  const done = g?.awayScore !== undefined && g?.homeScore !== undefined;
  const firstHome = !!m.first && m.first === m.home;
  const a = g?.awayScore ?? 0;
  const h = g?.homeScore ?? 0;
  const mine = firstHome ? h : a;
  const theirs = firstHome ? a : h;
  const r = !done || !m.first ? null : mine > theirs ? 'W' : mine < theirs ? 'L' : 'T';
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 pr-3">
      <span className={cn('flex h-6 w-6 flex-none items-center justify-center border-2 font-display text-sm font-bold', r === 'W' ? 'border-[hsl(145_63%_62%)] bg-[hsl(145_63%_42%)] text-[#04140a]' : r === 'L' ? 'border-[hsl(357_80%_74%)] bg-[hsl(357_80%_58%)] text-white' : 'border-white/20 bg-white/10 text-muted-foreground')} aria-hidden>
        {r ?? '–'}
      </span>
      <ClubBadge club={m.away} size="sm" />
      {done ? <LedDigits value={`${a}-${h}`} dot={2} label={`${a} to ${h}`} className="flex-none" /> : <span className="font-pixel text-[8px] text-muted-foreground">@</span>}
      <ClubBadge club={m.home} size="sm" />
      <span className="ml-auto flex flex-shrink-0 flex-col items-end gap-1 text-right font-pixel text-[8px] uppercase leading-tight text-muted-foreground">
        {done && <b className="border border-[hsl(var(--gold)/0.7)] px-1 py-0.5 font-normal text-[hsl(var(--gold))]">Final</b>}
        <span>{m.season} · {weekLabelOf(m.season, m.week)}</span>
      </span>
    </span>
  );
};

export const meetingLabel = (m: Meeting) => `${findNFLTeam(m.away)?.fullName ?? m.away} at ${findNFLTeam(m.home)?.fullName ?? m.home}, ${m.season} ${weekLabelOf(m.season, m.week)}`;
export const GamesIcon = Radio;
