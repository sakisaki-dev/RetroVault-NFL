import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ClubBadge, PixelIcon, PixelStepper, SectionHeader, clubVars } from '@/components/arcade';
import TeamLogo from '@/components/brand/TeamLogo';
import { IS_NFL } from '@/config/edition';
import { findNFLTeam } from '@/utils/nflTeams';
import { openGame, useGameIds, useSeasonGames, useSuperBowlIds, type GameDetail } from '@/utils/nflGames';
import { ROUND_LABEL, parseGameId } from '@/utils/gameFinder';
import { ScoresSkeleton, gameOrder, played } from '@/components/season/ScoresBrowser';
import { Reveal, stag } from '@/components/motion/Reveal';
import './clubGames.css';

/**
 * The club sheet's "Schedule": one season of the club's games as results (W/L, score, opponent), each opening the
 * Game page, plus its Super Bowl appearances (from sb.json). The season's file loads when picked.
 */
/** sb.json keeps nflverse's own abbreviations for relocated clubs */
const NOW: Record<string, string> = { STL: 'LAR', LA: 'LAR', OAK: 'LV', SD: 'LAC' };
const now = (a: string) => NOW[a] ?? a;
const sbSides = (id: string) => { const g = parseGameId(id); return { away: now(g.away), home: now(g.home) }; };

/** One game of the club's season as a ticket: week kicker, W/L lamp, opponent logo, the score with the winner lit */
const Ticket = ({ g, abbr, i = 0 }: { g: GameDetail; abbr: string; i?: number }) => {
  const home = g.home === abbr;
  const opp = home ? g.away : g.home;
  const done = played(g);
  const pf = (home ? g.homeScore : g.awayScore) ?? 0;
  const pa = (home ? g.awayScore : g.homeScore) ?? 0;
  const r = !done ? null : pf > pa ? 'W' : pf < pa ? 'L' : 'T';
  const wk = g.type === 'REG' ? `WEEK ${g.week}` : (ROUND_LABEL[g.type] ?? g.type).toUpperCase();
  return (
    <li className="min-w-0 mo-rise" style={stag(i, 35)}>
      <button
        type="button"
        onClick={() => openGame(g.id)}
        aria-label={`${wk}, ${home ? 'vs' : 'at'} ${opp}${done ? `, ${r === 'W' ? 'win' : r === 'L' ? 'loss' : 'tie'} ${pf} to ${pa}` : ', not played yet'}. Open the game`}
        className={cn('cg-ticket', g.type !== 'REG' && 'is-post')}
        style={clubVars(opp)}
      >
        <span className="cg-ticket__wk">{wk}{g.ot ? ' · OT' : ''}</span>
        <span className="cg-ticket__main">
          <span className={cn('cg-lamp', r && `is-${r}`)} aria-hidden>{r ?? '–'}</span>
          <TeamLogo team={opp} size={30} decorative backed />
          <span className="cg-ticket__opp" aria-hidden>{home ? 'vs' : '@'} {findNFLTeam(opp)?.abbreviation ?? opp}</span>
          {done && (
            <span className="cg-ticket__score" aria-hidden>
              <b className={cn(r === 'W' && 'is-lit')}>{pf}</b>
              <i>–</i>
              <b className={cn(r === 'L' && 'is-lit')}>{pa}</b>
            </span>
          )}
        </span>
      </button>
    </li>
  );
};

const ClubGames = ({ teamName }: { teamName: string }) => {
  const abbr = findNFLTeam(teamName)?.abbreviation;
  const ids = useGameIds(IS_NFL);
  const sb = useSuperBowlIds();
  const years = useMemo(() => (ids ? Object.keys(ids).map(Number).sort((a, b) => b - a) : []), [ids]);
  const [picked, setPicked] = useState<number | null>(null);
  const year = picked ?? years[0];
  const all = useSeasonGames(year);
  const games = useMemo(() => (all && abbr ? all.filter((g) => g.away === abbr || g.home === abbr).sort(gameOrder) : null), [all, abbr]);
  const bowls = useMemo(() => Object.entries(sb ?? {}).filter(([, id]) => abbr && (sbSides(id).away === abbr || sbSides(id).home === abbr)).sort((a, b) => Number(b[0]) - Number(a[0])), [sb, abbr]);
  if (!IS_NFL || !abbr || !years.length) return null;
  return (
    <section aria-labelledby="club-games">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <SectionHeader as="h3" kicker="Club schedule" title="Schedule" club={teamName} className="cg-head" />
        <PixelStepper label="Season" value={year} onChange={setPicked} values={years} />
      </div>
      {all === undefined ? <ScoresSkeleton n={6} /> : !games?.length ? <p className="text-sm text-muted-foreground">No games found for {year}.</p> : (
        <Reveal as="ul" key={year} className="grid grid-cols-2 gap-2 md:grid-cols-3">{games.map((g, i) => <Ticket key={g.id} g={g} abbr={abbr} i={i} />)}</Reveal>
      )}
      {bowls.length > 0 && (
        <div className="mt-4">
          <p className="ax-kicker mb-1.5 flex items-center gap-1.5"><PixelIcon name="trophy" size={14} color="hsl(var(--gold))" /> Super Bowl appearances</p>
          <Reveal as="ul" className="flex flex-wrap gap-1.5">
            {bowls.map(([y, id], bi) => {
              const g = sbSides(id);
              const opp = g.away === abbr ? g.home : g.away;
              return (
                <li key={y} className="mo-pop" style={stag(bi)}>
                  <button type="button" onClick={() => openGame(id)} aria-label={`${y} Super Bowl against ${opp}. Open the game`} className="cg-sb">
                    <PixelIcon name="trophy" size={14} />
                    <span className="font-display text-sm font-bold tabular-nums">{y}</span>
                    <span className="font-pixel text-[8px] uppercase">vs</span>
                    <ClubBadge club={opp} size="sm" />
                  </button>
                </li>
              );
            })}
          </Reveal>
        </div>
      )}
    </section>
  );
};

export default ClubGames;
