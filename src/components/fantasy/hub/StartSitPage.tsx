import { useMemo } from 'react';
import { ArrowLeftRight, Check, Eye, Minus } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { InfoTip } from '@/components/ui/InfoTip';
import { Reveal, stag, ViewCount } from '@/components/motion/Reveal';
import { cn } from '@/lib/utils';
import { canFill, F_SLOTS, fPos } from '@/utils/nflFantasy';
import { fantasyFrom, hintFor, isRegular, outlookOf, useFantasyRaw, type Alt, type Fantasy, type Hint } from '@/utils/fantasy';
import { bannerTeamOf } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { TrendChip, teamOf } from '../parts';
import { NameStrip, OppChip, RangeBar, Sprite, hcVars } from './hubParts';
import { f1, nameOf, type FantasyHub } from './useFantasyHub';
import type { Sub } from './FantasyHub';

const BADGE = { start: { t: 'START', I: Check }, sit: { t: 'SIT', I: Minus }, swap: { t: 'SWAP', I: ArrowLeftRight }, watch: { t: 'WATCH', I: Eye } } as const;

/** Start / sit: one card per lineup slot, in club colours, with the call as a bold badge and the floor-ceiling bar. */
const StartSitPage = ({ hub, onGo }: { hub: FantasyHub; onGo: (s: Sub) => void }) => {
  const { fl, setFl, cands, excludes, injured, ctx, filled, setF } = hub;
  const raw = useFantasyRaw();
  const view = useMemo(() => {
    if (!raw) return null;
    const pool = cands.filter((c) => !excludes.has(c.key)).map((c) => c.key);
    const used = new Set(Object.values(fl).filter(Boolean));
    const alts = pool
      .filter((k) => !k.startsWith('DST:') && !used.has(k))
      .map((k) => fantasyFrom(raw, k))
      .filter((f): f is Fantasy => !!f && isRegular(f) && !['Out', 'IR', 'Doubtful'].includes(injured.get(f.key) ?? ''))
      .map((f) => ({ f, mid: outlookOf(f).proj?.mid ?? 0 }));
    const rows = F_SLOTS.filter((s) => s.id !== 'dst' && fl[s.id]).map((s) => {
      const key = fl[s.id];
      const f = fantasyFrom(raw, key);
      if (!f) return { s, key, f: null, proj: null, hint: null as Hint | null };
      const best = alts.filter((a) => canFill(s, a.f.key) && fPos(a.f.key) !== undefined).sort((a, b) => b.mid - a.mid)[0];
      const alt: Alt | null = best ? { key: best.f.key, name: nameOf(best.f.key), mid: best.mid } : null;
      return { s, key, f, proj: outlookOf(f).proj, hint: hintFor(f, injured.get(key), alt) };
    });
    const sum = (g: (p: NonNullable<(typeof rows)[number]['proj']>) => number | null) => rows.reduce((t, r) => t + (r.proj ? g(r.proj) ?? r.proj.mid : 0), 0);
    return { rows, mid: sum((p) => p.mid), lo: sum((p) => p.lo), hi: sum((p) => p.hi), covered: rows.filter((r) => r.f).length };
  }, [raw, fl, cands, excludes, injured]);

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
  const week = raw?.n[view.rows.find((r) => r.f)!.f!.club]?.nx.find((n) => n[1])?.[0];
  const max = Math.max(1, ...view.rows.map((r) => r.proj?.hi ?? r.proj?.mid ?? 0));
  return (
    <div className="fh-page">
      <Reveal className="fh-totals" aria-label="Projected week total">
        {[['Projected', view.mid, true], ['Floor', view.lo, false], ['Ceiling', view.hi, false]].map(([k, v, lead], i) => (
          <div key={String(k)} className={cn('fh-total mo-pop', lead && 'is-lead')} style={stag(i, 70)}>
            <span>{k}</span><ViewCount value={Number(v)} decimals={1} />
          </div>
        ))}
        <span className="fh-totals__wk">{week ? `Week ${week}` : ''}<InfoTip label="About the outlook">
          PPR from this season's weekly lines. Projection: the average of his per-game and last-3 averages, scaled by how much the opponent allows to his position against the league mean (half weight). Floor and ceiling are his own 25th and 75th percentile weeks, scaled the same way, summed over the lineup. Calls: bye or out; a better projected player at an eligible slot (at least 2 points and 15% more); soft or tough matchup with his trend.
        </InfoTip></span>
      </Reveal>
      <ul className="fh-ss">
        {view.rows.map(({ s, key, f, proj, hint }, i) => {
          const prof = ctx.profiles.get(key);
          const club = f?.club ?? (prof ? bannerTeamOf(prof.player) : '');
          const t = club ? teamOf(club) ?? findNFLTeam(club) : null;
          const kind = hint?.kind ?? 'start';
          const B = BADGE[kind];
          return (
            <li key={s.id} className={cn('fh-ss__card ix-card', `is-${kind}`)} style={{ ...hcVars(t?.name), ...stag(i, 60) }}>
              {t && <span className="fh-wm" aria-hidden="true"><TeamLogo team={t} size={150} decorative /></span>}
              <span className="fh-ss__pos">{s.label}</span>
              <span className={cn('fh-call', `fh-call--${kind}`)}><B.I className="h-3.5 w-3.5" aria-hidden="true" />{B.t}</span>
              <div className="fh-ss__fig">{prof && <Sprite player={prof.player} club={t?.name} kind="figure" size="m" />}</div>
              <div className="fh-ss__body">
                <NameStrip pkey={key} name={nameOf(key)} club={t?.name} />
                {f ? (
                  <>
                    <div className="fh-ss__nums">
                      <span className="fh-ss__big"><b>{proj ? f1(proj.mid) : '0.0'}</b><i>proj</i></span>
                      <OppChip slots={f.next} size={26} />
                      <TrendChip trend={f.trend} />
                    </div>
                    <RangeBar lo={proj?.lo ?? null} mid={proj?.mid ?? 0} hi={proj?.hi ?? null} max={max} />
                    <span className="fh-ss__rng">{proj?.lo != null && proj.hi != null ? `${f1(proj.lo)} floor · ${f1(proj.hi)} ceiling` : ' '}</span>
                    {hint && <span className="fh-ss__why">{hint.text}</span>}
                    {hint?.swap && <button type="button" className="fh-btn fh-btn--swap" onClick={() => setFl((l) => setF(l, s.id, hint.swap!))}>Swap in {nameOf(hint.swap)}</button>}
                  </>
                ) : (
                  <span className="fh-ss__why">No PPR line yet</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default StartSitPage;
