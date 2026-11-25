import { createContext, lazy, Suspense, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Player } from '@/types/player';

const PlayerDetailCard = lazy(() => import('@/components/PlayerDetailCard'));

/** One player card for the whole Fantasy page: any player name or sprite opens it (a hold gives the quick look through data-player-key). */
const Ctx = createContext<(key: string) => void>(() => {});
export const useOpenCard = () => useContext(Ctx);

export const CardHost = ({ find, children }: { find: (key: string) => Player | undefined; children: ReactNode }) => {
  const [card, setCard] = useState<Player | null>(null);
  const open = useMemo(() => (key: string) => {
    const p = find(key);
    if (p) setCard(p);
  }, [find]);
  return (
    <Ctx.Provider value={open}>
      {children}
      {card && <Suspense fallback={null}><PlayerDetailCard player={card} onClose={() => setCard(null)} /></Suspense>}
    </Ctx.Provider>
  );
};
