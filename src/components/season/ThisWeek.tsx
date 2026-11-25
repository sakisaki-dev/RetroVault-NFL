import { useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { ClubStrip, clubPlate, clubVars } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { StarSprite } from './NflSeasonExtras';
import { SectionTitle } from './SeasonGames';
import { useClubStars } from './PlayoffRace';
import { findNFLTeam } from '@/utils/nflTeams';
import { openGame, regularGameId, useGameIds } from '@/utils/nflGames';
import { kickoffText } from '@/utils/seasonLive';
import type { PickGame, PlayoffOdds } from '@/utils/playoffOdds';
import './odds.css';

/**
 * Season page, "This week": every game of the coming week with its favourite and win chance (the same model as the
 * playoff odds: the posted line when there is one), the Game of the Week and the favourites' scorecard. Cards open the
 * game page. Rules over public/data/nfl/playoff_odds.json.
 */
const nickOf = (abbr: string) => findNFLTeam(abbr)?.name ?? abbr;
const cv = (club?: string | null) => clubVars(club) as CSSProperties;
const pc = (p: number) => `${Math.round(p * 100)}%`;
const recText = (r: { w: number; l: number; t: number }) => `${r.w}–${r.l}${r.t ? `–${r.t}` : ''}`;

const Pick = ({ g, stars, id, i, extra }: { extra?: boolean; g: PickGame; stars: ReturnType<typeof useClubStars>; id?: string; i: number }) => {
  const away = nickOf(g.away);
  const home = nickOf(g.home);
  const pa = 1 - g.pHome;
  const favHome = g.pHome >= 0.5;
  const fav = favHome ? g.home : g.away;
  const edge = Math.abs(g.line ?? 0);
  const k = { day: g.day, date: g.date, time: g.time };
  const toss = Math.abs(g.pHome - 0.5) < 0.03;
  const side = (abbr: string, nick: string, rec: string, p: number, isFav: boolean) => {
    const star = stars.get(nick);
    return (
      <span className={cn('tw-side', isFav && !toss && 'is-fav')} style={cv(nick)}>
        <span className="tw-fig" aria-hidden>
          {star ? <StarSprite name={star.name} pos={star.position} team={nick} size="m" kind="bust" /> : <TeamLogo team={nick} decorative className="h-9 w-9" />}
        </span>
        <ClubStrip club={nick} size="sm" logo={false}>{abbr}</ClubStrip>
        <span className="tw-nick">{nick}</span>
        <small>{rec}</small>
        <b className="tw-p">{pc(p)}</b>
      </span>
    );
  };
  const inner = (
    <>
      {g.gotw && <span className="tw-flag">Game of the week</span>}
      <span className="tw-vs">
        {side(g.away, away, g.awayRec, pa, !favHome)}
        <em>at</em>
        {side(g.home, home, g.homeRec, g.pHome, favHome)}
      </span>
      <span className="tw-wp" aria-hidden>
        <i style={{ width: `${pa * 100}%`, background: clubPlate(away).fill, borderColor: clubPlate(away).edge }} />
        <i style={{ width: `${g.pHome * 100}%`, background: clubPlate(home).fill, borderColor: clubPlate(home).edge }} />
      </span>
      <span className="tw-foot">
        <span>{kickoffText(k)}</span>
        <span>
          {toss ? 'Toss-up' : <>{nickOf(fav)} favoured{g.line != null && edge > 0 ? ` by ${edge}` : ''}</>} · {g.basis === 'line' ? 'posted line' : 'club ratings'}
        </span>
      </span>
    </>
  );
  const label = `${away} at ${home}: ${nickOf(fav)} ${pc(Math.max(g.pHome, pa))}. ${kickoffText(k)}`;
  return (
    <li className={cn('tw-pick mo-rise', g.gotw && 'is-gotw', extra && 'tw-extra')} style={stag(i, 50)}>
      {id ? (
        <button type="button" className="tw-card" aria-label={`${label}. Open the game`} onClick={() => openGame(id)}>{inner}</button>
      ) : (
        <div className="tw-card" aria-label={label}>{inner}</div>
      )}
    </li>
  );
};

const ThisWeek = ({ odds }: { odds: PlayoffOdds }) => {
  const [all, setAll] = useState(false);
  const stars = useClubStars();
  const ids = useGameIds(true);
  const { week, games, scorecard } = odds.picks;
  const sc = scorecard;
  const ordered = useMemo(() => [...games].sort((a, b) => Number(b.gotw) - Number(a.gotw) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)), [games]);
  if (!games.length) return null;
  const up = sc.lastWeek?.upset;
  return (
    <div className="sx-block tw" id="this-week">
      <SectionTitle kicker={`Week ${week} · ${games.length} games`} club={ordered[0] ? nickOf(ordered[0].home) : undefined}>This week</SectionTitle>
      <Reveal className="tw-score">
        <div className="tw-cell">
          <span className="tw-k">Last week · favourites</span>
          <span className="tw-big">{sc.lastWeek ? recText(sc.lastWeek) : '–'}</span>
          <span className="tw-sub">{sc.lastWeek ? `Week ${sc.lastWeek.week}${sc.lastWeek.tossups ? ` · ${sc.lastWeek.tossups} toss-up${sc.lastWeek.tossups > 1 ? 's' : ''} not counted` : ''}` : ''}</span>
        </div>
        <div className="tw-cell tw-cell--up">
          <span className="tw-k">Upset of the week</span>
          {up ? (
            <p>
              <ClubStrip club={nickOf(up.winner)} size="sm">{nickOf(up.winner)}</ClubStrip> beat the <ClubStrip club={nickOf(up.loser)} size="sm">{nickOf(up.loser)}</ClubStrip> {up.score}, a {pc(up.chance)} shot.
            </p>
          ) : (
            <p className="tw-sub">Every favourite held.</p>
          )}
        </div>
        <div className="tw-cell">
          <span className="tw-k">Season · favourites</span>
          <span className="tw-big">{recText(sc.season)}</span>
          <span className="tw-sub">{sc.season.pct != null ? `${Math.round(sc.season.pct * 100)}% won` : ''}</span>
        </div>
      </Reveal>
      <ul className={cn('tw-picks', all && 'is-all')}>
        {ordered.map((g, i) => (
          <Pick key={g.id} g={g} stars={stars} id={regularGameId(ids, odds.season, g.week, g.away, g.home) ?? g.id} i={i} extra={i >= 6} />
        ))}
      </ul>
      {ordered.length > 6 && (
        <button type="button" className="ax-chip tw-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer games' : `All ${ordered.length} games`}
        </button>
      )}
      <p className="sx-note">Win chances from the betting lines.</p>
    </div>
  );
};

export default ThisWeek;
