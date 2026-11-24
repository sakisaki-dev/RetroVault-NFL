import { useMemo, type CSSProperties } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import { surnameOf } from '@/utils/displayName';
import type { GameDetail } from '@/utils/nflGames';
import { fmtDate, winnerOf } from '@/components/game/gameModel';
import { biggestMargin, clubName, marginOf, nameOfWeek, upsetOf, v, type SaverDeps, type SaverWeek } from './nflSaverData';
import './saverScenes.css';

/**
 * Scoreboard Sunday: a week's finals on an LED board in a night stadium (the week's marquee game's home ground). Each game
 * is a row (both logos, the score, the winner lit); the biggest upset by the closing spread flashes (else the biggest
 * margin); a ticker crawls the week's top passing, rushing and receiving lines.
 */

const ticker = (games: GameDetail[]): { tag: string; club: string; text: string }[] => {
  const out: { tag: string; club: string; text: string; score: number }[] = [];
  games.forEach((g) =>
    g.players.forEach((p) => {
      const club = p.side === 0 ? g.away : g.home;
      const who = `${surnameOf(p.name)}`;
      if (v(p.s, 'attempts') >= 10) out.push({ tag: 'PASS', club, score: v(p.s, 'passing_yards'), text: `${who} ${v(p.s, 'completions')}/${v(p.s, 'attempts')}, ${v(p.s, 'passing_yards')} yds${v(p.s, 'passing_tds') ? `, ${v(p.s, 'passing_tds')} TD` : ''}` });
      if (v(p.s, 'carries') >= 8) out.push({ tag: 'RUSH', club, score: v(p.s, 'rushing_yards') * 1.6, text: `${who} ${v(p.s, 'carries')} car, ${v(p.s, 'rushing_yards')} yds${v(p.s, 'rushing_tds') ? `, ${v(p.s, 'rushing_tds')} TD` : ''}` });
      if (v(p.s, 'receptions') >= 3) out.push({ tag: 'REC', club, score: v(p.s, 'receiving_yards') * 1.8, text: `${who} ${v(p.s, 'receptions')} rec, ${v(p.s, 'receiving_yards')} yds${v(p.s, 'receiving_tds') ? `, ${v(p.s, 'receiving_tds')} TD` : ''}` });
    }),
  );
  const pick = (tag: string, n: number) => out.filter((x) => x.tag === tag).sort((a, b) => b.score - a.score).slice(0, n);
  const l = [pick('PASS', 3), pick('RUSH', 3), pick('REC', 3)];
  return Array.from({ length: 3 }, (_, i) => l.map((x) => x[i]).filter(Boolean)).flat();
};

const Row = ({ g, i, flash }: { g: GameDetail; i: number; flash: boolean }) => {
  const a = findNFLTeam(g.away);
  const h = findNFLTeam(g.home);
  const w = winnerOf(g);
  return (
    <li className={`sv-sb__row ${flash ? 'is-flash' : ''}`} style={{ '--i': i, '--c1': a ? `hsl(${a.primaryColor})` : '#888', '--c2': h ? `hsl(${h.primaryColor})` : '#888' } as CSSProperties}>
      <span className={`sv-sb__t ${w === 0 ? 'is-win' : ''}`}>
        <TeamLogo team={a?.name ?? g.away} size={30} decorative />
        <i>{a?.abbreviation ?? g.away}</i>
      </span>
      <b className={`sv-sb__n ${w === 0 ? 'is-win' : ''}`}>{g.awayScore}</b>
      <span className="sv-sb__f">{g.ot ? 'F/OT' : 'FINAL'}</span>
      <b className={`sv-sb__n ${w === 1 ? 'is-win' : ''}`}>{g.homeScore}</b>
      <span className={`sv-sb__t sv-sb__t--h ${w === 1 ? 'is-win' : ''}`}>
        <i>{h?.abbreviation ?? g.home}</i>
        <TeamLogo team={h?.name ?? g.home} size={30} decorative />
      </span>
    </li>
  );
};

const ScoreboardScene = ({ week, deps }: { week: SaverWeek; deps: SaverDeps }) => {
  const games = useMemo(() => [...week.games].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id)), [week]);
  const marquee = useMemo(() => [...games].sort((a, b) => (b.total ?? (b.homeScore ?? 0) + (b.awayScore ?? 0)) - (a.total ?? (a.homeScore ?? 0) + (a.awayScore ?? 0)))[0], [games]);
  const upset = useMemo(() => upsetOf(games), [games]);
  const blow = useMemo(() => biggestMargin(games), [games]);
  const flashId = upset?.g.id ?? blow?.id;
  const tick = useMemo(() => ticker(games), [games]);
  const half = Math.ceil(games.length / 2);
  const alert = upset
    ? `Upset alert · ${clubName(upset.winner)} (+${upset.points}) beat the ${clubName(upset.loser)} ${Math.max(upset.g.homeScore!, upset.g.awayScore!)}-${Math.min(upset.g.homeScore!, upset.g.awayScore!)}`
    : blow
      ? `Blowout of the week · ${clubName(winnerOf(blow) === 0 ? blow.away : blow.home)} by ${marginOf(blow)}`
      : '';
  const { Stadium } = deps;
  return (
    <Stadium club={findNFLTeam(marquee.home)?.name ?? 'Eagles'} roll={0.9}>
      <div className="sv-sb">
        <header className="sv-sb__head">
          <p className="sv-kick">Scoreboard Sunday · {week.season}</p>
          <h2 className="sv-title sv-sb__title">{nameOfWeek(week)} finals</h2>
          <p className="sv-sub sv-sub--dim">{games.length} games · {fmtDate(games[0].date)}{games.length > 1 && games[games.length - 1].date !== games[0].date ? ` to ${fmtDate(games[games.length - 1].date).replace(/, \d{4}$/, '')}` : ''}</p>
        </header>
        <div className="sv-sb__board">
          <ul className="sv-sb__grid" style={{ '--rows': half } as CSSProperties}>
            {games.map((g, i) => (
              <Row key={g.id} g={g} i={i} flash={g.id === flashId} />
            ))}
          </ul>
          {alert && <p className="sv-sb__alert">{alert}</p>}
        </div>
        {tick.length > 0 && (
          <div className="sv-sb__ticker" aria-hidden="true">
            <span className="sv-sb__tag">Top lines</span>
            <div className="sv-sb__crawl">
              <div className="sv-sb__track">
                {[0, 1].map((k) => (
                  <span key={k} className="sv-sb__set">
                    {tick.map((t, i) => (
                      <span key={i} className="sv-sb__item">
                        <em>{t.tag}</em>
                        <TeamLogo team={clubName(t.club)} size={18} decorative />
                        {t.text}
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Stadium>
  );
};
export default ScoreboardScene;
