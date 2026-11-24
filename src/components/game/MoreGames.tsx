import { SectionHeader, ScoreTile } from '@/components/arcade';
import { gameHash, useSeasonGames, type GameDetail } from '@/utils/nflGames';
import { played, roundLabel } from './gameModel';

/** The rest of this game's week (or its postseason round): every game as a small score chip linking to its page. */
const MoreGames = ({ g }: { g: GameDetail }) => {
  const all = useSeasonGames(g.season);
  const same = (all ?? []).filter((x) => (g.type === 'REG' ? x.type === 'REG' && x.week === g.week : x.type !== 'REG' && x.type === g.type) && x.id !== g.id);
  if (!same.length) return null;
  return (
    <section aria-labelledby="gm-more-h" className="space-y-3">
      <SectionHeader title={<span id="gm-more-h">More from {g.type === 'REG' ? `week ${g.week}` : roundLabel(g).replace(/^\d+ /, '')}</span>} kicker="Around the league" />
      <ul className="gm-more">
        {same.map((x) => (
          <li key={x.id}>
            <ScoreTile
              away={{ club: x.away, score: played(x) ? x.awayScore : null }}
              home={{ club: x.home, score: played(x) ? x.homeScore : null }}
              onClick={() => { window.location.hash = gameHash(x.id); }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
};

export default MoreGames;
