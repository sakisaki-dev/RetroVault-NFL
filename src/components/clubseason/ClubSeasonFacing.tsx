import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/brand/TeamLogo';
import { Reveal, stag } from '@/components/motion/Reveal';
import { findNFLTeam } from '@/utils/nflTeams';
import { ROUND_LABEL } from '@/utils/gameFinder';
import { openClubSeason, type SeasonResult, type Ticket } from '@/utils/clubSeason';
import type { TableRow } from '@/utils/schedule';
import { Band } from './ClubSeasonSection';
import { ordinal } from './ClubSeasonHero';

interface Props {
  abbr: string;
  year: number;
  cell: TableRow | null;
  table: TableRow[] | null;
  tickets: Ticket[];
  result: SeasonResult;
  onOpenGame: (id: string) => void;
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
const rec = (ts: Ticket[]) => {
  const w = ts.filter((t) => t.r === 'W').length;
  const l = ts.filter((t) => t.r === 'L').length;
  const d = ts.filter((t) => t.r === 'T').length;
  return `${w}-${l}${d ? `-${d}` : ''}`;
};

/**
 * The page facing the cover: club-colour bands for the season at a glance (points, differential, power, division
 * place), that season's division table (the club highlighted; another club opens its own season), the splits and the
 * postseason games. Every figure is the season table's or the game log's.
 */
const ClubSeasonFacing = ({ abbr, year, cell, table, tickets, result, onOpenGame }: Props) => {
  const reg = useMemo(() => tickets.filter((t) => t.type === 'REG' && !t.bye && t.r), [tickets]);
  const post = useMemo(() => tickets.filter((t) => t.type !== 'REG'), [tickets]);
  const division = useMemo(
    () => (cell?.division && table ? table.filter((r) => r.division === cell.division).sort((a, b) => (a.divisionRank ?? 9) - (b.divisionRank ?? 9) || b.pct - a.pct) : []),
    [cell?.division, table],
  );
  const glance: [string, string, string?][] = [];
  if (cell) {
    glance.push(['Points for', String(cell.pf)], ['Against', String(cell.pa)], ['Diff', signed(cell.diff), cell.diff > 0 ? 'is-up' : cell.diff < 0 ? 'is-dn' : '']);
    if (cell.power) glance.push(['Power', `No. ${cell.power}`]);
    if (cell.division && cell.divisionRank) glance.push([cell.division, ordinal(cell.divisionRank)]);
  }
  const margin = (t: Ticket) => (t.pf ?? 0) - (t.pa ?? 0);
  const best = reg.filter((t) => t.r === 'W').sort((a, b) => margin(b) - margin(a))[0];
  const worst = reg.filter((t) => t.r === 'L').sort((a, b) => margin(a) - margin(b))[0];
  const splits: [string, string, string?][] = reg.length
    ? [
        ['Home', cell?.home ?? rec(reg.filter((t) => t.home))],
        ['Away', cell?.away ?? rec(reg.filter((t) => !t.home))],
        ['One-score', cell?.oneScore ?? rec(reg.filter((t) => Math.abs(margin(t)) <= 8)), 'is-up'],
        ...(best ? ([['Biggest win', signed(margin(best))]] as [string, string][]) : []),
        ...(worst ? ([['Worst loss', signed(margin(worst))]] as [string, string][]) : []),
      ]
    : [];
  return (
    <div className="pg-inside">
      {glance.length > 0 && (
        <Reveal as="section" className="pg-sec">
          <Band title="At a glance" note={cell ? `${cell.ppg.toFixed(1)} a game for, ${cell.papg.toFixed(1)} against` : undefined} />
          <dl className="pg-glance num">
            {glance.map(([k, v, c], i) => (
              <div key={k} className="mo-rise" style={stag(i, 40)}><dt>{k}</dt><dd className={c}>{v}</dd></div>
            ))}
          </dl>
        </Reveal>
      )}
      {division.length > 0 && (
        <Reveal as="section" className="pg-sec">
          <Band title={cell?.division ?? 'Division'} note={`${year} final table`} />
          <ol className="pg-table">
            {division.map((r, i) => {
              const me = r.abbr === abbr;
              const name = findNFLTeam(r.abbr)?.name ?? r.team;
              return (
                <li key={r.abbr} className="mo-rise" style={stag(i, 40)}>
                  <button
                    type="button"
                    className={cn('pg-st', me && 'is-me')}
                    disabled={me}
                    aria-current={me ? 'true' : undefined}
                    onClick={() => openClubSeason(name, year)}
                    aria-label={`${ordinal(r.divisionRank ?? i + 1)}: ${name}, ${r.record}${me ? '' : `. Open the ${year} ${name}`}`}
                  >
                    <span className="pg-st__rk num">{r.divisionRank ?? i + 1}</span>
                    <TeamLogo team={r.abbr} size={28} decorative className="pg-logo" />
                    <span className="pg-st__n">{name}</span>
                    <b className="num">{r.record}</b>
                  </button>
                </li>
              );
            })}
          </ol>
        </Reveal>
      )}
      {splits.length > 0 && (
        <Reveal as="section" className="pg-sec">
          <Band title="Splits" note="regular season" />
          <dl className="pg-glance is-splits num">
            {splits.map(([k, v, c], i) => (
              <div key={k} className="mo-rise" style={stag(i, 40)}><dt>{k}</dt><dd className={c}>{v}</dd></div>
            ))}
          </dl>
        </Reveal>
      )}
      <Reveal as="section" className="pg-sec">
        <Band title="Postseason" note={result.text || undefined} />
        {post.length ? (
          <ul className="pg-post">
            {post.map((t, i) => {
              const opp = findNFLTeam(t.opp);
              return (
                <li key={t.game?.id ?? i} className="mo-rise" style={stag(i, 50)}>
                  <button
                    type="button"
                    className={cn('pg-po', t.r && `is-${t.r}`)}
                    onClick={() => t.game && onOpenGame(t.game.id)}
                    aria-label={`${ROUND_LABEL[t.type] ?? t.type}, ${t.home ? 'vs' : 'at'} ${opp?.name ?? t.opp}${t.r ? `, ${t.r === 'W' ? 'won' : t.r === 'L' ? 'lost' : 'tied'} ${t.pf} to ${t.pa}` : ''}. Open the game`}
                  >
                    <TeamLogo team={t.opp ?? ''} size={36} decorative className="pg-logo" />
                    <span className="pg-po__t"><b>{ROUND_LABEL[t.type] ?? t.type} · {t.home ? 'vs' : '@'} {opp?.name ?? t.opp}</b><span>{t.ot ? 'Overtime · ' : ''}{t.r === 'W' ? 'Won' : t.r === 'L' ? 'Lost' : t.r === 'T' ? 'Tied' : 'Not played yet'}{t.upset ? (t.upset === 'win' ? ` as a ${Math.abs(t.fav ?? 0)}-point underdog` : ` as a ${t.fav}-point favourite`) : ''}</span></span>
                    <em className="num">{t.r ? `${t.r} ${t.pf}-${t.pa}` : '–'}</em>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="pg-post is-none">{result.live ? 'The season is still being played.' : `No playoff games: the ${year} season ended in the regular season.`}</p>
        )}
      </Reveal>
    </div>
  );
};

export default ClubSeasonFacing;
