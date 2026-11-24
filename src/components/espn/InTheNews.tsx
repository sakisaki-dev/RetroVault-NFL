import { useEffect, useMemo, useState } from 'react';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import { bannerTeamOf } from '@/utils/playerExtras';
import { keyOfPlayer } from '@/utils/playerSearch';
import { fetchTeamNews, useEspnNews, type NewsItem } from '@/utils/espnNews';
import { namesPlayer } from '@/utils/newsMentions';
import { useEspnIds } from '@/utils/espnArticle';
import PixelLoader from '@/components/ui/PixelLoader';
import { ArticleReader } from './ArticleReader';
import { StoryItem } from './NewsTab';
import { useNewsPlayers } from './newsData';
import '@/components/news/news-art.css';
import '@/components/news/story.css';
import '@/components/news/takes.css';
import './espn.css';
import { displayName } from '@/utils/displayName';

/**
 * Deep Dive "In the news" (NFL edition): the real ESPN articles and clips that tag this player as an athlete (matched by
 * ESPN athlete id, public/data/nfl/espn_ids.json), from ESPN's latest 50 items and his club's feed (about two weeks).
 * Each opens the same reading sheet as the News page. With none, "Around the <club>": his club's latest.
 */
const InTheNews = ({ player }: { player: Player }) => {
  const { getAllPlayers } = useLeague();
  const players = useMemo(() => getAllPlayers(), [getAllPlayers]);
  const ids = useEspnIds();
  const { items: general } = useEspnNews();
  const club = bannerTeamOf(player) || player.team || '';
  const [teamItems, setTeamItems] = useState<{ club: string; items: NewsItem[] } | null>(null);
  useEffect(() => {
    let alive = true;
    if (!club || club === 'FA') {
      setTeamItems({ club, items: [] });
      return;
    }
    setTeamItems(null);
    fetchTeamNews(club).then((items) => alive && setTeamItems({ club, items }));
    return () => {
      alive = false;
    };
  }, [club]);

  const key = keyOfPlayer(player);
  const espnId = useMemo(() => (ids ? Object.entries(ids).find(([, k]) => k === key)?.[0] : undefined), [ids, key]);
  const pool = useMemo(() => {
    const seen = new Set<string>();
    return [...general, ...(teamItems?.items ?? [])].filter((i) => !seen.has(i.id) && !!seen.add(i.id)).sort((a, b) => b.published.localeCompare(a.published));
  }, [general, teamItems]);
  const featured = useMemo(
    () => pool.filter((i) => (espnId && i.athleteIds.includes(espnId)) || i.athletes.some((n) => n === player.name) || namesPlayer(`${i.headline}. ${i.description}`, player)),
    [pool, espnId, player.name],
  );
  const around = useMemo(() => (featured.length ? [] : (teamItems?.items ?? []).filter((i) => i.type !== 'Media').slice(0, 6)), [featured, teamItems]);
  const shown = featured.length ? featured.slice(0, 8) : around;
  const cast = useNewsPlayers(shown, players);
  const [openId, setOpenId] = useState<string | null>(null);
  const waiting = !ids || teamItems === null;

  return (
    <div className="en-dd">
      {waiting && !shown.length ? (
        <PixelLoader label="Press" what="his headlines" minHeight={160} />
      ) : shown.length ? (
        <>
          <p className="en-dd__sub">
            {featured.length
              ? `${featured.length} ESPN ${featured.length === 1 ? 'piece names' : 'pieces name'} ${displayName(player.name)} from the latest NFL news${club ? ` and the ${club}'s feed` : ''}.`
              : `ESPN hasn't tagged ${displayName(player.name)} in its latest items. Around the ${club}:`}
          </p>
          <ul className="ss-list ss-list--more">
            {shown.map((it, i) => (
              <StoryItem key={it.id} it={it} i={i} players={players} cast={cast} onRead={(x) => setOpenId(x.id)} />
            ))}
          </ul>
        </>
      ) : (
        <p className="en-dd__sub">Nothing in ESPN&apos;s latest feed for {displayName(player.name)}{club ? ` or the ${club}` : ''} right now.</p>
      )}
      <ArticleReader item={shown.find((i) => i.id === openId) ?? null} order={shown} onOpen={(x) => setOpenId(x.id)} onClose={() => setOpenId(null)} players={players} />
    </div>
  );
};

export default InTheNews;
