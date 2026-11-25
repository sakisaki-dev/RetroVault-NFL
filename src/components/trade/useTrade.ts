import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import { displayName } from '@/utils/displayName';
import { useFantasyRaw } from '@/utils/fantasy';
import { useInjuryList } from '@/utils/injuries';
import { useMarketLatest } from '@/utils/useMarket';
import { buildTradeModel, DEFAULT_SETTINGS, type Status, type TradeModel, type TradeSettings } from '@/utils/tradeSim';
import type { FanRaw } from '@/utils/fantasy';

const KEY = 'retroVault:nflTrade:settings';
const readSettings = (): TradeSettings => {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<TradeSettings>) : {};
    return {
      scoring: v.scoring === 'half' || v.scoring === 'std' ? v.scoring : 'ppr',
      teams: v.teams === 10 || v.teams === 14 ? v.teams : 12,
      superflex: !!v.superflex,
      tePremium: !!v.tePremium,
      playoffWeight: v.playoffWeight === 1 || v.playoffWeight === 2 ? v.playoffWeight : DEFAULT_SETTINGS.playoffWeight,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

/** League format, remembered per device (the NFL edition namespaces the key). */
export const useTradeSettings = () => {
  const [s, setS] = useState<TradeSettings>(readSettings);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // storage blocked: the format still holds for this visit
    }
  }, [s]);
  return [s, useCallback((patch: Partial<TradeSettings>) => setS((x) => ({ ...x, ...patch })), [])] as const;
};

/** The last few models built, by file, injury list and format: flipping a format back and forth (or a remount) rebuilds nothing. */
const modelCache = new WeakMap<FanRaw, { status: Map<string, Status>; byFormat: Map<string, TradeModel> }>();
const modelFor = (raw: FanRaw, s: TradeSettings, status: Map<string, Status>): TradeModel => {
  let c = modelCache.get(raw);
  if (!c || c.status !== status) modelCache.set(raw, (c = { status, byFormat: new Map() }));
  const k = `${s.scoring}|${s.teams}|${s.superflex ? 1 : 0}|${s.tePremium ? 1 : 0}|${s.playoffWeight}`;
  let m = c.byFormat.get(k);
  if (!m) {
    m = buildTradeModel(raw, s, (key) => status.get(key));
    if (c.byFormat.size >= 4) c.byFormat.delete(c.byFormat.keys().next().value as string);
    c.byFormat.set(k, m);
  }
  return m;
};

/** Everything the simulator reads (`active` false: only the card lookup and the format, no model or prices yet): the model for the chosen format, the card players, card values. null until fantasy.json is in. */
export const useTradeEnv = (active = true) => {
  const raw = useFantasyRaw();
  const inj = useInjuryList();
  const { getAllPlayers } = useLeague();
  const market = useMarketLatest(active);
  const [settings, setSettings] = useTradeSettings();
  const status = useMemo(() => new Map<string, Status>((inj?.entries ?? []).map((e) => [e.key, e.code])), [inj]);
  const model = useMemo(() => (raw && active ? modelFor(raw, settings, status) : null), [raw, active, settings, status]);
  const cards = useMemo(() => {
    const m = new Map<string, Player>();
    getAllPlayers().forEach((p) => m.set(`${p.position}:${displayName(p.name)}`, p));
    return m;
  }, [getAllPlayers]);
  const cardValue = useCallback(
    (key: string): number | null => {
      const last = market?.[market.length - 1];
      const v = (last?.players as Record<string, { value?: number }> | undefined)?.[key]?.value;
      return typeof v === 'number' ? v : null;
    },
    [market],
  );
  return { raw, model, settings, setSettings, cards, cardValue };
};
