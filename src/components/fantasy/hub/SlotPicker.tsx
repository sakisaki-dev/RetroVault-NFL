import { createPortal } from 'react-dom';
import { useCallback, useMemo, useState } from 'react';
import PlayerSearchSheet from '@/components/search/PlayerSearchSheet';
import { useGamePool } from '@/utils/useOfficialOvr';
import type { Player } from '@/types/player';
import { Search } from 'lucide-react';
import { ClubMark, fxTone } from '@/components/fantasy/ClubMark';
import TeamLogo from '@/components/brand/TeamLogo';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { bannerTeamOf } from '@/utils/playerExtras';
import { NFL_TEAMS } from '@/utils/nflTeams';
import { searchTeams } from '@/utils/teamSearch';
import { projectWeek, salaryOf, type FSlot } from '@/utils/nflFantasy';
import type { FantasyHub } from './useFantasyHub';
import { f1, nameOf } from './useFantasyHub';
import { teamOf } from '../parts';

/** A bottom sheet that fills one lineup slot: players who can play it, best projection first; a defence for D/ST. */
const SlotPicker = ({ hub, slot, onClose }: { hub: FantasyHub; slot: FSlot | null; onClose: () => void }) => {
  const { ctx, lab, fl, setFl, excludes, fctx, week, setF } = hub;
  const [q, setQ] = useState('');
  const value = slot ? fl[slot.id] ?? '' : '';
  // everyone who can play this slot (the header search then ranks them: names, nicknames, clubs, cities, abbreviations)
  const pool = useMemo(() => {
    if (!slot || slot.id === 'dst' || !fctx) return [];
    const used = new Set(Object.values(fl).filter(Boolean));
    return (slot.positions as string[])
      .flatMap((pos) => ctx.byPos.get(pos as never) ?? [])
      .filter((p) => lab?.p[p.key] && !excludes.has(p.key) && (!used.has(p.key) || p.key === value))
      .map((p) => ({ p, v: projectWeek(fctx, p.key, week) }))
      .sort((a, b) => b.v - a.v);
  }, [slot, ctx, lab, fl, excludes, fctx, week, value]);
  const players = useMemo(() => pool.map((x) => x.p.player), [pool]);
  const byKey = useMemo(() => new Map(pool.map((x) => [`${x.p.player.position}:${x.p.player.name}`, x])), [pool]);
  const suggestions = useMemo(() => [{ id: 'best', label: 'Best this week', players: players.slice(0, 20) }], [players]);
  const { ovrMap } = useGamePool();
  const extra = useCallback(
    (pl: Player) => {
      const x = byKey.get(`${pl.position}:${pl.name}`);
      return x ? <span className="ss-extra">{f1(x.v)} pts<i>{lab ? `$${salaryOf(lab, x.p.key)}` : ''}</i></span> : null;
    },
    [byKey, lab],
  );
  const done = (key: string) => {
    if (slot) setFl((l) => setF(l, slot.id, key));
    setQ('');
    onClose();
  };
  if (slot && slot.id !== 'dst')
    return createPortal(
      <PlayerSearchSheet
        open
        onClose={onClose}
        players={players}
        ovrMap={ovrMap}
        onPick={(p) => done(`${p.position}:${p.name}`)}
        title="Fantasy"
        word={`Pick ${slot.label}`}
        placeholder="Name, nickname, club or city"
        suggestions={suggestions}
        selectedKey={value || undefined}
        extra={extra}
        hidePositions
        dock
      />,
      document.body,
    );
  return (
    <Sheet open={!!slot} onOpenChange={(o) => { if (!o) { setQ(''); onClose(); } }}>
      <SheetContent side="bottom" className="fh-sheet fh-picker max-h-[82dvh] overflow-hidden p-0">
        <SheetTitle className="fh-picker__t font-display text-xl uppercase">Pick a defence</SheetTitle>
        <SheetDescription className="sr-only">Choose who starts in this slot.</SheetDescription>
        <Command shouldFilter={false}>
          <div className="fh-picker__in"><Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><CommandInput value={q} onValueChange={setQ} placeholder="Club, city or abbreviation" className="h-10 text-[16px]" /></div>
          <CommandList className="max-h-[60dvh]">
            <CommandEmpty>No defence matches.</CommandEmpty>
            <CommandGroup>
              {(q.trim() ? searchTeams(q, 32) : [...NFL_TEAMS].sort((a, b) => a.name.localeCompare(b.name))).map((t) => (
                <CommandItem key={t.id} value={t.abbreviation} onSelect={() => done(`DST:${t.abbreviation}`)} className="fh-pick fx-flat fx-row" style={fxTone(t.name)}>
                  <ClubMark club={t.name} size={64} />
                  <TeamLogo team={t} size={24} decorative backed />
                  <span className="fh-pick__n">{t.fullName}</span>
                  <span className="fh-pick__m">${lab ? salaryOf(lab, `DST:${t.abbreviation}`) : 0}</span>
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
