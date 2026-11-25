import { useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { InfoTip } from '@/components/ui/InfoTip';
import TeamLogo from '@/components/brand/TeamLogo';
import { cn } from '@/lib/utils';
import { canFill, F_SLOTS, fPos, type FLineup } from '@/utils/nflFantasy';
import { fantasyFrom, f1, hintFor, isRegular, outlookOf, useFantasyRaw, type Alt, type Fantasy, type Hint } from '@/utils/fantasy';
import { NextLogos, teamOf, TrendChip } from '@/components/fantasy/parts';
import { Card } from '../parts';

const nameOf = (k: string) => k.slice(k.indexOf(':') + 1);

/**
 * Team Lab > Fantasy: the lineup's outlook from the live PPR data (fantasy.json): a projected total with a floor and a ceiling,
 * each player's matchup, trend and a start / sit hint. Rules and numbers are in src/utils/fantasy.ts (PPR only).
 */
const FantasyDesk = ({ lineup, pool, injured, onSwap }: { lineup: FLineup; pool: string[]; injured: Map<string, string>; onSwap: (slot: string, key: string) => void }) => {
  const raw = useFantasyRaw();
  const view = useMemo(() => {
    if (!raw) return null;
    const used = new Set(Object.values(lineup).filter(Boolean));
    const alts = pool
      .filter((k) => !k.startsWith('DST:') && !used.has(k))
      .map((k) => fantasyFrom(raw, k))
      .filter((f): f is Fantasy => !!f && isRegular(f) && !['Out', 'IR', 'Doubtful'].includes(injured.get(f.key) ?? ''))
      .map((f) => ({ f, mid: outlookOf(f).proj?.mid ?? 0 }));
    const rows = F_SLOTS.filter((s) => s.id !== 'dst' && lineup[s.id]).map((s) => {
      const key = lineup[s.id];
      const f = fantasyFrom(raw, key);
      if (!f) return { s, key, f: null, proj: null, hint: null as Hint | null };
      const best = alts.filter((a) => canFill(s, a.f.key) && fPos(a.f.key) !== undefined).sort((a, b) => b.mid - a.mid)[0];
      const alt: Alt | null = best ? { key: best.f.key, name: nameOf(best.f.key), mid: best.mid } : null;
      return { s, key, f, proj: outlookOf(f).proj, hint: hintFor(f, injured.get(key), alt) };
    });
    const sum = (g: (p: NonNullable<typeof rows[number]['proj']>) => number | null) => rows.reduce((t, r) => t + (r.proj ? g(r.proj) ?? r.proj.mid : 0), 0);
    return { rows, mid: sum((p) => p.mid), lo: sum((p) => p.lo), hi: sum((p) => p.hi), covered: rows.filter((r) => r.f).length };
  }, [raw, lineup, pool, injured]);
  if (!view || !view.covered) return null;
  const week = raw?.n[view.rows.find((r) => r.f)!.f!.club]?.nx.find((n) => n[1])?.[0];
  return (
    <Card
      title={<>Start / sit{week ? <span className="ml-2 text-sm font-normal text-muted-foreground">week {week}</span> : null}</>}
      icon={<ClipboardCheck className="h-5 w-5 text-gold" aria-hidden="true" />}
      action={
        <InfoTip label="About the outlook">
          PPR from this season's weekly lines. Projection: the average of his per-game and last-3 averages, scaled by how much the opponent allows to his
          position against the league mean (half weight). Floor and ceiling are his own 25th and 75th percentile weeks, scaled the same way, summed over the
          lineup. Hints: bye or out; a better projected player at an eligible slot (at least 2 points and 15% more); soft or tough matchup with his trend.
        </InfoTip>
      }
    >
      <div className="fxd-total" aria-label="Projected week total">
        <div><span>Projected</span><b>{f1(view.mid)}</b></div>
        <div><span>Floor</span><b>{f1(view.lo)}</b></div>
        <div><span>Ceiling</span><b>{f1(view.hi)}</b></div>
      </div>
      <ul className="fxd-rows">
        {view.rows.map(({ s, key, f, proj, hint }) => {
          const t = f ? teamOf(f.club) : null;
          return (
            <li key={s.id} className="fxd-row">
              <span className="fxd-pos">{s.label}</span>
              <span className="fxd-who">{t && <TeamLogo team={t} size={18} decorative backed />}<b>{nameOf(key)}</b></span>
              {f ? (
                <>
                  <NextLogos slots={f.next.slice(0, 1)} size={20} label={false} />
                  <span className="fxd-n"><b>{proj ? f1(proj.mid) : '0.0'}</b><em>{proj?.lo != null && proj.hi != null ? `${f1(proj.lo)}-${f1(proj.hi)}` : ' '}</em></span>
                  <TrendChip trend={f.trend} />
                  {hint && (
                    hint.swap ? (
                      <button type="button" className="fxd-hint fxd-hint--swap" onClick={() => onSwap(s.id, hint.swap!)} title="Swap him in">Swap · {hint.text}</button>
                    ) : (
                      <span className={cn('fxd-hint', `fxd-hint--${hint.kind}`)}>{hint.kind === 'sit' ? 'Sit' : hint.kind === 'start' ? 'Start' : 'Watch'} · {hint.text}</span>
                    )
                  )}
                </>
              ) : (
                <span className="fxd-hint">No PPR line yet</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
};

export default FantasyDesk;
