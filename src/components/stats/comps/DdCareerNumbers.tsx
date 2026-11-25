import type { CSSProperties } from 'react';
import type { Player } from '@/types/player';
import { Reveal, stag } from '@/components/motion/Reveal';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { headlineStats } from '@/components/player/statLines';
import { useSeasonView } from '@/components/player/seasonView';

const fmt = (v: number, d: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Career numbers, above the style hexagon. The banner shows an active player's season, so this is where his career totals
 * (what the banner used to carry, plus rating, TD:INT, rings and games) stay one glance away. Same plaque and tiles as the
 * live-season header (.ts). Active players with a season line only: a retired player's banner already shows career.
 */
const DdCareerNumbers = ({ player }: { player: Player }) => {
  const sv = useSeasonView(player);
  if (!sv) return null;
  const club = findNFLTeam(sv.line.club === 'LA' ? 'LAR' : sv.line.club);
  const tiles = [
    ...headlineStats(player).map((s) => ({ key: s.key, label: s.label.replace(/^Career /, ''), value: s.value, d: s.decimals ?? 0 })),
    { key: 'rings', label: player.rings === 1 ? 'Ring' : 'Rings', value: player.rings ?? 0, d: 0 },
    { key: 'games', label: 'Games', value: player.games, d: 0 },
  ];
  return (
    <Reveal className="ts" style={{ '--tc': club ? `hsl(${club.primaryColor})` : 'hsl(var(--gold))' } as CSSProperties} aria-label="Career numbers">
      <div className="ts__head mo-rise" style={stag(0)}>
        {club && <TeamLogo team={club} size={30} decorative backed />}
        <div className="min-w-0">
          <div className="ts__k">Career</div>
          <div className="ts__s">Totals through last season and this one</div>
        </div>
      </div>
      <div className="ts__tiles ts__tiles--n" style={{ '--n': tiles.length } as CSSProperties}>
        {tiles.map((t, i) => (
          <div key={t.key} className="ts__tile mo-rise" style={stag(i + 1)}>
            <span className="ts__tk">{t.label}</span>
            <span className="ts__tv">{t.value == null ? '—' : fmt(t.value, t.d)}</span>
          </div>
        ))}
      </div>
    </Reveal>
  );
};

export default DdCareerNumbers;
