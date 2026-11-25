import { useMemo } from 'react';
import PixelLoader from '@/components/ui/PixelLoader';
import { ArcadeToggle, PixelSelect, PixelStepper, SectionHeader } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { useDraftYear, type CollegeIndex, type PickRow, type SchoolInfo } from '@/utils/collegeData';
import { clubColors, Figure, Outcome, PickName, SchoolLink, usePlayerMap } from './shared';

interface Props {
  idx: CollegeIndex;
  year: number;
  round: number | 'all';
  onYear: (y: number) => void;
  onRound: (r: number | 'all') => void;
  onSchool: (slug: string) => void;
}

const CHUNK = 16;
const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * One draft as a war-room board: a round at a time (or every pick), each pick a card with the club's logo and colour,
 * the pick number, the player's name (his club-colour strip to the Deep Dive when he has a card), position, school and
 * what became of the pick. Above it the class's steals and busts by the site's career OVR (draft 3+ seasons old).
 */
const DraftBoard = ({ idx, year, round, onYear, onRound, onSchool }: Props) => {
  const d = useDraftYear(year);
  const players = usePlayerMap();
  const years = useMemo(() => idx.years.map((y) => y[0]), [idx]);
  const meta = idx.years.find((y) => y[0] === year);
  const rounds = meta?.[2] ?? 7;
  const picks = useMemo(() => (d?.picks ?? []).filter((p) => round === 'all' || p[0] === round), [d, round]);
  const byPick = useMemo(() => new Map((d?.picks ?? []).map((p) => [p[1], p])), [d]);
  const school = (p: PickRow) => (p[5] && d?.schools[p[5]]) || null;
  const steals = (d?.steals ?? []).map((n) => byPick.get(n)).filter((p): p is PickRow => !!p);
  const busts = (d?.busts ?? []).map((n) => byPick.get(n)).filter((p): p is PickRow => !!p);
  const hofs = (d?.picks ?? []).filter((p) => p[10] > 0).length;

  return (
    <section aria-labelledby="cl-board-title" className="cl-sec">
      <SectionHeader
        as="h2"
        kicker={`${meta?.[1] ?? '–'} picks · ${rounds} rounds`}
        title={<span id="cl-board-title">The {year} draft board</span>}
        right={
          <div className="cl-yearpick">
            <PixelStepper value={year} values={years} onChange={onYear} label="Draft year" />
            <PixelSelect
              label="Jump to a draft"
              prefix="Draft"
              value={year}
              onChange={onYear}
              options={[...years].reverse().map((y) => ({ value: y, label: String(y) }))}
            />
          </div>
        }
      />
      <div className="cl-rounds">
        <ArcadeToggle<string>
          size="sm"
          label="Round"
          value={String(round)}
          onChange={(v) => onRound(v === 'all' ? 'all' : Number(v))}
          options={[...Array.from({ length: rounds }, (_, i) => ({ value: String(i + 1), label: `Rd ${i + 1}` })), { value: 'all', label: 'All' }]}
        />
        {d && (
          <p className="cl-note">
            {d.rated} of these picks have a card on the site{hofs ? ` · ${hofs} Hall of Famer${hofs === 1 ? '' : 's'}` : ''}
          </p>
        )}
      </div>

      {d === undefined && <PixelLoader label="Draft" what={`the ${year} draft`} minHeight={360} className="justify-start pt-12" />}
      {d === null && <p className="cl-note">No draft file for {year}.</p>}

      {d && (d.judged ? (
        <div className="cl-verdicts">
          <Verdict title="Steals" kicker={`Round 3 on · OVR ${idx.stealBar}+`} tone="steal" picks={steals} players={players} empty="No pick from round 3 on reached the steal bar." onSchool={onSchool} school={school} />
          <Verdict title="Busts" kicker={`Top 10 · OVR ${idx.bustBar} or lower`} tone="bust" picks={busts} players={players} empty="No top-10 pick fell to the bust bar." onSchool={onSchool} school={school} />
        </div>
      ) : (
        <p className="cl-callout">Too early to call steals and busts: a draft is judged after {idx.judgeAfter} seasons, so {year}'s waits until {year + idx.judgeAfter}.</p>
      ))}

      {d && (
        // In chunks: each rises in as it scrolls into view (one Reveal over a whole round at phone width is taller than
        // the observer's threshold could ever see)
        <div className="cl-board-wrap" role="list" aria-label={`${year} draft, ${round === 'all' ? 'every round' : `round ${round}`}`}>
          {chunks(picks, CHUNK).map((part, ci) => (
        <Reveal key={ci} className="cl-board">
          {part.map((p, i) => {
            const sc = school(p);
            const star = p[10] > 0 || p[9] > 0;
            const t = findNFLTeam(p[2]);
            return (
              <div role="listitem" key={p[1]} className={`cl-pick mo-rise${star ? ' is-star' : ''}${d.steals.includes(p[1]) ? ' is-steal' : ''}${d.busts.includes(p[1]) ? ' is-bust' : ''}`} style={{ ...clubColors(p[2]), ...stag(Math.min(i, 12), 22) }}>
                <span className="cl-pick__club" aria-hidden="true">
                  <TeamLogo team={p[2]} size={30} decorative />
                </span>
                <span className="cl-pick__no">
                  <b>{p[1]}</b>
                  <small>{round === 'all' ? `Rd ${p[0]}` : t?.abbreviation ?? ''}</small>
                </span>
                <span className="cl-pick__body">
                  <span className="cl-pick__name">
                    <PickName name={p[3]} siteKey={p[6]} club={p[2]} />
                  </span>
                  <span className="cl-pick__meta">
                    <span className="cl-pos">{p[4]}</span>
                    {sc ? <SchoolLink school={sc} onOpen={onSchool} /> : null}
                  </span>
                  <Outcome hof={p[10]} ap={p[9]} pb={p[8]} ovr={p[7]} g={p[11]} />
                </span>
              </div>
            );
          })}
        </Reveal>
          ))}
        </div>
      )}
      <p className="cl-foot">
        Picks, Pro Bowls, first-team All-Pro and games from nflverse's draft file; OVR is the site's career rating; HOF is a real inductee. Clubs carry today's
        names; the codes that changed franchises (Houston, Baltimore, St. Louis) are read by year.
      </p>
    </section>
  );
};

const Verdict = ({
  title,
  kicker,
  tone,
  picks,
  players,
  empty,
  onSchool,
  school,
}: {
  title: string;
  kicker: string;
  tone: 'steal' | 'bust';
  picks: PickRow[];
  players: ReturnType<typeof usePlayerMap>;
  empty: string;
  onSchool: (slug: string) => void;
  school: (p: PickRow) => (SchoolInfo & { slug?: string }) | null;
}) => (
  <Reveal className={`cl-verdict cl-verdict--${tone}`}>
    <header className="cl-verdict__head mo-rise">
      <span className="ax-kicker">{kicker}</span>
      <h3>{title}</h3>
    </header>
    {picks.length ? (
      <ul className="cl-verdict__list">
        {picks.map((p, i) => {
          const sc = school(p);
          return (
            <li key={p[1]} className="cl-vcard mo-pop" style={{ ...clubColors(p[2]), ...stag(i + 1, 70) }}>
              <span className="cl-vcard__fig" aria-hidden="true">
                <Figure player={p[6] ? players.get(p[6]) : null} club={p[2]} kind="bust" size="m" logo={40} />
              </span>
              <span className="cl-vcard__body">
                <PickName name={p[3]} siteKey={p[6]} club={p[2]} />
                <span className="cl-vcard__line">
                  Pick {p[1]} · Rd {p[0]} · {p[4]}
                  {sc ? <> · <SchoolLink school={sc} onOpen={onSchool} size={14} /></> : null}
                </span>
              </span>
              <span className="cl-vcard__ovr">
                <b>{p[7]}</b>
                <small>OVR</small>
              </span>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="cl-note">{empty}</p>
    )}
  </Reveal>
);

export default DraftBoard;
