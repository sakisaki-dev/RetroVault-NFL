import { useEffect, useId, useMemo, useState } from 'react';
import type { Player, Position } from '@/types/player';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import { Reveal, stag } from '@/components/motion/Reveal';
import { cn } from '@/lib/utils';
import { displayName } from '@/utils/displayName';
import { useGameLog } from '@/utils/gameLogs';
import { gameHash } from '@/utils/nflGames';
import { fmtFixed } from '@/utils/numberFormat';
import { ordinal } from '../../analytics/viz';
import { RULES, fmtDate, parseGames, type Game } from '../../gamelog/gameLogModel';
import type { Career } from './careerStory';
import { seasonScore, type LeagueSeasons, type SeasonPoint } from './careerModel';
import { BOX, fmtRate, groupOf, seasonRates } from './statDefs';
import { GlyphIcon, clubInk, shortNum, yLabel } from './graphKit';

/** The minimum SZN that earns the gold badge. */
const GOLD_SZN = 90;
/** Fewer tracked players than this at his position in a season: ranks and percentiles would mislead, so they are hidden. */
const MIN_POOL = 15;

interface Rec {
  record: string;
  seed?: number;
}
const recJobs = new Map<number, Promise<Record<string, Rec> | null>>();
/** Every club's final record in a season (public/data/league/schedule/<year>.json), memoised. */
const loadRecords = (year: number) => {
  let j = recJobs.get(year);
  if (!j) {
    j = fetch(`${import.meta.env.BASE_URL}data/league/schedule/${year}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { table?: Array<{ team: string; abbr: string; record: string }> } | null) => {
        if (!d?.table) return null;
        const m: Record<string, Rec> = {};
        d.table.forEach((t) => {
          m[t.team] = { record: t.record };
          m[t.abbr] = { record: t.record };
        });
        return m;
      })
      .catch(() => null);
    recJobs.set(year, j);
  }
  return j;
};

interface Row {
  p: SeasonPoint;
  i: number;
  club: string | null;
  szn: number | null;
}

const POY_LABEL = (pos: Position) => (pos === 'LB' || pos === 'DB' || pos === 'DL' ? 'Defensive Player of the Year' : 'Offensive Player of the Year');

/** The one-line headline: games and the position's box stats. */
const headline = (pos: Position, p: SeasonPoint) => {
  const box = BOX[groupOf(pos)];
  if (!p.box) return p.status === 'first' ? 'First season in the data' : 'No season line';
  return [`${p.games} G`, ...box.slice(0, 3).map((b) => `${shortNum(p.box?.[b.key] ?? 0)} ${b.short.toLowerCase()}`)].join(' · ');
};

const SznBadge = ({ v }: { v: number | null }) => (
  <span className={cn('ss-szn', v != null && v >= GOLD_SZN && 'ss-szn--gold', v == null && 'ss-szn--none')} title={v == null ? 'No season rating for this season' : `Season rating (SZN) ${fmtFixed(v, 0)}`}>
    <small>SZN</small>
    <b>{v == null ? '—' : fmtFixed(v, 0)}</b>
  </span>
);

const Fact = ({ label, children, gold }: { label: string; children: React.ReactNode; gold?: boolean }) => (
  <div className="ss-fact">
    <dt>{label}</dt>
    <dd className={cn(gold && 'text-gold')}>{children}</dd>
  </div>
);

interface CardProps {
  player: Player;
  career: Career;
  row: Row;
  rank: string | null;
  thin: boolean;
  games: Game[] | null;
  open: boolean;
  onToggle: () => void;
  tone?: 'best' | 'worst';
  badge?: string;
  inProgress?: boolean;
}

const SeasonCard = ({ player, career, row, rank, thin, games, open, onToggle, tone, badge, inProgress }: CardProps) => {
  const { p, club, szn } = row;
  const pos = player.position;
  const id = useId();
  const ink = clubInk(club);
  const [seen, setSeen] = useState(open);
  useEffect(() => {
    if (open) setSeen(true);
  }, [open]);
  const [rec, setRec] = useState<Rec | null>(null);
  useEffect(() => {
    if (!seen || !club) return;
    let live = true;
    void loadRecords(p.year).then((m) => live && setRec(m?.[club] ?? null));
    return () => {
      live = false;
    };
  }, [seen, club, p.year]);

  const mine = useMemo(() => (games ?? []).filter((g) => g.season === p.year), [games, p.year]);
  const post = mine.filter((g) => g.post);
  const lastPost = post.length ? post[post.length - 1] : null;
  const champion = (p.awards?.rings ?? 0) > 0 || (lastPost?.round === 'Super Bowl' && lastPost.win === true);
  const playoff = champion ? 'Super Bowl champion' : lastPost ? `${lastPost.win ? 'Won' : 'Lost'} in the ${lastPost.round}${lastPost.round === 'Super Bowl' ? '' : ' round'}`.replace('Conference round', 'Conference Championship') : null;
  const best = useMemo(() => (mine.length ? mine.reduce((b, g) => (g.score > b.score ? g : b), mine[0]) : null), [mine]);
  const rule = RULES[pos];
  const a = p.awards ?? {};
  const awards: string[] = [];
  if (a.mvp) awards.push('MVP');
  if (a[groupOf(pos) === 'DEF' ? 'dpoy' : 'opoy']) awards.push(POY_LABEL(pos));
  if (a.sbmvp) awards.push('Super Bowl MVP');
  const traits = thin ? [] : seasonRates(pos).filter((r) => r.trait && Number.isFinite(p.pct[r.id]));
  const box = BOX[groupOf(pos)];

  return (
    <div className={cn('ss-card', open && 'is-open', tone && `ss-card--${tone}`)} style={{ ['--ss-ink' as string]: ink.mark }}>
      <button type="button" className="ss-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {badge && <span className={cn('ss-badge', tone === 'worst' && 'ss-badge--low')}>{badge}</span>}
        <span className="ss-sprite" aria-hidden="true">
          <GameSprite player={player} team={club ?? undefined} season={p.year} kind="bust" size="s" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="ss-year">
            {yLabel(p.year)}
            {club && (
              <span className="ss-club">
                <TeamLogo team={club} size={14} decorative /> <span style={{ color: ink.mark }}>{club}</span>
              </span>
            )}
            {champion && <GlyphIcon kind="ring" px={2} title="Champion" />}
          </span>
          <span className="ss-line">{headline(pos, p)}{p.status === 'short' && <em> · short season</em>}{inProgress && <em> · in progress</em>}</span>
        </span>
        <SznBadge v={szn} />
        <svg className="ss-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="ss-body" id={id} role="region" aria-label={`${displayName(player.name)} ${yLabel(p.year)} season`} aria-hidden={!open}>
        <div className="ss-body__in">
          <div className="ss-inner">
            {p.box && (
              <ul className="ss-box">
                <li>
                  <b>{p.games}</b>
                  <span>Games</span>
                </li>
                {box.map((b) => (
                  <li key={b.key}>
                    <b>{shortNum(p.box?.[b.key] ?? 0)}</b>
                    <span>{b.short}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className="ss-facts">
              {rec && <Fact label="Club record">{club} {rec.record}</Fact>}
              {playoff && (
                <Fact label="Postseason" gold={champion}>
                  {champion && <GlyphIcon kind="ring" px={2} />} {playoff}
                </Fact>
              )}
              {awards.length > 0 && <Fact label="Awards" gold>{awards.join(' · ')}</Fact>}
              {rank && <Fact label={`SZN at ${pos}`}>{rank}</Fact>}
              {best && (
                <Fact label="Best game">
                  <a href={gameHash(String(best.r.game ?? ''))} className="ss-link" onClick={(e) => !best.r.game && e.preventDefault()}>
                    {best.post ? best.round : `Week ${best.week}`} {best.home ? 'vs' : 'at'} {best.opp}
                  </a>{' '}
                  · {best.win === true ? 'W' : best.win === false ? 'L' : 'T'} {best.pf}-{best.pa}
                  {rule?.hasLine && <span className="ss-sub">{rule.line.slice(0, 4).map((c) => `${c.fmt ? c.fmt(best.r) : fmtFixed(c.get(best.r), 0)} ${c.label.toLowerCase()}`).join(' · ')} · {fmtDate(best.date)}</span>}
                </Fact>
              )}
            </dl>
            {traits.length > 0 && (
              <div className="ss-traits" aria-label="Style percentiles that season">
                <p className="ss-k">Style that season · percentile among {pos}s</p>
                {traits.map((r) => {
                  const pc = p.pct[r.id];
                  return (
                    <div key={r.id} className="ss-trait" title={`${r.name}: ${fmtRate(r, p.rates[r.id])}`}>
                      <span>{r.name}</span>
                      <span className="ss-bar" aria-hidden="true">
                        <i style={{ width: `${Math.max(3, pc)}%` }} />
                      </span>
                      <b>{ordinal(pc)}</b>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * His best and worst seasons by SZN (the site's season rating, the number the career graphs plot), each a collapsible card,
 * plus every season in order. The trait percentiles are a STYLE profile; they never rank a season (they only break SZN ties).
 */
export const BestSeasons = ({ player, career, league, onIdx }: { player: Player; career: Career; league: LeagueSeasons; onIdx: (i: number) => void }) => {
  const pos = player.position;
  const key = `${pos}:${player.name}`;
  const log = useGameLog(key);
  const games = useMemo(() => (log ? parseGames(log, pos) : null), [log, pos]);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [all, setAll] = useState(false);

  const rows: Row[] = useMemo(() => career.points.map((p, i) => ({ p, i, club: career.clubs[i], szn: typeof p.ovr === 'number' ? p.ovr : null })), [career]);
  const shown = rows.filter((r) => r.p.status === 'played' || r.p.status === 'short' || (r.p.status === 'first' && r.szn != null));
  // full seasons: enough games to be a real sample and a SZN to rank by
  // the newest season is still being played when it is short of a full schedule: shown, never ranked as quiet
  const lastYear = league.seasons[league.seasons.length - 1];
  const live = (r: Row) => r.p.year === lastYear && r.p.games < 15;
  const full = rows.filter((r): r is Row & { szn: number } => r.p.status === 'played' && r.szn != null && !live(r));

  // SZN rank among his position, by season (full seasons only, as the pools are)
  const ranks = useMemo(() => {
    const byYear = new Map<number, number[]>();
    league.byKey.forEach((pts, k) => {
      if (!k.startsWith(`${pos}:`)) return;
      pts.forEach((p) => {
        if (p.status === 'played' && typeof p.ovr === 'number') (byYear.get(p.year) ?? byYear.set(p.year, []).get(p.year)!).push(p.ovr);
      });
    });
    return byYear;
  }, [league, pos]);
  const rankOf = (r: Row) => {
    if (r.szn == null || r.p.status !== 'played') return null;
    const v = ranks.get(r.p.year);
    if (!v?.length) return null;
    const n = v.length;
    const rk = 1 + v.filter((x) => x > (r.szn as number)).length;
    return n < MIN_POOL ? null : `${ordinal(rk)} of ${n} ${pos}s`;
  };

  const thinOf = (r: Row) => (ranks.get(r.p.year)?.length ?? 0) < MIN_POOL;
  if (!shown.length) return null;
  const tie = (r: Row) => seasonScore(pos, r.p) ?? 0;
  const sorted = [...full].sort((a, b) => b.szn - a.szn || tie(b) - tie(a));
  const best = sorted.slice(0, 3);
  const worst = sorted.length > 4 ? sorted.slice(-2).reverse() : [];
  const n90 = full.filter((r) => r.szn >= GOLD_SZN).length;
  const profile = seasonRates(pos)
    .filter((r) => r.trait)
    .map((r) => {
      const v = full.filter((s) => !thinOf(s)).map((s) => s.p.pct[r.id]).filter((x) => Number.isFinite(x));
      return { id: r.id, name: r.name, n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN };
    })
    .filter((t) => t.n >= 2);

  const toggle = (year: number, i: number) => {
    setOpenIds((s) => {
      const n = new Set(s);
      if (n.has(year)) n.delete(year);
      else {
        n.add(year);
        onIdx(i);
      }
      return n;
    });
  };
  const card = (r: Row, k: string, order: number, tone?: 'best' | 'worst', badge?: string) => (
    <li key={`${k}-${r.p.year}`} className="mo-rise" style={stag(order)}>
      <SeasonCard player={player} career={career} row={r} rank={rankOf(r)} thin={thinOf(r)} games={games ?? null} open={openIds.has(r.p.year)} onToggle={() => toggle(r.p.year, r.i)} tone={tone} badge={badge} />
    </li>
  );
  const newest = [...shown].reverse();

  return (
    <div className="cg-card glass-card ss-wrap">
      <h3>Best and worst seasons</h3>
      <p className="cg-sub">
        {full.length === 0
          ? 'No full season has a season rating (SZN) yet.'
          : `${n90} of ${full.length} full seasons rated ${GOLD_SZN}+ SZN`}
      </p>
      <div className="cg-fill">
        {best.length > 0 && (
          <>
            <p className="font-pixel text-[8px] uppercase text-gold">Peak seasons</p>
            <Reveal as="ul" className="ss-list">
              {best.map((r, k) => card(r, 'best', k, 'best', ordinal(k + 1)))}
            </Reveal>
          </>
        )}
        {worst.length > 0 && (
          <>
            <p className="font-pixel text-[8px] uppercase text-muted-foreground">Quietest full seasons</p>
            <Reveal as="ul" className="ss-list">
              {worst.map((r, k) => card(r, 'worst', k, 'worst', '▼'))}
            </Reveal>
          </>
        )}
        {shown.length > 0 && (
          <button type="button" className="ss-all" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'Hide all seasons' : `All seasons (${shown.length})`}
            <svg className="ss-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {all && (
          <Reveal as="ul" className="ss-list">
            {newest.map((r, k) => (
              <li key={`all-${r.p.year}`} className="mo-rise" style={stag(Math.min(k, 8))}>
                <SeasonCard player={player} career={career} row={r} rank={rankOf(r)} thin={thinOf(r)} inProgress={live(r)} games={games ?? null} open={openIds.has(r.p.year)} onToggle={() => toggle(r.p.year, r.i)} />
              </li>
            ))}
          </Reveal>
        )}
        {profile.length > 0 && (
          <>
            <p className="font-pixel text-[8px] uppercase text-muted-foreground">Style profile · average percentile of each trait (a style, not a rating)</p>
            <ul className="space-y-1">
              {profile.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-[11.5px]" title={`${t.name}: ${Math.round(t.avg)} average percentile over ${t.n} seasons`}>
                  <span className="w-28 shrink-0 truncate font-semibold text-secondary-foreground">{t.name}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-sm bg-panel-2" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0" style={{ width: `${Math.max(3, t.avg)}%`, background: `hsl(213 80% ${42 + (t.avg / 100) * 26}%)` }} />
                  </span>
                  <span className="w-9 text-right font-mono tabular-nums text-chalk">{ordinal(t.avg)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
