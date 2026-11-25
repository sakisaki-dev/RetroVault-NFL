import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { useLeague } from '@/context/LeagueContext';
import type { Player } from '@/types/player';
import { isInLeague } from '@/components/InLeague';
import TeamLogo from '@/components/timeline/TeamLogo';
import { ArcadeToggle, ClubStrip, PixelIcon, clubVars } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { StarSprite } from './NflSeasonExtras';
import { SectionTitle } from './SeasonGames';
import { findNFLTeam } from '@/utils/nflTeams';
import { openTeamPage } from '@/utils/teamSearch';
import { displayName } from '@/utils/displayName';
import { ClinchTag } from './ClinchTag';
import { pctText, type OddsClub, type PlayoffOdds } from '@/utils/playoffOdds';
import './odds.css';

/**
 * Season page, "Playoff race": the odds file's chances for each club in a conference (playoffs, division, bye, title),
 * the clinched / eliminated marks the bound check proved, and what the coming week can settle. Once the regular season
 * is over it shows the final seeds instead and hides the odds. Rules over public/data/nfl/playoff_odds.json.
 */
const nickOf = (abbr: string) => findNFLTeam(abbr)?.name ?? abbr;
const cv = (club?: string | null) => clubVars(club) as CSSProperties;

/** The best player (Career Legacy) on each club's roster now, for the cards that stand someone on the club colour. */
export const useClubStars = (): Map<string, Player> => {
  const { getAllPlayers, dataVersion } = useLeague();
  return useMemo(() => {
    const m = new Map<string, Player>();
    getAllPlayers().forEach((p) => {
      if (p.isRealLegend || !isInLeague(p)) return;
      const club = findNFLTeam(p.team)?.name;
      if (!club) return;
      const cur = m.get(club);
      if (!cur || (p.careerLegacy ?? 0) > (cur.careerLegacy ?? 0)) m.set(club, p);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAllPlayers, dataVersion]);
};

const Bar = ({ p, club, label }: { p: number; club: string; label: string }) => (
  <span className="po-bar" style={cv(club)} role="img" aria-label={`${label} ${pctText(p)}`}>
    <i style={{ width: `${Math.max(p > 0 ? 2 : 0, p * 100)}%` }} />
    <b>{pctText(p)}</b>
  </span>
);

const seedLabel = (c: OddsClub) =>
  c.seed == null ? 'Out' : c.seed === 1 ? 'Seed 1 · bye' : c.tag === 'y' ? `Seed ${c.seed} · division` : `Seed ${c.seed} · wild card`;

const PlayoffRace = ({ odds }: { odds: PlayoffOdds }) => {
  const [conf, setConf] = useState<'AFC' | 'NFC'>('NFC');
  const [open, setOpen] = useState<string | null>(null);
  const [allScen, setAllScen] = useState(false);
  const stars = useClubStars();
  const final = odds.status === 'final';
  const rows = useMemo(
    () =>
      Object.entries(odds.clubs)
        .filter(([, c]) => c.conf === conf)
        .sort(([a, x], [b, y]) =>
          final ? (x.seed ?? 99) - (y.seed ?? 99) || y.w - x.w : y.playoffs - x.playoffs || y.divWin - x.divWin || y.w - x.w || a.localeCompare(b),
        ),
    [odds, conf, final],
  );
  const lead = final ? rows.find(([, c]) => c.seed === 1) : [...rows].sort(([, a], [, b]) => b.bye - a.bye)[0];
  const leadStar = lead ? stars.get(nickOf(lead[0])) : undefined;
  const scen = odds.scenarios.filter((s) => odds.clubs[s.club]?.conf === conf);
  const shownScen = allScen ? scen : scen.slice(0, 6);
  const kicker = final ? `${odds.season} final playoff picture` : `${odds.season} · after week ${odds.week - 1} of ${odds.weeksTotal}`;

  return (
    <div className="sx-block po" id="playoff-race">
      <SectionTitle
        kicker={kicker}
        club={lead ? nickOf(lead[0]) : undefined}
        right={<ArcadeToggle<'AFC' | 'NFC'> label="Conference" size="sm" value={conf} onChange={setConf} options={[{ value: 'NFC', label: 'NFC' }, { value: 'AFC', label: 'AFC' }]} />}
      >
        {final ? 'Playoff field' : 'Playoff race'}
      </SectionTitle>

      <div className={cn('po-grid', !final && scen.length === 0 && 'po-grid--solo')}>
        <Reveal className="po-panel">
          {lead && (
            <div className="po-lead mo-rise" style={cv(nickOf(lead[0]))}>
              {leadStar && (
                <span className="po-lead__fig" aria-hidden>
                  <StarSprite name={leadStar.name} pos={leadStar.position} team={nickOf(lead[0])} size="m" celebrate />
                </span>
              )}
              <TeamLogo team={nickOf(lead[0])} decorative className="po-lead__logo" />
              <span className="po-lead__txt">
                <span className="po-lead__kick">{final ? `${conf} No. 1 seed` : `${conf} bye favourite`}</span>
                <span className="po-lead__name">{nickOf(lead[0])}</span>
                <span className="po-lead__sub">{final ? 'Top seed, first-round bye' : `${pctText(lead[1].bye)} to earn the bye · ${pctText(lead[1].superBowl)} to win the Super Bowl`}</span>
              </span>
              {leadStar && <span className="po-lead__who">{displayName(leadStar.name)}</span>}
            </div>
          )}

          <div className="po-scroll" tabIndex={0} aria-label={`${conf} ${final ? 'playoff seeds' : 'playoff odds'}`}>
            <table className="po-table">
              <caption className="sr-only">{conf} {final ? 'final playoff seeds' : 'playoff odds'}, {odds.season}</caption>
              <thead>
                <tr>
                  <th scope="col">Club</th>
                  <th scope="col" className="po-r">W-L</th>
                  {final ? (
                    <th scope="col">Result</th>
                  ) : (
                    <>
                      <th scope="col">Playoffs</th>
                      <th scope="col" className="po-hide">Division</th>
                      <th scope="col" className="po-hide">Bye</th>
                      <th scope="col">Title</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(([abbr, c]) => {
                  const nick = nickOf(abbr);
                  const exp = open === abbr;
                  return (
                    <Fragment key={abbr}>
                      <tr className={cn('po-row', exp && 'is-open', c.tag === 'e' && 'is-out')} onClick={() => setOpen(exp ? null : abbr)}>
                        <th scope="row">
                          <span className="po-club">
                            {final && <span className="po-seed">{c.seed ?? '–'}</span>}
                            <ClubStrip club={nick} size="sm" onClick={() => openTeamPage(nick)} aria-label={`${nick}: open the team`}>{nick}</ClubStrip>
                            <ClinchTag tag={c.tag} />
                          </span>
                        </th>
                        <td className="po-r po-rec">{c.w}-{c.l}{c.t ? `-${c.t}` : ''}</td>
                        {final ? (
                          <td className="po-res">{seedLabel(c)}</td>
                        ) : (
                          <>
                            <td><Bar p={c.tag === 'e' ? 0 : c.playoffs} club={nick} label={`${nick} playoffs`} /></td>
                            <td className="po-hide"><Bar p={c.tag === 'e' ? 0 : c.divWin} club={nick} label={`${nick} division`} /></td>
                            <td className="po-hide"><Bar p={c.tag === 'e' ? 0 : c.bye} club={nick} label={`${nick} bye`} /></td>
                            <td><Bar p={c.tag === 'e' ? 0 : c.superBowl} club={nick} label={`${nick} Super Bowl`} /></td>
                          </>
                        )}
                      </tr>
                      {!final && exp && (
                        <tr className="po-more">
                          <td colSpan={4}>
                            <span>Division <b>{pctText(c.divWin)}</b></span>
                            <span>Bye <b>{pctText(c.bye)}</b></span>
                            <span>Conference <b>{pctText(c.conference)}</b></span>
                            <span>Exp. wins <b>{c.expWins.toFixed(1)}</b></span>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="sx-note">
            <b>x</b> clinched · <b>y</b> division · <b>z</b> top seed · <b>e</b> out · Title = Super Bowl
          </p>
        </Reveal>

        {(final || scen.length > 0) && (
        <Reveal className="po-panel po-scen">
          <h4 className="po-h">
            <PixelIcon name="flag" size={12} /> {final ? 'How the seeds fell' : `What it takes in week ${odds.week}`}
          </h4>
          {final ? (
            <p className="po-empty">Division winners seed 1–4, then the three best records.</p>
          ) : (
            <ul className="po-list">
              {shownScen.map((s, i) => {
                const nick = nickOf(s.club);
                return (
                  <li key={`${s.club}-${s.kind}`} className="mo-rise" style={stag(i, 50)}>
                    <ClinchTag tag={s.kind} />
                    <span>
                      <ClubStrip club={nick} size="sm" onClick={() => openTeamPage(nick)}>{nick}</ClubStrip>
                      {s.text.slice(nick.length)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {!final && scen.length > 6 && (
            <button type="button" className="ax-chip" onClick={() => setAllScen((v) => !v)} aria-expanded={allScen}>
              {allScen ? 'Show fewer' : `All ${scen.length}`}
            </button>
          )}
        </Reveal>
        )}
      </div>
      {!final && (
        <p className="sx-note po-method">
          The {odds.left} games left, played {odds.sims.toLocaleString()} times from the betting lines.
        </p>
      )}
    </div>
  );
};

export default PlayoffRace;
