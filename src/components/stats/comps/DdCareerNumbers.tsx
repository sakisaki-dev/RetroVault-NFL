import { cn } from '@/lib/utils';
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
  const head = headlineStats(player).map((s) => ({ key: s.key, label: s.label.replace(/^Career /, ''), value: s.value, d: s.decimals ?? 0 }));
  const tiles = [
    ...head,
    { key: 'rings', label: player.rings === 1 ? 'Ring' : 'Rings', value: player.rings ?? 0, d: 0 },
    // games once (the headline tiles may already carry it)
    ...(head.some((t) => t.key === 'games') ? [] : [{ key: 'games', label: 'Games', value: player.games, d: 0 }]),
  ];
  // rows that fill: a column count that divides the tiles (5, 4 or 3 across on a desktop, 3 or 2 on a phone); when
  // none divides, the last tile spans the leftover cells (owner: "numbers overflow and look too condensed")
  const n = tiles.length;
  // owner: two rows on a desktop ("condense into 2 rows"), three across on a phone
  const cols = n <= 6 ? n : Math.ceil(n / 2);
  const mcols = 3;
  const spanD = cols - ((n - 1) % cols);
  const spanM = mcols - ((n - 1) % mcols);
  return (
    <Reveal className="ts" style={{ '--tc': club ? `hsl(${club.primaryColor})` : 'hsl(var(--gold))' } as CSSProperties} aria-label="Career numbers">
      <div className="ts__head mo-rise" style={stag(0)}>
        {club && <TeamLogo team={club} size={30} decorative backed />}
        <div className="min-w-0">
          <div className="ts__k">Career</div>
          <div className="ts__s">Totals through last season and this one</div>
        </div>
      </div>
      <div className="ts__tiles ts__tiles--career" style={{ '--cols': cols, '--mcols': mcols } as CSSProperties}>
        {tiles.map((t, i) => (
          <div
            key={t.key}
            className={cn('ts__tile mo-rise', i === n - 1 && 'ts__tile--last')}
            style={{ ...stag(i + 1), ...(i === n - 1 ? { '--sp-d': spanD, '--sp-m': spanM } : {}) } as CSSProperties}
          >
            <span className="ts__tk">{t.label}</span>
            <span className="ts__tv">{t.value == null ? '—' : fmt(t.value, t.d)}</span>
          </div>
        ))}
      </div>
    </Reveal>
  );
};

export default DdCareerNumbers;
