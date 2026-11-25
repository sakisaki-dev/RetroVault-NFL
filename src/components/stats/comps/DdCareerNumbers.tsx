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
  // owner: "we can make a couple big and resize the boxes so everything sits nicer". Two tiers: his headline numbers
  // (the first three tiles: e.g. pass yds, pass TD, INT) big across the top; the rest (rates, rings, games) smaller in a
  // second row, every row filled evenly.
  const n = tiles.length;
  const big = tiles.slice(0, Math.min(3, n));
  const small = tiles.slice(big.length);
  const k = small.length;
  // phone: the small tiles 3 or 2 across, whichever divides them (else 3, the last spanning what's left)
  const mcols = k % 3 === 0 ? 3 : k % 2 === 0 ? 2 : 3;
  const lastSpanM = mcols - ((k - 1) % mcols);
  return (
    <Reveal className="ts" style={{ '--tc': club ? `hsl(${club.primaryColor})` : 'hsl(var(--gold))' } as CSSProperties} aria-label="Career numbers">
      <div className="ts__head mo-rise" style={stag(0)}>
        {club && <TeamLogo team={club} size={30} decorative backed />}
        <div className="min-w-0">
          <div className="ts__k">Career</div>
          <div className="ts__s">Totals through last season and this one</div>
        </div>
      </div>
      <div className="ts__career">
        <div className="ts__career-big" style={{ '--n': big.length } as CSSProperties}>
          {big.map((t, i) => (
            <div key={t.key} className="ts__tile ts__tile--big mo-rise" style={stag(i + 1)}>
              <span className="ts__tk">{t.label}</span>
              <span className="ts__tv">{t.value == null ? '—' : fmt(t.value, t.d)}</span>
            </div>
          ))}
        </div>
        {k > 0 && (
          <div className="ts__career-small" style={{ '--k': k, '--mcols': mcols } as CSSProperties}>
            {small.map((t, i) => (
              <div
                key={t.key}
                className="ts__tile ts__tile--small mo-rise"
                style={{ ...stag(big.length + i + 1), ...(i === k - 1 ? { '--sp-m': lastSpanM } : {}) } as CSSProperties}
              >
                <span className="ts__tk">{t.label}</span>
                <span className="ts__tv">{t.value == null ? '—' : fmt(t.value, t.d)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Reveal>
  );
};

export default DdCareerNumbers;
