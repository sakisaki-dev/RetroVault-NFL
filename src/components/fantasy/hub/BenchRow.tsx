import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { ClubMark } from '@/components/fantasy/ClubMark';
import { stag } from '@/components/motion/Reveal';
import { cn } from '@/lib/utils';
import { bannerTeamOf } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { canFill, F_SLOTS, projectWeek } from '@/utils/nflFantasy';
import { teamOf } from '../parts';
import { Sprite, hcVars } from './hubParts';
import SlotPicker from './SlotPicker';
import { BENCH_MAX, f1, nameOf, type FantasyHub } from './useFantasyHub';

export const slotName = (id: string) => id.toUpperCase();

/** The bench under the lineup: your reserves (not the whole pool). Tap one to start him in a slot he can fill; the starter takes his seat. */
const BenchRow = ({ hub, pick, onPick, onClose }: { hub: FantasyHub; pick: string | null; onPick: (id: string) => void; onClose: () => void }) => {
  const { bench, benchN, setBenchN, ctx, fl, setFl, fctx, week, startFromBench } = hub;
  const [sel, setSel] = useState<string | null>(null);
  const count = bench.filter((b) => b.key).length;
  return (
    <section className="fh-panel fh-bench" id="fh-bench" aria-labelledby="fh-bench-h">
      <header className="fh-panel__h">
        <h2 id="fh-bench-h">Bench</h2>
        <span className="fh-lamp" aria-label={`${count} of ${benchN} bench spots filled`}><b>{count}</b>/{benchN}</span>
        <span className="fh-bench__n" role="group" aria-label="Bench spots">
          <button type="button" className="fh-icon" onClick={() => setBenchN(benchN - 1)} disabled={benchN <= 1} aria-label="Fewer bench spots"><Minus className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className="fh-icon" onClick={() => setBenchN(benchN + 1)} disabled={benchN >= BENCH_MAX} aria-label="More bench spots"><Plus className="h-4 w-4" aria-hidden="true" /></button>
        </span>
      </header>
      <ul className="fh-bench__list">
        {bench.map(({ id, key }, i) => {
          const prof = key ? ctx.profiles.get(key) : undefined;
          const club = prof ? bannerTeamOf(prof.player) : '';
          const t = club ? teamOf(club) ?? findNFLTeam(club) : null;
          const open = sel === id;
          const picking = pick === id;
          return (
            <li key={id} className={cn('fh-bch ix-card', key ? 'is-filled fx-flat' : 'is-empty', (open || picking) && 'is-open')} style={{ ...hcVars(club || undefined), ...stag(i, 40) }}>
              {key && club && <ClubMark club={t?.name ?? club} size={80} />}
              {key ? (
                <>
                  <button type="button" className="fh-bch__main" aria-expanded={open} onClick={() => setSel(open ? null : id)}>
                    <span className="fh-bch__fig">{prof && <Sprite player={prof.player} club={t?.name} />}</span>
                    <span className="fh-bch__who"><b>{nameOf(key)}</b><i>{key.slice(0, key.indexOf(':'))} · {fctx ? f1(projectWeek(fctx, key, week)) : '0.0'} proj</i></span>
                  </button>
                  <button type="button" className="fh-icon fh-icon--x" aria-label={`Remove ${nameOf(key)} from the bench`} onClick={() => setFl((l) => ({ ...l, [id]: '' }))}><X className="h-4 w-4" aria-hidden="true" /></button>
                  {open && (
                    <span className="fh-bch__go">
                      {F_SLOTS.filter((s) => s.id !== 'dst' && canFill(s, key)).map((s) => (
                        <button key={s.id} type="button" className="fh-btn fh-btn--sm" title={fl[s.id] ? `Replaces ${nameOf(fl[s.id])}` : 'Open slot'} onClick={() => { startFromBench(s.id, id); setSel(null); }}>
                          Start in {slotName(s.id)}
                        </button>
                      ))}
                      <button type="button" className="fh-btn fh-btn--sm fh-btn--ghost" onClick={() => onPick(id)}>Change</button>
                    </span>
                  )}
                </>
              ) : (
                <button type="button" className="fh-slot__empty" aria-expanded={picking} onClick={() => onPick(id)}><Plus className="h-4 w-4" aria-hidden="true" /> Add to bench</button>
              )}
              {picking && <SlotPicker hub={hub} slot={{ id, label: 'a bench player', positions: ['QB', 'RB', 'WR', 'TE', 'K'] }} onClose={onClose} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default BenchRow;
