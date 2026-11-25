import { useMemo, type CSSProperties } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/brand/TeamLogo';
import { Reveal, stag } from '@/components/motion/Reveal';
import { peekKeyProps } from '@/components/peek/peekProps';
import { StarSprite } from '@/components/season/NflSeasonExtras';
import type { ClubLineup } from '@/utils/clubSeason';
import type { RosterEntry } from './ClubSeasonParts';
import { surname } from './ClubSeasonHero';

const nf = (n: number) => n.toLocaleString('en-US');

interface Slot {
  pos: string;
  /** How many of this position start */
  n: number;
  /** Who started: the most work at the spot that season */
  rank: (r: RosterEntry) => number;
  /** The one figure on his card */
  figure: (r: RosterEntry) => [value: string, label: string] | null;
}
const num = (v: number | undefined, label: string, dec = 0): [string, string] | null => (v ? [dec ? v.toFixed(dec) : nf(v), label] : null);
const OFFENSE: Slot[] = [
  { pos: 'QB', n: 1, rank: (r) => (r.att ?? 0) * 100 + r.g, figure: (r) => num(r.pyds, 'pass yds') },
  { pos: 'RB', n: 1, rank: (r) => (r.car ?? 0) * 100 + (r.ryds ?? 0) / 100, figure: (r) => num(r.ryds, 'rush yds') },
  { pos: 'WR', n: 2, rank: (r) => (r.rec ?? 0) * 100 + (r.recyds ?? 0) / 100, figure: (r) => num(r.recyds, 'rec yds') },
  { pos: 'TE', n: 1, rank: (r) => (r.rec ?? 0) * 100 + (r.recyds ?? 0) / 100, figure: (r) => num(r.recyds, 'rec yds') },
];
const DEFENSE: Slot[] = [
  { pos: 'DL', n: 2, rank: (r) => (r.tkl ?? 0) * 100 + (r.sck ?? 0), figure: (r) => num(r.sck, 'sacks', 1) ?? num(r.tkl, 'tackles') },
  { pos: 'LB', n: 2, rank: (r) => (r.tkl ?? 0) * 100 + (r.sck ?? 0), figure: (r) => num(r.tkl, 'tackles') },
  { pos: 'DB', n: 2, rank: (r) => (r.tkl ?? 0) * 100 + (r.dint ?? 0), figure: (r) => num(r.dint, 'INT') ?? num(r.tkl, 'tackles') },
];

interface Starter {
  r: RosterEntry;
  figure: [string, string] | null;
}
const pickUnit = (rows: RosterEntry[], slots: Slot[]): Starter[] =>
  slots.flatMap((s) =>
    rows
      .filter((r) => r.pos === s.pos && r.g > 0 && s.rank(r) > 0)
      .sort((a, b) => s.rank(b) - s.rank(a) || b.g - a.g || a.k.localeCompare(b.k))
      .slice(0, s.n)
      .map((r) => ({ r, figure: s.figure(r) })),
  );

/** Desktop order: the quarterback in the middle, the rest outward ([WR, RB, QB, TE, WR]) */
const OFF_ORDER: Record<number, number> = { 0: 3, 1: 2, 2: 1, 3: 5, 4: 4 };

const Card = ({ s, club, year, i, order, lead, onPick }: { s: Starter; club: string; year: number; i: number; order?: number; lead?: boolean; onPick: (k: string) => void }) => {
  const { r, figure } = s;
  return (
    <li className={cn('pg-lu mo-rise', lead && 'is-lead')} style={{ ...stag(i, 60), ...(order ? ({ ['--o' as string]: order } as CSSProperties) : null) }}>
      <button type="button" className="pg-lu__b" data-peek-ok {...peekKeyProps(r.k)} onClick={() => onPick(r.k)} aria-label={`${r.pos} ${r.name}${r.number != null ? `, number ${r.number}` : ''}${figure ? `, ${figure[0]} ${figure[1]}` : ''}. Open player card`}>
        <span className="pg-lu__art" aria-hidden="true">
          {r.number != null && <span className="pg-lu__no num">{r.number}</span>}
          <span className="pg-lu__sp"><StarSprite name={r.name} pos={r.pos} team={club} size="l" kind="figure" season={year} /></span>
          {r.szn != null && <span className={cn('pg-szn num', r.szn >= 90 && 'is-hi')}>{r.szn}</span>}
        </span>
        <span className="pg-lu__strip">
          <i>{r.pos}</i>
          <span>{surname(r.name)}</span>
          {r.number != null && <small className="num">#{r.number}</small>}
        </span>
        <span className="pg-lu__fig">{figure ? <><b className="num">{figure[0]}</b>{figure[1]}</> : <span className="pg-dim">{r.g} games</span>}</span>
      </button>
    </li>
  );
};

/**
 * The programme's centre spread: the season's starting lineup as programme player cards, offense with the quarterback
 * in the middle, then defense. The starters are chosen when the data is built (scripts/nfl/club_season.py, `lineup`):
 * by snaps from 2013, the weekly depth charts 2001 to 2012, the current depth chart for the live season, else the club's busiest player at each spot (1999 and 2000). Without a
 * `lineup` the busiest-player rule runs here.
 */
const NOTE: Record<ClubLineup['m'], string> = {
  snaps: 'Each spot goes to the club\u2019s player with the most snaps there that season (nflverse snap counts).',
  depth: 'The live season: each spot goes to the player on the club\u2019s current depth chart (ESPN), with the season\u2019s snap leaders filling any gap.',
  weeks: 'No snap counts before 2013, so each spot goes to the player the club\u2019s weekly depth chart listed first there in the most regular-season weeks (nflverse depth charts, 2001 to 2012).',
  busiest: 'No starter data before 2001, so each spot goes to the club\u2019s busiest player there that season: the most passing attempts, carries, catches or tackles.',
};
const SHORT: Record<ClubLineup['m'], string> = {
  snaps: 'Starters by snaps',
  depth: 'Current depth chart',
  weeks: 'Starters by weekly depth charts',
  busiest: 'Busiest player at each spot',
};
const ClubSeasonLineup = ({ rows, lineup, club, clubName, year, onPick }: { rows: RosterEntry[]; lineup?: ClubLineup | null; club: string; clubName: string; year: number; onPick: (key: string) => void }) => {
  const picked = useMemo(() => {
    if (!lineup) return null;
    const by = new Map(rows.map((r) => [r.k, r]));
    const take = (slots: Slot[]) => {
      const keys = lineup.k.filter((k) => slots.some((s) => k.startsWith(`${s.pos}:`)));
      return slots.flatMap((s) => keys.filter((k) => k.startsWith(`${s.pos}:`)).map((k) => by.get(k)).filter((r): r is RosterEntry => !!r).map((r) => ({ r, figure: s.figure(r) })));
    };
    return { off: take(OFFENSE), def: take(DEFENSE) };
  }, [rows, lineup]);
  const off = useMemo(() => picked?.off ?? pickUnit(rows, OFFENSE), [rows, picked]);
  const def = useMemo(() => picked?.def ?? pickUnit(rows, DEFENSE), [rows, picked]);
  if (off.length + def.length < 3) return null;
  return (
    <Reveal as="section" className="pg-spread" aria-label={`${year} ${clubName} starting lineup`}>
      <span className="pg-spread__wm" aria-hidden="true"><TeamLogo team={club} size={320} decorative /></span>
      <header className="pg-spread__h mo-rise">
        <span className="pg-kick">Centre spread · {year}</span>
        <h2>Starting lineup</h2>
        <p>The {year} {clubName}, offense and defense.</p>
      </header>
      {off.length > 0 && (
        <div className="pg-unit">
          <h3 className="pg-unit__h"><span>Offense</span></h3>
          <ol className={cn('pg-lus is-off', off.length === 5 && 'is-five')}>
            {off.map((s, i) => <Card key={s.r.k} s={s} club={club} year={year} i={i} order={off.length === 5 ? OFF_ORDER[i] : undefined} lead={i === 0 && s.r.pos === 'QB'} onPick={onPick} />)}
          </ol>
        </div>
      )}
      {def.length > 0 && (
        <div className="pg-unit">
          <h3 className="pg-unit__h"><span>Defense</span></h3>
          <ol className="pg-lus is-def">
            {def.map((s, i) => <Card key={s.r.k} s={s} club={club} year={year} i={off.length + i} onPick={onPick} />)}
          </ol>
        </div>
      )}
      <p className="pg-spread__note">{SHORT[lineup?.m ?? 'busiest']}<InfoTip className="ml-1 align-middle">{NOTE[lineup?.m ?? 'busiest']}</InfoTip></p>
    </Reveal>
  );
};

export default ClubSeasonLineup;
