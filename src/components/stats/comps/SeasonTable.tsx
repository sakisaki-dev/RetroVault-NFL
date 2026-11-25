import { useMemo } from 'react';
import { Star } from 'lucide-react';
import type { Player } from '@/types/player';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/brand/TeamLogo';
import { Reveal } from '@/components/motion/Reveal';
import { seasonLabel } from '@/config/edition';
import { useGameLog, rowsOf, type GameRow } from '@/utils/gameLogs';
import { useCareerSeasons } from '@/utils/careerSeasons';
import { normalizeName, usePlayerExtras } from '@/utils/playerExtras';
import { INK_STATS, inkFor, useHonours, useInk } from '@/utils/seasonBoards';
import { findNFLTeam } from '@/utils/nflTeams';
import { groupOf } from './graphs/statDefs';
import { keyOf } from '../records';
import './seasonTable.css';

/**
 * Deep Dive, Season by season: one row per season from the real game log (regular season, 1999 on), his clubs that year
 * as logo plates, the line for his position, the honours of that season and his SZN. A gold star marks a stat he led
 * the league in that year (black ink, src/utils/seasonBoards.ts). A career that began before 1999 has no game log for
 * those seasons: its card totals less the seasons shown are one "Before 1999" row (exact arithmetic on the card, never
 * an estimate); a pre-1999 career with no log at all is one "Career before 1999 (totals)" row. Phone: the season and
 * club columns stay pinned while the stats scroll.
 */

interface Col {
  id: string;
  label: string;
  title: string;
  /** game-log columns summed */
  src: string[];
  /** the card's career total field */
  card?: string;
  /** black ink stat id */
  ink?: string;
}
const C = (id: string, label: string, title: string, src: string[], card?: string, ink?: string): Col => ({ id, label, title, src, card, ink });
const TKL = ['def_tackles_solo', 'def_tackle_assists'];
const COLS: Record<string, Col[]> = {
  QB: [
    C('cmp', 'Cmp', 'Completions', ['completions'], 'completions'),
    C('att', 'Att', 'Attempts', ['attempts'], 'attempts'),
    C('yds', 'Pass yds', 'Passing yards', ['passing_yards'], 'passYds', 'pyds'),
    C('td', 'Pass TD', 'Passing touchdowns', ['passing_tds'], 'passTD', 'ptd'),
    C('int', 'INT', 'Interceptions thrown', ['passing_interceptions'], 'interceptions'),
    C('ryds', 'Rush yds', 'Rushing yards', ['rushing_yards'], 'rushYds', 'ryds'),
    C('rtd', 'Rush TD', 'Rushing touchdowns', ['rushing_tds'], 'rushTD', 'rtd'),
  ],
  RB: [
    C('car', 'Car', 'Carries', ['carries'], 'rushAtt'),
    C('ryds', 'Rush yds', 'Rushing yards', ['rushing_yards'], 'rushYds', 'ryds'),
    C('rtd', 'Rush TD', 'Rushing touchdowns', ['rushing_tds'], 'rushTD', 'rtd'),
    C('rec', 'Rec', 'Receptions', ['receptions'], 'receptions', 'rec'),
    C('recyds', 'Rec yds', 'Receiving yards', ['receiving_yards'], 'recYds', 'recyds'),
    C('rectd', 'Rec TD', 'Receiving touchdowns', ['receiving_tds'], 'recTD', 'rectd'),
  ],
  REC: [
    C('rec', 'Rec', 'Receptions', ['receptions'], 'receptions', 'rec'),
    C('recyds', 'Rec yds', 'Receiving yards', ['receiving_yards'], 'recYds', 'recyds'),
    C('rectd', 'Rec TD', 'Receiving touchdowns', ['receiving_tds'], 'recTD', 'rectd'),
  ],
  DEF: [
    C('tkl', 'Tkl', 'Tackles (solo + assists)', TKL, 'tackles', 'tkl'),
    C('sck', 'Sck', 'Sacks', ['def_sacks'], 'sacks', 'sck'),
    C('int', 'INT', 'Interceptions', ['def_interceptions'], 'interceptions', 'int'),
    C('ff', 'FF', 'Forced fumbles', ['def_fumbles_forced'], 'forcedFumbles'),
  ],
  OL: [],
};
const colsFor = (p: Player): Col[] => (p.position === 'WR' || p.position === 'TE' ? COLS.REC : COLS[groupOf(p.position)] ?? []);

const ABBR: Record<string, string> = { LA: 'LAR', STL: 'LAR', OAK: 'LV', SD: 'LAC', WSH: 'WAS', JAC: 'JAX' };
const clubName = (a: string) => findNFLTeam(ABBR[a] ?? a)?.name ?? a;

const KIND_LABEL: Record<string, string> = { mvp: 'MVP', opoy: 'OPOY', dpoy: 'DPOY', oroy: 'OROY', droy: 'DROY', cpoy: 'CPOY', sbmvp: 'SB MVP' };
const KIND_ORDER = ['mvp', 'opoy', 'dpoy', 'sbmvp', 'oroy', 'droy', 'cpoy'];

interface SeasonRow {
  year: number;
  clubs: string[];
  g: number;
  v: Record<string, number | null>;
}
const fmt = (n: number | null | undefined) => (n == null ? '–' : Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(1));

const buildRows = (rows: GameRow[], cols: Col[]): SeasonRow[] => {
  const by = new Map<number, GameRow[]>();
  rows.forEach((r) => {
    if (r.type !== 'REG') return;
    const y = Number(r.season);
    by.set(y, [...(by.get(y) ?? []), r]);
  });
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, rs]) => {
      const clubs: string[] = [];
      [...rs].sort((a, b) => Number(a.week) - Number(b.week)).forEach((r) => {
        const t = String(r.team);
        if (!clubs.includes(t)) clubs.push(t);
      });
      const v: Record<string, number | null> = {};
      cols.forEach((c) => {
        // a column the log dropped (every value zero over the whole career) is a true zero; a null cell is a missing stat
        let any = false;
        let sum = 0;
        rs.forEach((r) =>
          c.src.forEach((s) => {
            const x = r[s];
            if (typeof x === 'number') {
              any = true;
              sum += x;
            }
          }),
        );
        v[c.id] = any ? sum : rs.some((r) => c.src.some((s) => s in r)) ? null : 0;
      });
      return { year, clubs, g: rs.length, v };
    });
};

const Plates = ({ clubs }: { clubs: string[] }) => (
  <span className="st-clubs">
    {clubs.slice(0, 3).map((c) => (
      <span key={c} title={clubName(c)}>
        <TeamLogo team={ABBR[c] ?? c} size={22} decorative backed />
      </span>
    ))}
    {clubs.length > 1 && <span className="st-clubs__n">{clubs.length}</span>}
  </span>
);

const SeasonTable = ({ player }: { player: Player }) => {
  const key = keyOf(player);
  const log = useGameLog(key);
  const file = useCareerSeasons();
  const inkFile = useInk();
  const honours = useHonours();
  const extras = usePlayerExtras();
  const cols = useMemo(() => colsFor(player), [player]);
  const rows = useMemo(() => buildRows(rowsOf(log), cols), [log, cols]);

  // SZN by season from the season-end file
  const szn = useMemo(() => {
    const m = new Map<number, number>();
    const e = file?.players[key];
    if (file && e) {
      const n = (file.fields[groupOf(player.position)] ?? []).length;
      e.rows.forEach((row, i) => {
        const y = file.seasons[file.seasons.indexOf(e.from) + i];
        const v = row ? row[5 + n] : null;
        if (y != null && typeof v === 'number') m.set(y, v);
      });
    }
    return m;
  }, [file, key, player.position]);

  const rings = useMemo(() => new Set((extras.stints[normalizeName(player.name)]?.stints ?? []).flatMap((s) => s.rings)), [extras, player.name]);
  const won = (year: number) => {
    const out: string[] = [];
    if (rings.has(year)) out.push('Ring');
    const aw = honours?.awards[String(year)] ?? {};
    KIND_ORDER.forEach((k) => {
      if (aw[k]?.some((w) => w.k === key)) out.push(KIND_LABEL[k]);
    });
    return out;
  };
  const led = (stat: string | undefined, year: number) => !!stat && !!inkFor(key)[stat]?.includes(year) && !!inkFile;

  if (log === undefined) return <p className="text-sm text-muted-foreground">Loading his seasons…</p>;

  const card = player as unknown as Record<string, number>;
  const cardOf = (c: Col) => (c.card && typeof card[c.card] === 'number' ? card[c.card] : null);
  const sums: Record<string, number> = {};
  cols.forEach((c) => (sums[c.id] = rows.reduce((a, r) => a + (r.v[c.id] ?? 0), 0)));
  const sumG = rows.reduce((a, r) => a + r.g, 0);
  // the seasons before the game log begins: card totals less the seasons shown, only when all of it is non-negative
  const gap = (() => {
    if (!rows.length) return null;
    const first = rows[0].year;
    if (first > 1999) return null;
    const g = player.games - sumG;
    const v: Record<string, number | null> = {};
    let ok = g > 0;
    cols.forEach((c) => {
      const t = cardOf(c);
      const d = t == null ? null : t - sums[c.id];
      if (d != null && d < -0.01) ok = false;
      v[c.id] = d;
    });
    return ok ? { g, v } : null;
  })();
  const noLog = rows.length === 0;
  const latest = rows.length ? rows[rows.length - 1].year : 0;

  if (noLog && !(player.games > 0)) return <p className="text-sm text-muted-foreground">No game log on file for {player.name}.</p>;

  return (
    <Reveal className="st">
      <div className="st-scroll" role="region" aria-label={`${player.name}, season by season`} tabIndex={0}>
        <table className="st-table">
          <thead>
            <tr>
              <th className="st-pin st-pin--a">Season</th>
              <th className="st-pin st-pin--b">Club</th>
              <th title="Games played">G</th>
              {cols.map((c) => (
                <th key={c.id} title={c.title}>
                  {c.label}
                </th>
              ))}
              <th className="st-honours">Honours</th>
              <th title="Season OVR: the season's own rating">SZN</th>
            </tr>
          </thead>
          <tbody>
            {noLog && (
              <tr className="st-pre">
                <td className="st-pin st-pin--a">Before 1999</td>
                <td className="st-pin st-pin--b" />
                <td>{fmt(player.games)}</td>
                {cols.map((c) => (
                  <td key={c.id}>{fmt(cardOf(c))}</td>
                ))}
                <td className="st-honours">
                  <span className="st-note">Career before 1999 (totals)</span>
                </td>
                <td>–</td>
              </tr>
            )}
            {gap && (
              <tr className="st-pre">
                <td className="st-pin st-pin--a">Before 1999</td>
                <td className="st-pin st-pin--b" />
                <td>{fmt(gap.g)}</td>
                {cols.map((c) => (
                  <td key={c.id}>{fmt(gap.v[c.id])}</td>
                ))}
                <td className="st-honours">
                  <span className="st-note">Card totals less the seasons below</span>
                </td>
                <td>–</td>
              </tr>
            )}
            {rows.map((r) => {
              const w = won(r.year);
              const s = szn.get(r.year);
              return (
                <tr key={r.year} className={cn(w.length > 0 && 'st-hl')}>
                  <td className="st-pin st-pin--a">
                    <b>{seasonLabel(r.year)}</b>
                  </td>
                  <td className="st-pin st-pin--b">
                    <Plates clubs={r.clubs} />
                  </td>
                  <td>{r.g}</td>
                  {cols.map((c) => (
                    <td key={c.id} className={cn(led(c.ink, r.year) && 'st-led')}>
                      {fmt(r.v[c.id])}
                      {led(c.ink, r.year) && <Star className="st-star" aria-label="Led the league" />}
                    </td>
                  ))}
                  <td className="st-honours">
                    {w.map((x) => (
                      <span key={x} className={cn('st-chip', x === 'MVP' && 'st-chip--mvp')}>
                        {x}
                      </span>
                    ))}
                  </td>
                  <td>{s != null ? <span className={cn('st-szn', s >= 90 && 'st-szn--gold')}>{s}</span> : '–'}</td>
                </tr>
              );
            })}
          </tbody>
          {!noLog && <tfoot>
            <tr>
              <td className="st-pin st-pin--a">Career</td>
              <td className="st-pin st-pin--b" />
              <td>{fmt(player.games)}</td>
              {cols.map((c) => (
                <td key={c.id}>{fmt(cardOf(c) ?? sums[c.id])}</td>
              ))}
              <td className="st-honours">
                {player.rings > 0 && <span className="st-chip">{player.rings}× Ring</span>}
                {player.mvp > 0 && <span className="st-chip st-chip--mvp">{player.mvp}× MVP</span>}
              </td>
              <td />
            </tr>
          </tfoot>}
        </table>
      </div>
      <p className="st-foot">
        Regular season, from the real game log{latest ? ` (${rows[0].year}–${latest})` : ''}. <Star className="st-star st-star--inline" aria-hidden /> led the league that year
        {inkFile ? `, ${INK_STATS.length} headline stats` : ''}. SZN is the season rating.
      </p>
    </Reveal>
  );
};

export default SeasonTable;
