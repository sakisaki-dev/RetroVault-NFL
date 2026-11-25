import { useMemo, useState } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import type { Player } from '@/types/player';
import { ClubStrip } from '@/components/arcade';
import { Reveal } from '@/components/motion/Reveal';
import { cn } from '@/lib/utils';
import { displayName } from '@/utils/displayName';
import { findNFLTeam } from '@/utils/nflTeams';
import { INK_STATS, useHonours, useStreaks, type RunRow, type StreakFile } from '@/utils/seasonBoards';
import { keyOf } from './records';
import { Shelves, type PlaqueItem } from './RecordBook';
import { peekProps } from '../peek/peekProps';
import './seasonRecordTabs.css';

/**
 * Record Book, NFL edition: the Awards tab (every AP award winner and Super Bowl MVP by season, 1957 on) and the Streaks
 * tab (the longest runs of straight seasons over a mark and the most seasons over it, on the same plaques and shelves as
 * the records, then the runs still alive). Data: scripts/nfl/season_boards.py, read through src/utils/seasonBoards.ts.
 */

type Select = (p: Player) => void;
const ABBR: Record<string, string> = { LA: 'LAR', STL: 'LAR', OAK: 'LV', SD: 'LAC', WSH: 'WAS', JAC: 'JAX' };
const clubOf = (a: string) => findNFLTeam(ABBR[a] ?? a)?.name ?? a;
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const useByKey = (players: Player[]) => useMemo(() => new Map(players.map((p) => [keyOf(p), p])), [players]);

/* ---------------- Awards ---------------- */

const COLS = [
  { id: 'mvp', label: 'MVP' },
  { id: 'opoy', label: 'Offensive POY' },
  { id: 'dpoy', label: 'Defensive POY' },
  { id: 'sbmvp', label: 'Super Bowl MVP' },
  { id: 'oroy', label: 'Offensive ROY' },
  { id: 'droy', label: 'Defensive ROY' },
  { id: 'cpoy', label: 'Comeback POY' },
];

export const AwardsHistory = ({ players, onSelect }: { players: Player[]; onSelect: Select }) => {
  const hon = useHonours();
  const byKey = useByKey(players);
  const [all, setAll] = useState(false);
  if (hon === undefined) return <p className="text-sm text-muted-foreground">Loading the winners…</p>;
  if (!hon) return <p className="text-sm text-muted-foreground">The awards file isn&rsquo;t built yet (npm run nfl:rebuild writes it).</p>;
  const years = Object.keys(hon.awards)
    .map(Number)
    .sort((a, b) => b - a)
    .filter((y) => all || y >= 1999);
  return (
    <div className="ra">
      <div className="ra-scroll" role="region" aria-label="Award winners by season" tabIndex={0}>
        <table className="ra-table">
          <thead>
            <tr>
              <th className="ra-pin">Season</th>
              {COLS.map((c) => (
                <th key={c.id}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y}>
                <td className="ra-pin">
                  <b>{y}</b>
                </td>
                {COLS.map((c) => (
                  <td key={c.id}>
                    {(hon.awards[String(y)]?.[c.id] ?? []).map((w) => {
                      const p = w.k ? byKey.get(w.k) : undefined;
                      const strip = (
                        <ClubStrip club={w.team} size="sm" onClick={p ? () => onSelect(p) : undefined} {...(p ? peekProps(p) : {})}>
                          {displayName(w.n)}
                        </ClubStrip>
                      );
                      return (
                        <span key={w.n} className="ra-win">
                          {strip}
                          <small>{w.pos}</small>
                        </span>
                      );
                    })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="ax-chip" onClick={() => setAll((v) => !v)}>
        {all ? 'Hide seasons before 1999' : 'Show seasons back to 1957'}
      </button>
      <p className="ra-foot">AP awards and Super Bowl MVPs<InfoTip>A name opens his card when he is in the league data; earlier winners are listed for the record. Comeback Player of the Year starts in 1998.</InfoTip></p>
    </div>
  );
};

/* ---------------- Streaks ---------------- */

const GROUP_OF: Record<string, PlaqueItem['group']> = { pyds: 'qb', ptd: 'qb', ryds: 'rb', recyds: 'wr', rec: 'wr', sck: 'def', tkl: 'def', int: 'def' };

const runText = (r: { from: number; to: number }) => `${r.from}–${r.to}`;

const plaques = (f: StreakFile, byKey: Map<string, Player>): PlaqueItem[] =>
  f.thresholds.flatMap((t) => {
    const a = f.longest[t.id]?.[0];
    const m = f.most[t.id]?.[0];
    const mk = (kind: 'run' | 'most'): PlaqueItem | null => {
      const r = kind === 'run' ? a : m;
      if (!r) return null;
      const p = byKey.get(r.k) ?? null;
      const club = kind === 'run' ? clubOf((r as RunRow).clubs[(r as RunRow).clubs.length - 1]) : p?.team;
      return {
        key: `${kind}-${t.id}`,
        group: GROUP_OF[t.stat],
        title: kind === 'run' ? `${t.label} in a row` : `${t.label} in all`,
        value: kind === 'run' ? (r as RunRow).len : (r as typeof m)!.seasons,
        decimals: 0,
        unit: ' seasons',
        holder: p?.name ?? displayName(r.n),
        player: p,
        team: club,
        year: null,
        sub: `${r.from}–${r.to}${r.alive ? ' · still alive' : ''}`,
      };
    };
    return [mk('run'), mk('most')].filter((x): x is PlaqueItem => !!x);
  });

export const StreaksShelf = ({ players, onSelect }: { players: Player[]; onSelect: Select }) => {
  const f = useStreaks();
  const byKey = useByKey(players);
  const items = useMemo(() => (f ? plaques(f, byKey) : []), [f, byKey]);
  const alive = useMemo(
    () => (f ? f.runs.filter((r) => r[3] === f.last && r[3] - r[2] + 1 >= 3).map(([id, k, from, to, clubs]) => ({ id, k, from, len: to - from + 1, club: clubs[clubs.length - 1] })).sort((a, b) => b.len - a.len || a.k.localeCompare(b.k)) : []),
    [f],
  );
  if (f === undefined) return <p className="text-sm text-muted-foreground">Loading the streaks…</p>;
  if (!f) return <p className="text-sm text-muted-foreground">The streaks file isn&rsquo;t built yet (npm run nfl:rebuild writes it).</p>;
  const label = new Map(f.thresholds.map((t) => [t.id, t.label]));
  return (
    <div className="space-y-4">
      <Shelves items={items} onSelect={onSelect} />
      <section className="rs-alive" aria-label="Streaks alive">
        <h3 className="rs-alive__head">
          Streaks alive<small>through {f.last}, 3 or more straight seasons</small>
        </h3>
        <Reveal as="ul" className="rs-alive__list">
          {alive.slice(0, 18).map((r) => {
            const p = byKey.get(r.k);
            const name = p?.name ?? r.k.slice(r.k.indexOf(':') + 1);
            return (
              <li key={`${r.id}-${r.k}`} className="mo-rise">
                <ClubStrip club={clubOf(r.club)} size="sm" onClick={p ? () => onSelect(p) : undefined}>
                  {displayName(name)}
                </ClubStrip>
                <span className="rs-alive__txt">
                  <b>{ordinal(r.len)}</b> straight, {label.get(r.id)}
                </span>
              </li>
            );
          })}
        </Reveal>
      </section>
      <div className="rs-lists">
        {f.thresholds.map((t) => (
          <details key={t.id} className="rs-det">
            <summary>
              {t.label} <small>{INK_STATS.find((s) => s.id === t.stat)?.label}</small>
            </summary>
            <div className="rs-det__cols">
              <ol>
                <li className="rs-det__h">Longest runs</li>
                {f.longest[t.id].slice(0, 10).map((r) => (
                  <li key={`${r.k}-${r.from}`} className={cn(r.alive && 'is-alive')}>
                    <span>{displayName(r.n)}</span>
                    <small>{runText(r)}</small>
                    <b>{r.len}</b>
                  </li>
                ))}
              </ol>
              <ol>
                <li className="rs-det__h">Most seasons</li>
                {f.most[t.id].slice(0, 10).map((r) => (
                  <li key={`${r.k}-m`} className={cn(r.alive && 'is-alive')}>
                    <span>{displayName(r.n)}</span>
                    <small>{runText(r)}</small>
                    <b>{r.seasons}</b>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        ))}
      </div>
      <p className="ra-foot">Regular season, real game logs from 1999. A run is alive when it reaches {f.last}. Gold rows are still going.</p>
    </div>
  );
};
