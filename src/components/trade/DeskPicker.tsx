import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import PlayerSearchSheet from '@/components/search/PlayerSearchSheet';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { f1 } from '@/utils/fantasy';
import { keyOfPlayer } from '@/utils/playerSearch';
import { useGamePool } from '@/utils/useOfficialOvr';
import { SCORING_LABEL, type TradeModel } from '@/utils/tradeSim';

/**
 * "Add player" on a locker: opens the site's search sheet (the header search's: field pinned on top, results right under
 * it, a centred dock panel from 768px, full screen on a phone), restricted to the fantasy pool not already in the trade.
 * It used to open inline in the locker column, where the stage's overflow clip and the first screen's bottom edge cut the
 * results off before any rows showed. Each row keeps the desk's figures: position rank, points a game, rest of season and
 * value. The sheet stays open after a pick so several players go in a row; Escape or the close button ends it.
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
  const byKey = useMemo(() => new Map(pool.map((x) => [keyOfPlayer(x.pl), x.key])), [pool]);
  const suggestions = useMemo(() => [{ id: 'best', label: 'Best values', players: players.slice(0, 20) }], [players]);
  const extra = useCallback(
    (pl: Player) => {
      const tp = model.players.get(byKey.get(keyOfPlayer(pl)) ?? '');
      return tp ? (
        <span className="ss-extra dk-ex">
          <em>{tp.pos}{tp.posRank}</em>
          <span>{f1(tp.ppg)}<i>{unit}/g</i></span>
          <span>{tp.ros.toFixed(0)}<i>ROS</i></span>
          <span className={tp.value > 0 ? 'is-val' : 'is-zero'}>{tp.value.toFixed(0)}<i>Value</i></span>
        </span>
      ) : null;
    },
    [model, byKey, unit],
  );

  return (
    <>
      <button type="button" className={cn('dk-add', big && 'dk-add--big')} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <Plus className="h-4 w-4" aria-hidden="true" /><span>{label}</span>
      </button>
      {open && createPortal(
        <PlayerSearchSheet
          open
          onClose={() => setOpen(false)}
          players={players}
          ovrMap={ovrMap}
          onPick={(p) => { const k = byKey.get(keyOfPlayer(p)); if (k) onPick(k); }}
          title="Trade desk"
          word={label}
          placeholder="Name, nickname, club or city"
          suggestions={suggestions}
          extra={extra}
          showActive
          peek={false}
          dock
        />,
        document.body,
      )}
    </>
  );
};
