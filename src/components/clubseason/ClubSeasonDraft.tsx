import { usePlayoffOdds } from '@/utils/playoffOdds';
import { useNeeds } from '@/utils/collegeData';
import { Section } from './ClubSeasonSection';

/**
 * The programme's "Draft outlook" band for the season in progress: the club's projected first-round pick in the next
 * draft (the most likely slot and the middle 90% of the 10,000 simulated seasons, scripts/nfl/playoff_odds.py) with the
 * slot spread as bars, and its top positional needs from its depth chart (scripts/nfl/college.py needs.json). Nothing
 * for a past season or before the projection is built. `onOpen` leaves the sheet for the College tab's war room (the projected order and the needs on one board).
 */
const ClubSeasonDraft = ({ abbr, clubName, year, onOpen }: { abbr: string; clubName: string; year: number; onOpen: (section: 'warroom') => void }) => {
  const odds = usePlayoffOdds();
  const needs = useNeeds();
  const c = odds?.clubs[abbr];
  if (!odds?.draft || odds.season !== year || !c?.draft) return null;
  const d = c.draft;
  const rows = (needs?.clubs[abbr] ?? []).slice(0, 3);
  const max = Math.max(...d.dist, 0.0001);
  const ageFrom = needs?.ageFrom ?? 30;
  return (
    <Section title="Draft outlook" note={`${odds.draft.year} draft · own pick, projected`} className="pg-draft">
      <div className="pg-dr">
        <div className="pg-dr__slot mo-rise">
          <span className="pg-kick">Most likely pick</span>
          <b className="pg-dr__n">{d.mode}</b>
          <span className="pg-dr__range">range {d.lo}–{d.hi} · average {d.mean.toFixed(1)}</span>
          <span className="pg-dr__bars" role="img" aria-label={`Simulated first-round slot for the ${clubName}: most likely ${d.mode}, middle 90% from ${d.lo} to ${d.hi}`}>
            {d.dist.map((p, i) => (
              <i key={i} className={i + 1 === d.mode ? 'is-mode' : i + 1 >= d.lo && i + 1 <= d.hi ? 'is-in' : ''} style={{ height: `${Math.max(p > 0 ? 8 : 0, (p / max) * 100)}%` }} />
            ))}
          </span>
          <span className="pg-dr__axis" aria-hidden="true"><span>1</span><span>16</span><span>32</span></span>
        </div>
        <div className="pg-dr__needs mo-rise">
          <span className="pg-kick">Top needs · from the depth chart</span>
          {rows.length ? (
            <ol>
              {rows.map((n, i) => (
                <li key={n.g}>
                  <b className="pg-dr__pos">{n.g}</b>
                  <span>
                    <span className="pg-dr__need">{i === 0 ? 'Needs ' : ''}{n.need}</span>
                    <small>
                      unit SZN {Math.round(n.szn)}, league {Math.round(n.lg)}
                      {n.old && n.old > ageFrom ? `, oldest starter ${n.old}` : ''}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="pg-note">No rated starters on file.</p>
          )}
          <div className="pg-dr__links">
            <button type="button" onClick={() => onOpen('warroom')}>The {odds.draft.year} war room <span aria-hidden="true">→</span></button>
          </div>
        </div>
      </div>
      <p className="pg-note">
        From {odds.sims.toLocaleString()} simulations of the rest of the {odds.season} season and the playoffs, by the NFL's order rules. Each club's own pick (traded
        picks aren't in the data); needs are a projection from the depth chart, not prospects.
      </p>
    </Section>
  );
};

export default ClubSeasonDraft;
