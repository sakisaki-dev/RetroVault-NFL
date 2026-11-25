import { useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/brand/TeamLogo';
import { clubPlate } from '@/components/arcade/clubInk';
import { Reveal, stag } from '@/components/motion/Reveal';
import { peekKeyProps } from '@/components/peek/peekProps';
import { findNFLTeam } from '@/utils/nflTeams';
import { ROUND_LABEL } from '@/utils/gameFinder';
import type { CapFile, RosterRow, Ticket } from '@/utils/clubSeason';

const nf = (n: number) => n.toLocaleString('en-US');

/* ---------------- Game log as tickets ---------------- */

export const Tickets = ({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (id: string) => void }) => {
  const reg = tickets.filter((t) => t.type === 'REG' && !t.bye && t.r);
  const rec = (f: (t: Ticket) => boolean) => {
    const rs = reg.filter(f);
    return `${rs.filter((t) => t.r === 'W').length}-${rs.filter((t) => t.r === 'L').length}`;
  };
  const one = reg.filter((t) => t.pf != null && t.pa != null && Math.abs(t.pf - t.pa) <= 8);
  const oneRec = `${one.filter((t) => t.r === 'W').length}-${one.filter((t) => t.r === 'L').length}`;
  return (
    <div>
      <div className="cs-split num">
        <span>Home {rec((t) => !!t.home)}</span>
        <span>Away {rec((t) => !t.home)}</span>
        <span>One-score games {oneRec}</span>
      </div>
      <Reveal as="ul" className="cs-tix">
        {tickets.map((t, i) => {
          const wk = t.type === 'REG' ? `WK ${t.week}` : (ROUND_LABEL[t.type] ?? t.type).toUpperCase();
          if (t.bye) {
            return (
              <li key={`b${t.week}`} className="mo-rise" style={stag(i, 22)}>
                <span className="cs-tix__t is-bye"><span className="cs-tix__wk">{wk}</span><b>BYE</b></span>
              </li>
            );
          }
          const label = `${wk}, ${t.home ? 'vs' : 'at'} ${t.opp}${t.r ? `, ${t.r === 'W' ? 'win' : t.r === 'L' ? 'loss' : 'tie'} ${t.pf} to ${t.pa}` : ', not played yet'}${t.upset ? `, upset ${t.upset}` : ''}. Open the game`;
          return (
            <li key={t.game?.id} className="mo-rise" style={stag(i, 22)}>
              <button
                type="button"
                onClick={() => t.game && onOpen(t.game.id)}
                aria-label={label}
                title={t.upset ? (t.upset === 'win' ? `Upset win: underdog by ${Math.abs(t.fav ?? 0)}` : `Upset loss: favoured by ${t.fav}`) : undefined}
                className={cn('cs-tix__t', t.r && `is-${t.r}`, t.type !== 'REG' && 'is-post', t.upset && 'is-upset')}
              >
                <span className="cs-tix__wk">{wk}{t.ot ? ' · OT' : ''}</span>
                <span className="cs-tix__r" aria-hidden="true">{t.r ?? '–'}</span>
                <span className="cs-tix__opp" aria-hidden="true"><TeamLogo team={t.opp ?? ''} size={18} decorative />{t.home ? 'vs' : '@'} {findNFLTeam(t.opp)?.abbreviation ?? t.opp}</span>
                {t.r && <span className="cs-tix__s num" aria-hidden="true">{t.pf}-{t.pa}</span>}
              </button>
            </li>
          );
        })}
      </Reveal>
      <p className="cs-note">Gold tickets are playoff games. An outlined ticket is an upset by the closing line: the winner was the underdog by 3 or more points. Tap a ticket for the game.</p>
    </div>
  );
};

/* ---------------- Roster ---------------- */

const lineOf = (pos: string, r: RosterRow): string => {
  const parts: string[] = [];
  if (pos === 'QB') {
    if (r.pyds != null) parts.push(`${nf(r.pyds)} yds`);
    if (r.ptd != null) parts.push(`${r.ptd} TD`);
    if (r.pint != null) parts.push(`${r.pint} INT`);
    if (r.ryds) parts.push(`${nf(r.ryds)} rush`);
  } else if (pos === 'RB') {
    if (r.ryds != null) parts.push(`${nf(r.ryds)} rush yds`);
    if (r.rtd) parts.push(`${r.rtd} TD`);
    if (r.rec) parts.push(`${r.rec} rec · ${nf(r.recyds ?? 0)} yds`);
  } else if (pos === 'WR' || pos === 'TE') {
    if (r.rec != null) parts.push(`${r.rec} rec`);
    if (r.recyds != null) parts.push(`${nf(r.recyds)} yds`);
    if (r.rectd) parts.push(`${r.rectd} TD`);
    if (r.ryds) parts.push(`${r.ryds} rush`);
  } else if (pos !== 'OL') {
    if (r.tkl != null) parts.push(`${r.tkl} tkl`);
    if (r.sck) parts.push(`${r.sck} sck`);
    if (r.dint) parts.push(`${r.dint} INT`);
    if (r.ff) parts.push(`${r.ff} FF`);
  }
  return parts.join(' · ');
};

export interface RosterEntry extends RosterRow {
  pos: string;
  name: string;
  number?: number;
}
const GROUPS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'];
const sznClass = (v?: number) => (v == null ? '' : v >= 90 ? 'is-hi' : v >= 80 ? 'is-mid' : '');

export const Roster = ({ rows, club, onPick }: { rows: RosterEntry[]; club: string; onPick: (key: string) => void }) => {
  const [group, setGroup] = useState('All');
  const [all, setAll] = useState(false);
  const shown = rows.filter((r) => group === 'All' || r.pos === group);
  const list = all || group !== 'All' ? shown : shown.slice(0, 24);
  const plate = clubPlate(club);
  const vars = { '--ax-c1': plate.fill, '--ax-c2': plate.edge, '--ax-ink': plate.ink } as CSSProperties;
  return (
    <div style={vars}>
      <div className="cs-chips" role="group" aria-label="Position">
        {GROUPS.map((g) => (
          <button key={g} type="button" className={cn('cs-chip', group === g && 'is-on')} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>
        ))}
      </div>
      <div className="cs-tablewrap">
        <table className="cs-table num">
          <thead>
            <tr><th className="cs-pin">Player</th><th className="n">G</th><th>Season line</th><th>Honours</th><th className="n">SZN</th></tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.k} {...peekKeyProps(r.k)}>
                <th className="cs-pin" scope="row">
                  <button type="button" className="cs-name" onClick={() => onPick(r.k)} aria-label={`Open ${r.name}'s card`}>
                    <i>{r.pos}</i><span>{r.name}</span>{r.number != null && <small>#{r.number}</small>}
                  </button>
                </th>
                <td className="n">{r.g}</td>
                <td>{lineOf(r.pos, r) || <span className="cs-dim">—</span>}</td>
                <td>{r.aw?.length ? r.aw.map((a) => <span key={a} className={cn('cs-aw', (a === 'MVP' || a === 'SB MVP') && 'is-gold')}>{a}</span>) : <span className="cs-dim">—</span>}</td>
                <td className="n">{r.szn != null ? <span className={cn('cs-szn', sznClass(r.szn))}>{r.szn}</span> : <span className="cs-dim">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {group === 'All' && shown.length > 24 && (
        <button type="button" className="cs-more" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${shown.length}`}</button>
      )}
      <p className="cs-note">Every player with a regular-season game for the club that year, sorted by SZN (the season rating). Lines are regular-season totals with this club; a blank means the data has no such stat for the position.</p>
    </div>
  );
};

/* ---------------- Team leaders ---------------- */

const LEADERS: { label: string; pick: (r: RosterEntry) => number | undefined; unit: string; pos?: string[]; dec?: number }[] = [
  { label: 'Passing yards', pick: (r) => r.pyds, unit: 'yds', pos: ['QB'] },
  { label: 'Rushing yards', pick: (r) => r.ryds, unit: 'yds', pos: ['QB', 'RB', 'WR', 'TE'] },
  { label: 'Receiving yards', pick: (r) => r.recyds, unit: 'yds', pos: ['RB', 'WR', 'TE'] },
  { label: 'Receptions', pick: (r) => r.rec, unit: 'rec', pos: ['RB', 'WR', 'TE'] },
  { label: 'Touchdowns', pick: (r) => (r.ptd || r.rtd || r.rectd ? (r.rtd ?? 0) + (r.rectd ?? 0) : undefined), unit: 'rush + rec TD', pos: ['QB', 'RB', 'WR', 'TE'] },
  { label: 'Tackles', pick: (r) => r.tkl, unit: 'tkl', pos: ['LB', 'DB', 'DL'] },
  { label: 'Sacks', pick: (r) => r.sck, unit: 'sacks', pos: ['LB', 'DB', 'DL'], dec: 1 },
  { label: 'Interceptions', pick: (r) => r.dint, unit: 'INT', pos: ['LB', 'DB', 'DL'] },
];

export const Leaders = ({ rows, club, onPick }: { rows: RosterEntry[]; club: string; onPick: (key: string) => void }) => {
  const cards = useMemo(
    () =>
      LEADERS.map((l) => {
        const best = rows
          .filter((r) => (!l.pos || l.pos.includes(r.pos)) && (l.pick(r) ?? 0) > 0)
          .sort((a, b) => (l.pick(b) ?? 0) - (l.pick(a) ?? 0) || a.k.localeCompare(b.k))[0];
        return best ? { l, best, v: l.pick(best) ?? 0 } : null;
      }).filter((x): x is { l: (typeof LEADERS)[number]; best: RosterEntry; v: number } => !!x),
    [rows],
  );
  const plate = clubPlate(club);
  if (!cards.length) return <p className="cs-note">No leaders on file for this season.</p>;
  return (
    <Reveal as="ul" className="cs-leaders" style={{ ['--ax-c1' as string]: plate.fill, ['--ax-c2' as string]: plate.edge, ['--ax-ink' as string]: plate.ink }}>
      {cards.map(({ l, best, v }, i) => (
        <li key={l.label} className="mo-rise" style={stag(i, 40)}>
          <button type="button" className="cs-lead" {...peekKeyProps(best.k)} onClick={() => onPick(best.k)} aria-label={`${l.label}: ${best.name}, ${v}. Open card`}>
            <span className="cs-lead__k">{l.label}</span>
            <b className="cs-lead__v num">{l.dec ? v.toFixed(l.dec) : nf(v)}</b>
            <span className="cs-lead__n">{best.name}</span>
            <span className="cs-lead__u">{best.pos}{best.number != null ? ` · #${best.number}` : ''} · {l.unit}</span>
          </button>
        </li>
      ))}
    </Reveal>
  );
};

/* ---------------- Season cap breakdown ---------------- */

const money = (n: number, dec = 1) => `$${(n / 1e6).toFixed(dec)}M`;
const GROUP_NAME: Record<string, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', LB: 'LB', DB: 'DB', ST: 'K / P / LS' };

export const CapBreakdown = ({ cap, club, year }: { cap: CapFile | null; club: string; year: number }) => {
  const c = cap?.clubs[club];
  const team = findNFLTeam(club);
  if (!cap || !c || year > cap.lastSigned) {
    return <p className="cs-note">No cap data for this season. The contracts file (OverTheCap through nflverse) holds deals signed up to {cap?.lastSigned ?? 2022} and none for this club this year.</p>;
  }
  const groups = Object.entries(c.groups).sort((a, b) => b[1] - a[1]);
  const total = c.total;
  // the bar's segments alternate the club's two colours in steps of lightness, so the groups stay apart in club colours
  const colour = (i: number) => {
    const t = i % 2 === 0 ? team?.primaryColor : team?.secondaryColor;
    const [h, s, l] = (t ?? '222 40% 40%').replace(/%/g, '').split(/\s+/).map(Number);
    const step = Math.floor(i / 2);
    const lum = Math.min(78, Math.max(30, (l < 30 ? 38 : l) + (step % 2 ? 14 : -4) * (step ? 1 : 0) + step * 3));
    return `hsl(${h} ${Math.max(s, 20)}% ${lum}%)`;
  };
  return (
    <div className="cs-cap">
      <div className="cs-cap__stats num">
        <div><span>League cap</span><b>{cap.cap ? `$${cap.cap.toFixed(1)}M` : 'n/a'}</b><small>{cap.cap ? 'derived from each deal’s cap share' : 'too few deals to derive'}</small></div>
        <div><span>Contracts on file</span><b>{c.n}</b><small>players with a deal in force</small></div>
        <div><span>Average per year</span><b>{money(total)}</b><small>{cap.cap ? `${((total / 1e6 / cap.cap) * 100).toFixed(0)}% of the cap` : 'sum of those deals'}</small></div>
      </div>
      <div className="cs-bar" role="img" aria-label={`Contract value by position group: ${groups.map(([g, v]) => `${GROUP_NAME[g] ?? g} ${((v / total) * 100).toFixed(0)}%`).join(', ')}`}>
        {groups.map(([g, v], i) => (
          <span key={g} style={{ width: `${(v / total) * 100}%`, background: colour(i) }} title={`${GROUP_NAME[g] ?? g}: ${money(v)}`}>
            {v / total > 0.07 && <i>{GROUP_NAME[g] ?? g}</i>}
          </span>
        ))}
      </div>
      <ul className="cs-legend num">
        {groups.map(([g, v], i) => (
          <li key={g}><span style={{ background: colour(i) }} />{GROUP_NAME[g] ?? g} <b>{money(v)}</b></li>
        ))}
      </ul>
      <h4 className="cs-sub">Biggest deals in force</h4>
      <ol className="cs-top num">
        {c.top.map(([name, pos, apy, signed, years]) => (
          <li key={`${name}${signed}`}><b>{name}</b><i>{pos}</i><span>{money(apy, 2)} <small>avg per year</small></span><em>signed {signed}, {years} yr{years === 1 ? '' : 's'}</em></li>
        ))}
      </ol>
      <p className="cs-note">
        Source: OverTheCap contracts through nflverse. These are contract values (average per year), not cap hits, so they are not the club&rsquo;s payroll. Only deals still in force that year for a player on the club&rsquo;s roster are counted, and the file holds deals signed through {cap.lastSigned}{c.n < 25 ? `; for ${year} it holds only the ${c.n} contracts shown, so read the split as that group, not the whole roster` : ''}.
      </p>
    </div>
  );
};

