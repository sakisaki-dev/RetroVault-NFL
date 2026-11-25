import type { CSSProperties } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { f1, ord, pctOf, useFantasy } from '@/utils/fantasy';
import { clubHue, NextLogos, TrendChip, wk } from './parts';

/**
 * The player card's fantasy strip for an active QB, RB, WR or TE with a game this season: PPR rank (position and overall),
 * points a game, last 3 games against the 3 before, the next 3 matchups by softness and how often he was a start-worthy week.
 * Everything from fantasy.json (scripts/nfl/fantasy.py); nothing for a retired or non-fantasy player.
 */
const FantasyStrip = ({ playerKey, active, onOpen }: { playerKey: string; active: boolean; onOpen?: () => void }) => {
  const f = useFantasy(active ? playerKey : null);
  if (!f) return null;
  const { rec, pos } = f;
  return (
    <section className="fx-strip" style={{ '--tc': clubHue(f.club) } as CSSProperties} aria-label="Fantasy">
      <header className="fx-strip__h">
        <span className="fx-k">Fantasy · PPR {f.season}</span>
        <InfoTip label="About these fantasy numbers">
          Standard PPR from nflverse weekly lines through week {f.week}. {pos} rank is by season total among {pos}s ({rec.rk[1]} with a game);
          overall counts QB, RB, WR and TE together. Trend compares his last 3 games with the 3 before. Matchup colour: green when the defence
          is among the 8 that allow the most PPR to {pos}s, red among the 8 that allow the least. Start-worthy: a weekly finish inside the top
          {pos === 'QB' || pos === 'TE' ? ' 12' : ' 24'} at his position.
        </InfoTip>
        {onOpen && <button type="button" className="fx-more" onClick={onOpen}>Fantasy detail</button>}
      </header>
      <dl className="fx-strip__g">
        <div className="fx-cell fx-cell--lead">
          <dt>{pos} rank</dt>
          <dd><b>{ord(rec.rk[0])}</b><i> of {rec.rk[1]}</i></dd>
          <em>{ord(rec.rk[2])} overall</em>
        </div>
        <div className="fx-cell">
          <dt>PPR / game</dt>
          <dd><b>{f1(rec.pg)}</b></dd>
          <em>{rec.rk[4] ? `${ord(rec.rk[4])} of ${rec.rk[5]}` : `${rec.g} games`}</em>
        </div>
        <div className="fx-cell">
          <dt>Last 3</dt>
          <dd><b>{rec.l3 != null ? f1(rec.l3) : '—'}</b></dd>
          <em className="fx-cell__t">{f.trend ? <TrendChip trend={f.trend} /> : null}{rec.p3 != null ? `prev ${f1(rec.p3)}` : rec.l3r ? `${ord(rec.l3r[0])} of ${rec.l3r[1]}` : ' '}</em>
        </div>
        <div className="fx-cell">
          <dt>Next 3</dt>
          <dd>{f.next.length ? <NextLogos slots={f.next} size={22} label={false} /> : <b>—</b>}</dd>
          <em>{f.next.length ? f.next.map((s) => (s.opp ? s.opp : 'bye')).join(' · ') : ' '}</em>
        </div>
        <div className="fx-cell fx-cell--wide">
          <dt>Start-worthy</dt>
          <dd><b>{pctOf(rec.sw, rec.g)}%</b></dd>
          <em>{rec.sw} of {rec.g} {wk(rec.g)}</em>
        </div>
      </dl>
    </section>
  );
};

export default FantasyStrip;
