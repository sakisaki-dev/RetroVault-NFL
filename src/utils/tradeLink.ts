/**
 * Entry points to the fantasy trade simulator (#lab/trade, components/trade/TradeSim.tsx): the player card's fantasy strip
 * and the Deep Dive's Fantasy section open it with the player on side one. Setting the hash is all it takes (the hub's
 * router follows hashchange, and the Team Lab shows the simulator for the trade route).
 */
export const tradeHash = (key?: string | null) => `#lab/trade${key ? `?p=${encodeURIComponent(key)}` : ''}`;
export const openTrade = (key?: string | null) => {
  window.location.hash = tradeHash(key);
};
