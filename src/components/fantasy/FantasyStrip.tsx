import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/InfoTip';
import TradeEntry from '@/components/trade/TradeEntry';
import { f1, ord, pctOf, useFantasy } from '@/utils/fantasy';
import { clubHue, NextLogos, TrendChip, wk } from './parts';

/**
 * The player card's fantasy strip for an active QB, RB, WR or TE with a game this season: PPR rank (position and overall),
 * points a game, last 3 games against the 3 before, the next 3 matchups by softness and how often he was a start-worthy week.
 * Everything from fantasy.json (scripts/nfl/fantasy.py); nothing for a retired or non-fantasy player.
 */
const FantasyStrip = ({ playerKey, active, onOpen, onTrade }: { playerKey: string; active: boolean; onOpen?: (stat?: string) => void; /** runs before the trade simulator opens (the card closes) */ onTrade?: () => void }) => {
  const f = useFantasy(active ? playerKey : null);
  if (!f) return null;
  const { rec, pos } = f;
  const Cell = ({ id, cls, children }: { id: string; cls?: string; children: ReactNode }) => (
    <button type="button" className={cn('fx-cell rbk-chip', cls)} onClick={onOpen ? () => onOpen(id) : undefined} disabled={!onOpen} aria-label={`Open ${id === 'next' ? 'next matchups' : 'this stat'} in the Deep Dive`}>
      {children}
    </button>
  );
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
        <span className="fx-more"><TradeEntry playerKey={playerKey} onBefore={onTrade} /></span>
        {onOpen && <button type="button" className="fx-more fx-more--r" onClick={() => onOpen()}>Fantasy detail</button>}
      </header>
      <div className="fx-strip__g">
        <Cell id="rank" cls="fx-cell--lead">
          <span className="fx-cell__k">{pos} rank</span>
          <div className="fx-cell__d"><b>{ord(rec.rk[0])}</b><i> of {rec.rk[1]}</i></div>
          <em>{ord(rec.rk[2])} overall</em>
        </Cell>
        <Cell id="pg">
          <span className="fx-cell__k">PPR / game</span>
          <div className="fx-cell__d"><b>{f1(rec.pg)}</b></div>
          <em>{rec.rk[4] ? `${ord(rec.rk[4])} of ${rec.rk[5]}` : `${rec.g} games`}</em>
        </Cell>
        <Cell id="l3">
          <span className="fx-cell__k">Last 3</span>
          <div className="fx-cell__d"><b>{rec.l3 != null ? f1(rec.l3) : '—'}</b></div>
          <em className="fx-cell__t">{f.trend ? <TrendChip trend={f.trend} /> : null}{rec.p3 != null ? `prev ${f1(rec.p3)}` : rec.l3r ? `${ord(rec.l3r[0])} of ${rec.l3r[1]}` : ' '}</em>
        </Cell>
        <Cell id="next">
          <span className="fx-cell__k">Next 3</span>
          <div className="fx-cell__d">{f.next.length ? <NextLogos slots={f.next} size={22} label={false} /> : <b>—</b>}</div>
          <em>{f.next.length ? f.next.map((s) => (s.opp ? s.opp : 'bye')).join(' · ') : ' '}</em>
        </Cell>
        <Cell id="sw" cls="fx-cell--wide">
          <span className="fx-cell__k">Start-worthy</span>
          <div className="fx-cell__d"><b>{pctOf(rec.sw, rec.g)}%</b></div>
          <em>{rec.sw} of {rec.g} {wk(rec.g)}</em>
        </Cell>
      </div>
    </section>
  );
};

export default FantasyStrip;
