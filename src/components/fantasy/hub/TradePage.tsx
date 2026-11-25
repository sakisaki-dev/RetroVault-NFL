import TradeSim from '@/components/trade/TradeSim';
import type { useTradeEnv } from '@/components/trade/useTrade';

/** The Fantasy page's Trade sub-page (its own chunk): the trade simulator on the page's shared league format. */
const TradePage = ({ env }: { env: ReturnType<typeof useTradeEnv> }) => <TradeSim env={env} />;

export default TradePage;
