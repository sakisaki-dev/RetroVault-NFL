import { useState, type CSSProperties } from 'react';
import { Sun } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TeamLogo from '@/components/brand/TeamLogo';
import { cn } from '@/lib/utils';
import { findNFLTeam, NFL_TEAMS } from '@/utils/nflTeams';
import { useFieldArt, type Turf } from '../fieldArt';
import { useMedia } from '../useMedia';

/** What the team and fantasy modes share: the stage (kit, turf, painted field), mode switch, selects, picker opener. */
/** Everything the two modes share: the stage (kit, turf, painted field) and its sizes. */
export const useStage = (kitClub: string) => {
  const tall = useMedia('(max-width: 639px)');
  const big = useMedia('(min-width: 1024px)');
  const huge = useMedia('(min-width: 1280px)');
  const [turfPick, setTurfPick] = useState<Turf | null>(null);
  const turf: Turf = turfPick ?? 'day';
  const art = useFieldArt(kitClub, turf, tall);
  const team = findNFLTeam(kitClub);
  const vars = {
    '--lab-c1': team ? `hsl(${team.primaryColor})` : 'hsl(var(--turf))',
    '--lab-c2': team ? `hsl(${team.secondaryColor})` : 'hsl(var(--gold))',
    ...(art.crowd ? { '--lab-crowd': `url("${art.crowd}")` } : {}),
    ...(art.stands ? { '--lab-standfront': `url("${art.stands}")` } : {}),
  } as CSSProperties;
  return { tall, big, huge, turf, setTurf: setTurfPick, art, vars };
};
export type Stage = ReturnType<typeof useStage>;

export const TURFS: { id: Turf; label: string }[] = [
  { id: 'day', label: 'Day game' },
  { id: 'night', label: 'Night game' },
  { id: 'snow', label: 'Snow game' },
];

export const ModeSwitch = ({ mode, onMode }: { mode: 'team' | 'fantasy'; onMode: (m: 'team' | 'fantasy') => void }) => (
  <div className="nfl-seg" role="tablist" aria-label="Team Lab mode">
    {(['team', 'fantasy'] as const).map((m) => (
      <button key={m} type="button" role="tab" aria-selected={mode === m} className={cn('nfl-seg-btn', mode === m && 'is-on')} onClick={() => onMode(m)}>
        {m === 'team' ? 'Real football' : 'Fantasy'}
      </button>
    ))}
  </div>
);

export const ClubSelect = ({ value, onChange, label = 'Club' }: { value: string; onChange: (abbr: string) => void; label?: string }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="lab-btn h-9 w-auto min-w-[10rem]" aria-label={label}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent className="z-[70] max-h-80">
      {[...NFL_TEAMS]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => (
          <SelectItem key={t.id} value={t.abbreviation}>
            <span className="inline-flex items-center gap-2">
              <TeamLogo team={t} size={16} decorative /> {t.fullName}
            </span>
          </SelectItem>
        ))}
    </SelectContent>
  </Select>
);

export const TurfSelect = ({ turf, onTurf }: { turf: Turf; onTurf: (t: Turf) => void }) => (
  <Select value={turf} onValueChange={(v) => onTurf(v as Turf)}>
    <SelectTrigger className="lab-btn h-9 w-auto min-w-[8.5rem]" aria-label="Field conditions">
      <Sun className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
      <SelectValue />
    </SelectTrigger>
    <SelectContent className="z-[70]">
      {TURFS.map((t) => (
        <SelectItem key={t.id} value={t.id}>
          {t.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const Stands = ({ art }: { art: Stage['art'] }) => (
  <div className={`lab-stands ${art.crowd ? 'lab-stands--art' : art.pending ? 'lab-stands--pending' : 'lab-stands--css'}`} aria-hidden="true">
    <span className="lab-crowd" />
    <span className="lab-standfront" />
  </div>
);

/** Opens a slot's picker from the field: scrolls its depth chart row into view and clicks the trigger. */
export const openPicker = (id: string) => {
  const row = document.getElementById(`lab-slot-${id}`);
  if (!row) return;
  row.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  row.querySelector<HTMLButtonElement>('button[role="combobox"]')?.click();
};

