import { useMemo, type CSSProperties } from 'react';
import { Star } from 'lucide-react';
import type { Player } from '@/types/player';
import GameSprite from '../GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import PositionBadge from '@/components/PositionBadge';
import { InLeague } from '@/components/InLeague';
import { getTeamColors } from '@/utils/teamColors';
import { useJerseyNumbers } from '@/utils/jerseys';
import { rowsOf, useGameLog, type GameRow } from '@/utils/gameLogs';
import { peekProps } from '@/components/peek/peekProps';
import type { Headline, PlayerNote } from '@/utils/leagueContent';
import './nflSpotlight.css';

/**
 * The Arcade Spotlight, NFL edition (owner: "boring"): each player a hero tile. His sprite stands big on a club-colour
 * pedestal under a light with his number behind him, the club's logo, why he is here (a rule: the Wire's headline about
 * him, else his best game of the season by fantasy points, else his season), his 2026 season line and last game in LED
 * type, and a bar per game for the season. Tap: his card. Hold: the quick look. Everything is read from his game log
 * (public/data/nfl/games), no new data.
 */
const SEASON = 2026;
const n = (r: GameRow, c: string) => Number(r[c] ?? 0) || 0;
const sum = (rows: GameRow[], c: string) => rows.reduce((a, r) => a + n(r, c), 0);
const plural = (v: number, one: string, many = `${one}s`) => `${v.toLocaleString('en-US')} ${v === 1 ? one : many}`;

interface Line {
  label: string;
  value: string;
}

/** The line a position is read by: season totals, one game, and the figure a bar stands for. */
const lineFor = (pos: string, rows: GameRow[]): Line[] => {
  const g = rows.length;
  const t = (c: string) => sum(rows, c);
  switch (pos) {
    case 'QB':
      return [
        { label: 'PASS YDS', value: t('passing_yards').toLocaleString('en-US') },
        { label: 'TD', value: String(t('passing_tds')) },
        { label: 'INT', value: String(t('passing_interceptions')) },
        { label: 'CMP%', value: t('attempts') ? `${Math.round((t('completions') / t('attempts')) * 100)}` : '-' },
      ];
    case 'RB':
      return [
        { label: 'RUSH YDS', value: t('rushing_yards').toLocaleString('en-US') },
        { label: 'TD', value: String(t('rushing_tds') + t('receiving_tds')) },
        { label: 'REC', value: String(t('receptions')) },
        { label: 'YPC', value: t('carries') ? (t('rushing_yards') / t('carries')).toFixed(1) : '-' },
      ];
    case 'WR':
    case 'TE':
      return [
        { label: 'REC', value: String(t('receptions')) },
        { label: 'REC YDS', value: t('receiving_yards').toLocaleString('en-US') },
        { label: 'TD', value: String(t('receiving_tds')) },
        { label: 'TGT', value: String(t('targets')) },
      ];
    case 'OL':
      return [{ label: 'GAMES', value: String(g) }];
    default:
      return [
        { label: 'TACKLES', value: String(t('def_tackles_solo') + t('def_tackle_assists')) },
        { label: 'SACKS', value: String(Math.round(t('def_sacks') * 10) / 10) },
        { label: 'INT', value: String(t('def_interceptions')) },
        { label: 'PD', value: String(t('def_pass_defended')) },
      ];
  }
};

const gameText = (pos: string, r: GameRow): string => {
  const c = (k: string) => n(r, k);
  switch (pos) {
    case 'QB':
      return `${c('completions')}/${c('attempts')}, ${c('passing_yards')} yds, ${plural(c('passing_tds'), 'TD')}${c('rushing_yards') >= 30 ? `, ${c('rushing_yards')} rush yds` : ''}`;
    case 'RB':
      return `${c('carries')} for ${c('rushing_yards')}${c('rushing_tds') ? `, ${plural(c('rushing_tds'), 'TD')}` : ''}, ${plural(c('receptions'), 'catch', 'catches')} for ${c('receiving_yards')}`;
    case 'WR':
    case 'TE':
      return `${plural(c('receptions'), 'catch', 'catches')} for ${c('receiving_yards')}${c('receiving_tds') ? `, ${plural(c('receiving_tds'), 'TD')}` : ''}`;
    case 'OL':
      return 'played';
    default:
      return `${plural(c('def_tackles_solo') + c('def_tackle_assists'), 'tackle')}${c('def_sacks') ? `, ${plural(c('def_sacks'), 'sack')}` : ''}${c('def_interceptions') ? `, ${plural(c('def_interceptions'), 'INT')}` : ''}`;
  }
};

/** The figure one bar stands for: the position's yardage, defenders' tackles. */
const bar = (pos: string, r: GameRow): number => {
  if (pos === 'QB') return n(r, 'passing_yards') + n(r, 'rushing_yards');
  if (pos === 'RB') return n(r, 'rushing_yards') + n(r, 'receiving_yards');
  if (pos === 'WR' || pos === 'TE') return n(r, 'receiving_yards');
  if (pos === 'OL') return 0;
  return n(r, 'def_tackles_solo') + n(r, 'def_tackle_assists') + n(r, 'def_sacks') * 3 + n(r, 'def_interceptions') * 4;
};

const Tile = ({ p, headline, note, onPlayer }: { p: Player; headline?: Headline; note?: PlayerNote; onPlayer: (p: Player) => void }) => {
  const key = `${p.position}:${p.name}`;
  const log = useGameLog(key);
  const { numberFor } = useJerseyNumbers();
  const club = p.bannerTeam || p.team;
  const c = getTeamColors(club);
  const rows = useMemo(() => rowsOf(log).filter((r) => r.season === SEASON && r.type === 'REG'), [log]);
  const last = rows[rows.length - 1];
  const best = useMemo(() => (rows.length ? [...rows].sort((a, b) => n(b, 'fantasy_points_ppr') - n(a, 'fantasy_points_ppr'))[0] : undefined), [rows]);
  // why he is here: the Wire's rule headline, else his week's standout, else his best game, else his note
  const reason = headline
    ? { kicker: 'In the news', text: headline.text }
    : last && n(last, 'fantasy_points_ppr') >= 22
      ? { kicker: `Week ${last.week} standout`, text: `${gameText(p.position, last)} against ${last.opp}` }
      : best && n(best, 'fantasy_points_ppr') >= 18
        ? { kicker: 'Best game of the season', text: `Week ${best.week} against ${best.opp}: ${gameText(p.position, best)}` }
        : { kicker: 'On the field', text: note?.tag ?? `${plural(rows.length, 'game')} played in ${SEASON}` };
  const bars = rows.map((r) => bar(p.position, r));
  const top = Math.max(1, ...bars);
  const num = numberFor(p);
  const result = last ? (n(last, 'pf') > n(last, 'pa') ? 'W' : n(last, 'pf') < n(last, 'pa') ? 'L' : 'T') : '';
  return (
    <li>
      <button
        type="button"
        className="nsp"
        style={c ? ({ '--tc': `hsl(${c.primary})`, '--tc2': `hsl(${c.secondary})` } as CSSProperties) : undefined}
        onClick={() => onPlayer(p)}
        {...peekProps(p)}
        aria-label={`Open ${p.name}'s card`}
      >
        <span className="nsp__rays" aria-hidden="true" />
        <span className="nsp__num" aria-hidden="true">{num}</span>
        <span className="nsp__logo" aria-hidden="true">
          <TeamLogo team={club} size={44} decorative />
        </span>
        <span className="nsp__stage">
          <GameSprite player={p} kind="figure" size="l" className="nsp__sprite" />
          <span className="nsp__ped" aria-hidden="true" />
        </span>
        <span className="nsp__body">
          <span className="nsp__top">
            <PositionBadge position={p.position} />
            <span className="nsp__team">{p.team && p.team !== 'FA' ? p.team : 'Free agent'}</span>
            <InLeague player={p} label={false} />
          </span>
          <span className="nsp__name">{p.name}</span>
          <span className="nsp__why">
            <b>{reason.kicker}</b>
            {reason.text}
          </span>
          {rows.length > 0 && (
            <span className="nsp__led" aria-label={`${SEASON} season`}>
              {lineFor(p.position, rows).map((l) => (
                <span key={l.label} className="nsp__cell">
                  <i>{l.value}</i>
                  <em>{l.label}</em>
                </span>
              ))}
            </span>
          )}
          {last && p.position !== 'OL' && (
            <span className="nsp__last">
              <b>WK {String(last.week)}</b> {last.home ? 'vs' : 'at'} {String(last.opp)} <u data-r={result}>{result} {String(last.pf)}-{String(last.pa)}</u> · {gameText(p.position, last)}
            </span>
          )}
          {bars.length > 1 && top > 1 && (
            <span className="nsp__spark" role="img" aria-label={`${SEASON} game by game`}>
              {bars.map((v, i) => (
                <i key={i} style={{ height: `${Math.max(6, (v / top) * 100)}%`, opacity: i === bars.length - 1 ? 1 : 0.7 }} data-last={i === bars.length - 1 ? '' : undefined} />
              ))}
            </span>
          )}
        </span>
      </button>
    </li>
  );
};

const NflSpotlight = ({ picks, headlines, notes, onPlayer }: { picks: Player[]; headlines: Headline[]; notes: PlayerNote[]; onPlayer: (p: Player) => void }) => (
  <section className="wc wc-spot" aria-labelledby="wc-spot-title">
    <h2 id="wc-spot-title" className="wc-spot__title">
      <Star className="h-4 w-4" aria-hidden="true" /> Spotlight
    </h2>
    <ul className="nsp-grid">
      {picks.map((p) => (
        <Tile key={`${p.position}:${p.name}`} p={p} headline={headlines.find((h) => h.players[0] === p.name)} note={notes.find((x) => x.name === p.name)} onPlayer={onPlayer} />
      ))}
    </ul>
  </section>
);

export default NflSpotlight;
