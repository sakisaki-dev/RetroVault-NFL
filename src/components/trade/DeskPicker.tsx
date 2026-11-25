import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import PlayerSearchSheet from '@/components/search/PlayerSearchSheet';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { f1 } from '@/utils/fantasy';
import { useGamePool } from '@/utils/useOfficialOvr';
import { SCORING_LABEL, type TradeModel } from '@/utils/tradeSim';

/**
 * "Add player" on a locker: the site's own player search (the header search's sheet and banner rows; clubs, cities and
 * nicknames search too), restricted to the fantasy pool not already in the trade. Each row keeps the desk's extra stats:
 * position rank, points a game, rest of season and value. A centred panel from 768px, full screen on a phone.
 */
export const DeskPicker = ({ model, cards, taken, onPick, label, big }: { model: TradeModel; cards: Map<string, Player>; taken: Set<string>; onPick: (k: string) => void; label: string; big?: boolean }) => {
  const [open, setOpen] = useState(false);
  const { ovrMap } = useGamePool();
  const unit = SCORING_LABEL[model.settings.scoring];
  const pool = useMemo(() => {
    if (!open) return [];
    const out: { pl: Player; key: string }[] = [];
    model.ranked.forEach((tp) => {
      const pl = cards.get(tp.key);
      if (pl && !taken.has(tp.key)) out.push({ pl, key: tp.key });
    });
    return out;
  }, [open, model, cards, taken]);
  const players = useMemo(() => pool.map((x) => x.pl), [pool]);
  const byPlayer = useMemo(() => new Map(pool.map((x) => [x.pl, x.key])), [pool]);
  const suggestions = useMemo(() => [{ id: 'best', label: 'Best values', players: players.slice(0, 20) }], [players]);
  const extra = useCallback((pl: Player) => {
    const tp = model.players.get(byPlayer.get(pl) ?? '');
    if (!tp) return null;
    return (
      <span className="ss-extra dk-ex">
        <em>{tp.pos}{tp.posRank}</em>
        <span>{f1(tp.ppg)}<i>{unit}/g</i></span>
        <span>{tp.ros.toFixed(0)}<i>ROS</i></span>
        <span className="is-gold">{tp.value.toFixed(0)}<i>Value</i></span>
      </span>
    );
  }, [model, byPlayer, unit]);
  return (
    <>
      <button type="button" className={cn('dk-add', big && 'dk-add--big')} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Plus className="h-4 w-4" aria-hidden="true" /><span>{label}</span>
      </button>
      {open && createPortal(
        <PlayerSearchSheet
          open
          onClose={() => setOpen(false)}
          players={players}
          ovrMap={ovrMap}
          onPick={(p) => { const k = byPlayer.get(p); setOpen(false); if (k) onPick(k); }}
          title="Trade desk"
          word={label}
          placeholder="Name, nickname, club or city"
          suggestions={suggestions}
          showOvr={false}
          extra={extra}
          hidePositions
          dock
        />,
        document.body,
      )}
    </>
  );
};
