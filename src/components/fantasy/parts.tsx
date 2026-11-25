import type { CSSProperties } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { cn } from '@/lib/utils';
import { findNFLTeam } from '@/utils/nflTeams';
import { ord, TONE_LABEL, type Slot, type Trend } from '@/utils/fantasy';
import './fantasy.css';

const ABBR: Record<string, string> = { LA: 'LAR' };
export const teamOf = (abbr: string) => findNFLTeam(ABBR[abbr] ?? abbr);
export const clubHue = (abbr: string) => {
  const t = teamOf(abbr);
  return t ? `hsl(${t.primaryColor})` : 'hsl(var(--gold))';
};

export const TrendChip = ({ trend, className }: { trend: Trend; className?: string }) => {
  if (!trend) return null;
  const Icon = trend.dir === 'up' ? ArrowUpRight : trend.dir === 'down' ? ArrowDownRight : ArrowRight;
  const word = trend.dir === 'up' ? 'Trending up' : trend.dir === 'down' ? 'Trending down' : 'Holding steady';
  return (
    <span className={cn('fx-trend', `fx-trend--${trend.dir}`, className)} title={`${word}: last 3 games against the 3 before (${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1)} per game)`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <b>{trend.delta >= 0 ? '+' : ''}{trend.delta.toFixed(1)}</b>
    </span>
  );
};

/** The next games as opponent logos, ringed by matchup tone (a bye is a dash). */
export const NextLogos = ({ slots, size = 26, label = true }: { slots: Slot[]; size?: number; label?: boolean }) => (
  <ul className="fx-next" aria-label="Next matchups">
    {slots.map((s) => {
      const t = s.opp ? teamOf(s.opp) : null;
      const tip = s.opp
        ? `Week ${s.week} ${s.home ? 'vs' : 'at'} ${t?.fullName ?? s.opp}: allows ${s.allowed?.toFixed(1)} PPR a game to his position, ${s.rank ? ord(s.rank) : ''} softest of 32 (${s.tone ? TONE_LABEL[s.tone] : ''})`
        : `Week ${s.week}: bye`;
      return (
        <li key={s.week} className={cn('fx-nx', s.tone && `fx-nx--${s.tone}`, !s.opp && 'fx-nx--bye')} title={tip} aria-label={tip}>
          {s.opp ? <TeamLogo team={t ?? s.opp} size={size} decorative backed /> : <span className="fx-bye" style={{ width: size, height: size }}>BYE</span>}
          {label && <span className="fx-nx__k">{s.opp ? `${s.home ? '' : '@'}${s.opp}` : `W${s.week}`}</span>}
        </li>
      );
    })}
  </ul>
);

export const toneVar = (tone: string | null): CSSProperties => ({ '--fx-tone': tone === 'easy' ? 'var(--fx-good)' : tone === 'hard' ? 'var(--fx-bad)' : 'var(--fx-mid)' }) as CSSProperties;

/** "1 week", "3 weeks". */
export const wk = (n: number) => (n === 1 ? 'week' : 'weeks');

/** Grid variables so a tile grid never leaves an orphan: the last tile spans the rest of its row (2 columns on a phone,
 *  `cols` from 640px, `colsWide` from 1100px). */
export const tileGrid = (n: number): CSSProperties => {
  const pick = (max: number) => (n <= max ? n : n % 4 === 0 ? 4 : n % 3 === 0 ? 3 : 4);
  const span = (c: number) => (n % c ? c - (n % c) + 1 : 1);
  const c = pick(5);
  const w = pick(7);
  return { '--sp-m': n % 2 ? 2 : 1, '--cols': c, '--sp-d': span(c), '--cols-w': w, '--sp-w': span(w) } as CSSProperties;
};
