import { ArrowLeftRight } from 'lucide-react';
import { openTrade } from '@/utils/tradeLink';
import './tradeEntry.css';

/** "Trade value": opens the fantasy trade simulator with this player on side one (#lab/trade?p=...). */
const TradeEntry = ({ playerKey, onBefore }: { playerKey: string; /** runs first (the player card closes itself) */ onBefore?: () => void }) => (
  <button type="button" className="fx-trade" onClick={() => { onBefore?.(); openTrade(playerKey); }}>
    <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /> Trade value
  </button>
);

export default TradeEntry;
