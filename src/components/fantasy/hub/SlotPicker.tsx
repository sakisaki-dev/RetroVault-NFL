import { createPortal } from 'react-dom';
import { useCallback, useMemo, useState } from 'react';
import PlayerSearchSheet from '@/components/search/PlayerSearchSheet';
import { useGamePool } from '@/utils/useOfficialOvr';
import type { Player } from '@/types/player';
import { keyOfPlayer } from '@/utils/playerSearch';
import { projectWeek, salaryOf, type FSlot } from '@/utils/nflFantasy';
import type { FantasyHub } from './useFantasyHub';
import { f1, isBenchId } from './useFantasyHub';
import { ArcadeToggle } from '@/components/arcade';

/** Fills one lineup slot with the site's search sheet (the header search's: field pinned on top, results right under it,
 *  sized to the visual viewport so the keyboard never covers them, fixed height while typing; a centred panel from 768px).
 *  Players who can play the slot, best projection first; a defence for D/ST; the bench takes players (kickers included)
 *  or a defence. */
const SlotPicker = ({ hub, slot, onClose }: { hub: FantasyHub; slot: FSlot | null; onClose: () => void }) => {
  const { ctx, lab, fl, setFl, excludes, fctx, week, setF } = hub;
  const value = slot ? fl[slot.id] ?? '' : '';
  const bench = !!slot && isBenchId(slot.id);
  const [benchKind, setBenchKind] = useState<'players' | 'dst'>('players');
  const dst = slot?.id === 'dst' || (bench && benchKind === 'dst');
  const pool = useMemo(() => {
    if (!slot || slot.id === 'dst' || !fctx) return [];
    const positions = bench ? ['QB', 'RB', 'WR', 'TE', 'K'] : (slot.positions as string[]);
    const used = new Set(Object.values(fl).filter(Boolean));
    return positions
      .flatMap((pos) => ctx.byPos.get(pos as never) ?? [])
      .filter((p) => lab?.p[p.key] && !excludes.has(p.key) && (!used.has(p.key) || p.key === value))
      .map((p) => ({ p, v: projectWeek(fctx, p.key, week) }))
      .sort((a, b) => b.v - a.v);
  }, [slot, bench, ctx, lab, fl, excludes, fctx, week, value]);
  const players = useMemo(() => pool.map((x) => x.p.player), [pool]);
  const byKey = useMemo(() => new Map(pool.map((x) => [keyOfPlayer(x.p.player), x])), [pool]);
  const suggestions = useMemo(() => [{ id: 'best', label: 'Best this week', players: players.slice(0, 20) }], [players]);
  const { ovrMap } = useGamePool();
  const extra = useCallback(
    (pl: Player) => {
      const x = byKey.get(keyOfPlayer(pl));
      return x ? <span className="ss-extra">{f1(x.v)} pts<i>{lab ? `$${salaryOf(lab, x.p.key)}` : ''}</i></span> : null;
    },
    [byKey, lab],
  );
  const close = () => {
    setBenchKind('players');
    onClose();
  };
  const done = (key: string) => {
    if (slot) setFl((l) => setF(l, slot.id, key));
    close();
  };
  if (!slot) return null;
  return createPortal(
    <PlayerSearchSheet
      open
      onClose={close}
      players={dst ? [] : players}
      ovrMap={ovrMap}
      onPick={(p) => done(keyOfPlayer(p))}
      title="Fantasy"
      word={dst ? 'Pick a defence' : `Pick ${slot.label}`}
      placeholder={dst ? 'Club, city or abbreviation' : 'Name, nickname, club or city'}
      suggestions={suggestions}
      selectedKey={value || undefined}
      extra={extra}
      hidePositions
      dock
      mode={dst ? 'dst' : 'players'}
      defence={
        dst
          ? {
              onPick: (t) => done(`DST:${t.abbreviation}`),
              extra: (t) => <span className="ss-extra">${lab ? salaryOf(lab, `DST:${t.abbreviation}`) : 0}</span>,
            }
          : undefined
      }
      subheader={
        bench ? (
          <ArcadeToggle<'players' | 'dst'> fill label="Bench pick" size="sm" value={benchKind} onChange={setBenchKind} options={[{ value: 'players', label: 'Players' }, { value: 'dst', label: 'Defences' }]} />
        ) : undefined
      }
    />,
    document.body,
  );
};

export default SlotPicker;
