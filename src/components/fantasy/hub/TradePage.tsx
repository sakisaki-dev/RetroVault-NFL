import TradeDesk from '@/components/trade/TradeDesk';
import type { useTradeEnv } from '@/components/trade/useTrade';

/** The Fantasy page's Trade sub-page (its own chunk): the Trade Desk on the page's shared league format. */
const TradePage = ({ env, onLeague, leagueSummary }: { env: ReturnType<typeof useTradeEnv>; onLeague?: () => void; leagueSummary?: string }) => (
  <TradeDesk env={env} onLeague={onLeague} leagueSummary={leagueSummary} />
);

export default TradePage;
