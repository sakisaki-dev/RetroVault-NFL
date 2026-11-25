import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
import { getTeamTextColor } from '@/utils/teamColors';
import { displayName } from '@/utils/displayName';
import GameSprite from '@/components/GameSprite';
import { useReveal } from '@/components/motion/Reveal';
import { peekProps } from '@/components/peek/peekProps';
import { keyOfPlayer } from '@/utils/playerSearch';
import { ArticleReader } from './ArticleReader';
import { GROUPS, KIND_ACCENT, SCENE_KIND, agoParts, kindOf, openDeepDive, useNewsPlayers } from './newsData';
import { FillGrid } from './FillGrid';
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

/** A story under three hours old gets the BREAKING tag */
const isBreaking = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t < 3 * 3600_000 && Date.now() - t >= 0;
};
const Breaking = ({ it }: { it: NewsItem }) => (isBreaking(it.published) ? <span className="en-breaking">Breaking</span> : null);

const clubOf = (it: NewsItem, ps: Player[]) => it.teams[0] || (ps[0] ? bannerTeamOf(ps[0]) : '');
const KindLabel = ({ it }: { it: NewsItem }) => {
  const k = kindOf(it);
  return <span className="ss-kind en-kind" style={{ '--ss-k': KIND_ACCENT[k] } as CSSProperties}>{NEWS_KIND_LABEL[k]}</span>;
};

export interface ItemProps {
  players: Player[];
  cast: Map<string, Player[]>;
  onRead: (it: NewsItem) => void;
}

export const StoryItem = ({ it, i, players, cast, onRead, cell }: ItemProps & { it: NewsItem; i: number; cell?: { style: CSSProperties; wide: boolean } }) => {
  const ps = cast.get(it.id) ?? [];
  const names = ps.map(keyOfPlayer);
  const club = clubOf(it, ps);
  const reveal = useReveal<HTMLLIElement>();
  return (
    <li ref={reveal} className={cn('ss-item mo-auto en-card', cell?.wide && 'en-card--wide')} data-kind={kindOf(it)} style={{ ...teamVars(club), '--k': KIND_ACCENT[kindOf(it)], '--i': Math.min(i, 5), ...cell?.style } as CSSProperties}>
      <button type="button" className="ss-cover" onClick={() => onRead(it)} aria-label={`Read: ${it.headline}`} />
      <div className="ss-item__head">
        <div className="ss-item__headtext">
          <p className="ss-item__meta">
            <KindLabel it={it} />
            <Breaking it={it} />
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

/** An image that fades in when it has loaded (its frame holds the space, so nothing shifts) */
const FadeImg = ({ src }: { src: string }) => {
  const [on, setOn] = useState(false);
  return <img src={src} alt="" loading="lazy" className={cn('en-fade', on && 'en-fade--on')} onLoad={() => setOn(true)} ref={(el) => { if (el?.complete && el.naturalWidth && !on) setOn(true); }} />;
};

const VideoCard = ({ it, onRead, i, style }: { it: NewsItem; onRead: (it: NewsItem) => void; i: number; style?: CSSProperties }) => (
  <li ref={useReveal<HTMLLIElement>()} className="en-vid mo-auto" style={{ ...teamVars(it.teams[0]), '--k': KIND_ACCENT.video, '--i': Math.min(i, 5), ...style } as CSSProperties}>
    <button type="button" className="en-vid__btn" onClick={() => onRead(it)} aria-label={`Watch: ${it.headline}`}>
      <span className="en-vid__poster">
        {it.image && <FadeImg src={it.image.url} />}
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

/** A section header in the site's style: kicker, Barlow title, count, and a rule in the section's colour with a turf motif */
const Rubric = ({ id, kicker, count, icon, club, big, children }: { id: string; kicker: string; count?: number; icon?: ReactNode; club?: string; big?: boolean; children: ReactNode }) => (
  <header className={cn('en-rub', big && 'en-rub--big')}>
    <p className="en-rub__kicker">
      {club && <TeamLogo team={club} size={16} decorative />}
      {kicker}
    </p>
    <h3 id={id} className="en-rub__title">
      {icon}
      {children}
      {count != null && <span className="en-rub__n">{count}</span>}
    </h3>
  </header>
);

const NewsTab = () => {
  const { getAllPlayers } = useLeague();
  const players = useMemo(() => getAllPlayers(), [getAllPlayers]);
  const { items, at, loading, error, refresh } = useEspnNews();
  const cast = useNewsPlayers(items, players);
  const [section, setSection] = useState<Section>('all');
  // each section shows its top 3; the rest fold under a tag (owner: the Fantasy section was gigantic)
  const [openSec, setOpenSec] = useState<Set<string>>(() => new Set());
  const [team, setTeam] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  // the most-mentioned card players in the feed (stories and clips alike): the trending strip
  const trending = useMemo(() => {
    const c = new Map<string, { p: Player; n: number }>();
    items.forEach((it) => (cast.get(it.id) ?? []).slice(0, 3).forEach((p) => {
      const k = keyOfPlayer(p);
      const e = c.get(k);
      if (e) e.n += 1;
      else c.set(k, { p, n: 1 });
    }));
    return [...c.values()].filter((e) => e.n >= 2).sort((a, b) => b.n - a.n || b.p.careerLegacy - a.p.careerLegacy).slice(0, 8);
  }, [items, cast]);
  const teamCount = useMemo(() => {
    const c = new Map<string, number>();
    items.forEach((i) => i.teams.forEach((t) => c.set(t, (c.get(t) ?? 0) + 1)));
    return c;
  }, [items]);

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
  // the feed under the lead, in labelled sections by article type (a single type when a section is picked)
  const groups = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: more.filter((i) => g.kinds.includes(kindOf(i))) })).filter((g) => g.items.length),
    [more],
  );
  const order = useMemo(() => (lead ? [lead, ...top, ...more, ...quick, ...videos] : []), [lead, top, more, quick, videos]);
  const open = order.find((i) => i.id === openId) ?? items.find((i) => i.id === openId) ?? null;
  const read = (it: NewsItem) => setOpenId(it.id);
  const itemProps = { players, cast, onRead: read };

  const leadReveal = useReveal<HTMLElement>();
  const leadCast = lead ? cast.get(lead.id) ?? [] : [];
  const leadNames = leadCast.map(keyOfPlayer);
  const leadClub = lead ? clubOf(lead, leadCast) : '';
  const leadMode = lead && lead.teams.length >= 2 ? (kindOf(lead) === 'trade' ? 'trade' : 'vs') : 'one';
  const ago = lead ? agoParts(lead.published) : null;

  return (
    <div className="en container py-6 sm:py-8">
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
          <button key={t} type="button" aria-pressed={team === t} aria-label={`${t}, ${teamCount.get(t)} stories`} title={`${t} · ${teamCount.get(t)}`} style={teamVars(t)} onClick={() => setTeam(t)} className="en-team">
            <TeamLogo team={t} size={22} decorative />
            <i className="en-team__n" aria-hidden>{teamCount.get(t)}</i>
          </button>
        ))}
      </div>

      {trending.length > 0 && (
        <section className="en-trend" aria-label="Trending players">
          <h3 className="en-trend__h">Trending</h3>
          <ul className="en-trend__list">
            {trending.map(({ p, n }, i) => {
              const club = bannerTeamOf(p);
              return (
                <li key={keyOfPlayer(p)} className="mo-pop" style={{ ...teamVars(club), '--i': i, '--ink': getTeamTextColor(club) ?? 'var(--tc)' } as CSSProperties}>
                  <button type="button" className="en-trend__btn" {...peekProps(p)} onClick={() => openDeepDive(p)} aria-label={`${displayName(p.name)}, in ${n} stories. Open his card`}>
                    <span className="en-trend__sprite" aria-hidden>
                      <GameSprite player={p} team={club} kind="bust" size="m" />
                    </span>
                    <span className="en-trend__name">{displayName(p.name)}</span>
                    <span className="en-trend__n">{n} {n === 1 ? 'story' : 'stories'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
        <div className="ss-front" key={`${section}-${team}`}>
          {lead && (
            <article ref={leadReveal} className="ss-lead mo-auto en-lead" style={{ ...teamVars(leadClub), '--i': 0 } as CSSProperties}>
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
                <Breaking it={lead} />
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

          <aside className="ss-side">
            <div className="ss-side__in">
            {top.length > 0 && (
              <section className="ss-top en-mod" aria-labelledby="ss-top-title">
                <Rubric id="ss-top-title" kicker="Front page" count={top.length}>Top stories</Rubric>
                <FillGrid
                  items={top}
                  minW={230}
                  max={3}
                  gap={12}
                  className="en-cards en-cards--top"
                  render={(it, i, cell) => <StoryItem key={it.id} it={it} i={i + 1} cell={cell} {...itemProps} />}
                />
              </section>
            )}

              {videos.length > 0 && (
                <section className="ss-dyk en-mod en-mod--video" aria-labelledby="en-vid-title">
                  <Rubric id="en-vid-title" kicker="Watch" count={Math.min(videos.length, 8)} icon={<Video className="h-4 w-4" aria-hidden="true" />}>Video</Rubric>
                  <FillGrid
                    items={videos.slice(0, 8)}
                    minW={240}
                    max={2}
                    gap={10}
                    className="en-vids"
                    render={(it, i, cell) => <VideoCard key={it.id} it={it} i={i} onRead={read} style={cell.style} />}
                  />
                </section>
              )}

              {trending.length > 0 && (
              <section className="en-side__mod en-side__trend en-mod" aria-labelledby="en-trend-title">
                <Rubric id="en-trend-title" kicker="Trending" count={trending.length}>Players in the news</Rubric>
                <ol className="en-rank">
                  {trending.map(({ p, n }, i) => {
                    const club = bannerTeamOf(p);
                    return (
                      <li key={keyOfPlayer(p)} style={{ ...teamVars(club), '--ink': getTeamTextColor(club) ?? 'var(--tc)' } as CSSProperties}>
                        <button type="button" className="en-rank__btn" {...peekProps(p)} onClick={() => openDeepDive(p)} aria-label={`${displayName(p.name)}, in ${n} stories. Open his card`}>
                          <span className="en-rank__n">{i + 1}</span>
                          <span className="en-trend__sprite" aria-hidden>
                            <GameSprite player={p} team={club} kind="bust" size="s" />
                          </span>
                          <span className="en-rank__name">{displayName(p.name)}</span>
                          <span className="en-trend__n">{n} stories</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
              )}
              <section className="en-side__mod en-mod" aria-labelledby="en-around-title">
                <Rubric id="en-around-title" kicker="By club" count={teams.length}>Around the league</Rubric>
                <FillGrid
                  items={teams}
                  minW={64}
                  max={4}
                  gap={6}
                  className="en-around"
                  render={(t, _i, cell) => (
                    <li key={t} style={{ ...teamVars(t), ...cell.style }}>
                      <button type="button" className="en-around__btn" aria-pressed={team === t} onClick={() => setTeam(team === t ? 'all' : t)} aria-label={`${t}, ${teamCount.get(t)} stories`} title={t}>
                        <TeamLogo team={t} size={26} decorative />
                        <b>{teamCount.get(t)}</b>
                      </button>
                    </li>
                  )}
                />
              </section>
            </div>
          </aside>

          {groups.length > 0 && (
            <div className="ss-more en-sections">
              {groups.map((g, gi) => (
                <section key={g.id} className="en-section" aria-labelledby={`en-sec-${g.id}`} style={{ ...(team !== 'all' ? teamVars(team) : {}), '--k': KIND_ACCENT[g.kinds[0]] } as CSSProperties}>
                  <Rubric id={`en-sec-${g.id}`} kicker={team !== 'all' ? team : `Section ${String(gi + 1).padStart(2, '0')}`} count={g.items.length} club={team !== 'all' ? team : undefined} big>
                    {g.label}
                  </Rubric>
                  <FillGrid
                    items={openSec.has(g.id) ? g.items : g.items.slice(0, 3)}
                    minW={270}
                    max={3}
                    gap={14}
                    className="en-cards"
                    render={(it, i, cell) => <StoryItem key={it.id} it={it} i={i + 4} cell={cell} {...itemProps} />}
                  />
                  {g.items.length > 3 && (
                    <button
                      type="button"
                      className="en-sec-more"
                      aria-expanded={openSec.has(g.id)}
                      onClick={() => setOpenSec((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                    >
                      {openSec.has(g.id) ? `Show fewer ${g.label.toLowerCase()}` : `+ ${g.items.length - 3} more ${g.label.toLowerCase()}`}
                    </button>
                  )}
                </section>
              ))}
            </div>
          )}

          {quick.length > 0 && (
            <section className="ss-hits en-section" aria-labelledby="ss-hits-title" style={{ '--k': 'var(--ss-gold)' } as CSSProperties}>
              <Rubric id="ss-hits-title" kicker="In brief" count={quick.length} icon={<Zap className="h-4 w-4" aria-hidden="true" />} big>Quick hits</Rubric>
              <FillGrid
                as="ol"
                items={quick}
                minW={300}
                max={2}
                gap={10}
                className="en-hits"
                render={(it, i, cell) => {
                  const club = it.teams[0] || firstClubIn(it.headline);
                  return (
                    <li key={it.id} className="ss-hit en-hit" style={{ ...teamVars(club), ...cell.style }}>
                      <span className="ss-hit__n" aria-hidden="true">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {club && <TeamLogo team={club} size={20} decorative className="ss-hit__logo" />}
                      <button type="button" className="en-hit__btn" onClick={() => read(it)}>
                        {it.headline}
                      </button>
                    </li>
                  );
                }}
              />
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
