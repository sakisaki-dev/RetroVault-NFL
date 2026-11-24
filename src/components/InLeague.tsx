import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { IS_NFL } from '@/config/edition';
import { useInjury } from '@/utils/injuries';
import './inLeague.css';
import { displayName } from '@/utils/displayName';

/**
 * The Active tag (owner: "add in a little in the league rn indicator for the players that are", "An active tag"): a
 * live dot and an ACTIVE tag for players who are active on a club today. Free agents and the games' real NFL legends don't get it. Never on a
 * collectible card's face (cards are timeless); search rows, pickers, game cards and player pages only.
 */
export const isInLeague = (p: Pick<Player, 'status' | 'team'> & { isRealLegend?: boolean }): boolean =>
  p.status === 'Active' && !!p.team && p.team !== 'FA' && !p.isRealLegend;

type Subject = Pick<Player, 'status' | 'team'> & { isRealLegend?: boolean; name?: string; position?: string };

/**
 * The Injured tag (owner: "add in an injured tag similar to the active tag"), NFL edition: the same pill in red (IR,
 * Out) or amber (Doubtful, Questionable), beside the Active tag, from the real injury list (utils/injuries.ts); the body
 * part is only in its tooltip. Same places as Active; never on a card face.
 */
export const InjuredTag = ({ player, label = true, className }: { player: Subject; label?: boolean; className?: string }) => {
  const hurt = useInjury(IS_NFL && player.name && player.position && !player.isRealLegend ? `${player.position}:${displayName(player.name)}` : undefined);
  if (!hurt) return null;
  const warm = hurt.code === 'Doubtful' || hurt.code === 'Questionable';
  const text = hurt.code === 'Questionable' ? 'Quest.' : hurt.code === 'Doubtful' ? 'Doubtful' : hurt.code;
  const title = `${hurt.code === 'IR' ? 'Injured reserve' : hurt.code}${hurt.part ? ` · ${hurt.part}` : ''} (week ${hurt.week} report)`;
  return (
    <span className={cn('inl inl--hurt', warm && 'inl--warm', label && 'inl--label', className)} title={title} aria-label={title} role="img">
      <i aria-hidden="true" />
      {label && <b aria-hidden="true">{text}</b>}
    </span>
  );
};

export const InLeague = ({ player, label = true, className }: { player: Subject; label?: boolean; className?: string }) => {
  const active = isInLeague(player);
  const hurt = IS_NFL ? <InjuredTag player={player} label={label} className={className} /> : null;
  if (!active) return hurt;
  return (
    <>
      <span className={cn('inl', label && 'inl--label', className)} title="Active: in the league now" aria-label="Active" role="img">
        <i aria-hidden="true" />
        {label && <b aria-hidden="true">Active</b>}
      </span>
      {hurt}
    </>
  );
};

export default InLeague;
