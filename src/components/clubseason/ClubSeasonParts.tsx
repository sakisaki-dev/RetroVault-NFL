import { useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/brand/TeamLogo';
import { clubPlate } from '@/components/arcade/clubInk';
import { Reveal, stag } from '@/components/motion/Reveal';
import { PixelIcon } from '@/components/arcade';
import { StarSprite } from '@/components/season/NflSeasonExtras';
import { peekKeyProps } from '@/components/peek/peekProps';
import { findNFLTeam } from '@/utils/nflTeams';
import { ROUND_LABEL } from '@/utils/gameFinder';
import type { CapFile, RosterRow, Ticket } from '@/utils/clubSeason';

const nf = (n: number) => n.toLocaleString('en-US');

/* ---------------- Season at a glance (margin bars) ---------------- */

const resWord = (r?: string) => (r === 'W' ? 'Win' : r === 'L' ? 'Loss' : r === 'T' ? 'Tie' : 'Not played');
const weekLabel = (t: Ticket) => (t.type === 'REG' ? `Week ${t.week}` : ROUND_LABEL[t.type] ?? t.type);

export const SeasonStrip = ({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (id: string) => void }) => {
  const [sel, setSel] = useState<number | null>(null);
  const maxM = Math.max(14, ...tickets.map((t) => (t.pf != null && t.pa != null ? Math.abs(t.pf - t.pa) : 0)));
  // running regular-season record after each game
  const running = useMemo(() => {
    let w = 0, l = 0, t = 0;
    return tickets.map((x) => {
      if (x.type === 'REG' && x.r) {
        if (x.r === 'W') w += 1; else if (x.r === 'L') l += 1; else t += 1;
      }
      return `${w}-${l}${t ? `-${t}` : ''}`;
    });
  }, [tickets]);
  const reg = tickets.filter((t) => t.type === 'REG' && !t.bye && t.r);
  const best = reg.reduce<Ticket | null>((a, t) => (t.r === 'W' && (a == null || (t.pf ?? 0) - (t.pa ?? 0) > (a.pf ?? 0) - (a.pa ?? 0)) ? t : a), null);
  const worst = reg.reduce<Ticket | null>((a, t) => (t.r === 'L' && (a == null || (t.pa ?? 0) - (t.pf ?? 0) > (a.pa ?? 0) - (a.pf ?? 0)) ? t : a), null);
  const t = sel != null ? tickets[sel] : null;
  const one = reg.filter((x) => Math.abs((x.pf ?? 0) - (x.pa ?? 0)) <= 8);
  const rec = (f: (x: Ticket) => boolean) => {
    const rs = reg.filter(f);
    return `${rs.filter((x) => x.r === 'W').length}-${rs.filter((x) => x.r === 'L').length}`;
  };
  const oneRec = `${one.filter((x) => x.r === 'W').length}-${one.filter((x) => x.r === 'L').length}`;
  return (
    <div className="cs-sg">
      <div className="cs-split num">
        <span><i>Home</i><b>{rec((x) => !!x.home)}</b></span>
        <span><i>Away</i><b>{rec((x) => !x.home)}</b></span>
        <span><i>One-score</i><b>{oneRec}</b></span>
        {best && <span><i>Biggest win</i><b>+{(best.pf ?? 0) - (best.pa ?? 0)}</b></span>}
        {worst && <span><i>Worst loss</i><b>-{(worst.pa ?? 0) - (worst.pf ?? 0)}</b></span>}
      </div>
      <Reveal className="cs-sg__chart" role="list" aria-label="Every game as its winning or losing margin">
        <span className="cs-sg__axis" aria-hidden="true" />
        {tickets.map((x, i) => {
          if (x.bye) {
            return (
              <span key={`b${x.week}`} role="listitem" className="cs-sg__col is-bye mo-rise" style={stag(i, 18)} aria-label={`Week ${x.week}, bye`}>
                <span className="cs-sg__up" /><span className="cs-sg__dn" />
                <span className="cs-sg__lg" aria-hidden="true">BYE</span>
              </span>
            );
          }
          const m = x.pf != null && x.pa != null ? x.pf - x.pa : 0;
          const h = x.r ? Math.max(8, (Math.abs(m) / maxM) * 100) : 6;
          const label = `${weekLabel(x)}, ${x.home ? 'vs' : 'at'} ${x.opp}${x.r ? `, ${resWord(x.r).toLowerCase()} ${x.pf} to ${x.pa}` : ', not played yet'}${x.upset ? `, upset ${x.upset}` : ''}`;
          return (
            <span key={x.game?.id ?? i} role="listitem" className={cn('cs-sg__col mo-rise', x.r && `is-${x.r}`, x.type !== 'REG' && 'is-post', sel === i && 'is-sel')} style={stag(i, 18)}>
              <button type="button" className="cs-sg__btn" aria-label={label} aria-pressed={sel === i} onClick={() => setSel(sel === i ? null : i)}>
                <span className="cs-sg__up">{x.r === 'W' || x.r === 'T' ? <i style={{ height: `${h}%` }}>{x.upset === 'win' && <b aria-hidden="true">★</b>}</i> : null}</span>
                <span className="cs-sg__dn">{x.r === 'L' ? <i style={{ height: `${h}%` }}>{x.upset === 'loss' && <b aria-hidden="true">!</b>}</i> : null}</span>
                <span className="cs-sg__lg" aria-hidden="true"><TeamLogo team={x.opp ?? ''} size={20} decorative /></span>
                <span className="cs-sg__ha" aria-hidden="true">{x.home ? 'H' : 'A'}</span>
              </button>
            </span>
          );
        })}
      </Reveal>
      <div className="cs-sg__read" aria-live="polite">
        {t && !t.bye ? (
          <>
            <span className={cn('cs-sg__res', t.r && `is-${t.r}`)}>{t.r ?? '–'}</span>
            <span className="cs-sg__txt">
              <b>{weekLabel(t)}{t.ot ? ' · OT' : ''}</b>
              <span><TeamLogo team={t.opp ?? ''} size={16} decorative /> {t.home ? 'vs' : 'at'} {t.opp}{t.r ? <> · <b className="num">{t.pf}-{t.pa}</b></> : ' · not played yet'}</span>
              {sel != null && t.type === 'REG' && t.r && <small className="num">Record after: {running[sel]}</small>}
              {t.upset && <small>{t.upset === 'win' ? `Upset win: underdog by ${Math.abs(t.fav ?? 0)}` : `Upset loss: favoured by ${t.fav}`}</small>}
            </span>
            {t.game && <button type="button" className="cs-sg__open" onClick={() => onOpen(t.game!.id)}>Open game</button>}
          </>
        ) : (
          <span className="cs-note">Tap a bar for the game. Bars above the line are wins, below are losses, taller for a bigger margin; gold marks playoff games, a star an upset win by the closing line (underdog by 3 or more) and a ! an upset loss.</span>
        )}
      </div>
    </div>
  );
};

/* ---------------- Game log as tickets ---------------- */

export const Tickets = ({ tickets, onOpen }: { tickets: Ticket[]; onOpen: (id: string) => void }) => (
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
      const opp = findNFLTeam(t.opp);
      const label = `${wk}, ${t.home ? 'vs' : 'at'} ${t.opp}${t.r ? `, ${t.r === 'W' ? 'win' : t.r === 'L' ? 'loss' : 'tie'} ${t.pf} to ${t.pa}` : ', not played yet'}${t.upset ? `, upset ${t.upset}` : ''}. Open the game`;
      return (
        <li key={t.game?.id} className="mo-rise" style={stag(i, 22)}>
          <button
            type="button"
            onClick={() => t.game && onOpen(t.game.id)}
            aria-label={label}
            title={t.upset ? (t.upset === 'win' ? `Upset win: underdog by ${Math.abs(t.fav ?? 0)}` : `Upset loss: favoured by ${t.fav}`) : undefined}
            className={cn('cs-tix__t', t.r && `is-${t.r}`, t.type !== 'REG' && 'is-post', t.upset && 'is-upset')}
            style={opp ? ({ ['--tx-opp' as string]: clubPlate(opp.name).fill } as CSSProperties) : undefined}
          >
            <span className="cs-tix__mark" aria-hidden="true"><TeamLogo team={t.opp ?? ''} size={44} decorative /></span>
            <span className="cs-tix__top">
              <span className="cs-tix__wk">{wk}{t.ot ? ' · OT' : ''}</span>
              <span className="cs-tix__ha" aria-hidden="true">{t.home ? 'HOME' : 'AWAY'}</span>
            </span>
            <span className="cs-tix__opp" aria-hidden="true">{t.home ? 'vs' : '@'} {opp?.abbreviation ?? t.opp}</span>
            <span className="cs-tix__bot" aria-hidden="true">
              <b className="cs-tix__r">{t.r ?? '–'}</b>
              {t.r && <span className="cs-tix__s num">{t.pf}-{t.pa}</span>}
              {t.upset && <em className="cs-tix__up">{t.upset === 'win' ? 'UPSET' : 'UPSET L'}</em>}
            </span>
          </button>
        </li>
      );
    })}
  </Reveal>
);

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
const UNITS: { id: string; label: string; pos: string[] }[] = [
  { id: 'off', label: 'Offense', pos: ['QB', 'RB', 'WR', 'TE', 'OL'] },
  { id: 'def', label: 'Defense', pos: ['DL', 'LB', 'DB'] },
];
const GROUPS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'];
const PER_UNIT = 10;
const sznClass = (v?: number) => (v == null ? '' : v >= 90 ? 'is-hi' : v >= 80 ? 'is-mid' : '');

const RosterRowView = ({ r, club, year, i, onPick }: { r: RosterEntry; club: string; year: number; i: number; onPick: (key: string) => void }) => (
  <li className="mo-rise" style={stag(i, 24)}>
    <button type="button" className="cs-r" {...peekKeyProps(r.k)} onClick={() => onPick(r.k)} aria-label={`Open ${r.name}'s card`}>
      <span className="cs-r__sp" aria-hidden="true"><StarSprite name={r.name} pos={r.pos} team={club} size="s" kind="bust" season={year} /></span>
      <span className="cs-r__who">
        <span className="cs-name"><i>{r.pos}</i><span>{r.name}</span>{r.number != null && <small>#{r.number}</small>}</span>
      </span>
      <span className="cs-r__g num"><i>G</i>{r.g}</span>
      <span className="cs-r__line num">{lineOf(r.pos, r) || <span className="cs-dim">No line on file</span>}</span>
      <span className="cs-r__aw">{r.aw?.map((a) => <span key={a} className={cn('cs-aw', (a === 'MVP' || a === 'SB MVP') && 'is-gold')}>{a}</span>)}</span>
      <span className="cs-r__szn">{r.szn != null ? <span className={cn('cs-szn num', sznClass(r.szn))}><i>SZN</i>{r.szn}</span> : <span className="cs-dim">-</span>}</span>
    </button>
  </li>
);

export const Roster = ({ rows, club, year, onPick }: { rows: RosterEntry[]; club: string; year: number; onPick: (key: string) => void }) => {
  const [group, setGroup] = useState('All');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const plate = clubPlate(club);
  const vars = { '--ax-c1': plate.fill, '--ax-c2': plate.edge, '--ax-ink': plate.ink } as CSSProperties;
  const shown = rows.filter((r) => group === 'All' || r.pos === group);
  const sections = group === 'All'
    ? [...UNITS.map((u) => ({ ...u, list: shown.filter((r) => u.pos.includes(r.pos)) })), { id: 'oth', label: 'Special teams and others', pos: [], list: shown.filter((r) => !UNITS.some((u) => u.pos.includes(r.pos))) }].filter((u) => u.list.length)
    : [{ id: 'pos', label: group, pos: [group], list: shown }];
  return (
    <div style={vars}>
      <div className="cs-chips" role="group" aria-label="Position">
        {GROUPS.map((g) => (
          <button key={g} type="button" className={cn('cs-chip', group === g && 'is-on')} aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>
        ))}
      </div>
      {sections.map((u) => {
        const all = group !== 'All' || open[u.id];
        const list = all ? u.list : u.list.slice(0, PER_UNIT);
        return (
          <div key={`${group}-${u.id}`} className="cs-unit">
            <h4 className="cs-unit__h"><span>{u.label}</span><small className="num">{u.list.length} players</small></h4>
            <Reveal as="ul" className="cs-rl">
              {list.map((r, i) => <RosterRowView key={r.k} r={r} club={club} year={year} i={i} onPick={onPick} />)}
            </Reveal>
            {group === 'All' && u.list.length > PER_UNIT && (
              <button type="button" className="cs-more" onClick={() => setOpen((o) => ({ ...o, [u.id]: !o[u.id] }))}>{open[u.id] ? 'Show fewer' : `Show all ${u.list.length}`}</button>
            )}
          </div>
        );
      })}
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
  const plate = clubPlate(club);
  if (!cards.length) return <p className="cs-note">No leaders on file for this season.</p>;
  return (
    <Reveal as="ul" className="cs-leaders" style={{ ['--ax-c1' as string]: plate.fill, ['--ax-c2' as string]: plate.edge, ['--ax-ink' as string]: plate.ink }}>
      {cards.map(({ l, best, v }, i) => (
        <li key={l.label} className="mo-pop" style={stag(i, 50)}>
          <button type="button" className="cs-lead" {...peekKeyProps(best.k)} onClick={() => onPick(best.k)} aria-label={`${l.label}: ${best.name}, ${v}. Open card`}>
            <span className="cs-lead__k">{i === 0 && <PixelIcon name="crown" size={10} />}{l.label}</span>
            <b className="cs-lead__v num">{l.dec ? v.toFixed(l.dec) : nf(v)}</b>
            <span className="cs-lead__u">{l.unit}</span>
            <span className="cs-lead__sp" aria-hidden="true"><StarSprite name={best.name} pos={best.pos} team={club} size="m" kind="bust" season={year} celebrate={i === 0} /></span>
            <span className="cs-lead__n"><span>{best.name}</span><small>{best.pos}{best.number != null ? ` #${best.number}` : ''}</small></span>
          </button>
        </li>
      ))}
    </Reveal>
  );
};

/* ---------------- Season cap breakdown ---------------- */

const money = (n: number, dec = 1) => `$${(n / 1e6).toFixed(dec)}M`;
const GROUP_NAME: Record<string, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DL', LB: 'LB', DB: 'DB', ST: 'K / P / LS' };

export const CapBreakdown = ({ cap, club, clubName, year }: { cap: CapFile | null; club: string; clubName: string; year: number }) => {
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
        Source: OverTheCap contracts through nflverse. These are contract values (average per year), not cap hits, so they are not the club&rsquo;s payroll. Only deals still in force that year for a player on the club&rsquo;s roster are counted, and the file holds deals signed through {cap.lastSigned}{c.n < 25 ? `; for ${year} it holds only the ${c.n} contracts shown, so read the split as that group, not the whole roster` : ''}.
      </p>
    </div>
  );
};

