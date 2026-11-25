import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { bannerTeamOf } from '@/utils/playerExtras';
import { NFL_TEAMS } from '@/utils/nflTeams';
import { projectWeek, salaryOf, type FSlot } from '@/utils/nflFantasy';
import type { FantasyHub } from './useFantasyHub';
import { f1, nameOf } from './useFantasyHub';
import { teamOf } from '../parts';

/** A bottom sheet that fills one lineup slot: players who can play it, best projection first; a defence for D/ST. */
const SlotPicker = ({ hub, slot, onClose }: { hub: FantasyHub; slot: FSlot | null; onClose: () => void }) => {
  const { ctx, lab, fl, setFl, excludes, fctx, week, setF } = hub;
  const [q, setQ] = useState('');
  const value = slot ? fl[slot.id] ?? '' : '';
  const list = useMemo(() => {
    if (!slot || slot.id === 'dst' || !fctx) return [];
    const used = new Set(Object.values(fl).filter(Boolean));
    const qq = q.trim().toLowerCase();
    return (slot.positions as string[])
      .flatMap((pos) => ctx.byPos.get(pos as never) ?? [])
      .filter((p) => lab?.p[p.key] && !excludes.has(p.key) && (!used.has(p.key) || p.key === value) && (!qq || p.name.toLowerCase().includes(qq)))
      .map((p) => ({ p, v: projectWeek(fctx, p.key, week) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 40);
  }, [slot, ctx, lab, fl, excludes, fctx, week, q, value]);
  const done = (key: string) => {
    if (slot) setFl((l) => setF(l, slot.id, key));
    setQ('');
    onClose();
  };
  return (
    <Sheet open={!!slot} onOpenChange={(o) => { if (!o) { setQ(''); onClose(); } }}>
      <SheetContent side="bottom" className="fh-sheet fh-picker max-h-[82dvh] overflow-hidden p-0">
        <SheetTitle className="fh-picker__t font-display text-xl uppercase">{slot?.id === 'dst' ? 'Pick a defence' : `Pick ${slot?.label ?? ''}`}</SheetTitle>
        <SheetDescription className="sr-only">Choose who starts in this slot.</SheetDescription>
        <Command shouldFilter={false}>
          {slot?.id !== 'dst' && (
            <div className="fh-picker__in"><Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><CommandInput value={q} onValueChange={setQ} placeholder="Search by name" className="h-10 text-[16px]" /></div>
          )}
          <CommandList className="max-h-[60dvh]">
            <CommandEmpty>No player matches.</CommandEmpty>
            <CommandGroup>
              {slot?.id === 'dst'
                ? [...NFL_TEAMS].sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
                    <CommandItem key={t.id} value={t.abbreviation} onSelect={() => done(`DST:${t.abbreviation}`)} className="fh-pick">
                      <TeamLogo team={t} size={24} decorative backed />
                      <span className="fh-pick__n">{t.fullName}</span>
                      <span className="fh-pick__m">${lab ? salaryOf(lab, `DST:${t.abbreviation}`) : 0}</span>
                    </CommandItem>
                  ))
                : list.map(({ p, v }) => (
                    <CommandItem key={p.key} value={p.key} onSelect={() => done(p.key)} className="fh-pick">
                      <TeamLogo team={teamOf(bannerTeamOf(p.player)) ?? bannerTeamOf(p.player)} size={24} decorative backed />
                      <span className="fh-pick__n">{nameOf(p.key)}</span>
                      <span className="fh-pick__m">{f1(v)} pts{lab ? ` · $${salaryOf(lab, p.key)}` : ''}</span>
                    </CommandItem>
                  ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </SheetContent>
    </Sheet>
  );
};

export default SlotPicker;
