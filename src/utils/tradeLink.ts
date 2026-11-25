/**
 * Entry points to the fantasy trade simulator (#fantasy/trade, components/fantasy/hub): the player card's fantasy strip
 * and the Deep Dive's Fantasy section open it with the player on side one. Setting the hash is all it takes (the hub's
 * router follows hashchange).
 */
export const tradeHash = (key?: string | null) => `#fantasy/trade${key ? `?p=${encodeURIComponent(key)}` : ''}`;
export const openTrade = (key?: string | null) => {
  window.location.hash = tradeHash(key);
};
