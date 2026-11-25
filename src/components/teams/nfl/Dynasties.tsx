import { useMemo } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { SectionHeader } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { findNFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn } from '@/utils/teamColors';
import { seasonLabel } from '@/config/edition';
import { openTeamPage } from '@/utils/teamSearch';
import { pctText, recordLine, useAllTimeRecords, winPct, type ClubSeason } from './allTime';
import './dynasties.css';

const WINDOW = 5;
const SHOWN = 8;

interface Run {
  club: string;
  from: number;
  to: number;
  w: number;
  l: number;
  t: number;
  titles: number;
  playoffs: number;
}
interface Streak {
  club: string;
  from: number;
  to: number;
  n: number;
}

const rowStyle = (club: string) => {
  const t = findNFLTeam(club);
  return t ? { ['--p' as string]: `hsl(${t.primaryColor})`, ['--fg' as string]: getReadableTextOn(t.primaryColor) } : undefined;
};

/** Each club's best five-season stretch by win %, the top eight clubs; and every run of consecutive titles. */
const Dynasties = () => {
  const allTime = useAllTimeRecords();
  const { runs, streaks } = useMemo(() => {
    const runs: Run[] = [];
    const streaks: Streak[] = [];
    allTime?.seasons.forEach((list: ClubSeason[], club) => {
      let best: Run | null = null;
      for (let i = 0; i + WINDOW <= list.length; i++) {
        const w = list.slice(i, i + WINDOW);
        if (w[WINDOW - 1].season - w[0].season !== WINDOW - 1) continue;
        const sum = w.reduce((a, s) => ({ w: a.w + s.w, l: a.l + s.l, t: a.t + s.t }), { w: 0, l: 0, t: 0 });
        const run = { club, from: w[0].season, to: w[WINDOW - 1].season, ...sum, titles: w.filter((s) => s.champion).length, playoffs: w.filter((s) => s.playoff).length };
        if (!best || winPct(run) > winPct(best) || (winPct(run) === winPct(best) && run.titles > best.titles)) best = run;
      }
      if (best) runs.push(best);
      let at = 0;
      while (at < list.length) {
        if (!list[at].champion) {
          at++;
          continue;
        }
        let end = at;
        while (end + 1 < list.length && list[end + 1].champion && list[end + 1].season === list[end].season + 1) end++;
        if (end > at) streaks.push({ club, from: list[at].season, to: list[end].season, n: end - at + 1 });
        at = end + 1;
      }
    });
    runs.sort((a, b) => winPct(b) - winPct(a) || b.titles - a.titles);
    streaks.sort((a, b) => b.n - a.n || b.to - a.to);
    return { runs: runs.slice(0, SHOWN), streaks: streaks.slice(0, SHOWN) };
  }, [allTime]);
  if (!runs.length && !streaks.length) return null;
  return (
    <section aria-labelledby="dyn-heading" className="dyn space-y-3">
      <SectionHeader kicker="Eras" title={<span id="dyn-heading">Dynasties</span>} />
      <div className="dyn-cols">
        {runs.length > 0 && (
          <div className="min-w-0">
            <h3 className="dyn-h">Best five-season runs</h3>
            <Reveal as="ol" className="dyn-list">
              {runs.map((r, i) => (
                <li key={r.club} className="mo-rise" style={stag(i, 40)}>
                  <button type="button" className="dyn-row" style={rowStyle(r.club)} onClick={() => openTeamPage(r.club, { tab: 'franchise' })} aria-label={`${r.club}, ${seasonLabel(r.from)} to ${seasonLabel(r.to)}: ${recordLine(r)}. Open club page`}>
                    <span className="dyn-n">{i + 1}</span>
                    <TeamLogo team={r.club} decorative size={30} />
                    <span className="dyn-main">
                      <b>{r.club}</b>
                      <small>
                        {seasonLabel(r.from)}–{seasonLabel(r.to)} · {recordLine(r)}
                        {r.titles > 0 ? ` · ${r.titles} ${r.titles === 1 ? 'title' : 'titles'}` : ''}
                        {r.playoffs > 0 ? ` · ${r.playoffs} playoff trips` : ''}
                      </small>
                    </span>
                    <span className="dyn-pct">{pctText(winPct(r))}</span>
                  </button>
                </li>
              ))}
            </Reveal>
          </div>
        )}
        {streaks.length > 0 && (
          <div className="min-w-0">
            <h3 className="dyn-h">Repeat champions</h3>
            <Reveal as="ol" className="dyn-list">
              {streaks.map((s, i) => (
                <li key={`${s.club}-${s.from}`} className="mo-rise" style={stag(i, 40)}>
                  <button type="button" className="dyn-row" style={rowStyle(s.club)} onClick={() => openTeamPage(s.club, { tab: 'franchise' })} aria-label={`${s.club}, ${s.n} straight titles, ${seasonLabel(s.from)} to ${seasonLabel(s.to)}. Open club page`}>
                    <span className="dyn-n">{i + 1}</span>
                    <TeamLogo team={s.club} decorative size={30} />
                    <span className="dyn-main">
                      <b>{s.club}</b>
                      <small>
                        {seasonLabel(s.from)}–{seasonLabel(s.to)}
                      </small>
                    </span>
                    <span className="dyn-pct">{s.n} straight</span>
                  </button>
                </li>
              ))}
            </Reveal>
          </div>
        )}
      </div>
    </section>
  );
};

export default Dynasties;
