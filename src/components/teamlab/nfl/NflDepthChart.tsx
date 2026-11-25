import { useMemo, type ReactNode } from 'react';
import { IdCard, X } from 'lucide-react';
import PlayerSearchSelect from '@/components/PlayerSearchSelect';
import { peekProps } from '@/components/peek/peekProps';
import type { Player } from '@/types/player';
import type { PlayerProfile } from '@/utils/teamLab';
import type { InjuryCode } from '@/utils/injuries';
import { activeSlots, clubAbbr, filledN, type NLineup, type NflCtx } from '@/utils/nflLab';
import { GradeChip } from '../parts';

const INJ_TEXT: Record<InjuryCode, string> = { IR: 'IR', Out: 'Out', Doubtful: 'Dbt', Questionable: 'Q' };
export const InjuryChip = ({ code }: { code: InjuryCode }) => (
  <span className={`nfl-injchip nfl-injchip--${code.toLowerCase()}`} title={code}>
    {INJ_TEXT[code]}
  </span>
);

/** One picker row: slot label, the player picker, his grade (or a custom end), a clear button. */
export const SlotRow = ({
  id,
  label,
  side,
  players,
  value,
  profile,
  injury,
  end,
  onChange,
  onOpen,
  placeholder,
}: {
  id: string;
  label: string;
  side: 'offense' | 'defense';
  players: Player[];
  value: string;
  profile?: PlayerProfile;
  injury?: InjuryCode;
  end?: ReactNode;
  onChange: (key: string) => void;
  /** opens his player card (the real-football lab) */
  onOpen?: (key: string) => void;
  placeholder?: string;
}) => (
  <li id={`lab-slot-${id}`} className="lab-row" data-side={side} {...peekProps(profile?.player)}>
    <span className="lab-row-pos" aria-hidden="true">
      {label}
    </span>
    <div className="min-w-0 flex-1">
      <PlayerSearchSelect players={players} value={value} onValueChange={onChange} placeholder={placeholder ?? `Pick ${label}`} ariaLabel={label} showOvr />
    </div>
    <span className="lab-row-end">
      {injury && <InjuryChip code={injury} />}
      {end ?? (profile && <GradeChip grade={profile.grade} size="sm" label={`Skill grade ${profile.grade?.grade ?? 'none'}`} />)}
      {value && onOpen && (
        <button type="button" onClick={() => onOpen(value)} className="nfl-rowcard" aria-label={`Open ${label} player card`} title="Player card">
          <IdCard className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {value && (
        <button type="button" onClick={() => onChange('')} className="nfl-rowclear rounded p-0.5 text-muted-foreground hover:text-chalk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold" aria-label={`Clear ${label}`}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </span>
  </li>
);

/** The 22 pickers, offense then defense. `club`: restrict to that club's roster ('' = any player, the dream team). */
export const NflDepthChart = ({ ctx, lineup, onSlot, onOpen, club, injured }: { onOpen?: (key: string) => void; ctx: NflCtx; lineup: NLineup; onSlot: (id: string, key: string) => void; club: string; injured: Map<string, InjuryCode> }) => {
  const slots = activeSlots(lineup);
  const used = useMemo(() => new Set(Object.values(lineup.s).filter(Boolean)), [lineup]);
  const poolFor = (positions: string[], value: string) =>
    positions
      .flatMap((pos) => ctx.byPos.get(pos as never) ?? [])
      .filter((p) => (!used.has(p.key) || p.key === value) && (!club || clubAbbr(p) === club || p.key === value))
      .map((p) => p.player);
  const group = (side: 'offense' | 'defense') => (
    <ul className="lab-rows">
      {slots
        .filter((s) => s.side === side)
        .map((s) => {
          const v = lineup.s[s.id] ?? '';
          const p = v ? ctx.profiles.get(v) : undefined;
          return <SlotRow key={s.id} id={s.id} label={s.label} side={side} players={poolFor(s.positions, v)} value={v} profile={p} injury={v ? injured.get(v) : undefined} onChange={(k) => onSlot(s.id, k)} onOpen={onOpen} />;
        })}
    </ul>
  );
  return (
    <section aria-labelledby="lab-depth" className="lab-panel lab-depth nfl-depth">
      <header className="lab-panel-head">
        <h2 id="lab-depth" className="lab-panel-title">
          Depth chart
        </h2>
        <span className="lamp" aria-label={`${filledN(lineup)} of 22 slots filled`}>
          <b>{filledN(lineup)}</b>/22
        </span>
      </header>
      <p className="lab-group">Offense · {lineup.off} personnel</p>
      {group('offense')}
      <p className="lab-group">Defense · {lineup.def}</p>
      {group('defense')}
    </section>
  );
};
