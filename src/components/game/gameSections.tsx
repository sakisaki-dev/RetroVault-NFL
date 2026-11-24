import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/timeline/TeamLogo';
import { findNFLTeam } from '@/utils/nflTeams';
import type { GameDetail, GamePlayer, Stat } from '@/utils/nflGames';
import { useGameSprites } from '@/utils/gameSprites';
import { hslOf } from '../season/seasonGamesUi';
import { displayName } from '@/utils/displayName';
import { liftForDarkBg } from '@/utils/teamColors';
import { score, sitePos, unitOf, v, impact, type Side } from './gameModel';

/** Shared bits and the data-dense sections of the game page (QB duel, ground game, air attack, pass rush, tiles, fantasy, special teams). */

export type Linker = (p: GamePlayer) => string | null;

/** A club's colour for bars and strips: its primary, or its secondary when the primary is near-black (so it shows on dark). */
export const toneOf = (abbr: string): string => {
  const t = findNFLTeam(abbr);
  const l = parseFloat((t?.primaryColor ?? '0 0% 50%').split(/\s+/)[2]);
  return l < 20 && t ? t.secondaryColor : hslOf(abbr);
};
const abbrOf = (a: string) => findNFLTeam(a)?.abbreviation ?? a;
const clubOf = (g: GameDetail, side: Side) => (side === 0 ? g.away : g.home);
const has = (s: Stat, k: string) => s[k] !== undefined;
const f1 = (x: number, d = 1) => (Number.isInteger(x) && d === 1 ? String(x) : x.toFixed(d));

export const NameStrip = ({ p, g, link, children, className }: { p: GamePlayer; g: GameDetail; link: Linker; children?: ReactNode; className?: string }) => {
  const href = link(p);
  const cls = cn('gm-strip', className);
  const tone = toneOf(clubOf(g, p.side));
  const light = parseFloat(tone.split(/\s+/)[2]) > 55;
  const st = { ['--tc' as string]: tone, ...(light ? { color: '#0b1020', textShadow: 'none' } : {}) };
  const body = children ?? displayName(p.name);
  return href ? <a href={href} className={cls} style={st} title={`${displayName(p.name)}: open Deep Dive`}>{body}</a> : <span className={cls} style={st}>{body}</span>;
};

export const SpriteOf = ({ p, g, size = 's', celebrate, kind = 'figure' }: { p: GamePlayer; g: GameDetail; size?: 's' | 'm' | 'l'; celebrate?: boolean; kind?: 'figure' | 'bust' }) => {
  const abbr = clubOf(g, p.side);
  const sprites = useGameSprites();
  if (!sprites) return <TeamLogo team={abbr} decorative className={size === 's' ? 'h-9 w-9' : 'h-14 w-14'} />;
  return <GameSprite player={{ name: p.name, position: sitePos(p.pos), team: abbr, bannerTeam: abbr }} team={abbr} season={g.season} kind={kind} size={size} action={celebrate ? 'celebrate' : undefined} />;
};

const Card = ({ title, kicker, children, className }: { title: string; kicker?: string; children: ReactNode; className?: string }) => (
  <section className={cn('gm-card', className)} aria-label={title}>
    <header className="gm-card__head"><h2>{title}</h2>{kicker && <span>{kicker}</span>}</header>
    {children}
  </section>
);

const side2 = (g: GameDetail) => ([0, 1] as Side[]).map((s) => ({ s, abbr: clubOf(g, s), tone: toneOf(clubOf(g, s)) }));
const sideStyle = (tone: string) => ({ ['--tc' as string]: tone });

/* ---------------- QB duel ---------------- */

const qbOf = (g: GameDetail, side: Side) => g.players.filter((p) => p.side === side && unitOf(p) === 'qb' && v(p.s, 'attempts') >= 5).sort((a, b) => v(b.s, 'attempts') - v(a.s, 'attempts'))[0];

interface Row { label: string; get: (s: Stat) => number | undefined; fmt: (n: number, s: Stat) => string; better?: 'hi' | 'lo' }
const sgn1 = (n: number, suffix = '') => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + suffix;
const QB_GROUPS: { title: string; rows: Row[] }[] = [
  { title: 'Passing', rows: [
    { label: 'Comp / Att', get: (s) => (v(s, 'attempts') ? v(s, 'completions') / v(s, 'attempts') : undefined), fmt: (_n, s) => `${v(s, 'completions')}/${v(s, 'attempts')}`, better: 'hi' },
    { label: 'Pass yards', get: (s) => v(s, 'passing_yards'), fmt: (n) => String(n), better: 'hi' },
    { label: 'TD', get: (s) => v(s, 'passing_tds'), fmt: (n) => String(n), better: 'hi' },
    { label: 'INT', get: (s) => v(s, 'passing_interceptions'), fmt: (n) => String(n), better: 'lo' },
    { label: 'Yards / att', get: (s) => (v(s, 'attempts') ? v(s, 'passing_yards') / v(s, 'attempts') : undefined), fmt: (n) => n.toFixed(1), better: 'hi' },
  ] },
  { title: 'Efficiency', rows: [
    { label: 'Pass EPA', get: (s) => (has(s, 'passing_epa') ? s.passing_epa : undefined), fmt: (n) => sgn1(n), better: 'hi' },
    { label: 'CPOE', get: (s) => (has(s, 'passing_cpoe') ? s.passing_cpoe : undefined), fmt: (n) => sgn1(n, '%'), better: 'hi' },
  ] },
  { title: 'Style', rows: [
    { label: 'Avg depth of target (yds)', get: (s) => (has(s, 'avg_intended_air_yards') ? s.avg_intended_air_yards : v(s, 'attempts') && has(s, 'passing_air_yards') ? s.passing_air_yards / v(s, 'attempts') : undefined), fmt: (n) => n.toFixed(1) },
    { label: 'Time to throw', get: (s) => (has(s, 'avg_time_to_throw') ? s.avg_time_to_throw : undefined), fmt: (n) => `${n.toFixed(2)}s` },
  ] },
  { title: 'Pressure', rows: [
    { label: 'Sacked', get: (s) => v(s, 'sacks_suffered'), fmt: (n) => String(n), better: 'lo' },
    { label: 'Pressured', get: (s) => (has(s, 'times_pressured') ? s.times_pressured : undefined), fmt: (n) => String(n), better: 'lo' },
    { label: 'Hit', get: (s) => (has(s, 'times_hit') ? s.times_hit : undefined), fmt: (n) => String(n), better: 'lo' },
    { label: 'Bad throws', get: (s) => (has(s, 'passing_bad_throws') ? s.passing_bad_throws : undefined), fmt: (n) => String(n), better: 'lo' },
    { label: 'Drops by receivers', get: (s) => (has(s, 'passing_drops') ? s.passing_drops : undefined), fmt: (n) => String(n), better: 'lo' },
  ] },
];

/** The share of the bar the left QB takes: 50% level, more when he leads (the lower value leads where lower is better). */
const splitOf = (a: number, h: number, better?: 'hi' | 'lo'): number => {
  const tot = Math.abs(a) + Math.abs(h);
  if (!tot) return 50;
  if (!better) return Math.max(8, Math.min(92, (Math.abs(a) / tot) * 100));
  const d = (better === 'hi' ? a - h : h - a) / tot;
  return Math.max(8, Math.min(92, 50 + 50 * d));
};
const headLine = (s: Stat) => bits([`${v(s, 'completions')}/${v(s, 'attempts')}`, `${v(s, 'passing_yards')} yds`, `${v(s, 'passing_tds')} TD`, `${v(s, 'passing_interceptions')} INT`]);

export const QbDuel = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const qa = qbOf(g, 0);
  const qh = qbOf(g, 1);
  if (!qa || !qh) return null;
  const head = (p: GamePlayer, side: Side) => (
    <div className={cn('gm-qb__who', side === 1 && 'is-home')} style={sideStyle(toneOf(clubOf(g, side)))}>
      <span className="gm-qb__spr"><SpriteOf p={p} g={g} size="m" /></span>
      <span className="gm-qb__id">
        <small>{abbrOf(clubOf(g, side))} · {side === 0 ? 'Away' : 'Home'}</small>
        <NameStrip p={p} g={g} link={link} className="gm-qb__name" />
        <span className="gm-qb__line">{headLine(p.s)}</span>
      </span>
    </div>
  );
  return (
    <Card title="QB duel" kicker="Passer against passer" className="gm-qb">
      <div className="gm-qb__top">{head(qa, 0)}<span className="gm-qb__vs" aria-hidden>VS</span>{head(qh, 1)}</div>
      <div className="gm-qb__body" style={{ ['--ca' as string]: liftForDarkBg(toneOf(g.away), 46), ['--ch' as string]: liftForDarkBg(toneOf(g.home), 46) }}>
        {QB_GROUPS.map((grp) => {
          const rows = grp.rows.filter((r) => r.get(qa.s) !== undefined || r.get(qh.s) !== undefined);
          if (!rows.length) return null;
          return (
            <div key={grp.title} className="gm-qb__grp">
              <p className="gm-qb__gh">{grp.title}</p>
              {rows.map((r) => {
                const a = r.get(qa.s);
                const h = r.get(qh.s);
                const win = (x?: number, y?: number) => !!r.better && x !== undefined && y !== undefined && x !== y && (r.better === 'hi' ? x > y : x < y);
                const split = a !== undefined && h !== undefined ? splitOf(a, h, r.better) : 50;
                return (
                  <div key={r.label} className="gm-qb__row">
                    <b className={cn(win(a, h) ? 'is-better' : r.better && win(h, a) && 'is-worse')}>{a === undefined ? '–' : r.fmt(a, qa.s)}</b>
                    <span className="gm-qb__lab">{r.label}{r.better === 'lo' ? ' (lower wins)' : ''}</span>
                    <b className={cn(win(h, a) ? 'is-better' : r.better && win(a, h) && 'is-worse')}>{h === undefined ? '–' : r.fmt(h, qh.s)}</b>
                    <span className={cn('gm-qb__split', !r.better && 'is-neutral')} aria-hidden><i className="a" style={{ width: `${split}%` }} /><i className="h" style={{ width: `${100 - split}%` }} /></span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------------- two-club leaderboards (ground, air, pass rush) ---------------- */

const Clubs = ({ g, render }: { g: GameDetail; render: (s: Side) => ReactNode }) => (
  <div className="gm-clubs">
    {side2(g).map(({ s, abbr, tone }) => (
      <div key={s} className="gm-clubs__col" style={sideStyle(tone)}>
        <p className="gm-clubs__head"><TeamLogo team={abbr} decorative className="h-5 w-5" /> {abbrOf(abbr)}</p>
        {render(s)}
      </div>
    ))}
  </div>
);

const Bar = ({ pct, label }: { pct: number; label?: string }) => (
  <span className="gm-bar" aria-hidden><i style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />{label && <em>{label}</em>}</span>
);

const bits = (xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' · ');
const sg = (n: number, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d);

export const GroundGame = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const rushers = (s: Side) => g.players.filter((p) => p.side === s && v(p.s, 'carries') > 0 && p.pos !== 'QB').sort((a, b) => v(b.s, 'rushing_yards') - v(a.s, 'rushing_yards') || v(b.s, 'carries') - v(a.s, 'carries')).slice(0, 4);
  const any = [0, 1].some((s) => rushers(s as Side).length);
  if (!any) return null;
  const max = Math.max(1, ...g.players.filter((p) => v(p.s, 'carries') > 0 && p.pos !== 'QB').map((p) => Math.abs(v(p.s, 'rushing_yards'))));
  return (
    <Card title="Ground game" kicker="Rushing, by runner">
      <Clubs g={g} render={(s) => rushers(s).map((p) => {
        const c = v(p.s, 'carries');
        return (
          <div key={p.gsis + p.name} className="gm-lb">
            <NameStrip p={p} g={g} link={link} className="gm-lb__n" />
            <Bar pct={(Math.max(0, v(p.s, 'rushing_yards')) / max) * 100} label={`${v(p.s, 'rushing_yards')} yds`} />
            <span className="gm-lb__d">{bits([`${c} car`, `${(v(p.s, 'rushing_yards') / c).toFixed(1)} ypc`, v(p.s, 'rushing_tds') ? `${v(p.s, 'rushing_tds')} TD` : '',
              has(p.s, 'rushing_yards_before_contact') && `${v(p.s, 'rushing_yards_before_contact')} before / ${v(p.s, 'rushing_yards_after_contact')} after contact`,
              v(p.s, 'rushing_broken_tackles') ? `${v(p.s, 'rushing_broken_tackles')} broken tkl` : '', has(p.s, 'rush_yards_over_expected') && `RYOE ${sg(p.s.rush_yards_over_expected)}`,
              has(p.s, 'rushing_epa') && `EPA ${sg(p.s.rushing_epa)}`])}</span>
          </div>
        );
      })} />
    </Card>
  );
};

export const AirAttack = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const recv = (s: Side) => g.players.filter((p) => p.side === s && v(p.s, 'targets') > 0).sort((a, b) => v(b.s, 'targets') - v(a.s, 'targets') || v(b.s, 'receiving_yards') - v(a.s, 'receiving_yards'));
  if (![0, 1].some((s) => recv(s as Side).length)) return null;
  return (
    <Card title="Air attack" kicker="Target share">
      <Clubs g={g} render={(s) => {
        const all = recv(s);
        const total = all.reduce((n, p) => n + v(p.s, 'targets'), 0) || 1;
        return all.slice(0, 5).map((p, i) => {
          const t = v(p.s, 'targets');
          return (
            <div key={p.gsis + p.name} className={cn('gm-lb', i === 0 && 'is-top')}>
              {i === 0 && <span className="gm-lb__spr"><SpriteOf p={p} g={g} kind="bust" /></span>}
              <NameStrip p={p} g={g} link={link} className="gm-lb__n" />
              <Bar pct={(t / total) * 100} label={`${Math.round((t / total) * 100)}%`} />
              <span className="gm-lb__d">{bits([`${t} tgt`, `${v(p.s, 'receptions')} rec`, `${v(p.s, 'receiving_yards')} yds`, v(p.s, 'receiving_tds') ? `${v(p.s, 'receiving_tds')} TD` : '',
                has(p.s, 'receiving_air_yards') && `${v(p.s, 'receiving_air_yards')} air`, has(p.s, 'receiving_yards_after_catch') && `${v(p.s, 'receiving_yards_after_catch')} YAC`,
                has(p.s, 'avg_separation') && `${p.s.avg_separation.toFixed(1)} sep`])}</span>
            </div>
          );
        });
      }} />
    </Card>
  );
};

const defScore = (s: Stat) => 3 * v(s, 'def_sacks') + 3 * v(s, 'def_interceptions') + v(s, 'def_qb_hits') + 1.5 * v(s, 'def_tackles_for_loss') + v(s, 'def_pass_defended') + 0.5 * v(s, 'def_pressures');
export const PassRush = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const defs = (s: Side) => g.players.filter((p) => p.side === s && defScore(p.s) > 0).sort((a, b) => defScore(b.s) - defScore(a.s) || impact(b.s) - impact(a.s)).slice(0, 4);
  if (![0, 1].some((s) => defs(s as Side).length)) return null;
  const max = Math.max(1, ...g.players.map((p) => defScore(p.s)));
  return (
    <Card title="Pass rush and defense" kicker="Disruption, by player">
      <Clubs g={g} render={(s) => defs(s).map((p) => (
        <div key={p.gsis + p.name} className="gm-lb is-def">
          <span className="gm-lb__spr"><SpriteOf p={p} g={g} kind="bust" /></span>
          <NameStrip p={p} g={g} link={link} className="gm-lb__n"><b>{displayName(p.name)}</b> <small>{p.pos}</small></NameStrip>
          <Bar pct={(defScore(p.s) / max) * 100} />
          <span className="gm-lb__d">{bits([has(p.s, 'def_pressures') && v(p.s, 'def_pressures') ? `${p.s.def_pressures} prs` : '', v(p.s, 'def_qb_hits') ? `${v(p.s, 'def_qb_hits')} QB hit` : '', v(p.s, 'def_sacks') ? `${f1(v(p.s, 'def_sacks'))} sck` : '',
            v(p.s, 'def_tackles_for_loss') ? `${f1(v(p.s, 'def_tackles_for_loss'))} TFL` : '', v(p.s, 'def_pass_defended') ? `${v(p.s, 'def_pass_defended')} PD` : '', v(p.s, 'def_interceptions') ? `${v(p.s, 'def_interceptions')} INT` : '',
            has(p.s, 'def_targets') && v(p.s, 'def_targets') ? `tgt ${p.s.def_targets}, ${v(p.s, 'def_completions_allowed')} cmp, ${v(p.s, 'def_yards_allowed')} yds${has(p.s, 'def_passer_rating_allowed') ? `, ${p.s.def_passer_rating_allowed.toFixed(1)} rtg` : ''}` : ''])}</span>
        </div>
      ))} />
    </Card>
  );
};

/* ---------------- efficiency tiles ---------------- */

export const Efficiency = ({ g }: { g: GameDetail }) => {
  if (!g.team) return null;
  const [A, H] = g.team;
  const plays = (s: Stat) => v(s, 'attempts') + v(s, 'sacks_suffered') + v(s, 'carries');
  const epaOk = has(A, 'passing_epa') || has(H, 'passing_epa');
  const tiles: { label: string; a: string; h: string; ba?: boolean; bh?: boolean }[] = [];
  const add = (label: string, a: number, h: number, fmt: (n: number) => string, hi = true) => tiles.push({ label, a: fmt(a), h: fmt(h), ba: a !== h && (hi ? a > h : a < h), bh: a !== h && (hi ? h > a : h < a) });
  if (epaOk) {
    add('Pass EPA', v(A, 'passing_epa'), v(H, 'passing_epa'), (n) => sg(n));
    add('Rush EPA', v(A, 'rushing_epa'), v(H, 'rushing_epa'), (n) => sg(n));
    if (plays(A) && plays(H)) add('EPA / play', (v(A, 'passing_epa') + v(A, 'rushing_epa')) / plays(A), (v(H, 'passing_epa') + v(H, 'rushing_epa')) / plays(H), (n) => sg(n, 2));
  }
  if (has(A, 'passing_first_downs')) {
    add('Pass 1st downs', v(A, 'passing_first_downs'), v(H, 'passing_first_downs'), String);
    add('Rush 1st downs', v(A, 'rushing_first_downs'), v(H, 'rushing_first_downs'), String);
  }
  if (plays(A) && plays(H)) {
    const yd = (s: Stat) => v(s, 'passing_yards') - v(s, 'sack_yards_lost') + v(s, 'rushing_yards');
    add('Yards / play', yd(A) / plays(A), yd(H) / plays(H), (n) => n.toFixed(1));
  }
  if (tiles.length < 3) return null;
  return (
    <section className="gm-led" aria-label="Efficiency" style={{ ['--ca' as string]: liftTone(g.away), ['--ch' as string]: liftTone(g.home) }}>
      <header><span>{abbrOf(g.away)}</span><h2>Efficiency</h2><span>{abbrOf(g.home)}</span></header>
      <div className="gm-led__grid">
        {tiles.map((t) => (
          <div key={t.label} className="gm-led__tile">
            <span className="gm-led__l">{t.label}</span>
            <span className="gm-led__v"><b className={cn('is-a', t.ba && 'is-better')}>{t.a}</b><b className={cn('is-h', t.bh && 'is-better')}>{t.h}</b></span>
          </div>
        ))}
      </div>
    </section>
  );
};
const liftTone = (abbr: string) => {
  const t = toneOf(abbr).split(/\s+/);
  const l = parseFloat(t[2]);
  return l < 55 ? `${t[0]} ${t[1]} 58%` : toneOf(abbr);
};

/* ---------------- fantasy and special teams ---------------- */

export const Fantasy = ({ g, link }: { g: GameDetail; link: Linker }) => {
  const top = g.players.filter((p) => v(p.s, 'fantasy_points_ppr') > 0).sort((a, b) => v(b.s, 'fantasy_points_ppr') - v(a.s, 'fantasy_points_ppr')).slice(0, 5);
  if (top.length < 3) return null;
  const max = v(top[0].s, 'fantasy_points_ppr');
  return (
    <Card title="Fantasy" kicker="Top PPR scores">
      <ol className="gm-fan">
        {top.map((p, i) => (
          <li key={p.gsis + p.name} style={sideStyle(toneOf(clubOf(g, p.side)))}>
            <span className="gm-fan__r">{i + 1}</span>
            <span className="gm-fan__bust"><SpriteOf p={p} g={g} kind="bust" /></span>
            <span className="gm-fan__who"><NameStrip p={p} g={g} link={link} className="gm-lb__n" /><Bar pct={(v(p.s, 'fantasy_points_ppr') / max) * 100} /></span>
            <b>{v(p.s, 'fantasy_points_ppr').toFixed(1)}</b>
          </li>
        ))}
      </ol>
    </Card>
  );
};

export const SpecialTeams = ({ g }: { g: GameDetail }) => {
  const rows: { key: string; side: Side; who: string; line: string; tag: string }[] = [];
  g.players.forEach((p) => {
    const s = p.s;
    const n = displayName(p.name);
    if (v(s, 'fg_att') || v(s, 'pat_att')) rows.push({ key: p.gsis + 'k', side: p.side, who: n, tag: 'K', line: bits([v(s, 'fg_att') ? `FG ${v(s, 'fg_made')}/${v(s, 'fg_att')}` : '', has(s, 'fg_long') && v(s, 'fg_long') ? `long ${s.fg_long}` : '', v(s, 'pat_att') ? `XP ${v(s, 'pat_made')}/${v(s, 'pat_att')}` : '']) });
    if (v(s, 'pt_att')) rows.push({ key: p.gsis + 'p', side: p.side, who: n, tag: 'P', line: `${v(s, 'pt_att')} punts · ${(v(s, 'pt_yards') / v(s, 'pt_att')).toFixed(1)} avg` });
    const rets = v(s, 'punt_returns') + v(s, 'kickoff_returns');
    if (rets) rows.push({ key: p.gsis + 'r', side: p.side, who: n, tag: 'RET', line: bits([v(s, 'punt_returns') ? `${v(s, 'punt_returns')} punt ret, ${v(s, 'punt_return_yards')} yds` : '', v(s, 'kickoff_returns') ? `${v(s, 'kickoff_returns')} kick ret, ${v(s, 'kickoff_return_yards')} yds` : '', v(s, 'special_teams_tds') ? `${v(s, 'special_teams_tds')} TD` : '']) });
  });
  if (!rows.length) return null;
  return (
    <Card title="Special teams" kicker="Kicking, punting, returns">
      <ul className="gm-st">
        {rows.slice(0, 8).map((r) => (
          <li key={r.key} style={sideStyle(toneOf(clubOf(g, r.side)))}>
            <TeamLogo team={clubOf(g, r.side)} decorative className="h-4 w-4" />
            <span className="gm-st__t">{r.tag}</span><b>{r.who}</b><span>{r.line}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
};

export { score };
