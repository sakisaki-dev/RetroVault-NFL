import { openPlayerCard } from '@/utils/playerCardLink';
import { useMemo } from 'react';
import type { Player } from '@/types/player';
import type { StoryKind } from '@/utils/leagueContent';
import { useEspnIds } from '@/utils/espnArticle';
import { newsKind, type NewsItem, type NewsKind } from '@/utils/espnNews';
import { keyOfPlayer } from '@/utils/playerSearch';
import { mentionsOf } from '@/utils/newsMentions';
import { normalizeName } from '@/utils/playerExtras';
import { stripSuffix } from '@/utils/nameSuffix';
import { buildHash } from '@/components/stats/hub/hashRoute';

/** The scene kind ArticleArt draws for an ESPN item (its rule picks vs / turf / lineup from kind, players and clubs) */
export const SCENE_KIND: Record<NewsKind, StoryKind> = {
  recap: 'feature', trade: 'trade', injury: 'fall', video: 'feature', betting: 'feature', fantasy: 'quickhits',
  feature: 'feature', headline: 'feature', analysis: 'feature',
};

/** The card players ESPN tagged on each item: by ESPN athlete id (espn_ids.json), else by name. Best Career Legacy wins a shared name. */
export const useTaggedPlayers = (items: NewsItem[], players: Player[]) => {
  const ids = useEspnIds();
  const byKey = useMemo(() => new Map(players.map((p) => [keyOfPlayer(p), p])), [players]);
  const byName = useMemo(() => {
    const m = new Map<string, Player>();
    const bareNames = new Map<string, Player>();
    players.forEach((p) => {
      const k = normalizeName(p.name.replace(/\s*\(.*\)$/, ''));
      const cur = m.get(k);
      if (!cur || p.careerLegacy > cur.careerLegacy) m.set(k, p);
      // ESPN drops the suffix ("James Cook" for "James Cook III"): also file him under the bare name unless that is a card of its own
      const bare = normalizeName(stripSuffix(p.name.replace(/\s*\(.*\)$/, '')));
      if (bare !== k) {
        const b = bareNames.get(bare);
        if (!b || p.careerLegacy > b.careerLegacy) bareNames.set(bare, p);
      }
    });
    bareNames.forEach((p, b) => {
      if (!m.has(b)) m.set(b, p);
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
/** Per item: everyone ESPN tagged plus anyone its headline or description names, best focus first (the feed shows the top 1-2). */
export const useNewsPlayers = (items: NewsItem[], players: Player[]) => {
  const tagged = useTaggedPlayers(items, players);
  return useMemo(() => {
    const out = new Map<string, Player[]>();
    items.forEach((it) => {
      const m = mentionsOf({ headline: it.headline, description: it.description, tagged: tagged.get(it.id) ?? [], teams: it.teams }, players);
      out.set(it.id, m.map((x) => x.player));
    });
    return out;
  }, [items, tagged, players]);
};

export const openDeepDive = (p: Player) => {
  openPlayerCard(keyOfPlayer(p));
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

/** One accent per article type, shared by the card stripe, the tag, the sidebar and the reader */
export const KIND_ACCENT: Record<NewsKind, string> = {
  analysis: '#5cc8ff', recap: '#ffc83d', trade: '#b69cff', injury: '#ff5a61', fantasy: '#3ddc84',
  betting: '#ff9f43', feature: '#2dd4bf', headline: '#c9d3f5', video: '#ff7a85',
};
/** The feed's sections, in reading order: which kinds each holds */
export const GROUPS: { id: string; label: string; kinds: NewsKind[] }[] = [
  { id: 'analysis', label: 'Analysis', kinds: ['analysis', 'feature', 'headline', 'video'] },
  { id: 'recap', label: 'Recaps', kinds: ['recap'] },
  { id: 'trade', label: 'Transactions', kinds: ['trade'] },
  { id: 'injury', label: 'Injuries', kinds: ['injury'] },
  { id: 'fantasy', label: 'Fantasy', kinds: ['fantasy'] },
  { id: 'betting', label: 'Betting', kinds: ['betting'] },
];
