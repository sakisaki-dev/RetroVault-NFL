import { useMemo } from 'react';
import type { Player } from '@/types/player';
import type { StoryKind } from '@/utils/leagueContent';
import { useEspnIds } from '@/utils/espnArticle';
import { newsKind, type NewsItem, type NewsKind } from '@/utils/espnNews';
import { keyOfPlayer } from '@/utils/playerSearch';
import { normalizeName } from '@/utils/playerExtras';
import { buildHash } from '@/components/stats/hub/hashRoute';

/** The scene kind ArticleArt draws for an ESPN item (its rule picks vs / turf / lineup from kind, players and clubs) */
export const SCENE_KIND: Record<NewsKind, StoryKind> = {
  recap: 'feature', trade: 'trade', injury: 'fall', video: 'feature', betting: 'feature', fantasy: 'quickhits',
  feature: 'feature', headline: 'feature', analysis: 'feature',
};

/** The card players ESPN tagged on each item: by ESPN athlete id (espn_ids.json), else by name. Best Career Legacy wins a shared name. */
export const useNewsPlayers = (items: NewsItem[], players: Player[]) => {
  const ids = useEspnIds();
  const byKey = useMemo(() => new Map(players.map((p) => [keyOfPlayer(p), p])), [players]);
  const byName = useMemo(() => {
    const m = new Map<string, Player>();
    players.forEach((p) => {
      const k = normalizeName(p.name.replace(/\s*\(.*\)$/, ''));
      const cur = m.get(k);
      if (!cur || p.careerLegacy > cur.careerLegacy) m.set(k, p);
    });
    return m;
  }, [players]);
  return useMemo(() => {
    const out = new Map<string, Player[]>();
    items.forEach((it) => {
      const found: Player[] = [];
      it.athleteIds.forEach((id, i) => {
        const key = ids?.[id];
        const p = (key && byKey.get(key)) || byName.get(normalizeName(it.athletes[i] ?? ''));
        if (p && !found.includes(p)) found.push(p);
      });
      out.set(it.id, found);
    });
    return out;
  }, [items, ids, byKey, byName]);
};

/** Open a player's Deep Dive (the hash route; any open sheet closes itself first) */
export const openDeepDive = (p: Player) => {
  window.location.hash = buildHash({ tab: 'career', sub: 'deepdive', p: keyOfPlayer(p) });
};

export const kindOf = (it: NewsItem): NewsKind => newsKind(it);

/** "3 h" / "12 min" / "2 days": the lead's big figure */
export const agoParts = (iso: string, now = Date.now()): { value: string; label: string } => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { value: 'NEW', label: 'from ESPN' };
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return { value: String(Math.max(1, m)), label: 'min ago' };
  const h = Math.round(m / 60);
  if (h < 24) return { value: String(h), label: h === 1 ? 'hour ago' : 'hours ago' };
  const d = Math.round(h / 24);
  return { value: String(d), label: d === 1 ? 'day ago' : 'days ago' };
};
