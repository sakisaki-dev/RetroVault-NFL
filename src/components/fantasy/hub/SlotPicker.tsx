import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ClubMark, fxTone } from '@/components/fantasy/ClubMark';
import TeamLogo from '@/components/brand/TeamLogo';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { bannerTeamOf, usePlayerExtras } from '@/utils/playerExtras';
import { NFL_TEAMS } from '@/utils/nflTeams';
import { searchTeams } from '@/utils/teamSearch';
import { buildSearchIndex, keyOfPlayer, pushRecent, readRecent, searchPlayers } from '@/utils/playerSearch';
import { useGamePool } from '@/utils/useOfficialOvr';
import { projectWeek, salaryOf, type FSlot } from '@/utils/nflFantasy';
import type { FantasyHub } from './useFantasyHub';
import { f1, nameOf } from './useFantasyHub';
import { teamOf } from '../parts';

/** A bottom sheet that fills one lineup slot: players who can play it, best projection first; a defence for D/ST.
 *  Search ranks like the header's (names, nicknames, clubs, cities, abbreviations); recent picks lead while it is empty. */
const SlotPicker = ({ hub, slot, onClose }: { hub: FantasyHub; slot: FSlot | null; onClose: () => void }) => {
  const { ctx, lab, fl, setFl, excludes, fctx, week, setF } = hub;
  const [q, setQ] = useState('');
  const extras = usePlayerExtras();
  const { ovrMap } = useGamePool();
  const value = slot ? fl[slot.id] ?? '' : '';
  const pool = useMemo(() => {
    if (!slot || slot.id === 'dst' || !fctx) return [];
    const used = new Set(Object.values(fl).filter(Boolean));
    return (slot.positions as string[])
      .flatMap((pos) => ctx.byPos.get(pos as never) ?? [])
      .filter((p) => lab?.p[p.key] && !excludes.has(p.key) && (!used.has(p.key) || p.key === value))
      .map((p) => ({ p, v: projectWeek(fctx, p.key, week) }))
      .sort((a, b) => b.v - a.v);
  }, [slot, ctx, lab, fl, excludes, fctx, week, value]);
  const byKey = useMemo(() => new Map(pool.map((x) => [keyOfPlayer(x.p.player), x])), [pool]);
  const index = useMemo(() => buildSearchIndex(pool.map((x) => x.p.player), { ovr: ovrMap, formerNames: extras.formerNames }), [pool, ovrMap, extras]);
  const list = useMemo(() => {
    const qq = q.trim();
    type Item = (typeof pool)[number];
    const has = (x: Item | undefined): x is Item => !!x;
    if (qq) return searchPlayers(index, qq, 40).map((e) => byKey.get(keyOfPlayer(e.p))).filter(has);
    const recent = readRecent().map((k) => byKey.get(k)).filter(has);
    const seen = new Set(recent);
    return [...recent, ...pool.filter((x) => !seen.has(x)).slice(0, 40)];
  }, [q, index, byKey, pool]);
  const done = (key: string) => {
    if (slot) setFl((l) => setF(l, slot.id, key));
    setQ('');
    onClose();
  };
  const dst = slot?.id === 'dst';
  return (
    <Sheet open={!!slot} onOpenChange={(o) => { if (!o) { setQ(''); onClose(); } }}>
      <SheetContent side="bottom" className="fh-sheet fh-picker max-h-[82dvh] overflow-hidden p-0">
        <SheetTitle className="fh-picker__t font-display text-xl uppercase">{dst ? 'Pick a defence' : `Pick ${slot?.label ?? ''}`}</SheetTitle>
        <SheetDescription className="sr-only">Choose who starts in this slot.</SheetDescription>
        <Command shouldFilter={false}>
          <div className="fh-picker__in"><Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><CommandInput value={q} onValueChange={setQ} placeholder={dst ? 'Club, city or abbreviation' : 'Name, nickname, club or city'} className="h-10 text-[16px]" /></div>
          <CommandList className="max-h-[60dvh]">
            <CommandEmpty>{dst ? 'No defence matches.' : 'No player matches.'}</CommandEmpty>
            <CommandGroup>
              {dst
                ? (q.trim() ? searchTeams(q, 32) : [...NFL_TEAMS].sort((a, b) => a.name.localeCompare(b.name))).map((t) => (
                    <CommandItem key={t.id} value={t.abbreviation} onSelect={() => done(`DST:${t.abbreviation}`)} className="fh-pick fx-flat fx-row" style={fxTone(t.name)}>
                      <ClubMark club={t.name} size={64} />
                      <TeamLogo team={t} size={24} decorative backed />
                      <span className="fh-pick__n">{t.fullName}</span>
                      <span className="fh-pick__m">${lab ? salaryOf(lab, `DST:${t.abbreviation}`) : 0}</span>
                    </CommandItem>
                  ))
                : list.map(({ p, v }) => (
                    <CommandItem key={p.key} value={p.key} onSelect={() => { pushRecent(keyOfPlayer(p.player)); done(p.key); }} className="fh-pick fx-flat fx-row" style={fxTone(bannerTeamOf(p.player))}>
                      <ClubMark club={bannerTeamOf(p.player)} size={64} />
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
