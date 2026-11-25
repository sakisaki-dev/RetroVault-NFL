import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowUp, Check, Eye, Minus, Plus, TriangleAlert } from 'lucide-react';
import { LedDigits, SpriteStage } from '@/components/arcade';
import TeamLogo from '@/components/brand/TeamLogo';
import { ViewCount, stag } from '@/components/motion/Reveal';
import { InfoTip } from '@/components/ui/InfoTip';
import { useMedia } from '@/components/teamlab/useMedia';
import { cn } from '@/lib/utils';
import { canFill, F_SLOTS } from '@/utils/nflFantasy';
import {
  assignSwaps, fantasyFrom, hintFor, outReason, outlookOf, replacementLevels, useFantasyRaw,
  type Alt, type Fantasy, type Hint, type Projection,
} from '@/utils/fantasy';
import { bannerTeamOf } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { TrendChip, teamOf } from '../parts';
import { ClubMark } from '@/components/fantasy/ClubMark';
import { NameStrip, PlayerHit, RangeBar, Sprite, hcVars } from './hubParts';
import { slotName } from './BenchRow';
import { f1, nameOf, type FantasyHub } from './useFantasyHub';
import type { Sub } from './FantasyHub';

const BADGE = {
  start: { t: 'START', I: Check }, sit: { t: 'SIT', I: Minus }, swap: { t: 'SWAP', I: ArrowLeftRight },
  watch: { t: 'WATCH', I: Eye }, risk: { t: 'SIT RISK', I: TriangleAlert },
} as const;

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
/** Counts up to a value (and from the old value to a new one); the final number at once under reduced motion. */
const useTween = (target: number, ms = 900) => {
  const [v, setV] = useState(() => (reduced() ? target : 0));
  const from = useRef(v);
  useEffect(() => {
    if (reduced()) { from.current = target; setV(target); return; }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const x = a + (target - a) * (1 - (1 - p) ** 3);
      from.current = x;
      setV(x);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
};
const Led = ({ value, dot, color }: { value: number; dot: number; color: 'amber' | 'red' | 'green' }) => {
  const v = useTween(value);
  return <LedDigits matrix value={v.toFixed(1)} color={color} dot={dot} label={value.toFixed(1)} />;
};

interface Row {
  s: (typeof F_SLOTS)[number]; key: string; f: Fantasy | null; proj: Projection | null; mid: number; hint: Hint | null;
  swap: { alt: Alt; gain: number } | null; out: boolean;
}

/** The opponent's logo with VS / @ and the matchup's difficulty colour. */
const VsChip = ({ f }: { f: Fantasy }) => {
  const s = f.next[0];
  if (!s) return null;
  const t = s.opp ? teamOf(s.opp) : null;
  return (
    <span className={cn('ss-vs', s.tone && `is-${s.tone}`, !s.opp && 'is-bye')} title={s.opp ? `Week ${s.week} ${s.home ? 'vs' : 'at'} ${t?.fullName ?? s.opp}: ${s.rank ? `${s.rank} of 32 softest` : ''}` : `Week ${s.week}: bye`}>
      {s.opp ? <><b>{s.home ? 'VS' : '@'}</b><TeamLogo team={t ?? s.opp} size={22} decorative backed /><i>{s.opp}</i></> : <b>BYE</b>}
    </span>
  );
};

/** Start / sit: a stadium scoreboard for the lineup's outlook, then a call sheet by position with a stamp on every starter. */
const StartSitPage = ({ hub, onGo }: { hub: FantasyHub; onGo: (s: Sub) => void }) => {
  const { fl, injured, ctx, filled, bench, startFromBench, clubName, week: hubWeek } = hub;
  const raw = useFantasyRaw();
  const wide = !useMedia('(max-width: 639px)');
  const repl = useMemo(() => replacementLevels(raw), [raw]);
  const view = useMemo(() => {
    if (!raw) return null;
    // only players on the user's own bench can come in
    const benchPlayers = bench.filter((b) => b.key && !b.key.startsWith('DST:')).map((b) => {
      const f = fantasyFrom(raw, b.key);
      const out = !!f && (outReason(f, injured.get(b.key)) !== null || injured.get(b.key) === 'Doubtful');
      const proj = f ? outlookOf(f).proj : null;
      return { id: b.id, key: b.key, f, proj, mid: out ? 0 : proj?.mid ?? 0, out };
    });
    const alts: Alt[] = benchPlayers.filter((b) => b.f && !b.out).map((b) => ({ key: b.key, name: nameOf(b.key), mid: b.mid }));
    const starters = F_SLOTS.filter((s) => s.id !== 'dst' && fl[s.id]).map((s) => {
      const key = fl[s.id];
      const f = fantasyFrom(raw, key);
      const out = f ? outReason(f, injured.get(key)) !== null : false;
      const proj = f ? outlookOf(f).proj : null;
      return { s, key, f, proj, mid: out ? 0 : proj?.mid ?? 0, out };
    });
    const plan = assignSwaps(starters.filter((r) => r.f).map((r) => ({ id: r.s.id, mid: r.mid, ok: (k: string) => canFill(r.s, k) })), alts);
    const rows: Row[] = starters.map((r) => {
      const swap = plan.get(r.s.id) ?? null;
      const noBench = !bench.some((b) => b.key && canFill(r.s, b.key));
      return { ...r, swap, hint: r.f ? hintFor(r.f, injured.get(r.key), { swap, repl: repl[r.f.pos], noBenchAt: noBench ? r.s.label : null }) : null };
    });
    const sum = (g: (p: Projection) => number | null) => rows.reduce((t, r) => t + (r.proj && !r.out ? g(r.proj) ?? r.proj.mid : 0), 0);
    const planned = new Map([...plan.entries()].map(([id, v]) => [v.alt.key, { slot: id, gain: v.gain }]));
    return {
      rows, benchPlayers, planned, mid: sum((p) => p.mid), lo: sum((p) => p.lo), hi: sum((p) => p.hi),
      covered: rows.filter((r) => r.f).length, gain: [...plan.values()].reduce((t, v) => t + v.gain, 0),
    };
  }, [raw, fl, bench, injured, repl]);

  const stars = useMemo(() => {
    if (!view) return [];
    const ranked = [...view.rows].filter((r) => r.f).sort((a, b) => b.mid - a.mid).slice(0, 5);
    const order: typeof ranked = [];
    ranked.forEach((r, i) => (i % 2 ? order.unshift(r) : order.push(r)));
    return order.map((r) => ctx.profiles.get(r.key)?.player).filter((p): p is NonNullable<typeof p> => !!p).map((player) => ({ player, club: bannerTeamOf(player) }));
  }, [view, ctx]);

  if (!filled || !view || !view.covered)
    return (
      <div className="fh-page">
        <section className="fh-empty">
          <b>{raw ? 'No lineup to read yet' : 'Loading the matchups'}</b>
          <p>Build a lineup and every slot gets a start or sit call.</p>
          <button type="button" className="fh-btn fh-btn--go" onClick={() => onGo('lineup')}>Build a lineup</button>
        </section>
      </div>
    );

  const first = view.rows.find((r) => r.f)!.f!;
  const week = raw?.n[first.club]?.nx.find((n) => n[1])?.[0] ?? hubWeek;
  const max = Math.max(1, ...view.rows.map((r) => r.proj?.hi ?? r.proj?.mid ?? 0));
  const groups = (['QB', 'RB', 'WR', 'TE', 'FLEX'] as const).map((g) => ({ g, rows: view.rows.filter((r) => r.s.label === g) })).filter((x) => x.rows.length);
  const hasBench = bench.some((b) => b.key);
  const goBench = () => { onGo('lineup'); window.setTimeout(() => document.getElementById('fh-bench')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }), 350); };
  const opp = hub.oppId ? hub.opp : undefined;
  const edge = opp && hub.fctx ? hub.total(fl, hubWeek) - hub.total(opp.lineup, hubWeek) : null;
  const span = Math.max(1, view.hi * 1.05);
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / span) * 100))}%`;

  return (
    <div className="fh-page ss">
      <SpriteStage club={clubName} players={stars} time="night" size="m" maxMobile={3} height={wide ? 300 : 270} className="ss-stage">
        <div className="ss-jumbo" role="group" aria-label={`Projected week total ${view.mid.toFixed(1)}, floor ${view.lo.toFixed(1)}, ceiling ${view.hi.toFixed(1)}`}>
          <div className="ss-jumbo__top">
            <span className="ss-jumbo__k">{week ? `Week ${week}` : 'This week'} · outlook</span>
            <InfoTip label="About the outlook">
              PPR from this season's weekly lines. Projection: the average of his per-game and last-3 averages, scaled by how much the opponent allows to his position against the league mean (half weight). Floor and ceiling are his own 25th and 75th percentile weeks, scaled the same way, summed over the starters. Swaps only come from your own bench: a bench player who projects at least 2 points and 15% more. Without a bench, calls compare each starter to replacement level and his matchup.
            </InfoTip>
          </div>
          <div className="ss-jumbo__row">
            <div className="ss-led ss-led--side"><span>Floor</span><Led value={view.lo} dot={wide ? 4 : 3} color="red" /></div>
            <div className="ss-led ss-led--lead"><span>Projected</span><Led value={view.mid} dot={wide ? 7 : 5} color="amber" /></div>
            <div className="ss-led ss-led--side"><span>Ceiling</span><Led value={view.hi} dot={wide ? 4 : 3} color="green" /></div>
          </div>
          <div className="ss-gauge" aria-hidden="true">
            <i className="ss-gauge__band" style={{ left: pct(view.lo), width: `calc(${pct(view.hi)} - ${pct(view.lo)})` }} />
            <i className="ss-gauge__mid" style={{ left: pct(view.mid) }} />
          </div>
          {(view.gain > 0 || edge != null) && (
            <div className="ss-jumbo__foot">
              {view.gain > 0 && <span className="ss-pill ss-pill--swap"><ArrowUp className="h-3 w-3" aria-hidden="true" />Swaps <b>+{view.gain.toFixed(1)}</b></span>}
              {opp && edge != null && <span className={cn('ss-pill', edge >= 0 ? 'ss-pill--up' : 'ss-pill--dn')}>vs {opp.name} <b>{edge >= 0 ? '+' : ''}{edge.toFixed(1)}</b></span>}
            </div>
          )}
        </div>
      </SpriteStage>

      <div className="ss-sheet">
        {groups.map(({ g, rows }, gi) => (
          <section key={g} className="ss-grp" aria-label={g}>
            <h3 className="ss-grp__h"><span>{g}</span><i>{rows.length}</i></h3>
            <ul className="ss-grp__list">
              {rows.map(({ s, key, f, proj, hint, swap }, i) => {
                const prof = ctx.profiles.get(key);
                const club = f?.club ?? (prof ? bannerTeamOf(prof.player) : '');
                const t = club ? teamOf(club) ?? findNFLTeam(club) : null;
                const kind = hint?.kind ?? 'start';
                const B = BADGE[kind];
                const altProf = swap ? ctx.profiles.get(swap.alt.key) : undefined;
                const altClub = altProf ? bannerTeamOf(altProf.player) : undefined;
                return (
                  <li key={s.id} className={cn('ss-card ix-card fx-flat', `is-${kind}`)} style={{ ...hcVars(t?.name), ...stag(gi * 2 + i, 70) }}>
                    <ClubMark club={t?.name} size={190} />
                    <span className="ss-card__pos">{slotName(s.id)}</span>
                    <span className={cn('ss-stamp', `ss-stamp--${kind}`)} aria-label={B.t}><B.I className="h-4 w-4" aria-hidden="true" />{B.t}</span>
                    <div className="ss-card__main">
                      <div className="ss-ped">{prof && <PlayerHit pkey={key}><Sprite player={prof.player} club={t?.name} kind="figure" size="m" /></PlayerHit>}<i aria-hidden="true" /></div>
                      <div className="ss-info">
                        <NameStrip pkey={key} name={nameOf(key)} club={t?.name} />
                        {f ? (
                          <>
                            <div className="ss-nums">
                              <span className="ss-big"><ViewCount value={proj && !outReason(f, injured.get(key)) ? proj.mid : 0} decimals={1} /><i>proj</i></span>
                              <VsChip f={f} />
                              <TrendChip trend={f.trend} />
                            </div>
                            <RangeBar lo={proj?.lo ?? null} mid={proj?.mid ?? 0} hi={proj?.hi ?? null} max={max} />
                            <span className="ss-rng">{proj?.lo != null && proj.hi != null ? `${f1(proj.lo)} floor · ${f1(proj.hi)} ceiling` : ' '}</span>
                          </>
                        ) : (
                          <span className="ss-why">No PPR line yet</span>
                        )}
                      </div>
                    </div>
                    {hint && <p className="ss-why">{hint.text}</p>}
                    {swap && (
                      <button type="button" className="ss-sub" onClick={() => { const b = bench.find((x) => x.key === swap.alt.key); if (b) startFromBench(s.id, b.id); }} aria-label={`Start ${swap.alt.name} over ${nameOf(key)}`}>
                        <span className="ss-sub__in">{altProf && <Sprite player={altProf.player} club={findNFLTeam(altClub ?? '')?.name} />}</span>
                        <ArrowUp className="ss-sub__arrow h-4 w-4" aria-hidden="true" />
                        <span className="ss-sub__t"><b>{swap.alt.name}</b><i>+{swap.gain.toFixed(1)} · start him</i></span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="ss-grp ss-grp--bench" aria-label="Bench">
          <h3 className="ss-grp__h"><span>Bench</span><i>{view.benchPlayers.length}</i></h3>
          {hasBench ? (
            <ul className="ss-grp__list ss-grp__list--bench">
              {view.benchPlayers.map((b, i) => {
                const prof = ctx.profiles.get(b.key);
                const club = b.f?.club ?? (prof ? bannerTeamOf(prof.player) : '');
                const t = club ? teamOf(club) ?? findNFLTeam(club) : null;
                const p = view.planned.get(b.key);
                const over = p ? view.rows.find((r) => r.s.id === p.slot) : null;
                return (
                  <li key={b.id} className={cn('ss-bch ix-card fx-flat', p && 'is-in')} style={{ ...hcVars(t?.name), ...stag(i, 50) }}>
                    <ClubMark club={t?.name} size={90} />
                    <span className="ss-bch__fig">{prof && <PlayerHit pkey={b.key}><Sprite player={prof.player} club={t?.name} /></PlayerHit>}</span>
                    <span className="ss-bch__who"><b>{nameOf(b.key)}</b><i>{b.key.slice(0, b.key.indexOf(':'))}{b.out ? ' · out' : ''}</i></span>
                    <span className="ss-bch__n"><b>{b.f && !b.out ? f1(b.mid) : '—'}</b>{b.f && <VsChip f={b.f} />}</span>
                    {p && over && <button type="button" className="fh-btn fh-btn--swap ss-bch__go" onClick={() => startFromBench(p.slot, b.id)}>Start over {nameOf(over.key).split(' ').slice(-1)[0]}</button>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <button type="button" className="ss-prompt" onClick={goBench}><Plus className="h-4 w-4" aria-hidden="true" />Add your bench to get swap ideas</button>
          )}
        </section>
      </div>
    </div>
  );
};

export default StartSitPage;
