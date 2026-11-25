import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Sun } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

export const ClubSelect = ({ value, onChange, label = 'Club', compact = false }: { value: string; onChange: (abbr: string) => void; label?: string; compact?: boolean }) => {
  const t = findNFLTeam(value);
  return (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className={cn('lab-btn h-9 w-auto', compact ? 'min-w-0 gap-1.5 px-2.5 sm:min-w-[10rem]' : 'min-w-[10rem]')} aria-label={label}>
      {compact ? (
        <SelectValue>
          <span className="inline-flex items-center gap-1.5">
            {t && <TeamLogo team={t} size={18} decorative />}
            <span className="hidden sm:inline">{t?.fullName ?? value}</span>
            <span className="sm:hidden">{t?.abbreviation ?? value}</span>
          </span>
        </SelectValue>
      ) : (
        <SelectValue />
      )}
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
};

/** A toolbar button that opens a small popover (a desktop popover, a near-full-width one on a phone). */
export const MenuPop = ({ icon, label, aria, children, className }: { icon: ReactNode; label: string; aria: string; children: ReactNode; className?: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" className={cn('nfl-opt-btn', className)} aria-label={aria}>
        {icon}
        <span className="hidden lg:inline">{label}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="nfl-opt-pop z-[60]">
      {children}
    </PopoverContent>
  </Popover>
);

/** A labelled segmented control (one choice of a few), the display settings' building block. */
export const Seg = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; title?: string; disabled?: boolean }[]; onChange: (v: T) => void }) => (
  <div className="nfl-opt-line">
    <span className="nfl-opt-k">{label}</span>
    <div className="nfl-seg nfl-seg--sm" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" disabled={o.disabled} title={o.title} className={cn('nfl-seg-btn', value === o.id && 'is-on')} onClick={() => onChange(o.id)} aria-pressed={value === o.id}>
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

/** A number that counts up to its value when it changes (instant under reduced motion). */
export const CountUp = ({ value, ms = 700 }: { value: number; ms?: number }) => {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const calm = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (calm || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setShown(Math.round(a + (value - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{shown}</>;
};

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

