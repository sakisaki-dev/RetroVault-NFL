import { useMemo, useState } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/brand/TeamLogo';
import { Reveal, stag } from '@/components/motion/Reveal';
import { PixelIcon } from '@/components/arcade';
import { StarSprite } from '@/components/season/NflSeasonExtras';
import { peekKeyProps } from '@/components/peek/peekProps';
import { findNFLTeam } from '@/utils/nflTeams';
import type { CapFile, RosterRow, Ticket } from '@/utils/clubSeason';
import { surname } from './ClubSeasonHero';

const nf = (n: number) => n.toLocaleString('en-US');
const ROUND_SHORT: Record<string, string> = { WC: 'WC', DIV: 'DIV', CON: 'CONF', SB: 'SB' };
const ROUND_NAME: Record<string, string> = { WC: 'Wild Card', DIV: 'Divisional round', CON: 'Conference championship', SB: 'Super Bowl' };

export interface RosterEntry extends RosterRow {
  pos: string;
  name: string;
  number?: number;
}

/* ---------------- The schedule: a programme fixture list ---------------- */

/**
 * Every game as a fixture row: the week, the opponent's logo, home or away, an upset tag by the closing line, the
 * result and a margin bar (wins in the club's colour, losses red, scaled to the season's widest margin); playoff
 * rows carry their round on gold. A row opens the game.
 */
export const Fixtures = ({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (id: string) => void }) => {
  const maxM = Math.max(14, ...tickets.map((t) => (t.pf != null && t.pa != null ? Math.abs(t.pf - t.pa) : 0)));
  return (
    <Reveal as="ol" className="pg-fix">
      {tickets.map((t, i) => {
        const wk = t.type === 'REG' ? String(t.week) : ROUND_SHORT[t.type] ?? t.type;
        if (t.bye) {
          return (
            <li key={`b${t.week}`} className="pg-fx is-bye mo-rise" style={stag(i, 22)}>
              <span className="pg-fx__wk num">{wk}</span>
              <span className="pg-fx__bye">Bye week</span>
            </li>
          );
        }
        const opp = findNFLTeam(t.opp);
        const m = t.pf != null && t.pa != null ? t.pf - t.pa : 0;
        const where = t.type === 'REG' ? `Week ${t.week}` : ROUND_NAME[t.type] ?? t.type;
        const label = `${where}, ${t.home ? 'vs' : 'at'} ${opp?.name ?? t.opp}${t.r ? `, ${t.r === 'W' ? 'win' : t.r === 'L' ? 'loss' : 'tie'} ${t.pf} to ${t.pa}` : ', not played yet'}${t.upset ? `, upset ${t.upset === 'win' ? `win as a ${Math.abs(t.fav ?? 0)}-point underdog` : `loss as a ${t.fav}-point favourite`}` : ''}. Open the game`;
        return (
          <li key={t.game?.id ?? i} className="mo-rise" style={stag(i, 22)}>
            <button type="button" className={cn('pg-fx', t.r && `is-${t.r}`, t.type !== 'REG' && 'is-po')} onClick={() => t.game && onOpen(t.game.id)} aria-label={label}>
              <span className="pg-fx__wk num">{wk}</span>
              <TeamLogo team={t.opp ?? ''} size={24} decorative className="pg-logo" />
              <span className="pg-fx__opp">
                <i>{t.home ? 'vs' : '@'}</i> <b>{opp?.abbreviation ?? t.opp}</b>
                {t.upset && <em className={cn('pg-up', t.upset === 'loss' && 'is-dn')} title={t.upset === 'win' ? `Underdog by ${Math.abs(t.fav ?? 0)} on the closing line` : `Favoured by ${t.fav} on the closing line`}>{t.upset === 'win' ? 'Upset' : 'Upset L'}</em>}
                {t.ot && <small>OT</small>}
              </span>
              <span className="pg-fx__r num">{t.r ? `${t.r} ${t.pf}-${t.pa}` : '–'}</span>
              <span className="pg-fx__m" aria-hidden="true">{t.r && t.r !== 'T' && <i style={{ width: `${Math.max(6, (Math.abs(m) / maxM) * 100)}%` }} />}</span>
            </button>
          </li>
        );
      })}
    </Reveal>
  );
};

/* ---------------- Stat leaders as bust tiles ---------------- */

const LEADERS: { label: string; pick: (r: RosterEntry) => number | undefined; pos?: string[]; dec?: number }[] = [
  { label: 'Passing yards', pick: (r) => r.pyds, pos: ['QB'] },
  { label: 'Rushing yards', pick: (r) => r.ryds, pos: ['QB', 'RB', 'WR', 'TE'] },
  { label: 'Receiving yards', pick: (r) => r.recyds, pos: ['RB', 'WR', 'TE'] },
  { label: 'Receptions', pick: (r) => r.rec, pos: ['RB', 'WR', 'TE'] },
  { label: 'Scrimmage TDs', pick: (r) => (r.rtd || r.rectd ? (r.rtd ?? 0) + (r.rectd ?? 0) : undefined), pos: ['QB', 'RB', 'WR', 'TE'] },
  { label: 'Tackles', pick: (r) => r.tkl, pos: ['LB', 'DB', 'DL'] },
  { label: 'Sacks', pick: (r) => r.sck, pos: ['LB', 'DB', 'DL'], dec: 1 },
  { label: 'Interceptions', pick: (r) => r.dint, pos: ['LB', 'DB', 'DL'] },
];

export const Leaders = ({ rows, club, year, onPick }: { rows: RosterEntry[]; club: string; year: number; onPick: (key: string) => void }) => {
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
  if (!cards.length) return <p className="pg-note">No leaders on file for this season.</p>;
  return (
    <Reveal as="ul" className="pg-lds">
      {cards.map(({ l, best, v }, i) => (
        <li key={l.label} className="mo-pop" style={stag(i, 45)}>
          <button type="button" className="pg-ld" data-peek-ok {...peekKeyProps(best.k)} onClick={() => onPick(best.k)} aria-label={`${l.label}: ${best.name}, ${l.dec ? v.toFixed(l.dec) : nf(v)}. Open player card`}>
            <span className="pg-ld__sp" aria-hidden="true"><StarSprite name={best.name} pos={best.pos} team={club} size="m" kind="bust" season={year} /></span>
            <span className="pg-ld__t">
              <span className="pg-kick">{l.label}</span>
              <b className="num">{l.dec ? v.toFixed(l.dec) : nf(v)}</b>
              <em>{best.name}<small> · {best.pos}{best.number != null ? ` #${best.number}` : ''}</small></em>
            </span>
          </button>
        </li>
      ))}
    </Reveal>
  );
};

/* ---------------- The roster as a yearbook ---------------- */

const GROUPS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'];
const FIRST = 16;

export const Yearbook = ({ rows, club, year, onPick }: { rows: RosterEntry[]; club: string; year: number; onPick: (key: string) => void }) => {
  const [group, setGroup] = useState('All');
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.szn ?? -1) - (a.szn ?? -1) || b.g - a.g || a.k.localeCompare(b.k)), [rows]);
  // yearbook names: the surname, with the initial where two share it ("A. Jones", "P. Jones")
  const short = useMemo(() => {
    const n = new Map<string, number>();
    rows.forEach((r) => n.set(surname(r.name), (n.get(surname(r.name)) ?? 0) + 1));
    return (name: string) => ((n.get(surname(name)) ?? 0) > 1 ? `${name[0]}. ${surname(name)}` : surname(name));
  }, [rows]);
  const shown = sorted.filter((r) => group === 'All' || r.pos === group || (group === 'Other' && !GROUPS.includes(r.pos)));
  const list = group === 'All' && !all ? shown.slice(0, FIRST) : shown;
  const groups = useMemo(() => [...GROUPS.filter((g) => g === 'All' || rows.some((r) => r.pos === g)), ...(rows.some((r) => !GROUPS.includes(r.pos)) ? ['Other'] : [])], [rows]);
  return (
    <div className="pg-yb-wrap">
      <div className="pg-chips" role="group" aria-label="Position">
        {groups.map((g) => (
          <button key={g} type="button" className={cn('pg-chip', group === g && 'is-on')} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>
        ))}
      </div>
      <Reveal as="ul" className="pg-yb" key={`${group}-${all ? 1 : 0}`}>
        {list.map((r, i) => (
          <li key={r.k} className="mo-pop" style={stag(i, 22)}>
            <button type="button" className="pg-ybt" data-peek-ok {...peekKeyProps(r.k)} onClick={() => onPick(r.k)} aria-label={`${r.pos} ${r.name}${r.number != null ? `, number ${r.number}` : ''}, ${r.g} games${r.szn != null ? `, season rating ${r.szn}` : ''}${r.aw?.length ? `, ${r.aw.join(', ')}` : ''}. Open player card`}>
              <span className="pg-ybt__sp" aria-hidden="true"><StarSprite name={r.name} pos={r.pos} team={club} size="m" kind="bust" season={year} /></span>
              {r.szn != null && <span className={cn('pg-szn num', r.szn >= 90 ? 'is-hi' : r.szn >= 80 && 'is-mid')}>{r.szn}</span>}
              {r.aw?.length ? <span className="pg-ybt__aw" title={r.aw.join(', ')}><PixelIcon name="trophy" size={9} />{r.aw[0]}{r.aw.length > 1 ? ` +${r.aw.length - 1}` : ''}</span> : null}
              <b className="pg-ybt__n" title={r.name}>{short(r.name)}</b>
              <span className="pg-ybt__m num">{r.pos}{r.number != null ? ` · #${r.number}` : ''} · {r.g} g</span>
            </button>
          </li>
        ))}
      </Reveal>
      {group === 'All' && shown.length > FIRST && (
        <button type="button" className="pg-more" onClick={() => setAll((v) => !v)}>{all ? 'Show the top 16' : `Show all ${shown.length}`}</button>
      )}
      <p className="pg-note">By SZN · tap a player for his card</p>
    </div>
  );
};

/* ---------------- Season cap breakdown ---------------- */

const money = (n: number, dec = 1) => `$${(n / 1e6).toFixed(dec)}M`;
const GROUP_NAME: Record<string, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', LB: 'LB', DB: 'DB', ST: 'K / P / LS' };

export const CapBreakdown = ({ cap, club, clubName, year }: { cap: CapFile | null; club: string; clubName: string; year: number }) => {
  const c = cap?.clubs[club];
  const team = findNFLTeam(club);
  if (!cap || !c || year > cap.lastSigned) {
    return <p className="cs-note">No cap data for this season</p>;
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
      <Reveal as="ol" className="cs-top num">
        {c.top.map(([name, pos, apy, signed, years], i) => (
          <li key={`${name}${signed}`} className="mo-rise" style={stag(i, 40)}>
            <span className="cs-top__sp" aria-hidden="true"><StarSprite name={name} pos={pos} team={clubName} size="s" kind="bust" season={year} /></span>
            <span className="cs-top__who"><span className="cs-name"><i>{pos}</i><span>{name}</span></span><em>signed {signed}, {years} yr{years === 1 ? '' : 's'}</em></span>
            <span className="cs-top__v"><b>{money(apy, 2)}</b><small>avg per year</small></span>
          </li>
        ))}
      </Reveal>
      <p className="cs-note">
        Average per year, not cap hits{c.n < 25 ? ` · ${c.n} contracts shown` : ''}
        <InfoTip>
          Source: OverTheCap contracts through nflverse. These are contract values (average per year), not cap hits, so they are not the club&rsquo;s payroll. Only deals still in force that year for a player on the club&rsquo;s roster are counted, and the file holds deals signed through {cap.lastSigned}{c.n < 25 ? `; for ${year} it holds only the ${c.n} contracts shown, so read the split as that group, not the whole roster` : ''}.
        </InfoTip>
      </p>
    </div>
  );
};

