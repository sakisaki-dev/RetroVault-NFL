import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { PixelBall } from '@/components/ui/PixelLoader';
import { clubPlate } from '@/components/arcade';
import { isLite, useReducedMotion } from '@/hooks/usePerfMode';
import type { LiveDetail, LiveGame, LivePlayRow } from '@/utils/liveGames';
import { lampOf, sameClub, spotLabel } from './liveField';
import { DRIVE_TAG, driveKind, driveSpan, isKeyPlay, pairOf, playTone, winModel, clockSecs, type Mark } from './liveModel';

/**
 * The live page's broadcast panels, all read off ESPN's scoreboard and summary (see liveModel.ts): the score bug, the
 * win-probability chart, the drive tracker, the play feed, the scoring summary and the team stats. A panel whose data
 * isn't in the feed returns null; nothing is invented.
 */
const abbrName = (g: LiveGame, abbr: string | null | undefined) => (abbr ? (sameClub(abbr, g.away.abbr) ? g.away.name : sameClub(abbr, g.home.abbr) ? g.home.name : abbr) : '');
const periodTag = (n: number) => (n > 4 ? 'OT' : `Q${n}`);
const vars = (g: LiveGame): CSSProperties => ({ ['--lv-a' as string]: lampOf(g.away.abbr), ['--lv-h' as string]: lampOf(g.home.abbr) }) as CSSProperties;
const pct = (n: number) => Math.round(n * 100);

/** true for a couple of seconds after the value changes (never on the first render, never with reduced motion or Lite) */
const useChanged = (v: unknown, ms = 2600): boolean => {
  const prev = useRef(v);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prev.current === v) return;
    prev.current = v;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(t);
  }, [v, ms]);
  return on;
};

const Panel = ({ title, aside, className, children, i = 0 }: { title: string; aside?: ReactNode; className?: string; children: ReactNode; i?: number }) => (
  <article className={cn('lv-card lv-rise', className)} style={{ ['--i' as string]: i } as CSSProperties}>
    <h3>
      {title}
      {aside != null && <span className="lv-r">{aside}</span>}
    </h3>
    {children}
  </article>
);

/* ---------------- the score bug ---------------- */

const Pips = ({ n }: { n: number | null }) =>
  n === null ? null : (
    <span className="lv-pips" role="img" aria-label={`${n} timeouts left`}>
      {[0, 1, 2].map((i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );

const BugSide = ({ g, side, ball }: { g: LiveGame; side: 'a' | 'h'; ball: boolean }) => {
  const t = side === 'a' ? g.away : g.home;
  const flash = useChanged(t.score, 4000);
  return (
    <div className={cn('lv-bs', side === 'a' ? 'is-a' : 'is-h', flash && 'is-flash')} style={{ ['--lv-lamp' as string]: lampOf(t.abbr), ['--lv-tile' as string]: clubPlate(t.abbr).fill } as CSSProperties}>
      <TeamLogo team={t.abbr} decorative className="lv-bs__logo" />
      <div className="lv-bs__id">
        <b>{t.abbr}{ball && <span className="lv-poss" title="Has the ball"><PixelBall /></span>}</b>
        <span className="lv-bs__rec">{t.rec || t.name}</span>
        <Pips n={t.timeouts} />
      </div>
      <span className="lv-bs__score">{t.score}</span>
    </div>
  );
};

const resultLabel = (d: LiveDetail | undefined, g: LiveGame): { tag: string; text: string; tone: 'td' | 'to' | 'plain' } | null => {
  const lp = d?.lastPlay;
  const text = lp?.text || d?.last || g.sit?.last || '';
  if (!text) return null;
  const type = lp?.type ?? g.sit?.lastType ?? '';
  const yds = lp?.yds ?? g.sit?.lastYds ?? 0;
  const tone = /touchdown/i.test(type + text) ? 'td' : /intercept|fumble/i.test(type) ? 'to' : 'plain';
  const tag = tone === 'td' ? 'TOUCHDOWN' : /sack/i.test(type) ? 'SACK' : /intercept/i.test(type) ? 'INTERCEPTION' : /fumble/i.test(type) ? 'FUMBLE' : /incomplet/i.test(type) ? 'INCOMPLETE' : /punt/i.test(type) ? 'PUNT' : /field goal/i.test(type) ? 'FIELD GOAL' : yds ? `${yds > 0 ? '+' : '−'}${Math.abs(yds)} YDS` : type.toUpperCase() || 'LAST PLAY';
  return { tag, text, tone };
};

export const ScoreBug = ({ g, d }: { g: LiveGame; d: LiveDetail | undefined }) => {
  const s = g.sit;
  const hasBall = (abbr: string) => !!s?.poss && sameClub(s.poss, abbr);
  const spot = spotLabel(g);
  const last = resultLabel(d, g);
  const q = /half/i.test(g.desc) && !/quarter/i.test(g.desc) ? 'HALF' : g.period > 4 ? (g.period === 5 ? 'OT' : `OT${g.period - 4}`) : `Q${g.period || 1}`;
  const flashLast = useChanged(d?.lastPlay?.id ?? s?.last, 5000);
  return (
    <div className="lv-bug chrome-follow" style={vars(g)} role="group" aria-label="Score bug">
      <div className="lv-bug__row">
        <BugSide g={g} side="a" ball={hasBall(g.away.abbr)} />
        <div className="lv-bug__mid">
          <span className="lv-bug__q">{q}</span>
          <span className="lv-bug__clock">{g.clock || '0:00'}</span>
        </div>
        <BugSide g={g} side="h" ball={hasBall(g.home.abbr)} />
      </div>
      <div className="lv-bug__sit">
        {s?.poss && (
          <span className="lv-bug__dd">
            <TeamLogo team={s.poss} decorative className="lv-lg lv-lg--sm" />
            <b>{s.dd || 'Ball'}</b>
            {spot && <span>at {spot}</span>}
          </span>
        )}
        {s?.redZone && <span className="lv-tag is-red">Red zone</span>}
        {!s?.poss && <span className="lv-tag">{/half/i.test(g.desc) ? 'Halftime' : 'Between plays'}</span>}
        {last && (
          <span className={cn('lv-bug__last', `is-${last.tone}`, flashLast && 'is-new')} title={last.text}>
            <em>{last.tag}</em>
            <span>{last.text}</span>
          </span>
        )}
      </div>
    </div>
  );
};

/* ---------------- win probability ---------------- */

const DOT: Record<string, string> = { TD: 'td', FG: 'fg' };
const markClass = (m: Mark) => (/td|touchdown/i.test(m.kind) ? 'td' : DOT[m.kind.toUpperCase()] ?? (/fg|field/i.test(m.kind) ? 'fg' : 'other'));

export const WinChart = ({ g, d, i, wide }: { g: LiveGame; d: LiveDetail | undefined; i: number; wide?: boolean }) => {
  const reduced = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const m = useMemo(() => winModel(g, d), [g, d]);
  const now = d?.winHome;
  if (now == null && !m) return null;
  const h = pct(now ?? m!.pts[m!.pts.length - 1].h);
  const diff = g.home.score - g.away.score;
  const pathOf = (close: boolean) => {
    if (!m) return '';
    const x = (t: number) => ((t / m.total) * 100).toFixed(2);
    const y = (v: number) => ((1 - v) * 100).toFixed(2);
    const line = m.pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.t)} ${y(p.h)}`).join(' ');
    return close ? `${line} L${x(m.pts[m.pts.length - 1].t)} 50 L${x(m.pts[0].t)} 50 Z` : line;
  };
  const last = m?.pts[m.pts.length - 1];
  const mom = m?.momentum;
  const momClub = mom == null || Math.abs(mom) < 0.03 ? null : mom > 0 ? g.home : g.away;
  const qLines = m ? [900, 1800, 2700, ...(m.total > 3600 ? [3600] : [])] : [];
  return (
    <Panel title="Win probability" aside={momClub ? <span className="lv-mom" style={{ color: lampOf(momClub.abbr) }}>Momentum {momClub.abbr} +{Math.round(Math.abs(mom!) * 100)}</span> : null} className={cn('lv-wp', wide && 'is-wide')} i={i}>
      <div className="lv-wpbar" role="img" aria-label={`${g.away.name} ${100 - h} percent, ${g.home.name} ${h} percent`}>
        <span className="lv-wpbar__n" style={{ color: 'var(--lv-a)' }}><TeamLogo team={g.away.abbr} decorative className="lv-lg" />{100 - h}<small>%</small></span>
        <span className="lv-wpbar__track"><i style={{ width: `${100 - h}%`, background: 'var(--lv-a)' }} /><i style={{ width: `${h}%`, background: 'var(--lv-h)' }} /></span>
        <span className="lv-wpbar__n is-r" style={{ color: 'var(--lv-h)' }}>{h}<small>%</small><TeamLogo team={g.home.abbr} decorative className="lv-lg" /></span>
      </div>
      {m && last ? (
        <div className="lv-wpchart" aria-hidden>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <clipPath id={`${uid}t`}><rect x="0" y="0" width="100" height="50" /></clipPath>
              <clipPath id={`${uid}b`}><rect x="0" y="50" width="100" height="50" /></clipPath>
            </defs>
            <path d={pathOf(true)} fill="var(--lv-h)" fillOpacity=".42" clipPath={`url(#${uid}t)`} />
            <path d={pathOf(true)} fill="var(--lv-a)" fillOpacity=".42" clipPath={`url(#${uid}b)`} />
            {qLines.map((t) => <line key={t} x1={(t / m.total) * 100} x2={(t / m.total) * 100} y1="0" y2="100" className={t === 1800 ? 'half' : ''} vectorEffect="non-scaling-stroke" />)}
            <line x1="0" x2="100" y1="50" y2="50" className="mid" vectorEffect="non-scaling-stroke" />
            <path d={pathOf(false)} className="line" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="lv-wpchart__end is-top">{g.home.abbr}</span>
          <span className="lv-wpchart__end is-bot">{g.away.abbr}</span>
          {m.marks.map((k, n) => (
            <span key={n} className={cn('lv-wpmark', `is-${markClass(k)}`)} style={{ left: `${(k.t / m.total) * 100}%`, top: `${(1 - k.h) * 100}%`, ['--c' as string]: lampOf(k.abbr) } as CSSProperties} title={`${k.kind} ${k.text} (${k.score})`} />
          ))}
          <span className={cn('lv-wpnow', reduced && 'is-still')} style={{ left: `${(last.t / m.total) * 100}%`, top: `${(1 - last.h) * 100}%` }} />
          <div className="lv-wpq">{[0, 1, 2, 3, ...(m.total > 3600 ? [4] : [])].map((q) => <span key={q}>{q === 4 ? 'OT' : `Q${q + 1}`}</span>)}</div>
        </div>
      ) : (
        <p className="lv-empty">The chart fills in as the game goes.</p>
      )}
      <div className="lv-wpfoot">
        <span>{diff === 0 ? 'All square' : `${diff > 0 ? g.home.name : g.away.name} up ${Math.abs(diff)}`}</span>
        <span className="lv-leg"><i className="td" />TD<i className="fg" />FG</span>
      </div>
      {m?.swing && (
        <p className="lv-swing">
          <b>Biggest swing</b>
          <span style={{ color: lampOf(m.swing.d > 0 ? g.home.abbr : g.away.abbr) }}>{m.swing.d > 0 ? g.home.abbr : g.away.abbr} +{Math.round(Math.abs(m.swing.d) * 100)} pts</span>
          {m.swing.text}
        </p>
      )}
    </Panel>
  );
};

/* ---------------- drives ---------------- */

export const DriveTracker = ({ g, d, i }: { g: LiveGame; d: LiveDetail | undefined; i: number }) => {
  const drives = d?.drives ?? [];
  const cur = d?.cur;
  const lite = isLite();
  void lite;
  if (!drives.length) return null;
  const n = drives.length;
  const curDrive = drives[n - 1]?.live ? drives[n - 1] : null;
  const started = cur?.from ? (cur.from.yd === 50 ? '50' : `${cur.from.side} ${cur.from.yd}`) : null;
  const pts = (abbr: string) => drives.filter((x) => sameClub(x.abbr, abbr) && x.score).length;
  return (
    <Panel title="Drives" aside={`${n} so far`} className="lv-drives" i={i}>
      {curDrive && (
        <div className="lv-curdrive" style={{ ['--lv-c' as string]: lampOf(curDrive.abbr) } as CSSProperties}>
          <TeamLogo team={curDrive.abbr} decorative className="lv-lg" />
          <div>
            <span className="lv-k">Current drive</span>
            <b>{cur && cur.plays > 0 ? `${cur.plays} plays · ${cur.yards} yds${cur.time ? ` · ${cur.time}` : ''}` : 'Just started'}</b>
          </div>
          {started && <span className="lv-curdrive__from">Started<b>{started}</b></span>}
        </div>
      )}
      <div className="lv-strip-drv" style={{ ['--n' as string]: n, ['--n2' as string]: Math.ceil(n / 2) } as CSSProperties}>
        {drives.map((x, k) => {
          const kind = driveKind(x);
          const span = driveSpan(x, g);
          void span;
          return (
            <span key={k} className={cn('lv-dv', `is-${kind}`)} style={{ ['--c' as string]: lampOf(x.abbr) } as CSSProperties} title={`${abbrName(g, x.abbr)}: ${x.result || 'in progress'}, ${x.plays} plays, ${x.yards} yards`}>
              <TeamLogo team={x.abbr} decorative className="lv-dv__logo" />
              <em>{DRIVE_TAG[kind]}</em>
              <b>{x.yards}</b>
            </span>
          );
        })}
      </div>
      <div className="lv-legend">
        <span><i className="td" />TD</span><span><i className="fg" />FG</span><span><i className="punt" />Punt</span><span><i className="to" />Turnover</span>
        <span className="lv-r">{g.away.abbr} {pts(g.away.abbr)} scoring drives · {g.home.abbr} {pts(g.home.abbr)}</span>
      </div>
    </Panel>
  );
};

/* ---------------- plays and scoring ---------------- */

const PlayRow = ({ p, g, fresh }: { p: LivePlayRow; g: LiveGame; fresh: boolean }) => {
  const tone = playTone(p);
  return (
    <li className={cn('lv-pl', `is-${tone}`, fresh && 'is-new')}>
      <span className="lv-pl__t">{periodTag(p.period)}<b>{p.clock}</b></span>
      {p.abbr ? <TeamLogo team={p.abbr} decorative className="lv-lg lv-lg--sm" /> : <span />}
      <span className="lv-pl__x">
        {tone !== 'plain' && <em>{tone === 'td' ? 'Touchdown' : tone === 'to' ? 'Turnover' : tone === 'fg' ? 'Score' : `${p.yds} yds`}</em>}
        {p.text}
        {p.dd && tone === 'plain' && <small>{p.dd}</small>}
      </span>
    </li>
  );
};

export const PlayFeed = ({ g, d, i, wide }: { g: LiveGame; d: LiveDetail | undefined; i: number; wide?: boolean }) => {
  const [key, setKey] = useState(true);
  const [more, setMore] = useState(0);
  const all = useMemo(() => (d?.plays ?? []).filter((p) => p.text && !/^(end of|two-minute|timeout)/i.test(p.text)), [d?.plays]);
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seen.current) all.forEach((p) => !seen.current!.has(p.id) && fresh.add(p.id));
  useEffect(() => {
    seen.current = new Set(all.map((p) => p.id));
  }, [all]);
  if (!all.length) return null;
  const list = (key ? all.filter(isKeyPlay) : all).slice().reverse();
  const step = typeof window !== 'undefined' && window.innerWidth < 640 ? 7 : 12;
  const shown = list.slice(0, step + more * step);
  return (
    <Panel
      title="Play by play"
      i={i}
      className={cn('lv-plays', wide && 'is-wide')}
      aside={
        <span className="lv-seg" role="group" aria-label="Which plays">
          <button type="button" aria-pressed={key} onClick={() => { setKey(true); setMore(0); }}>Key</button>
          <button type="button" aria-pressed={!key} onClick={() => { setKey(false); setMore(0); }}>All</button>
        </span>
      }
    >
      {shown.length ? (
        <ol className="lv-pllist">{shown.map((p) => <PlayRow key={p.id} p={p} g={g} fresh={fresh.has(p.id)} />)}</ol>
      ) : (
        <p className="lv-empty">No key plays yet.</p>
      )}
      {list.length > shown.length && <button type="button" className="lv-more" onClick={() => setMore((n) => n + 1)}>Earlier plays</button>}
    </Panel>
  );
};

export const Scoring = ({ g, d, i, wide }: { g: LiveGame; d: LiveDetail | undefined; i: number; wide?: boolean }) => {
  const log = (d?.scoreLog ?? []).slice().reverse();
  if (!log.length) return null;
  let q = 0;
  return (
    <Panel title="Scoring" aside={`${log.length} scores`} className={cn('lv-scoring', wide && 'is-wide')} i={i}>
      {log.map((p, k) => {
        const head = p.period !== q ? ((q = p.period), <div key={`q${k}`} className="lv-sq">{p.period > 4 ? 'Overtime' : `Quarter ${p.period}`}</div>) : null;
        const lead = p.away === p.home ? '' : p.away > p.home ? g.away.abbr : g.home.abbr;
        return (
          <div key={k}>
            {head}
            <div className="lv-sp" style={{ ['--c' as string]: lampOf(p.abbr) } as CSSProperties}>
              <span className="lv-spq">{p.clock}</span>
              <TeamLogo team={p.abbr} decorative className="lv-lg" />
              <span className="lv-sptx"><em>{p.kind || 'SC'}</em>{p.text}</span>
              <span className="lv-spsc"><b>{p.away}–{p.home}</b>{lead && <i>{lead}</i>}</span>
            </div>
          </div>
        );
      })}
    </Panel>
  );
};

export const Quarters = ({ g, i }: { g: LiveGame; i: number }) => {
  const n = Math.max(4, g.away.ls.length, g.home.ls.length);
  if (!g.away.ls.length && !g.home.ls.length) return null;
  const cols = Array.from({ length: n }, (_, k) => k);
  const row = (t: LiveGame['away']) => (
    <tr>
      <td><span className="lv-who"><TeamLogo team={t.abbr} decorative className="lv-lg" />{t.abbr}</span></td>
      {cols.map((k) => <td key={k} className={cn(k + 1 === g.period && 'now')}>{t.ls[k] ?? '–'}</td>)}
      <td className="t">{t.score}</td>
    </tr>
  );
  return (
    <Panel title="By quarter" className="lv-q" i={i}>
      <table>
        <thead><tr><th />{cols.map((k) => <th key={k} className={cn(k + 1 === g.period && 'now')}>{k < 4 ? k + 1 : 'OT'}</th>)}<th>T</th></tr></thead>
        <tbody>{row(g.away)}{row(g.home)}</tbody>
      </table>
    </Panel>
  );
};

/* ---------------- team stats, mirrored ---------------- */

interface Row { label: string; a: number | null; h: number | null; fa: string; fh: string; low?: boolean }
const num = (v: string | undefined): number | null => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return v == null || v === '' || Number.isNaN(n) ? null : n;
};
const rowsOf = (sa: Record<string, string> | undefined, sh: Record<string, string> | undefined): Row[] => {
  if (!sa || !sh) return [];
  const mk = (label: string, key: string, low = false): Row => ({ label, a: num(sa[key]), h: num(sh[key]), fa: sa[key] ?? '', fh: sh[key] ?? '', low });
  const third = (s: Record<string, string>) => pairOf(s.thirdDownEff);
  const ta = third(sa);
  const th = third(sh);
  const poss = (s: Record<string, string>) => (s.possessionTime ? clockSecs(s.possessionTime) : null);
  return [
    mk('Total yards', 'totalYards'),
    mk('Passing', 'netPassingYards'),
    mk('Rushing', 'rushingYards'),
    mk('1st downs', 'firstDowns'),
    { label: '3rd down', a: ta ? ta[0] : null, h: th ? th[0] : null, fa: ta ? `${ta[0]}/${ta[1]}` : '', fh: th ? `${th[0]}/${th[1]}` : '' },
    mk('Turnovers', 'turnovers', true),
    { label: 'Possession', a: poss(sa), h: poss(sh), fa: sa.possessionTime ?? '', fh: sh.possessionTime ?? '' },
  ].filter((r) => r.a != null && r.h != null);
};

export const TeamStats = ({ g, d, i, wide }: { g: LiveGame; d: LiveDetail | undefined; i: number; wide?: boolean }) => {
  const rows = rowsOf(d?.stats?.[g.away.abbr], d?.stats?.[g.home.abbr]);
  if (!rows.length) return null;
  return (
    <Panel title="Team stats" className={cn('lv-tstats', wide && 'is-wide')} i={i}>
      <div className="lv-tshead">
        <span style={{ color: 'var(--lv-a)' }}><TeamLogo team={g.away.abbr} decorative className="lv-lg" />{g.away.abbr}</span>
        <span style={{ color: 'var(--lv-h)' }}>{g.home.abbr}<TeamLogo team={g.home.abbr} decorative className="lv-lg" /></span>
      </div>
      {rows.map((r) => {
        const max = Math.max(r.a!, r.h!, 1);
        const lead = r.a === r.h ? '' : (r.a! > r.h!) !== !!r.low ? 'a' : 'h';
        return (
          <div key={r.label} className="lv-ts">
            <b className={cn('lv-ts__v', lead === 'a' && 'is-lead')}>{r.fa}</b>
            <span className="lv-ts__bars">
              <span className="lv-ts__lbl">{r.label}</span>
              <i className={cn('a', lead === 'a' && 'is-lead')} style={{ width: `${(r.a! / max) * 100}%` }} />
              <i className={cn('h', lead === 'h' && 'is-lead')} style={{ width: `${(r.h! / max) * 100}%` }} />
            </span>
            <b className={cn('lv-ts__v is-r', lead === 'h' && 'is-lead')}>{r.fh}</b>
          </div>
        );
      })}
    </Panel>
  );
};
