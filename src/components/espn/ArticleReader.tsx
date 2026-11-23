import { useMemo, useState, type ReactNode } from 'react';
import { ExternalLink, Newspaper, Play, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { FeatureSheet, type SheetPiece } from '@/components/news/FeatureSheet';
import PixelLoader from '@/components/ui/PixelLoader';
import { useArticle, type ArticleBlock, type ArticleVideo } from '@/utils/espnArticle';
import { NEWS_KIND_LABEL, timeAgo, type NewsItem } from '@/utils/espnNews';
import { SCENE_KIND, kindOf, openDeepDive, useNewsPlayers } from './newsData';
import './espn.css';

/**
 * The reading sheet for an ESPN item: the site's FeatureSheet (club-colour header with the players' sprites, side rail
 * with player banners and clubs) around the real article: ESPN's story text cut to a whitelist, its photos with
 * caption and credit and its video clip embedded where the story puts them (else after paragraphs 2 and 4).
 */

const Clip = ({ v, fallbackPoster }: { v: ArticleVideo; fallbackPoster?: string }) => {
  const [playing, setPlaying] = useState(false);
  const poster = v.poster || fallbackPoster;
  const dur = v.duration ? `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}` : '';
  return (
    <figure className="en-fig en-fig--video">
      <div className="en-fig__frame">
        {playing && v.mp4 ? (
          <video className="en-fig__media" src={v.mp4} poster={poster} controls autoPlay playsInline preload="auto" />
        ) : (
          <>
            {poster && <img className="en-fig__media" src={poster} alt="" loading="lazy" />}
            <button
              type="button"
              className="en-play"
              aria-label={`Play video: ${v.title}`}
              onClick={() => (v.mp4 ? setPlaying(true) : window.open(v.web ?? 'https://www.espn.com/nfl/', '_blank', 'noopener'))}
            >
              <span className="en-play__disc">
                <Play className="h-6 w-6 fill-current" aria-hidden />
              </span>
              {dur && <span className="en-play__dur">{dur}</span>}
            </button>
          </>
        )}
      </div>
      <figcaption className="en-fig__cap">
        <span className="en-fig__tag">Video</span> {v.title}
        {!v.mp4 && v.web && <span> · opens on ESPN</span>}
      </figcaption>
    </figure>
  );
};

const Block = ({ b, first, poster }: { b: ArticleBlock; first: boolean; poster?: string }) => {
  if (b.t === 'photo')
    return (
      <figure className="en-fig">
        <div className="en-fig__frame">
          <img className="en-fig__media" src={b.photo.url} alt={b.photo.caption || ''} loading="lazy" />
        </div>
        {(b.photo.caption || b.photo.credit) && (
          <figcaption className="en-fig__cap">
            {b.photo.caption}
            {b.photo.credit && <span className="en-fig__credit"> {b.photo.credit}</span>}
          </figcaption>
        )}
      </figure>
    );
  if (b.t === 'video') return <Clip v={b.video} fallbackPoster={poster} />;
  if (b.tag === 'ul' || b.tag === 'ol') {
    const T = b.tag;
    return <T className="en-list" dangerouslySetInnerHTML={{ __html: b.html }} />;
  }
  const T = b.tag;
  return <T className={cn(first && b.tag === 'p' && 'fs-lede', b.tag === 'blockquote' && 'en-quote')} dangerouslySetInnerHTML={{ __html: b.html }} />;
};

interface Props {
  item: NewsItem | null;
  /** The list the reader steps through (previous / next) */
  order: NewsItem[];
  onOpen: (it: NewsItem) => void;
  onClose: () => void;
  players: Player[];
}

export const ArticleReader = ({ item, order, onOpen, onClose, players }: Props) => {
  const { article, loading, error, retry } = useArticle(item);
  const lookup = useMemo(() => (item ? [item] : []), [item]);
  const tagged = useNewsPlayers(lookup, players);
  const cast = item ? tagged.get(item.id) ?? [] : [];
  const close = () => onClose();

  if (!item) return <FeatureSheet piece={null} onClose={close} players={players} onPlayer={openDeepDive} />;
  const kind = kindOf(item);
  const at = order.findIndex((x) => x.id === item.id);
  const link = (x: NewsItem | undefined, label: string) => (x ? { headline: x.headline, label, onGo: () => onOpen(x) } : null);
  const names = cast.map((p) => p.name);
  const hero = { teams: item.teams.slice(0, 2), mode: (item.teams.length >= 2 ? (kind === 'trade' ? 'trade' : 'vs') : 'one') as 'one' | 'vs' | 'trade' };

  const firstText = article?.blocks.findIndex((b) => b.t === 'html' && b.tag === 'p') ?? -1;
  let bodyNode: ReactNode;
  if (error) {
    bodyNode = (
      <div className="en-state en-state--error" role="alert">
        <WifiOff className="h-5 w-5" aria-hidden />
        <p>Can&apos;t load the full article from ESPN right now. Check the connection and try again, or read it on ESPN.</p>
        <div className="en-state__row">
          <button type="button" className="en-refresh" onClick={retry}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
          <a className="en-refresh" href={item.href} target="_blank" rel="noopener noreferrer">
            Read on ESPN <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    );
  } else if (loading || !article) {
    bodyNode = <PixelLoader label="Press" what="the article" minHeight={260} />;
  } else {
    const onlyVideo = article.blocks.every((b) => b.t === 'video');
    bodyNode = (
      <div className="en-body">
        {onlyVideo && item.description && item.description !== item.headline && <p className="fs-lede">{item.description}</p>}
        {article.blocks.map((b, i) => (
          <Block key={i} b={b} first={i === firstText} poster={item.image?.url} />
        ))}
      </div>
    );
  }

  const piece: SheetPiece = {
    id: item.id,
    kicker: (
      <>
        <span className={cn('ss-kind', `ss-kind--${SCENE_KIND[kind] === 'trade' ? 'trade' : SCENE_KIND[kind] === 'fall' ? 'fall' : 'feature'}`)}>{NEWS_KIND_LABEL[kind]}</span>
        <span className="en-espn">ESPN</span>
      </>
    ),
    headline: item.headline,
    dek: item.description && item.description !== item.headline ? item.description : '',
    byline: (
      <>
        <Newspaper className="h-3.5 w-3.5" aria-hidden="true" /> {article?.byline || 'ESPN'}
        <span aria-hidden="true">·</span>
        <time dateTime={item.published}>{timeAgo(item.published)}</time>
      </>
    ),
    body: [],
    bodyNode,
    stats: [],
    players: names,
    teams: item.teams,
    hero,
    scene: { kind: SCENE_KIND[kind], players: names, teams: item.teams.slice(0, 2) },
    position: `Story ${at + 1} of ${order.length}`,
    sourcesNote: '',
    after: (
      <p className="en-end">
        <span className="en-espn">ESPN</span> {article?.byline ? `${article.byline} · ` : ''}Text, photos and video are ESPN&apos;s, shown here from their public feed.
        <a className="en-read" href={article?.web || item.href} target="_blank" rel="noopener noreferrer">
          Read on ESPN <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </p>
    ),
  };
  return (
    <FeatureSheet
      piece={piece}
      onClose={close}
      prev={link(order[at - 1], 'Newer')}
      next={link(order[at + 1], 'Older')}
      players={players}
      onPlayer={(p) => {
        close();
        openDeepDive(p);
      }}
    />
  );
};
