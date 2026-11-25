import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { ExternalLink, Newspaper, Play, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { FeatureSheet, type SheetPiece } from '@/components/news/FeatureSheet';
import PixelLoader from '@/components/ui/PixelLoader';
import { articleText, useArticle, useEspnIds, type ArticleBlock, type ArticleVideo } from '@/utils/espnArticle';
import { openPlayerPeek } from '@/components/peek/PlayerPeek';
import { nameKey } from '@/utils/newsMentions';
import { NEWS_KIND_LABEL, timeAgo, type NewsItem } from '@/utils/espnNews';
import { keyOfPlayer } from '@/utils/playerSearch';
import { focusOf, mentionsOf } from '@/utils/newsMentions';
import { KIND_ACCENT, SCENE_KIND, kindOf, openDeepDive, useTaggedPlayers } from './newsData';
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
            {poster && <img className="en-fig__media en-fade" src={poster} alt="" loading="lazy" onLoad={(e) => e.currentTarget.classList.add('en-fade--on')} />}
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
          <img className="en-fig__media en-fade" src={b.photo.url} alt={b.photo.caption || ''} loading="lazy" onLoad={(e) => e.currentTarget.classList.add('en-fade--on')} />
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
  const { article, loading, error, unavailable, retry } = useArticle(item);
  const lookup = useMemo(() => (item ? [item] : []), [item]);
  const tagged = useTaggedPlayers(lookup, players);
  const mentions = useMemo(
    () => (item ? mentionsOf({ headline: item.headline, description: item.description, body: article ? articleText(article) : undefined, tagged: tagged.get(item.id) ?? [], teams: item.teams }, players) : []),
    [item, article, tagged, players],
  );
  const cast = mentions.slice(0, 12).map((m) => m.player);
  const focus = focusOf(mentions, 3);
  const close = () => onClose();

  // owner: a player's name in the story opens the site's quick look (card, Head-to-Head, Deep Dive), not ESPN's page.
  // ESPN links players as espn.com/nfl/player/_/id/<id>/...; the id maps to our key (espn_ids.json), else the link text
  // matches someone the piece mentions. Marked links get data-player-key (a hold opens the card too) and a chip look.
  const espnIds = useEspnIds();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const byName = useMemo(() => new Map(mentions.map((m) => [nameKey(m.player.name), keyOfPlayer(m.player)])), [mentions]);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      const id = /\/nfl\/player\/(?:_\/id\/)?(\d+)/.exec(a.getAttribute('href') ?? '')?.[1];
      const k = (id && espnIds?.[id]) || byName.get(nameKey(a.textContent ?? '')) || null;
      if (k) {
        a.dataset.playerKey = k;
        a.classList.add('en-plink');
      }
    });
    el.querySelectorAll<HTMLElement>('.fs-lede').forEach((p) => {
      const first = [...p.childNodes].find((n) => n.nodeType !== 3 || (n.textContent ?? '').trim());
      p.classList.toggle('fs-lede--nocap', first instanceof HTMLElement && first.matches('a.en-plink'));
    });
  });
  const onBodyClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-player-key]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    openPlayerPeek(a.dataset.playerKey!, e.clientX, e.clientY);
  };

  if (!item) return <FeatureSheet piece={null} onClose={close} players={players} onPlayer={openDeepDive} />;
  const kind = kindOf(item);
  const at = order.findIndex((x) => x.id === item.id);
  const link = (x: NewsItem | undefined, label: string) => (x ? { headline: x.headline, label, onGo: () => onOpen(x) } : null);
  const names = cast.map(keyOfPlayer);
  const hero = { teams: item.teams.slice(0, 2), mode: (item.teams.length >= 2 ? (kind === 'trade' ? 'trade' : 'vs') : 'one') as 'one' | 'vs' | 'trade' };

  const firstText = article?.blocks.findIndex((b) => b.t === 'html' && b.tag === 'p') ?? -1;
  let bodyNode: ReactNode;
  if (unavailable) {
    // The public site has no article proxy: the summary (the dek above) and a link to the full story on ESPN
    bodyNode = (
      <div className="en-state">
        <Newspaper className="h-5 w-5" aria-hidden />
        <p>The full story, with its photos and video, is on ESPN.</p>
        <div className="en-state__row">
          <a className="en-refresh" href={item.href} target="_blank" rel="noopener noreferrer">
            Read on ESPN <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    );
  } else if (error) {
    bodyNode = (
      <div className="en-body">
        {item.description && <p className="fs-lede">{item.description}</p>}
        <aside className="en-fallback" role="status">
          <span className="en-fallback__mark" aria-hidden>
            <Newspaper className="h-5 w-5" />
          </span>
          <div className="en-fallback__text">
            <b>The full story lives on ESPN</b>
            <span>Open the article for the full piece.</span>
          </div>
          <div className="en-fallback__row">
            <a className="en-read en-read--solid" href={item.href} target="_blank" rel="noopener noreferrer">
              Read on ESPN <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <button type="button" className="en-refresh" onClick={retry}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </button>
          </div>
        </aside>
      </div>
    );
  } else if (loading || !article) {
    bodyNode = <PixelLoader label="Press" what="the article" minHeight={260} />;
  } else {
    const onlyVideo = article.blocks.every((b) => b.t === 'video');
    bodyNode = (
      <div className="en-body" ref={bodyRef} onClickCapture={onBodyClick}>
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
        <span className="ss-kind en-kind" style={{ '--ss-k': KIND_ACCENT[kind] } as CSSProperties}>{NEWS_KIND_LABEL[kind]}</span>
        <span className="en-espn">ESPN</span>
        {Date.now() - Date.parse(item.published) < 3 * 3600_000 && <span className="en-breaking">Breaking</span>}
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
    scene: {
      kind: SCENE_KIND[kind],
      players: focus.map(keyOfPlayer),
      teams: item.teams.slice(0, 2),
      // two focus players square up (vs), three line up; one stands on the turf
      art: focus.length === 2 ? { scene: 'vs' } : focus.length >= 3 ? { scene: 'lineup' } : undefined,
    },
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
