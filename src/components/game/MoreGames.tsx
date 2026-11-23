import { Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { gameHash, useSeasonGames, type GameDetail } from '@/utils/nflGames';
import { hslOf } from '../season/seasonGamesUi';
import { played, roundLabel, winnerOf } from './gameModel';

/** The rest of this game's week (or its postseason round): every game as a small score chip linking to its page. */
const MoreGames = ({ g }: { g: GameDetail }) => {
  const all = useSeasonGames(g.season);
  const same = (all ?? []).filter((x) => (g.type === 'REG' ? x.type === 'REG' && x.week === g.week : x.type !== 'REG' && x.type === g.type) && x.id !== g.id);
  if (!same.length) return null;
  return (
    <section aria-labelledby="gm-more-h" className="space-y-3">
      <h2 id="gm-more-h" className="flex items-center gap-2 border-b border-[hsl(var(--line)/0.6)] pb-1.5 font-display text-xl font-bold uppercase tracking-wide">
        <Globe2 className="h-5 w-5 text-[hsl(var(--gold))]" aria-hidden /> More from {g.type === 'REG' ? `week ${g.week}` : roundLabel(g).replace(/^\d+ /, '')}
      </h2>
      <ul className="gm-more">
        {same.map((x) => {
          const w = winnerOf(x);
          return (
            <li key={x.id}>
              <a href={gameHash(x.id)} style={{ ['--ca' as string]: hslOf(x.away), ['--ch' as string]: hslOf(x.home) }}>
                {([0, 1] as const).map((s) => {
                  const abbr = s === 0 ? x.away : x.home;
                  return (
                    <span key={s} className={cn('gm-more__row', played(x) && w !== null && w !== s && 'is-lost')}>
                      <TeamLogo team={abbr} decorative className="h-5 w-5" />
                      <b>{abbr}</b>
                      <i>{played(x) ? (s === 0 ? x.awayScore : x.homeScore) : ''}</i>
                    </span>
                  );
                })}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default MoreGames;
