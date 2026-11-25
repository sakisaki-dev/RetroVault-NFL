import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { displayName } from '@/utils/displayName';
import { IS_NFL } from '@/config/edition';
import { openGame, playoffGameId, useGameIds } from '@/utils/nflGames';
import { PlayerHit, StarSprite, playoffSeeds } from './NflSeasonExtras';
import TeamLogo from '@/components/timeline/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import type { SeasonView } from '@/utils/seasonLive';
import { signed } from './seasonGamesUi';
import { LeagueTable, SectionTitle } from './SeasonGames';
import { useLeague } from '@/context/LeagueContext';
import { isInLeague } from '@/components/InLeague';
import { ArcadeToggle, ClubStrip, LedBoard, LedDigits, PixelIcon, ScoreTile, StadiumHeader, clubVars, type StagePlayer } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { openClubSeason, prefetchClubSeason } from '@/utils/clubSeason';
import './sx.css';

/**
 * NFL edition Season page pieces (arcade kit, flat club colours): the season header (the leading club's stadium and
 * stars, its record on an LED board, the champion plate, AP award winners with sprites), the playoff bracket as score
 * tiles on a turf board, division boards and the power ladder with movement against the season before. All rules over
 * the per-season schedule file.
 */

const nick = (team: string) => findNFLTeam(team)?.name ?? team;
const cv = (club?: string | null) => clubVars(club) as CSSProperties;

const CONFETTI = Array.from({ length: 18 }, (_, i) => ({ left: `${(i * 37) % 100}%`, delay: `${-((i * 0.7) % 5).toFixed(1)}s`, d: `${4 + (i % 4)}s` }));

/**
 * The season header: the leading club's stadium (the game's crowd and turf painted to it) with its three best players
 * standing on it and the record on an LED board, then the champion plate and the AP award winners.
 */
export const SeasonJumbo = ({ season, live }: { season: SeasonView; live: boolean }) => {
  const sb = season.superBowl;
  const [w, l] = (sb?.score ?? '').split('-');
  const top = [...season.table].sort((a, b) => b.pct - a.pct || b.diff - a.diff)[0];
  const lead = sb?.winner ?? top?.team;
  const { getAllPlayers, dataVersion } = useLeague();
  const id = findNFLTeam(lead ?? '')?.name;
  const best = useMemo(
    () =>
      getAllPlayers()
        .filter((p) => !p.isRealLegend && (!live || isInLeague(p)) && findNFLTeam(p.team)?.name === id)
        .sort((a, b) => (b.careerLegacy ?? 0) - (a.careerLegacy ?? 0))
        .slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getAllPlayers, dataVersion, id, live],
  );
  const stage = useMemo<StagePlayer[]>(() => (best.length === 3 ? [best[1], best[0], best[2]] : best).map((p) => ({ player: p, action: p === best[0] ? 'celebrate' : undefined })), [best]);
  const row = season.table.find((r) => r.team === lead);
  const wk = season.weeks?.filter((x) => x.games.some((g) => g.awayScore !== undefined)).length;
  return (
    <section aria-label={`${season.season} season`} className="sx-block">
      {lead && (
        <StadiumHeader
          club={lead}
          players={stage}
          size="m"
          kicker={live ? `${season.season} season · in progress${wk ? ` · week ${wk}` : ''}` : `${season.season} season${sb ? ` · Super Bowl ${sb.roman}` : ''}`}
          title={nick(lead)}
          height={240}
          right={row ? <LedBoard label={live ? 'Best record' : 'Final record'} value={row.record} sub={`${signed(row.diff)} pts · power #${Number.isFinite(row.power) ? row.power : '–'}`} dot={3} /> : undefined}
        />
      )}
      {best.length > 0 && (
        <Reveal className="sx-stars" aria-label={`${nick(lead ?? '')} stars`}>
          {best.map((p, i) => (
            <PlayerHit key={p.name} name={p.name} pos={p.position} className="max-w-full mo-rise" style={stag(i + 3, 80)}>
              <ClubStrip club={lead} size="sm">{displayName(p.name)}</ClubStrip>
            </PlayerHit>
          ))}
        </Reveal>
      )}
      {lead && sb && (
        <Reveal className="sx-champ" style={cv(lead)}>
          {sb && (
            <span className="sx-confetti" aria-hidden>
              {CONFETTI.map((c, i) => (
                <i key={i} style={{ left: c.left, animationDelay: c.delay, animationDuration: c.d }} />
              ))}
            </span>
          )}
          <span className="sx-champ__logo mo-pop"><TeamLogo team={lead} decorative className="h-16 w-16" /></span>
          <div className="sx-champ__txt">
            {sb ? (
              <>
                <span className="sx-champ__kick">Super Bowl {sb.roman} champions</span>
                <span className="sx-champ__name"><PixelIcon name="trophy" size={26} /> {nick(sb.winner)}</span>
                <span className="sx-champ__over">over <TeamLogo team={sb.loser} decorative className="h-5 w-5" /> {nick(sb.loser)}</span>
              </>
            ) : top ? (
              <>
                <span className="sx-champ__kick">Best record so far</span>
                <span className="sx-champ__name">{nick(top.team)}</span>
                <span className="sx-champ__over">{top.record} · Super Bowl still to play</span>
              </>
            ) : null}
          </div>
          {sb && w && l && (
            <span className="sx-champ__led ax-ledboard" role="img" aria-label={`Final score ${w} to ${l}`}>
              <span className="ax-kicker">Final</span>
              <LedDigits value={`${w}-${l}`} dot={4} />
            </span>
          )}
        </Reveal>
      )}
    </section>
  );
};

/* ---------------- Playoff bracket ---------------- */

type PGame = NonNullable<SeasonView['playoffs']>[number]['games'][number];

const BracketGame = ({ g, final, seeds, id, i = 0 }: { g: PGame; final?: boolean; seeds: Map<string, number>; id?: string; i?: number }) => {
  const fav = g.line === undefined || g.line === 0 ? null : g.line > 0 ? g.home : g.away;
  const winner = g.away_score > g.home_score ? g.away : g.home;
  const upset = fav && winner !== fav && Math.abs(g.line!) >= 2.5;
  const seed = (t: string) => (seeds.has(t) ? `#${seeds.get(t)}` : undefined);
  return (
    <li className="min-w-0 mo-pop" style={stag(i, 90)}>
      <ScoreTile
        away={{ club: g.away, score: g.away_score, record: seed(g.away) }}
        home={{ club: g.home, score: g.home_score, record: seed(g.home) }}
        footer={upset ? `UPSET · LINE ${fav} −${Math.abs(g.line!)}` : final ? 'SUPER BOWL' : 'FINAL'}
        onClick={id ? () => openGame(id) : undefined}
        className={cn('sx-bracket-tile', final && 'is-final')}
      />
    </li>
  );
};

export const PlayoffBracket = ({ season }: { season: SeasonView }) => {
  const ids = useGameIds(IS_NFL);
  const rounds = season.playoffs ?? [];
  const seeds = useMemo(() => playoffSeeds(season), [season]);
  if (!rounds.length) return null;
  const sb = season.superBowl;
  return (
    <div className="sx-block" id="season-bracket" style={{ scrollMarginTop: 80 }}>
      <SectionTitle kicker="Postseason" club={sb?.winner}>Road to the Super Bowl</SectionTitle>
      <Reveal className="sx-field">
        <div className="relative flex min-w-[640px] items-stretch gap-3">
          {rounds.map((r, ri) => (
            <div key={r.round} className="flex min-w-0 flex-1 flex-col">
              <p className={cn('sx-field__round', r.round === 'Super Bowl' && 'is-sb')}>{r.round}</p>
              <ul className="flex flex-1 list-none flex-col justify-around gap-2 p-0">
                {r.games.map((g, gi) => (
                  <BracketGame key={`${g.away}-${g.home}`} g={g} final={r.round === 'Super Bowl'} seeds={seeds} id={playoffGameId(ids, season.season, g.away, g.home)} i={ri * 2 + gi * 0.5} />
                ))}
              </ul>
            </div>
          ))}
          {sb && (
            <div className="sx-field__cup">
              <PixelIcon name="trophy" size={56} color="hsl(var(--gold))" />
              <TeamLogo team={sb.winner} decorative className="h-9 w-9" />
              <span>Champions</span>
            </div>
          )}
        </div>
      </Reveal>
      {seeds.size > 0 && <p className="sx-note">Seeds: division winners first, then wild cards, each by win percentage then point differential (a simplified tiebreak).</p>}
    </div>
  );
};

/** A standings or ladder row opens that club's sheet (Teams); keyboard and screen-reader reachable. */
const clubLink = (team: string, year?: string | number) => ({
  role: 'link' as const,
  tabIndex: 0,
  onClick: () => openClubSeason(team, year ? Number(year) : undefined),
  onPointerEnter: prefetchClubSeason,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openClubSeason(team, year ? Number(year) : undefined);
    }
  },
});

/* ---------------- Power ladder ---------------- */

export const PowerLadder = ({ season }: { season: SeasonView }) => {
  const [all, setAll] = useState<'10' | 'all'>('10');
  const rows = [...season.table].filter((r) => Number.isFinite(r.power)).sort((a, b) => a.power - b.power);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.powerScore));
  const min = Math.min(...rows.map((r) => r.powerScore));
  const shown = all === 'all' ? rows : rows.slice(0, 10);
  const prev = season.prevPower;
  return (
    <div className="sx-block" id="season-power" style={{ scrollMarginTop: 80 }}>
      <SectionTitle
        kicker="Rankings"
        club={rows[0].team}
        right={<ArcadeToggle label="Ladder length" size="sm" value={all} onChange={(v) => setAll(v as '10' | 'all')} options={[{ value: '10', label: 'Top 10' }, { value: 'all', label: `All ${rows.length}` }]} />}
      >
        Power ladder
      </SectionTitle>
      <Reveal as="ol" className="sx-ladder">
        {shown.map((r, ri) => {
          const before = prev?.[r.abbr];
          const move = before ? before - r.power : null;
          return (
            <li key={r.abbr} className={cn('sx-rung sx-club-link mo-rise', r.power <= 3 && 'is-top')} style={{ ...cv(r.team), ...stag(ri, 40) }} {...clubLink(r.team, season.season)}>
              <span className="sx-rung__n">{r.power}</span>
              <TeamLogo team={r.team} decorative className="h-8 w-8 flex-shrink-0" />
              <span className="sx-rung__name">{r.team}</span>
              <span className="sx-rung__rec">{r.record}</span>
              <span className="sx-rung__diff">{signed(r.diff)}</span>
              <span className={cn('sx-rung__mv', move === null ? 'text-muted-foreground' : move > 0 ? 'text-[hsl(145_63%_55%)]' : move < 0 ? 'text-[hsl(357_80%_70%)]' : 'text-muted-foreground')} title={before ? `Ranked ${before} the season before` : 'Not ranked the season before'}>
                {move === null ? <span className="font-pixel text-[7px]">NEW</span> : move > 0 ? <><TrendingUp className="h-3 w-3" aria-hidden />{move}</> : move < 0 ? <><TrendingDown className="h-3 w-3" aria-hidden />{-move}</> : <Minus className="h-3 w-3" aria-hidden />}
              </span>
              <span className="sx-rung__bar" aria-hidden><i className="mo-grow" style={{ width: `${8 + (92 * (r.powerScore - min)) / Math.max(1, max - min)}%`, ['--i' as string]: ri * 0.7 + 3 }} /></span>
            </li>
          );
        })}
      </Reveal>
    </div>
  );
};

/** The full table behind a toggle, for anyone who wants every column. */
export const FullTable = ({ season }: { season: SeasonView }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="sx-block" id="season-table" style={{ scrollMarginTop: 80 }}>
      <div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="ax-chip">
          {open ? 'Hide the full league table' : 'Full league table'}
        </button>
      </div>
      {open && <LeagueTable season={season} />}
    </div>
  );
};
