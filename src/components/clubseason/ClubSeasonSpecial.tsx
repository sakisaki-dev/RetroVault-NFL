import { Reveal } from '@/components/motion/Reveal';
import { StarSprite } from '@/components/season/NflSeasonExtras';
import ClubStrip from '@/components/brand/ClubStrip';
import { InfoTip } from '@/components/ui/InfoTip';
import { displayName } from '@/utils/displayName';
import type { ClubSpecial } from '@/utils/clubSeason';
import { Section } from './ClubSeasonSection';

const nf = (n: number) => n.toLocaleString('en-US');
const ord = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 100 >= 11 && n % 100 <= 13 ? 0 : n % 10] ?? 'th'}`;
const pct = (m: number, a: number) => (a > 0 ? `${((100 * m) / a).toFixed(1)}%` : '–');
const BANDS = ['0-39', '40-49', '50+'];

/**
 * The club season's special teams (owner, 2026-11-25: kickers, no punters): the kicker the club used most (his field
 * goals, by distance as three bars, the longest), the unit's field goal percentage and its rank among the clubs, and the
 * club's leading returner by yards as one line. Names are club-colour strips that open the player card. All from the
 * weekly lines (scripts/nfl/club_season.py); nothing when the season has no kicker line.
 */
const ClubSeasonSpecial = ({ st, club, year, onPick }: { st: ClubSpecial | null; club: string; year: number; onPick: (key: string) => void }) => {
  if (!st || !st.fg || !st.fg[1]) return null;
  const [made, att] = st.fg;
  const name = (key: string) => {
    const n = displayName(key.split(':').slice(1).join(':'));
    return <ClubStrip team={club} label={n} size="sm" className="pg-name" playerKey={key} onClick={() => onPick(key)} ariaLabel={`${n}: open player card`} />;
  };
  const r = st.ret;
  const retYds = r ? r.kry + r.pry : 0;
  return (
    <Section title="Special teams" note={st.rk && st.of ? `FG % ${ord(st.rk)} of ${st.of}` : undefined}>
      <Reveal as="div" className="pg-kk">
        <div className="pg-kk__head">
          {st.k && (
            <span className="pg-kk__sp" aria-hidden="true">
              <StarSprite name={st.k.split(':').slice(1).join(':')} pos="K" team={club} size="m" kind="bust" season={year} />
            </span>
          )}
          <div className="pg-kk__who">
            <span className="pg-kick">Kicker</span>
            {st.k ? name(st.k) : <ClubStrip team={club} label="Unit" size="sm" className="pg-name" />}
          </div>
          <div className="pg-kk__big">
            <b className="num">{nf(made)}<small>/{nf(att)}</small></b>
            <em>{pct(made, att)}{st.long ? ` · long ${st.long}` : ''}</em>
          </div>
        </div>
        {st.b && (
          <ul className="pg-kk__bars" aria-label="Field goals by distance">
            {st.b.map(([m, a], i) => (
              <li key={BANDS[i]}>
                <span>{BANDS[i]} yds</span>
                <i aria-hidden="true"><u style={{ width: a ? `${(100 * m) / a}%` : 0 }} /></i>
                <b className="num">{a ? `${m}/${a}` : '–'}</b>
              </li>
            ))}
          </ul>
        )}
        {st.xp && st.xp[1] > 0 && (
          <p className="pg-kk__line">
            Extra points <b className="num">{st.xp[0]}/{st.xp[1]}</b> ({pct(st.xp[0], st.xp[1])})
            <InfoTip label="About the unit">The unit counts every kicker the club used that season; the kicker shown is the one with the most attempts. The rank is the unit's field goal percentage among the clubs with an attempt.</InfoTip>
          </p>
        )}
        {r && retYds > 0 && (
          <p className="pg-kk__line">
            Returner {name(r.k)}: {r.kr ? <><b className="num">{r.kr}</b> kick returns for <b className="num">{nf(r.kry)}</b> yds</> : null}
            {r.kr && r.pr ? ', ' : null}
            {r.pr ? <><b className="num">{r.pr}</b> punt returns for <b className="num">{nf(r.pry)}</b> yds</> : null}
          </p>
        )}
      </Reveal>
    </Section>
  );
};

export default ClubSeasonSpecial;
