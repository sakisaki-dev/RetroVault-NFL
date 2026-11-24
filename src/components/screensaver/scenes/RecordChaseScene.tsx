import { type CSSProperties } from 'react';
import type { Player } from '@/types/player';
import type { CareerSeasonsFile } from '@/utils/careerSeasons';
import { playerKey } from '@/config/ovr';
import { findNFLTeam } from '@/utils/nflTeams';
import { bannerTeamOf } from '@/utils/playerExtras';
import { displayName, surnameOf } from '@/utils/displayName';
import type { ClubRecordFile } from '@/components/stats/clubRecords';
import { groupOf } from '@/components/stats/comps/graphs/statDefs';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { clubStyle } from '@/components/stats/visual/clubTone';
import { Stadium, Figure } from '../Screensaver';
import './newScenes.css';

/*
 * Record chase: the active players closest to a league career mark (records.json) racing a turf progress bar toward
 * the record holder standing at the finish line, with the amount to go and an ETA in seasons at his recent pace.
 */
export interface Chase {
  record: string;
  unit: string;
  chaser: Player;
  holder: Player | null;
  holderName: string;
  have: number;
  mark: number;
  pct: number;
  toGo: number;
  pace: number | null;
}
export interface ChaseData { chases: Chase[]; near: boolean; roll: number }

/** Record → who can chase it, his career total, the file field his seasons come from */
const MAP: Record<string, { pos: string[]; key: string; field: string; unit: string }> = {
  'Best passing career': { pos: ['QB'], key: 'passYds', field: 'yds', unit: 'passing yards' },
  'Most TD passes, career': { pos: ['QB'], key: 'passTD', field: 'td', unit: 'TD passes' },
  'Best receiving career': { pos: ['WR', 'TE'], key: 'recYds', field: 'yds', unit: 'receiving yards' },
  'Most TD receptions, career': { pos: ['WR', 'TE'], key: 'recTD', field: 'td', unit: 'TD catches' },
  'Best rushing career': { pos: ['RB'], key: 'rushYds', field: 'ryds', unit: 'rushing yards' },
  'Most rushing TDs, career': { pos: ['RB'], key: 'rushTD', field: 'rtd', unit: 'rushing TDs' },
  'Most tackles, career': { pos: ['LB', 'DB', 'DL'], key: 'tackles', field: 'tkl', unit: 'tackles' },
  'Most sacks, career': { pos: ['LB', 'DB', 'DL'], key: 'sacks', field: 'sck', unit: 'sacks' },
  'Most interceptions, career': { pos: ['LB', 'DB', 'DL'], key: 'interceptions', field: 'int', unit: 'interceptions' },
  'Most forced fumbles, career': { pos: ['LB', 'DB', 'DL'], key: 'forcedFumbles', field: 'ff', unit: 'forced fumbles' },
};
const num = (p: Player, k: string) => Number((p as unknown as Record<string, number>)[k]) || 0;

/** Per-season pace from his last three seasons of 8+ games; his career rate × 17 without them */
const paceOf = (file: CareerSeasonsFile | null, p: Player, field: string, have: number): number | null => {
  const e = file?.players[playerKey(p)];
  if (file && e) {
    const fields = file.fields[groupOf(p.position)] ?? [];
    const fi = fields.indexOf(field);
    const gi = fields.indexOf('g');
    const deltas: number[] = [];
    for (let i = 1; i < e.rows.length; i++) {
      const r = e.rows[i];
      const q = e.rows[i - 1];
      if (!r || !q || fi < 0 || gi < 0) continue;
      const g = Number(r[5 + gi]) - Number(q[5 + gi]);
      if (g >= 8 && g <= 21) deltas.push(Number(r[5 + fi]) - Number(q[5 + fi]));
    }
    const last = deltas.slice(-3);
    if (last.length) return last.reduce((a, b) => a + b, 0) / last.length;
  }
  return p.games > 0 ? (have / p.games) * 17 : null;
};

export const buildChases = (records: ClubRecordFile, players: Player[], file: CareerSeasonsFile | null): Chase[] => {
  const active = players.filter((p) => p.status === 'Active');
  const out: Chase[] = [];
  for (const row of records.records) {
    const m = MAP[row.record];
    const mark = row.league?.value;
    if (!m || !mark) continue;
    const top = row.league?.top?.[0];
    let best: Chase | null = null;
    for (const p of active) {
      if (!m.pos.includes(p.position) || p.name === top?.player) continue;
      const have = num(p, m.key);
      if (have <= 0 || have >= mark) continue;
      if (!best || have > best.have) {
        best = { record: row.record, unit: m.unit, chaser: p, holder: null, holderName: top?.player ?? '', have, mark, pct: have / mark, toGo: mark - have, pace: paceOf(file, p, m.field, have) };
      }
    }
    if (best) {
      best.holder = players.find((x) => x.name === top?.player && m.pos.includes(x.position)) ?? null;
      out.push(best);
    }
  }
  return out.sort((a, b) => b.pct - a.pct);
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const etaText = (c: Chase) => {
  if (!c.pace || c.pace <= 0) return 'no recent pace';
  const y = c.toGo / c.pace;
  return y > 15 ? 'over 15 seasons at his pace' : y <= 1 ? 'within a season at his pace' : `about ${Math.ceil(y)} seasons at his pace`;
};

const Row = ({ c, i, sprites }: { c: Chase; i: number; sprites: boolean }) => {
  const p = c.chaser;
  const t = findNFLTeam(bannerTeamOf(p));
  return (
    <li className="rc__row" style={{ ...clubStyle(p), '--w': `${Math.min(99, c.pct * 100).toFixed(1)}%`, '--i': i } as CSSProperties}>
      <div className="rc__info">
        <p className="sv-kick">{c.record.replace(/, career$/, '')}</p>
        <h3 className="rc__name">{displayName(p.name)}</h3>
        <p className="rc__line">
          <b>{fmt(c.have)}</b> of {fmt(c.mark)} {c.unit}
        </p>
        <p className="rc__line rc__line--gold">
          <b>{fmt(c.toGo)}</b> to go · {etaText(c)}
        </p>
        {c.pct < 0.6 && <span className="rc__tag">Long shot · {Math.round(c.pct * 100)}% of the way</span>}
      </div>
      <div className="rc__track">
        <span className="rc__bar">
          <i />
          <em>{Math.round(c.pct * 100)}%</em>
        </span>
        <span className="rc__runner">
          {sprites ? <GameSprite player={p} team={t?.name} kind="figure" size="m" action="run" /> : t && <TeamLogo team={t.name} size={56} decorative />}
        </span>
        <span className="rc__flag" aria-hidden="true" />
      </div>
      <div className="rc__holder">
        {c.holder ? <Figure player={c.holder} sprites={sprites} action="celebrate" scale={0.85} /> : <span className="rc__nobody" />}
        <span className="rc__mark">{fmt(c.mark)}</span>
        <span className="sv-line__name">{c.holder ? surnameOf(c.holder.name) : c.holderName}</span>
      </div>
    </li>
  );
};

const RecordChaseScene = ({ data, sprites }: { data: ChaseData; sprites: boolean }) => {
  const lead = data.chases[0].chaser;
  return (
    <Stadium club={findNFLTeam(bannerTeamOf(lead))?.name ?? 'Eagles'} roll={data.roll}>
      <div className="rc">
        <div className="rc__head">
          <p className="sv-kick">Record chase · league career marks</p>
          <h2 className="sv-title rc__title">{data.near ? 'Closing in' : 'Long shots'}</h2>
          {!data.near && <p className="sv-sub">No active player is within 60% of a career record. These are the closest.</p>}
        </div>
        <ul className="rc__rows">
          {data.chases.map((c, i) => (
            <Row key={c.record} c={c} i={i} sprites={sprites} />
          ))}
        </ul>
      </div>
    </Stadium>
  );
};

export default RecordChaseScene;
