import { useMemo, useState, type CSSProperties } from 'react';
import { BookOpen, ChevronRight, Clock, Newspaper, Play, RefreshCw, Video, WifiOff, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import TeamLogo from '@/components/brand/TeamLogo';
import PixelLoader from '@/components/ui/PixelLoader';
import ArticleArt from '@/components/news/ArticleArt';
import { ClubChips } from '@/components/news/ClubChips';
import { HeroLogos, PlayerBanners, StoryThumb, firstClubIn, teamVars } from '@/components/news/clubArt';
import { NEWS_KIND_LABEL, timeAgo, useEspnNews, type NewsItem, type NewsKind } from '@/utils/espnNews';
import { bannerTeamOf } from '@/utils/playerExtras';
import { ArticleReader } from './ArticleReader';
import { SCENE_KIND, agoParts, kindOf, openDeepDive, useNewsPlayers } from './newsData';
import '@/components/news/news-art.css';
import '@/components/news/story.css';
import '@/components/news/takes.css';
import './espn.css';

/**
 * NFL edition's News page (where the Timeline was), built on the Season Story's design: a newspaper-flag masthead with a
 * section switcher, the lead story as a hero (the tagged athletes as their own game sprites in their club's kit, club
 * colours and logos), Top stories and More stories as lists, video clips in the sidebar, ESPN's headline items as Quick
 * hits and The Wire above. ESPN's photos and video live inside the article (ArticleReader, the FeatureSheet).
 * Live from ESPN's public feed, cached for the browser session; nothing is stored in the repo.
 */

type Section = 'all' | 'recap' | 'trade' | 'injury' | 'video';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'recap', label: 'Recaps' },
  { id: 'trade', label: 'Moves' },
  { id: 'injury', label: 'Injuries' },
  { id: 'video', label: 'Video' },
];
/** Betting lines and fantasy columns read as filler on a front page: they come after the news */
const FILLER: NewsKind[] = ['betting', 'fantasy'];

const clubOf = (it: NewsItem, ps: Player[]) => it.teams[0] || (ps[0] ? bannerTeamOf(ps[0]) : '');
const KindLabel = ({ it }: { it: NewsItem }) => {
  const k = kindOf(it);
  return <span className={cn('ss-kind', `ss-kind--${SCENE_KIND[k] === 'trade' ? 'trade' : SCENE_KIND[k] === 'fall' ? 'fall' : 'feature'}`)}>{NEWS_KIND_LABEL[k]}</span>;
};

export interface ItemProps {
  players: Player[];
  cast: Map<string, Player[]>;
  onRead: (it: NewsItem) => void;
}

export const StoryItem = ({ it, i, players, cast, onRead }: ItemProps & { it: NewsItem; i: number }) => {
  const ps = cast.get(it.id) ?? [];
  const names = ps.map((p) => p.name);
  const club = clubOf(it, ps);
  return (
    <li className="ss-item stagger-in" style={{ ...teamVars(club), '--i': i } as CSSProperties}>
      <button type="button" className="ss-cover" onClick={() => onRead(it)} aria-label={`Read: ${it.headline}`} />
      <div className="ss-item__head">
        <div className="ss-item__headtext">
          <p className="ss-item__meta">
            <KindLabel it={it} />
            <span className="ss-item__time">{timeAgo(it.published)}</span>
          </p>
          <h4 className="ss-item__title">{it.headline}</h4>
        </div>
        <ArticleArt variant="thumb" kind={SCENE_KIND[kindOf(it)]} players={names} teams={it.teams.slice(0, 2)} league={players} fallback={<StoryThumb kind={SCENE_KIND[kindOf(it)]} teams={it.teams} club={club} />} />
      </div>
      {it.description && it.description !== it.headline && <p className="ss-item__dek">{it.description}</p>}
      {names.length > 0 && (
        <div className="ss-item__foot">
          <ClubChips names={names} players={players} onPlayer={openDeepDive} max={2} label="Players in this story" />
        </div>
      )}
    </li>
  );
};

const VideoCard = ({ it, onRead, i }: { it: NewsItem; onRead: (it: NewsItem) => void; i: number }) => (
  <li className="en-vid stagger-in" style={{ ...teamVars(it.teams[0]), '--i': i } as CSSProperties}>
    <button type="button" className="en-vid__btn" onClick={() => onRead(it)} aria-label={`Watch: ${it.headline}`}>
      <span className="en-vid__poster">
        {it.image && <img src={it.image.url} alt="" loading="lazy" />}
        <span className="en-vid__disc">
          <Play className="h-4 w-4 fill-current" aria-hidden />
        </span>
      </span>
      <span className="en-vid__text">
        <span className="en-vid__title">{it.headline}</span>
        <span className="en-vid__time">{timeAgo(it.published)}</span>
      </span>
    </button>
  </li>
);

const NewsTab = () => {
  const { getAllPlayers } = useLeague();
  const players = useMemo(() => getAllPlayers(), [getAllPlayers]);
  const { items, at, loading, error, refresh } = useEspnNews();
  const cast = useNewsPlayers(items, players);
  const [section, setSection] = useState<Section>('all');
  const [team, setTeam] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const teams = useMemo(() => {
    const c = new Map<string, number>();
    items.forEach((i) => i.teams.forEach((t) => c.set(t, (c.get(t) ?? 0) + 1)));
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [items]);

  const shown = useMemo(
    () =>
      items.filter((i) => {
        if (team !== 'all' && !i.teams.includes(team)) return false;
        if (section === 'all') return true;
        if (section === 'video') return i.type === 'Media';
        return kindOf(i) === section;
      }),
    [items, team, section],
  );
  const videos = shown.filter((i) => i.type === 'Media');
  const hits = shown.filter((i) => i.type === 'HeadlineNews');
  const stories = shown.filter((i) => i.type !== 'Media' && i.type !== 'HeadlineNews');
  const ranked = useMemo(() => [...stories.filter((i) => !FILLER.includes(kindOf(i))), ...stories.filter((i) => FILLER.includes(kindOf(i)))], [stories]);
  // the lead: the newest real story with a photo and a tagged player (else any story, else a headline item)
  const lead = ranked.find((i) => i.image && (cast.get(i.id)?.length ?? 0) > 0) ?? ranked[0] ?? hits[0];
  const rest = ranked.filter((i) => i !== lead);
  const top = rest.slice(0, 3);
  const more = rest.slice(3);
  const quick = lead && lead.type === 'HeadlineNews' ? hits.filter((i) => i !== lead) : hits;
  const wire = useMemo(() => items.slice(0, 8), [items]);
  const order = useMemo(() => (lead ? [lead, ...top, ...more, ...quick, ...videos] : []), [lead, top, more, quick, videos]);
  const open = order.find((i) => i.id === openId) ?? items.find((i) => i.id === openId) ?? null;
  const read = (it: NewsItem) => setOpenId(it.id);
  const itemProps = { players, cast, onRead: read };

  const leadCast = lead ? cast.get(lead.id) ?? [] : [];
  const leadNames = leadCast.map((p) => p.name);
  const leadClub = lead ? clubOf(lead, leadCast) : '';
  const leadMode = lead && lead.teams.length >= 2 ? (kindOf(lead) === 'trade' ? 'trade' : 'vs') : 'one';
  const ago = lead ? agoParts(lead.published) : null;

  return (
    <div className="en container mx-auto px-4 py-4 sm:py-6">
      <header className="ss-mast">
        <div className="ss-mast__text">
          <p className="ss-mast__kicker">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> NFL news · live from ESPN
          </p>
          <h2 id="ss-title" className="ss-mast__title">
            The NFL This Week
          </h2>
          <p className="ss-mast__tagline">
            {items.length ? `${items.filter((i) => i.type !== 'Media').length} stories and ${items.filter((i) => i.type === 'Media').length} clips, newest first.` : 'The latest from around the league.'}
            <button type="button" className="en-refresh en-refresh--inline" onClick={refresh} disabled={loading} aria-label="Refresh the news">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden /> {at ? `Updated ${timeAgo(new Date(at).toISOString())}` : 'Refresh'}
            </button>
          </p>
        </div>
        <div className="ss-seasons" role="group" aria-label="Section">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="ss-season" aria-pressed={section === s.id} onClick={() => setSection(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </header>

      {wire.length > 0 && (
        <section className="en-wire" aria-label="The Wire">
          <h3 className="en-wire__h">The Wire</h3>
          <ul className="en-wire__list">
            {wire.map((w) => (
              <li key={w.id} style={teamVars(w.teams[0])}>
                <button type="button" onClick={() => read(w)}>
                  {w.teams[0] && <TeamLogo team={w.teams[0]} size={16} decorative />}
                  <span>{w.headline}</span>
                  <time>{timeAgo(w.published)}</time>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="group" aria-label="Team" className="en-teams">
        <button type="button" aria-pressed={team === 'all'} onClick={() => setTeam('all')} className="en-team en-team--all">
          All teams
        </button>
        {teams.map((t) => (
          <button key={t} type="button" aria-pressed={team === t} aria-label={t} title={t} onClick={() => setTeam(t)} className="en-team">
            <TeamLogo team={t} size={22} decorative />
          </button>
        ))}
      </div>

      {loading && !items.length && <PixelLoader label="Press" what="the headlines" minHeight={360} />}
      {error && !items.length && (
        <div className="en-state en-state--error" role="alert">
          <WifiOff className="h-5 w-5" aria-hidden />
          <p>Can&apos;t reach ESPN right now. Check the connection and try again.</p>
          <button type="button" className="en-refresh" onClick={refresh}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
        </div>
      )}
      {!!items.length && !shown.length && <p className="en-state">Nothing in the news for that filter.</p>}

      {shown.length > 0 && (
        <div className="ss-front">
          {lead && (
            <article className="ss-lead stagger-in" style={{ ...teamVars(leadClub), '--i': 0 } as CSSProperties}>
              <button type="button" className="ss-cover" onClick={() => read(lead)} aria-label={`Read: ${lead.headline}`} />
              <div className={cn('ss-lead__art', leadMode !== 'one' && 'ss-lead__art--pair')}>
                <ArticleArt
                  variant="hero"
                  kind="lead"
                  players={leadNames}
                  teams={lead.teams.slice(0, 2)}
                  league={players}
                  className="ss-lead__scene"
                  fallback={<HeroLogos teams={(lead.teams.length ? lead.teams : [leadClub]).filter(Boolean).slice(0, 2)} mode={leadMode} />}
                />
                {ago && (
                  <p className="ss-lead__big">
                    <b>{ago.value}</b>
                    <span>{ago.label}</span>
                  </p>
                )}
              </div>
              <div className="ss-lead__text">
                <span className="ss-kind ss-kind--lead">Top story</span>
                <h3 className="ss-lead__title">{lead.headline}</h3>
                {lead.description && lead.description !== lead.headline && <p className="ss-lead__dek">{lead.description}</p>}
                <PlayerBanners names={leadNames} players={players} onPlayer={openDeepDive} max={3} className="nz-banners--lead" />
                <p className="ss-byline">
                  <Newspaper className="h-3.5 w-3.5" aria-hidden="true" /> ESPN
                  <span aria-hidden="true">·</span>
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {timeAgo(lead.published)}
                  <span className="ss-read" aria-hidden="true">
                    {lead.type === 'Media' ? 'Watch the clip' : 'Read the story'} <ChevronRight className="h-4 w-4" />
                  </span>
                </p>
              </div>
            </article>
          )}

          {top.length > 0 && (
            <section className="ss-top" aria-labelledby="ss-top-title">
              <h3 id="ss-top-title" className="ss-rubric">
                Top stories
              </h3>
              <ul className="ss-list ss-list--top">
                {top.map((it, i) => (
                  <StoryItem key={it.id} it={it} i={i + 1} {...itemProps} />
                ))}
              </ul>
            </section>
          )}

          <div className="ss-dyk">
            {videos.length > 0 && (
              <section aria-labelledby="en-vid-title">
                <h3 id="en-vid-title" className="ss-rubric ss-rubric--gold">
                  <Video className="h-3.5 w-3.5" aria-hidden="true" /> Video
                </h3>
                <ul className="en-vids">
                  {videos.slice(0, 8).map((it, i) => (
                    <VideoCard key={it.id} it={it} i={i} onRead={read} />
                  ))}
                </ul>
              </section>
            )}
          </div>

          {more.length > 0 && (
            <section className="ss-more" aria-labelledby="ss-more-title">
              <h3 id="ss-more-title" className="ss-rubric">
                More stories
              </h3>
              <ul className="ss-list ss-list--more">
                {more.map((it, i) => (
                  <StoryItem key={it.id} it={it} i={i + 4} {...itemProps} />
                ))}
              </ul>
            </section>
          )}

          {quick.length > 0 && (
            <section className="ss-hits" aria-labelledby="ss-hits-title">
              <h3 id="ss-hits-title" className="ss-rubric ss-rubric--gold">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Quick hits
              </h3>
              <ol className="ss-hits__list">
                {quick.map((it, i) => {
                  const club = it.teams[0] || firstClubIn(it.headline);
                  return (
                    <li key={it.id} className="ss-hit en-hit" style={teamVars(club)}>
                      <span className="ss-hit__n" aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {club && <TeamLogo team={club} size={20} decorative className="ss-hit__logo" />}
                      <button type="button" className="en-hit__btn" onClick={() => read(it)}>
                        {it.headline}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      )}

      <p className="en-credit-line">Headlines, articles, photos and video are ESPN&apos;s, fetched live and kept for this browser session only.</p>
      <ArticleReader item={open} order={order} onOpen={read} onClose={() => setOpenId(null)} players={players} />
    </div>
  );
};

export default NewsTab;
