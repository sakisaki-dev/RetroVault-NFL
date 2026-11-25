import type { CSSProperties } from 'react';
import type { Player } from '@/types/player';
import { Reveal, stag } from '@/components/motion/Reveal';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { useThisSeason, type NextGame } from '@/utils/thisSeason';
import { keyOf } from '../records';

const ABBR: Record<string, string> = { LA: 'LAR' };
const ord = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};
const fmt = (n: number) => n.toLocaleString('en-US');
const kickoff = (g: NextGame) => {
  const [y, m, d] = g.date.split('-').map(Number);
  const [hh, mm] = g.time.split(':').map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const t = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'} ET`;
  return { day, t };
};

/**
 * The live season for an active player, above the Game log tabs: headline numbers with their league rank among players at
 * his position, a 17-game pace (a projection), fantasy PPR and the club's next game with its win chance. Data from
 * thisseason.json (scripts/nfl/this_season.py). Nothing for a retired player or one with no game this season.
 */
const SeasonHeader = ({ player }: { player: Player }) => {
  const d = useThisSeason(player.status === 'Active' ? keyOf(player) : null);
  if (!d) return null;
  const { line, next } = d;
  const club = findNFLTeam(ABBR[line.club] ?? line.club);
  const opp = next ? findNFLTeam(ABBR[next.opp] ?? next.opp) : null;
  const ko = next ? kickoff(next) : null;
  const hue = club ? `hsl(${club.primaryColor})` : 'hsl(var(--gold))';
  return (
    <Reveal className="ts" style={{ '--tc': hue } as CSSProperties} aria-label={`${d.season} season so far`}>
      <div className="ts__head mo-rise" style={stag(0)}>
        {club && <TeamLogo team={club} size={30} decorative backed />}
        <div className="min-w-0">
          <div className="ts__k">This season · {d.season}</div>
          <div className="ts__s">
            {club?.name} · {line.games} {line.games === 1 ? 'game' : 'games'} through week {d.week}
          </div>
        </div>
      </div>
      <div className="ts__tiles">
        {line.stats.map((s, i) => (
          <div key={s.label} className="ts__tile mo-rise" style={stag(i + 1)}>
            <span className="ts__tk">{s.label}</span>
            <span className="ts__tv">{Number.isInteger(s.value) ? fmt(s.value) : s.value.toFixed(1)}</span>
            <span className="ts__tr" title={s.rank ? `Among ${s.of} ${player.position}s with a game this season` : undefined}>
              {s.rank ? <><b>{ord(s.rank)}</b> of {s.of}</> : ' '}
            </span>
          </div>
        ))}
      </div>
      <div className="ts__cards">
        {line.pace.length > 0 && (
          <div className="ts__card mo-rise" style={stag(6)}>
            <span className="ts__tk">17-game pace · projection</span>
            <div className="ts__pace">
              {line.pace.map((p) => (
                <span key={p.label}><b>{fmt(p.value)}</b> {p.label.toLowerCase()}</span>
              ))}
            </div>
            <span className="ts__note">His per-game rate over {line.games} games, times 17.</span>
          </div>
        )}
        {line.ppr && (
          <div className="ts__card mo-rise" style={stag(7)}>
            <span className="ts__tk">Fantasy · standard PPR scoring</span>
            <div className="ts__pace">
              <span><b>{line.ppr.perGame.toFixed(1)}</b> pts / game</span>
              <span><b>{ord(line.ppr.rank)}</b> of {line.ppr.of} {player.position}s</span>
            </div>
            <span className="ts__note">{line.ppr.total.toFixed(1)} points in total this season.</span>
          </div>
        )}
        {next && opp && ko && (
          <div className="ts__card ts__next mo-rise" style={stag(8)}>
            <span className="ts__tk">Next game · week {next.week}</span>
            <div className="ts__opp">
              <TeamLogo team={opp} size={34} decorative backed />
              <div className="min-w-0">
                <b>{next.home ? 'vs' : 'at'} {opp.fullName}</b>
                <span className="ts__note">{ko.day} · {ko.t}</span>
              </div>
            </div>
            {typeof next.p === 'number' && (
              <div className="ts__odds" title="Win chance from the playoff-odds model (the posted line where there is one)">
                <span>{club?.abbreviation} win chance <b>{Math.round(next.p * 100)}%</b></span>
                <span className="ts__bar"><i style={{ width: `${Math.round(next.p * 100)}%` }} /></span>
              </div>
            )}
          </div>
        )}
      </div>
    </Reveal>
  );
};

export default SeasonHeader;
