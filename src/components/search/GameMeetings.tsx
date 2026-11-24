import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { loadGameIds, type GameIds } from '@/utils/nflGames';
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
  return useMemo(() => (pair && ids ? meetingsOf(ids, pair[0], pair[1], limit) : []), [pair, ids, limit]);
};

export const MeetingRow = ({ m }: { m: Meeting }) => (
  <span className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2 pr-3">
    <TeamLogo team={m.away} size={26} decorative />
    <span className="font-display text-base font-extrabold uppercase">{m.away}</span>
    <span className="font-pixel text-[8px] text-muted-foreground">@</span>
    <span className="font-display text-base font-extrabold uppercase">{m.home}</span>
    <TeamLogo team={m.home} size={26} decorative />
    <span className="ml-auto flex-shrink-0 text-right font-pixel text-[8px] uppercase leading-tight text-muted-foreground">
      {m.season}<br />{weekLabelOf(m.season, m.week)}
    </span>
  </span>
);

export const meetingLabel = (m: Meeting) => `${findNFLTeam(m.away)?.fullName ?? m.away} at ${findNFLTeam(m.home)?.fullName ?? m.home}, ${m.season} ${weekLabelOf(m.season, m.week)}`;
export const GamesIcon = Radio;
