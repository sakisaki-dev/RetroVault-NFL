import { useMemo, useState, type CSSProperties } from 'react';
import { ExternalLink, Newspaper, Play, RefreshCw, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import PlayerDetailCard from '@/components/PlayerDetailCard';
import TeamLogo from '@/components/brand/TeamLogo';
import PixelLoader from '@/components/ui/PixelLoader';
import ArticleArt from '@/components/news/ArticleArt';
import { ClubChips } from '@/components/news/ClubChips';
import { teamVars } from '@/components/news/clubArt';
import { fetchClip, timeAgo, useEspnNews, type NewsItem } from '@/utils/espnNews';
import { normalizeName, bannerTeamOf } from '@/utils/playerExtras';
import '@/components/news/news-art.css';
import '@/components/news/story.css';
import '@/components/news/takes.css';
import './espn.css';

/**
 * NFL edition's News page (where the Timeline was): ESPN's live NFL feed in the site's pixel news layout. The photo
 * is ESPN's; the tagged athletes stand as their own game sprites in their club's kit (ArticleArt) and the tagged
 * clubs give the colours and logos. Video items play inline (the clip's mp4 is asked of ESPN when you press play).
 */

const KIND: Record<string, string> = { Story: 'Story', Media: 'Video', HeadlineNews: 'Headline', Recap: 'Recap' };

/** Our card players among the athletes ESPN tagged (by name; the best Career Legacy wins a shared name). */
const useAthletes = (items: NewsItem[], players: Player[]) => {
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
    items.forEach((it) => out.set(it.id, it.athletes.map((n) => byName.get(normalizeName(n))).filter((p): p is Player => !!p)));
    return out;
  }, [items, byName]);
};

const clubOf = (it: NewsItem, ps: Player[]) => (ps[0] ? bannerTeamOf(ps[0]) : it.teams[0]);

const Photo = ({ it, big = false }: { it: NewsItem; big?: boolean }) => {
  const [video, setVideo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const play = async () => {
    if (!it.clipApi) return void window.open(it.href, '_blank', 'noopener');
    setBusy(true);
    const clip = await fetchClip(it.clipApi);
    setBusy(false);
    const v = document.createElement('video');
    const src = clip?.mp4 ?? (clip?.hls && v.canPlayType('application/vnd.apple.mpegurl') ? clip.hls : undefined);
    if (src) setVideo(src);
    else window.open(it.href, '_blank', 'noopener');
  };
  if (!it.image && !video) return null;
  return (
    <figure className={cn('en-photo', big && 'en-photo--big')}>
      {video ? (
        <video className="en-video" src={video} poster={it.image?.url} controls autoPlay playsInline />
      ) : (
        <>
          <img src={it.image!.url} alt={it.image!.caption || it.headline} loading="lazy" className="en-img" />
          {it.type === 'Media' && (
            <button type="button" className="en-play" onClick={play} aria-label={`Play: ${it.headline}`}>
              <span className="en-play__disc">{busy ? <RefreshCw className="h-6 w-6 animate-spin" aria-hidden /> : <Play className="h-6 w-6 fill-current" aria-hidden />}</span>
            </button>
          )}
        </>
      )}
      {!video && it.image?.credit && <figcaption className="en-credit">{it.image.credit}</figcaption>}
    </figure>
  );
};

interface CardProps {
  it: NewsItem;
  ps: Player[];
  players: Player[];
  onPlayer: (p: Player) => void;
  hero?: boolean;
}

const Foot = ({ it }: { it: NewsItem }) => (
  <p className="en-foot">
    <span className="en-espn">ESPN</span>
    <span aria-hidden>·</span>
    <time dateTime={it.published}>{timeAgo(it.published)}</time>
    <a className="en-read" href={it.href} target="_blank" rel="noopener noreferrer">
      {it.type === 'Media' ? 'Watch on ESPN' : 'Read the full story'} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  </p>
);

const Scene = ({ it, ps, players, variant }: { it: NewsItem; ps: Player[]; players: Player[]; variant: 'hero' | 'thumb' }) => {
  const names = ps.slice(0, 3).map((p) => p.name);
  const fallback = (
    <span className="en-logos" aria-hidden>
      {(it.teams.length ? it.teams : [clubOf(it, ps)]).filter(Boolean).slice(0, 2).map((t) => (
        <TeamLogo key={t} team={t} size={variant === 'hero' ? 56 : 36} decorative />
      ))}
    </span>
  );
  if (!names.length && !it.teams.length) return null;
  return <ArticleArt variant={variant} kind={variant === 'hero' ? 'lead' : 'feature'} players={names} teams={it.teams.slice(0, 2)} league={players} className={variant === 'hero' ? 'en-scene' : undefined} fallback={fallback} />;
};

const Hero = ({ it, ps, players, onPlayer }: CardProps) => (
  <article className="en-hero" style={teamVars(clubOf(it, ps)) as CSSProperties}>
    <Photo it={it} big />
    <div className="en-hero__text">
      <p className="en-kind">
        <Newspaper className="h-3.5 w-3.5" aria-hidden /> Top story
      </p>
      <h2 className="en-hero__title">{it.headline}</h2>
      <p className="en-hero__dek">{it.description}</p>
      <div className="en-hero__scene">
        <Scene it={it} ps={ps} players={players} variant="hero" />
      </div>
      <ClubChips names={ps.map((p) => p.name)} teams={it.teams.slice(0, 4)} players={players} onPlayer={onPlayer} max={4} label="Players in this story" />
      <Foot it={it} />
    </div>
  </article>
);

const Card = ({ it, ps, players, onPlayer }: CardProps) => (
  <li className="en-card" style={teamVars(clubOf(it, ps)) as CSSProperties}>
    <Photo it={it} />
    <div className="en-card__head">
      <div className="en-card__headtext">
        <p className="en-kind">{KIND[it.type] ?? it.type}</p>
        <h3 className="en-card__title">{it.headline}</h3>
      </div>
      <Scene it={it} ps={ps} players={players} variant="thumb" />
    </div>
    {it.description && it.description !== it.headline && <p className="en-card__dek">{it.description}</p>}
    <ClubChips names={ps.map((p) => p.name)} teams={it.teams.slice(0, 4)} players={players} onPlayer={onPlayer} max={3} label="Players in this story" />
    <Foot it={it} />
  </li>
);

const NewsTab = () => {
  const { getAllPlayers } = useLeague();
  const players = useMemo(() => getAllPlayers(), [getAllPlayers]);
  const { items, at, loading, error, refresh } = useEspnNews();
  const athletes = useAthletes(items, players);
  const [team, setTeam] = useState<string>('all');
  const [kind, setKind] = useState<'all' | 'Story' | 'Media'>('all');
  const [selected, setSelected] = useState<Player | null>(null);

  const teams = useMemo(() => {
    const c = new Map<string, number>();
    items.forEach((i) => i.teams.forEach((t) => c.set(t, (c.get(t) ?? 0) + 1)));
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  }, [items]);
  const shown = useMemo(
    () => items.filter((i) => (team === 'all' || i.teams.includes(team)) && (kind === 'all' || (kind === 'Story' ? i.type !== 'Media' : i.type === 'Media'))),
    [items, team, kind],
  );
  const lead = shown.find((i) => i.type === 'Story' && i.image) ?? shown.find((i) => i.image) ?? shown[0];
  const rest = shown.filter((i) => i !== lead);

  return (
    <div className="en container mx-auto space-y-4 px-4 py-4 sm:py-6">
      <header className="en-mast">
        <div>
          <p className="en-mast__kicker">
            <Newspaper className="h-3.5 w-3.5" aria-hidden /> NFL news · live from ESPN
          </p>
          <h1 className="en-mast__title">News</h1>
        </div>
        <button type="button" className="en-refresh" onClick={refresh} disabled={loading} aria-label="Refresh the news">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden /> {at ? `Updated ${timeAgo(new Date(at).toISOString())}` : 'Refresh'}
        </button>
      </header>

      <div className="en-filters">
        <div role="group" aria-label="Type" className="en-seg">
          {(['all', 'Story', 'Media'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : k === 'Story' ? 'Stories' : 'Video'}
            </button>
          ))}
        </div>
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
      </div>

      {loading && !items.length && (
        <div className="en-state" role="status">
          <PixelLoader /> Loading the headlines
        </div>
      )}
      {error && !items.length && (
        <div className="en-state en-state--error" role="alert">
          <WifiOff className="h-5 w-5" aria-hidden />
          <p>Can&apos;t reach ESPN right now. Check the connection and try again.</p>
          <button type="button" className="en-refresh" onClick={refresh}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
        </div>
      )}
      {!!items.length && !shown.length && <p className="en-state">No stories for that filter.</p>}

      {lead && <Hero it={lead} ps={athletes.get(lead.id) ?? []} players={players} onPlayer={setSelected} />}
      {rest.length > 0 && (
        <ul className="en-grid">
          {rest.map((it) => (
            <Card key={it.id} it={it} ps={athletes.get(it.id) ?? []} players={players} onPlayer={setSelected} />
          ))}
        </ul>
      )}
      <p className="en-credit-line">Headlines, photos and video are ESPN&apos;s, fetched live when this page opens and kept for this browser session only.</p>
      <PlayerDetailCard player={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

export default NewsTab;
