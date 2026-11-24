import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { liftForDarkBg } from '@/utils/teamColors';
import type { GameDetail, GamePlayer, Stat } from '@/utils/nflGames';
import { Reveal, stag } from '@/components/motion/Reveal';
import { clubVars } from '@/components/arcade';
import { NameStrip, SpriteOf, toneOf, type Linker } from './gameSections';
import { lineOf, played, podiumOf, readableOf, score, tackles, unitOf, v, winnerOf, type Side } from './gameModel';
import './gamePerformers.css';

/**
 * The Game page's Top performers: one themed block a club (header band with the logo, name and result), four player
 * cards in it (sprite on a club-colour floor, the name strip, one big headline number for his role, the sentence line,
 * a row of stat chips that skips anything the game's year doesn't record, and a share-of-team bar where one fits).
 */

const has = (s: Stat, k: string) => s[k] !== undefined && s[k] !== null && !Number.isNaN(s[k]);
const n1 = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const sg = (x: number, d = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d);
const pct = (x: number) => `${Math.round(x * 100)}%`;

interface Chip { value: string; label: string }
interface Headline { value: string; label: string }
interface Share { label: string; frac: number }

/** The one number that sums up his game, by role. */
const headlineOf = (p: GamePlayer): Headline | null => {
  const s = p.s;
  const u = unitOf(p);
  const tds = v(s, 'rushing_tds') + v(s, 'receiving_tds') + v(s, 'special_teams_tds');
  if (u === 'qb' && v(s, 'attempts') >= 5) return { value: String(v(s, 'passing_yards')), label: 'pass yds' };
  if (u === 'st' || v(s, 'fg_att')) return v(s, 'fg_att') ? { value: `${v(s, 'fg_made')}/${v(s, 'fg_att')}`, label: 'field goals' } : null;
  if (['dl', 'lb', 'db'].includes(u)) {
    if (v(s, 'def_tds')) return { value: String(v(s, 'def_tds')), label: v(s, 'def_tds') === 1 ? 'def TD' : 'def TDs' };
    if (v(s, 'def_interceptions')) return { value: String(v(s, 'def_interceptions')), label: v(s, 'def_interceptions') === 1 ? 'INT' : 'INTs' };
    if (v(s, 'def_sacks') >= 1) return { value: n1(v(s, 'def_sacks')), label: v(s, 'def_sacks') === 1 ? 'sack' : 'sacks' };
    if (tackles(s)) return { value: n1(tackles(s)), label: 'tackles' };
    return null;
  }
  if (tds >= 2) return { value: String(tds), label: 'TD' };
  if (u === 'bf' && v(s, 'carries') >= 3 && v(s, 'rushing_yards') >= v(s, 'receiving_yards')) return { value: String(v(s, 'rushing_yards')), label: 'rush yds' };
  if (v(s, 'receptions') || v(s, 'targets') >= 3) return { value: String(v(s, 'receiving_yards')), label: 'rec yds' };
  if (v(s, 'carries')) return { value: String(v(s, 'rushing_yards')), label: 'rush yds' };
  return null;
};

/** Three to five chips from what the data has for him; nothing is shown for a stat the year doesn't carry. */
const chipsOf = (p: GamePlayer, snapMax: number): Chip[] => {
  const s = p.s;
  const u = unitOf(p);
  const c: Chip[] = [];
  const add = (cond: boolean, value: string, label: string) => cond && c.push({ value, label });
  const snapPct = snapMax > 0 && v(s, 'offense_snaps') > 0 ? v(s, 'offense_snaps') / snapMax : snapMax > 0 && v(s, 'defense_snaps') > 0 ? v(s, 'defense_snaps') / snapMax : 0;
  if (u === 'qb' && v(s, 'attempts') >= 5) {
    add(true, `${v(s, 'completions')}/${v(s, 'attempts')}`, 'cmp/att');
    add(true, `${v(s, 'passing_tds')} / ${v(s, 'passing_interceptions')}`, 'TD / INT');
    add(has(s, 'passing_epa'), sg(s.passing_epa), 'pass EPA');
    add(has(s, 'passing_air_yards') && s.passing_air_yards > 0, String(s.passing_air_yards), 'air yds');
    add(has(s, 'passing_cpoe'), sg(s.passing_cpoe) + '%', 'CPOE');
    add(v(s, 'carries') >= 3, `${v(s, 'rushing_yards')}`, 'rush yds');
    add(v(s, 'sacks_suffered') > 0, String(v(s, 'sacks_suffered')), 'sacked');
  } else if (['dl', 'lb', 'db'].includes(u)) {
    add(tackles(s) > 0, `${v(s, 'def_tackles_solo')}/${tackles(s)}`, 'solo/total');
    add(v(s, 'def_sacks') > 0, n1(v(s, 'def_sacks')), 'sacks');
    add(v(s, 'def_tackles_for_loss') > 0, n1(v(s, 'def_tackles_for_loss')), 'TFL');
    add(v(s, 'def_qb_hits') > 0, String(v(s, 'def_qb_hits')), 'QB hits');
    add(has(s, 'def_pressures') && v(s, 'def_pressures') > 0, String(s.def_pressures), 'pressures');
    add(v(s, 'def_interceptions') > 0 && v(s, 'def_sacks') < 1 || v(s, 'def_interceptions') > 1, String(v(s, 'def_interceptions')), 'INT');
    add(v(s, 'def_pass_defended') > 0, String(v(s, 'def_pass_defended')), 'PD');
    add(v(s, 'def_fumbles_forced') > 0, String(v(s, 'def_fumbles_forced')), 'FF');
    add(v(s, 'def_tds') > 0 && !!v(s, 'def_interceptions'), String(v(s, 'def_tds')), 'def TD');
    add(snapPct > 0, pct(snapPct), 'snaps');
  } else if (u !== 'st') {
    add(v(s, 'targets') > 0, `${v(s, 'receptions')}/${v(s, 'targets')}`, 'rec/tgt');
    add(v(s, 'carries') >= 3, `${v(s, 'carries')}`, 'carries');
    add(v(s, 'carries') >= 3, n1(v(s, 'rushing_yards') / v(s, 'carries')), 'yds/carry');
    add(has(s, 'rush_yards_over_expected') && v(s, 'carries') >= 3, sg(s.rush_yards_over_expected), 'RYOE');
    add(v(s, 'rushing_tds') > 0 && v(s, 'receiving_tds') + v(s, 'rushing_tds') < 2, String(v(s, 'rushing_tds')), 'rush TD');
    add(v(s, 'receiving_tds') > 0 && v(s, 'receiving_tds') + v(s, 'rushing_tds') < 2, String(v(s, 'receiving_tds')), 'rec TD');
    add(v(s, 'receptions') > 0 && has(s, 'receiving_yards_after_catch'), String(v(s, 'receiving_yards_after_catch')), 'YAC');
    add(v(s, 'targets') > 0 && has(s, 'receiving_air_yards'), String(v(s, 'receiving_air_yards')), 'air yds');
    add(v(s, 'rushing_yards') > 0 && v(s, 'receptions') > 0 && v(s, 'carries') >= 3, `${v(s, 'receptions')}/${v(s, 'receiving_yards')}`, 'rec/yds');
    add(has(s, 'receiving_epa') && v(s, 'targets') > 0 && !(v(s, 'carries') >= 3), sg(s.receiving_epa), 'rec EPA');
    add(has(s, 'rushing_epa') && v(s, 'carries') >= 3, sg(s.rushing_epa), 'rush EPA');
    add(snapPct > 0, pct(snapPct), 'snaps');
  } else {
    add(v(s, 'fg_att') > 0, `${v(s, 'fg_made')}/${v(s, 'fg_att')}`, 'FG');
    add(v(s, 'fg_made') > 0 && has(s, 'fg_long'), String(s.fg_long), 'long');
    add(v(s, 'pat_att') > 0, `${v(s, 'pat_made')}/${v(s, 'pat_att')}`, 'XP');
  }
  if (u !== 'st' && has(s, 'fantasy_points_ppr') && v(s, 'fantasy_points_ppr') > 0 && u !== 'dl' && u !== 'lb' && u !== 'db') c.push({ value: n1(s.fantasy_points_ppr), label: 'PPR pts' });
  return c.slice(0, 5);
};

/** His share of the club's targets or carries, when he had a real part of them. */
const shareOf = (p: GamePlayer, mates: GamePlayer[]): Share | null => {
  const s = p.s;
  if (unitOf(p) === 'qb' || unitOf(p) === 'st') return null;
  const tg = mates.reduce((a, m) => a + v(m.s, 'targets'), 0);
  const ca = mates.reduce((a, m) => a + v(m.s, 'carries'), 0);
  if (v(s, 'carries') >= 5 && ca >= 10 && v(s, 'carries') >= v(s, 'targets')) return { label: 'of the club’s carries', frac: v(s, 'carries') / ca };
  if (v(s, 'targets') >= 3 && tg >= 10) return { label: 'of the club’s targets', frac: v(s, 'targets') / tg };
  return null;
};

export const Performers = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const done = played(g);
  const win = winnerOf(g);
  const ball = podiumOf(g)[0];
  return (
    <Reveal className="gm-pf">
      {([0, 1] as Side[]).map((s) => {
        const abbr = s === 0 ? g.away : g.home;
        const team = findNFLTeam(abbr);
        const mates = g.players.filter((p) => p.side === s);
        const rows = mates.filter((p) => score(p) > 0 && lineOf(p)).sort((a, b) => score(b) - score(a)).slice(0, 4);
        const snapOff = Math.max(0, ...mates.map((p) => v(p.s, 'offense_snaps')));
        const snapDef = Math.max(0, ...mates.map((p) => v(p.s, 'defense_snaps')));
        const mine = s === 0 ? g.awayScore : g.homeScore;
        const theirs = s === 0 ? g.homeScore : g.awayScore;
        const res = !done ? null : win === null ? 'T' : win === s ? 'W' : 'L';
        return (
          <article key={s} className="gm-pf__club mo-fade" style={{ ...clubVars(abbr), ['--tc' as string]: toneOf(abbr), ['--tl' as string]: liftForDarkBg(toneOf(abbr), 58), ['--i' as string]: s }} aria-label={`${team?.fullName ?? abbr} top performers`}>
            <header className="gm-pf__band">
              <TeamLogo team={abbr} decorative className="gm-pf__logo" />
              <span className="gm-pf__name"><small>{s === 0 ? 'Away' : 'Home'}</small>{team?.fullName ?? abbr}</span>
              {res && (
                <span className={cn('gm-pf__res', `is-${res}`)}>
                  <b>{res}</b> {mine}–{theirs}
                </span>
              )}
            </header>
            <ul className="gm-pf__list">
              {rows.map((p, i) => {
                const head = headlineOf(p);
                const chips = chipsOf(p, ['dl', 'lb', 'db'].includes(unitOf(p)) ? snapDef : snapOff);
                const share = shareOf(p, mates);
                const isBall = ball === p;
                return (
                  <li key={p.gsis + p.name} className={cn('gm-pf__card mo-rise', i === 0 && 'is-top', isBall && 'is-ball')} style={stag(i + 1 + s)}>
                    <span className="gm-pf__floor"><SpriteOf p={p} g={g} size="m" celebrate={isBall || i === 0} /></span>
                    <div className="gm-pf__body">
                      <div className="gm-pf__who">
                        <NameStrip p={p} g={g} link={link} className="gm-pf__n" />
                        <span className="gm-pf__pos">{p.pos || '—'}</span>
                        {isBall && <span className="gm-pf__ball" title="The game ball: the best line of the game">Game ball</span>}
                      </div>
                      {head && (
                        <p className="gm-pf__big"><b>{head.value}</b><span>{head.label}</span></p>
                      )}
                      <p className="gm-pf__line">{readableOf(p)}</p>
                      {chips.length >= 2 && (
                        <ul className="gm-pf__chips">
                          {chips.map((c) => <li key={c.label}><b>{c.value}</b><span>{c.label}</span></li>)}
                        </ul>
                      )}
                      {share && (
                        <div className="gm-pf__share" aria-label={`${pct(share.frac)} ${share.label}`}>
                          <span className="gm-pf__track"><i className="mo-grow" style={{ width: `${Math.max(4, Math.round(share.frac * 100))}%` }} /></span>
                          <span className="gm-pf__sharet"><b>{pct(share.frac)}</b> {share.label}</span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
              {!rows.length && <li className="gm-pf__none">No stat lines recorded for this club.</li>}
            </ul>
          </article>
        );
      })}
    </Reveal>
  );
};
