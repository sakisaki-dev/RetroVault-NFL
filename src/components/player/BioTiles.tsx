import { Ruler } from 'lucide-react';
import type { Player } from '@/types/player';
import { useBioInfo } from '@/utils/bioInfo';
import { useInjury } from '@/utils/injuries';
import { displayName } from '@/utils/displayName';
import { cn } from '@/lib/utils';

/** Active / Injured reserve / Retired (plus a game-day tag when he is listed Questionable, Doubtful or Out). */
export const useStatusLabel = (player: Pick<Player, 'status' | 'team' | 'name' | 'position' | 'isRealLegend'>): { label: string; tone: 'on' | 'hurt' | 'off' } | null => {
  const hurt = useInjury(player.status === 'Active' && !player.isRealLegend ? `${player.position}:${displayName(player.name)}` : undefined);
  if (player.status === 'Retired') return { label: 'Retired', tone: 'off' };
  if (player.status !== 'Active') return null;
  if (hurt?.code === 'IR') return { label: 'Injured reserve', tone: 'hurt' };
  if (!player.team || player.team === 'FA') return { label: 'Free agent', tone: 'on' };
  return hurt ? { label: `Active · ${hurt.code}`, tone: 'hurt' } : { label: 'Active', tone: 'on' };
};

/**
 * One wide Bio tile for the player card's identity row: height, weight and age as three Barlow figures (birth date on
 * hover) and his status. Data: bio.json (nflverse players). Nothing off the NFL edition or with no record.
 */
const BioTile = ({ player }: { player: Player }) => {
  const bio = useBioInfo(`${player.position}:${player.name}`);
  const status = useStatusLabel(player);
  if (!bio || (!bio.height && !bio.weight && bio.age == null)) return null;
  const figs: Array<[string, string, string?]> = [];
  if (bio.height) figs.push(['Height', bio.height]);
  if (bio.weight) figs.push(['Weight', `${bio.weight}`, 'lbs']);
  if (bio.age != null) figs.push(['Age', `${bio.age}`, bio.bornLabel ? `born ${bio.bornLabel}` : undefined]);
  return (
    <div className="pc-tile pc-tile--bio" title={bio.bornLabel ? `Born ${bio.bornLabel}` : undefined}>
      {figs.map(([k, v, sub]) => (
        <div key={k} className="pc-bio__fig">
          <span className="pc-tile__k">{k}</span>
          <span className="pc-bio__v">{v}</span>
          {sub && <span className="pc-bio__sub">{sub}</span>}
        </div>
      ))}
      {status && (
        <div className="pc-bio__fig">
          <span className="pc-tile__k">Status</span>
          <span className={cn('pc-bio__status', `pc-bio__status--${status.tone}`)}>{status.label}</span>
        </div>
      )}
    </div>
  );
};

/** Height / weight / age and status as pills for the Deep Dive hero, in the college and draft pills' format. */
export const BioPills = ({ player }: { player: Player }) => {
  const bio = useBioInfo(`${player.position}:${player.name}`);
  const status = useStatusLabel(player);
  const pill = 'inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2 py-0.5 text-xs';
  return (
    <>
      {bio && (bio.height || bio.weight) && (
        <span className={pill} title="Height and weight">
          <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{[bio.height, bio.weight ? `${bio.weight} lbs` : null].filter(Boolean).join(' · ')}</span>
        </span>
      )}
      {bio && bio.age != null && (
        <span className={pill} title={bio.bornLabel ? `Born ${bio.bornLabel}` : 'Age'}>
          <span>Age {bio.age}</span>
        </span>
      )}
      {status && status.tone === 'hurt' && (
        <span className={cn(pill, 'border-flag/50 text-flag')} title="Roster status">
          <span>{status.label}</span>
        </span>
      )}
    </>
  );
};

export default BioTile;
