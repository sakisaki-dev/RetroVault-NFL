import { useMemo, useState } from 'react';
import { ClipboardList, Dices, Medal, Swords, TrendingUp } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { findNFLTeam } from '@/utils/nflTeams';
import { ALL_UNITS, DEFENSE_UNITS, OFFENSE_UNITS, UNIT_LABELS, UNIT_WEIGHTS, ordinal, type UnitId } from '@/utils/teamLab';
import type { InjuryCode } from '@/utils/injuries';
import type { LabFile, DepthFile } from '@/utils/nflLabData';
import {
  BENCH_SIZE,
  RATING_SOURCES,
  keysOf,
  usesCarFallback,
  callSheet,
  clubDistribution,
  identityOf,
  indicesOf,
  isCompleteN,
  loadClub,
  randomN,
  realMatchups,
  scoreN,
  winProbOf,
  type NLineup,
  type NScore,
  type NflCtx,
  type RatingSource,
} from '@/utils/nflLab';
import { Card, GradeChip, ScoreBar } from '../parts';
import type { SavedLab } from './useNflLab';

const GROUPS: { title: string; units: UnitId[] }[] = [
  { title: 'Offense', units: OFFENSE_UNITS },
  { title: 'Defense', units: DEFENSE_UNITS },
  { title: 'Roster', units: ['star'] },
];

interface ReportProps {
  ctx: NflCtx;
  lineup: NLineup;
  depth: DepthFile | null;
  lab: LabFile | null;
  injured: Map<string, InjuryCode>;
  src: RatingSource;
  clubName: string;
}

export const NflReport = ({ ctx, lineup, depth, lab, injured, src }: ReportProps) => {
  const score = useMemo(() => (isCompleteN(lineup) ? scoreN(ctx, lineup, src, true) : null), [ctx, lineup, src]);
  const dist = useMemo(() => (depth && lab ? clubDistribution(ctx, depth, lab, injured, src) : null), [ctx, depth, lab, injured, src]);
  const idx = useMemo(() => (lab && score ? indicesOf(ctx, lab, lineup, src) : null), [ctx, lab, lineup, score, src]);
  const calls = useMemo(() => (score ? callSheet(ctx, lineup, score, idx, dist, lab) : []), [ctx, lineup, score, idx, dist, lab]);
  const ranking = useMemo(() => {
    if (!score || !dist) return [];
    const rows = [...dist.clubs.map((c) => ({ abbr: c.abbr, team: c.score.team.raw, grade: c.score.team.grade, score: c.score.team.score })), { abbr: '', team: score.team.raw, grade: score.team.grade, score: score.team.score }];
    return rows.sort((a, b) => b.team - a.team);
  }, [score, dist]);
  const carFallback = useMemo(() => keysOf(lineup).flatMap((k) => { const pr = ctx.profiles.get(k); return pr && usesCarFallback(pr, src) ? [pr.name] : []; }), [ctx, lineup, src]);
  if (!score) return null;
  const rank = ranking.findIndex((r) => r.abbr === '') + 1;
  const near = ranking.slice(Math.max(0, Math.min(rank - 3, ranking.length - 5)), Math.max(0, Math.min(rank - 3, ranking.length - 5)) + 5);
  return (
    <div className="lab-analysis nfl-report">
      <Card title="Unit ratings" className="lab-order-1" icon={<TrendingUp className="h-5 w-5 text-gold" aria-hidden="true" />}>
        <p className="mb-3 text-xs text-muted-foreground">
          Each score is a percentile against {BENCH_SIZE} random {lineup.off} / {lineup.def} lineups of today's depth-chart starters: 80 means better than 80% of possible teams. Offense {Math.round(UNIT_WEIGHTS.team.offense * 100)}%, defense {Math.round(UNIT_WEIGHTS.team.defense * 100)}%, star power {Math.round(UNIT_WEIGHTS.team.star * 100)}% of the team grade. Ratings: {RATING_SOURCES.find((r) => r.id === src)?.label}.{carFallback.length > 0 && ` No 2026 snaps, so rated on CAR: ${carFallback.slice(0, 6).join(', ')}${carFallback.length > 6 ? ` and ${carFallback.length - 6} more` : ''}.`}
        </p>
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 font-pixel text-[9px] uppercase text-muted-foreground">{g.title}</p>
              <div className="space-y-2">
                {g.units.map((u) => (
                  <div key={u}>
                    <ScoreBar label={UNIT_LABELS[u]} score={score.units[u].score} grade={score.units[u].grade} />
                    {score.units[u].leaders.length > 0 && <p className="nfl-leaders">{score.units[u].leaders.join(' · ')}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="lab-order-1 grid min-w-0 content-start gap-2">
        <Card title={identityOf(score).label} icon={<Medal className="h-5 w-5 text-gold" aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground">{identityOf(score).why}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['team', 'offense', 'defense'] as const).map((k) => (
              <span key={k} className="nfl-grade-pill">
                <i>{k}</i>
                <GradeChip grade={score[k].grade} size="sm" />
                <b>{Math.round(score[k].score)}</b>
              </span>
            ))}
          </div>
        </Card>
        {ranking.length > 0 && (
          <Card title={`Ranks ${ordinal(rank)} of ${ranking.length}`} icon={<Medal className="h-5 w-5 text-gold" aria-hidden="true" />}>
            <p className="mb-2 text-xs text-muted-foreground">Against the 32 clubs' real starting lineups (their depth charts now, injured starters out).</p>
            <ol className="space-y-1">
              {near.map((r) => {
                const t = findNFLTeam(r.abbr);
                const me = r.abbr === '';
                return (
                  <li key={r.abbr || 'you'} className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-sm', me ? 'bg-gold/15 ring-1 ring-gold/60' : 'bg-black/20')}>
                    <span className="w-6 text-right font-display font-bold tabular-nums text-muted-foreground">{ranking.indexOf(r) + 1}</span>
                    {me ? <span className="font-pixel text-[8px] uppercase text-gold">Your lineup</span> : <TeamLogo team={r.abbr} size={20} decorative />}
                    <span className="min-w-0 flex-1 truncate text-chalk">{me ? '' : t?.fullName}</span>
                    <GradeChip grade={r.grade} size="sm" />
                    <b className="w-7 text-right font-display tabular-nums text-chalk">{Math.round(r.score)}</b>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}
      </div>

      <div className="lab-span-2 lab-order-2 min-w-0">
        <Card title="Call sheet" icon={<ClipboardList className="h-5 w-5 text-gold" aria-hidden="true" />}>
          <p className="mb-2 text-xs text-muted-foreground">Rules over the grades and the real per-game numbers (sacks and hits, passes defended, yards) of these players.</p>
          <ul className="nfl-calls">
            {calls.map((c) => (
              <li key={c.id} className={`nfl-call nfl-call--${c.tone}`}>
                <span className="nfl-call-sit">{c.situation}</span>
                <b className="nfl-call-title">{c.title}</b>
                <span className="nfl-call-why">{c.why}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

// ---------- Head-to-head ----------

const edgeText = (e: number) => (Math.abs(e) < 5 ? 'even' : e > 0 ? `+${Math.round(e)} you` : `+${Math.round(-e)} them`);
const Row = ({ label, a, b, aLine, bLine }: { label: string; a: number; b: number; aLine?: string; bLine?: string }) => {
  const e = a - b;
  return (
    <li className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-chalk">{label}</span>
        <span className={cn('shrink-0 font-display text-sm font-bold tabular-nums', e >= 5 ? 'text-turf' : e <= -5 ? 'text-destructive' : 'text-muted-foreground')}>{edgeText(e)}</span>
      </div>
      <div className="mt-1 grid grid-cols-[2.6rem_minmax(0,1fr)_2rem] items-center gap-x-2 gap-y-0.5 text-[11px]" aria-hidden="true">
        <span className="font-pixel text-[8px] uppercase text-gold">You</span>
        <span className="h-2 overflow-hidden rounded-sm bg-black/50"><span className="block h-full rounded-sm bg-gold" style={{ width: `${Math.max(2, a)}%` }} /></span>
        <span className="text-right tabular-nums text-chalk">{Math.round(a)}</span>
        <span className="font-pixel text-[8px] uppercase text-muted-foreground">Them</span>
        <span className="h-2 overflow-hidden rounded-sm bg-black/50"><span className="block h-full rounded-sm bg-[repeating-linear-gradient(135deg,hsl(var(--muted-foreground))_0_4px,hsl(var(--line))_4px_7px)]" style={{ width: `${Math.max(2, b)}%` }} /></span>
        <span className="text-right tabular-nums text-chalk">{Math.round(b)}</span>
      </div>
      {(aLine || bLine) && (
        <p className="nfl-leaders">
          {aLine}
          {aLine && bLine ? ' vs ' : ''}
          {bLine}
        </p>
      )}
    </li>
  );
};

const UNIT_MATCHUPS: { label: string; ours: UnitId; theirs: UnitId }[] = [
  { label: 'Your passing vs their coverage', ours: 'passing', theirs: 'coverage' },
  { label: 'Your run game vs their run defense', ours: 'run', theirs: 'runDef' },
  { label: 'Your protection vs their pass rush', ours: 'protection', theirs: 'passRush' },
  { label: 'Your ball security vs their playmaking', ours: 'security', theirs: 'playmaking' },
  { label: 'Your coverage vs their passing', ours: 'coverage', theirs: 'passing' },
  { label: 'Your run defense vs their run game', ours: 'runDef', theirs: 'run' },
  { label: 'Your pass rush vs their protection', ours: 'passRush', theirs: 'protection' },
  { label: 'Your playmaking vs their ball security', ours: 'playmaking', theirs: 'security' },
];

export const NflH2H = ({ ctx, lineup, depth, lab, injured, src, saved, kitClub }: ReportProps & { saved: SavedLab[]; kitClub: string }) => {
  const [choice, setChoice] = useState('');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const dist = useMemo(() => (depth && lab ? clubDistribution(ctx, depth, lab, injured, src) : null), [ctx, depth, lab, injured, src]);
  const clubs = useMemo(() => (depth ? Object.keys(depth.clubs).map((a) => ({ abbr: a, name: findNFLTeam(a)?.fullName ?? a })).sort((a, b) => a.name.localeCompare(b.name)) : []), [depth]);
  const teamSaved = saved.filter((s): s is Extract<SavedLab, { kind: 'team' }> => s.kind === 'team');
  const current = choice || (clubs.find((c) => c.abbr !== kitAbbr(kitClub))?.abbr ?? 'random');
  const opp = useMemo<{ name: string; lineup: NLineup } | null>(() => {
    if (current === 'random') return { name: 'Random lineup', lineup: randomN(ctx, lineup.off, lineup.def, seed) };
    if (current.startsWith('saved:')) {
      const s = teamSaved.find((x) => `saved:${x.id}` === current);
      return s ? { name: s.name, lineup: s.lineup } : null;
    }
    const l = depth && loadClub(ctx, depth, current, lineup.off, lineup.def, injured);
    return l ? { name: findNFLTeam(current)?.fullName ?? current, lineup: l.lineup } : null;
  }, [current, ctx, depth, lineup.off, lineup.def, injured, seed, teamSaved]);
  const out = useMemo(() => {
    if (!opp || !isCompleteN(lineup) || !isCompleteN(opp.lineup)) return null;
    const a = scoreN(ctx, lineup, src);
    const b = scoreN(ctx, opp.lineup, src);
    if (!a || !b) return null;
    let real: ReturnType<typeof realMatchups> = [];
    if (lab && dist) {
      const ia = indicesOf(ctx, lab, lineup, src);
      const ib = indicesOf(ctx, lab, opp.lineup, src);
      if (ia && ib) real = realMatchups(dist, ia, ib);
    }
    return { a, b, real, p: winProbOf(a, b, real) };
  }, [ctx, lineup, opp, src, lab, dist]);
  const oppAbbr = current.length <= 3 ? current : '';

  return (
    <Card
      title="Head-to-head"
      icon={<Swords className="h-5 w-5 text-gold" aria-hidden="true" />}
      action={
        <div className="flex items-center gap-1.5">
          <Select value={current} onValueChange={setChoice}>
            <SelectTrigger className="h-8 w-[min(14rem,52vw)] border-line text-sm" aria-label="Choose an opponent">
              <SelectValue placeholder="Opponent" />
            </SelectTrigger>
            <SelectContent className="z-[70] max-h-80">
              {teamSaved.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Saved teams</SelectLabel>
                  {teamSaved.map((s) => (
                    <SelectItem key={s.id} value={`saved:${s.id}`}>{s.name}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectGroup>
                <SelectLabel>Real starting lineups</SelectLabel>
                {clubs.map((c) => (
                  <SelectItem key={c.abbr} value={c.abbr}>
                    <span className="inline-flex items-center gap-2"><TeamLogo team={c.abbr} size={16} decorative /> {c.name}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectItem value="random">Random lineup</SelectItem>
            </SelectContent>
          </Select>
          {current === 'random' && (
            <Button type="button" size="sm" variant="outline" className="lab-btn h-8" onClick={() => setSeed(Math.floor(Math.random() * 1e9))} aria-label="New random opponent">
              <Dices className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      }
    >
      {!isCompleteN(lineup) ? (
        <p className="text-sm text-muted-foreground">Fill all 22 slots for a head-to-head.</p>
      ) : !out || !opp ? (
        <p className="text-sm text-muted-foreground">Pick a complete opponent.</p>
      ) : (
        <div className="space-y-4">
          <div className="nfl-vs">
            <div className="nfl-vs-side"><TeamLogo team={kitClub} size={34} decorative /><em>Your lineup</em><GradeChip grade={out.a.team.grade} size="md" /><b>{Math.round(out.a.team.score)}</b></div>
            <div className="nfl-vs-prob" aria-label={`Estimated win chance ${Math.round(out.p * 100)} percent`}>
              <span className="nfl-vs-bar"><i style={{ width: `${out.p * 100}%` }} /></span>
              <small>{Math.round(out.p * 100)}% · {Math.round((1 - out.p) * 100)}%</small>
            </div>
            <div className="nfl-vs-side nfl-vs-side--them">{oppAbbr ? <TeamLogo team={oppAbbr} size={34} decorative /> : null}<em>{opp.name}</em><GradeChip grade={out.b.team.grade} size="md" /><b>{Math.round(out.b.team.score)}</b></div>
          </div>
          {out.real.length > 0 && (
            <div>
              <p className="mb-1.5 font-pixel text-[9px] uppercase text-gold">The real matchups</p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {out.real.map((m) => (
                  <Row key={m.id} label={m.label} a={m.ours} b={m.theirs} aLine={m.oursLine} bLine={m.theirsLine} />
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-1.5 font-pixel text-[9px] uppercase text-muted-foreground">Unit matchups</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {UNIT_MATCHUPS.map((m) => (
                <Row key={m.label} label={m.label} a={out.a.units[m.ours].score} b={out.b.units[m.theirs].score} />
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-muted-foreground">Win chance: the team-grade gap and the six real matchups through a logistic curve. Units: {ALL_UNITS.length}.</p>
        </div>
      )}
    </Card>
  );
};
const kitAbbr = (kit: string) => findNFLTeam(kit)?.abbreviation ?? '';
