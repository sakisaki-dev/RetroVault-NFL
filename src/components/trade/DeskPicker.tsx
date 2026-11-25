import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { ClubMark, fxTone } from '@/components/fantasy/ClubMark';
import { teamOf } from '@/components/fantasy/parts';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { usePhone } from '@/hooks/usePhone';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { f1, type FPos } from '@/utils/fantasy';
import type { NFLTeam } from '@/utils/nflTeams';
import { buildSearchIndex, searchPlayers } from '@/utils/playerSearch';
import { searchTeams } from '@/utils/teamSearch';
import { SCORING_LABEL, type TradeModel, type TradePlayer } from '@/utils/tradeSim';
import { Stand } from './DeskCard';

const POS_CHIPS: ('ALL' | FPos)[] = ['ALL', 'QB', 'RB', 'WR', 'TE'];
const LIMIT = 40;

/** The site's own search (the header's index over the card players, plus clubs) restricted to the fantasy pool. */
const useDeskIndex = (model: TradeModel, cards: Map<string, Player>) =>
  useMemo(() => {
    const players: Player[] = [];
    const keyOf = new Map<Player, string>();
    model.players.forEach((_, k) => {
      const p = cards.get(k);
      if (p) { players.push(p); keyOf.set(p, k); }
    });
    return { index: buildSearchIndex(players), keyOf };
  }, [model, cards]);

const Row = ({ p, player, unit, onPick }: { p: TradePlayer; player?: Player; unit: string; onPick: (k: string) => void }) => (
  <CommandItem value={p.key} onSelect={() => onPick(p.key)} className="dk-pk-r fx-flat fx-row" style={fxTone(p.club)}>
    <ClubMark club={p.club} size={84} />
    <Stand player={player} club={p.club} size="s" />
    <span className="dk-pk-r__id">
      <b>{p.name}</b>
      <span><em className="dk-pos">{p.pos}{p.posRank}</em><TeamLogo team={teamOf(p.club)} size={15} decorative backed /> {p.club}{p.status && <i className="dk-flag dk-flag--bad">{p.status}</i>}</span>
    </span>
    <span className="dk-pk-r__n dk-hide-s"><b>{f1(p.ppg)}</b><i>{unit}/g</i></span>
    <span className="dk-pk-r__n"><b>{p.ros.toFixed(0)}</b><i>ROS</i></span>
    <span className="dk-pk-r__n is-gold"><b>{p.value.toFixed(0)}</b><i>Value</i></span>
  </CommandItem>
);

/** The command palette: a search box, position chips, club chips from what was typed, rows themed like the cards. */
const Palette = ({ model, cards, taken, onPick, autoFocus }: { model: TradeModel; cards: Map<string, Player>; taken: Set<string>; onPick: (k: string) => void; autoFocus?: boolean }) => {
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<'ALL' | FPos>('ALL');
  const [club, setClub] = useState<NFLTeam | null>(null);
  const dq = useDeferredValue(q);
  const [sel, setSel] = useState('');
  const { index, keyOf } = useDeskIndex(model, cards);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (autoFocus) inputRef.current?.focus({ preventScroll: true }); }, [autoFocus]);
  const unit = SCORING_LABEL[model.settings.scoring];
  const clubs = useMemo(() => (dq.trim() && !club ? searchTeams(dq, 3) : []), [dq, club]);
  const rows = useMemo(() => {
    const ok = (p: TradePlayer) => !taken.has(p.key) && (pos === 'ALL' || p.pos === pos) && (!club || teamOf(p.club)?.name === club.name);
    if (!dq.trim()) return model.ranked.filter(ok).slice(0, LIMIT);
    const hits = searchPlayers(index, dq, LIMIT * 2).map((e) => keyOf.get(e.p)).filter((k): k is string => !!k);
    return hits.map((k) => model.players.get(k)!).filter((p) => p && ok(p)).slice(0, LIMIT);
  }, [dq, pos, club, taken, model, index, keyOf]);
  // the first row is always the highlighted one, so Enter adds the best match
  const first = rows[0]?.key ?? '';
  useEffect(() => setSel(first), [first]);
  return (
    <Command shouldFilter={false} className="dk-pal" value={sel} onValueChange={setSel}>
      <div className="dk-pal__in">
        <Search className="h-4 w-4" aria-hidden="true" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player or a club" aria-label="Search players and clubs" autoComplete="off" enterKeyHint="search" />
        {q && <button type="button" className="dk-pal__clr" onClick={() => setQ('')} aria-label="Clear"><X className="h-4 w-4" aria-hidden="true" /></button>}
      </div>
      <div className="dk-pal__f">
        <div className="dk-chips" role="group" aria-label="Position">
          {POS_CHIPS.map((x) => <button key={x} type="button" className="dk-chip" aria-pressed={pos === x} onClick={() => setPos(x)}>{x === 'ALL' ? 'All' : x}</button>)}
        </div>
        {club && <button type="button" className="dk-chip dk-chip--club" aria-pressed="true" onClick={() => setClub(null)} aria-label={`Remove club filter ${club.name}`}><TeamLogo team={club} size={16} decorative backed />{club.name}<X className="h-3 w-3" aria-hidden="true" /></button>}
        {clubs.map((t) => <button key={t.name} type="button" className="dk-chip dk-chip--club" onClick={() => { setClub(t); setQ(''); }}><TeamLogo team={t} size={16} decorative backed />{t.name}</button>)}
      </div>
      <CommandList className="dk-pal__list">
        <CommandEmpty><span className="dk-empty-note">No fantasy player matches. Try a surname or a club.</span></CommandEmpty>
        <CommandGroup>{rows.map((p) => <Row key={p.key} p={p} player={cards.get(p.key)} unit={unit} onPick={onPick} />)}</CommandGroup>
      </CommandList>
    </Command>
  );
};

/**
 * "Add player" on a locker: opens the palette inline under the locker's header on a desktop and as a bottom sheet on a phone.
 * Stays open after a pick on a desktop so a whole package can be added; a phone sheet closes (it covers the desk).
 */
export const DeskPicker = ({ model, cards, taken, onPick, label, big }: { model: TradeModel; cards: Map<string, Player>; taken: Set<string>; onPick: (k: string) => void; label: string; big?: boolean }) => {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const trigger = (
    <button type="button" className={cn('dk-add', big && 'dk-add--big', open && 'is-open')} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
      {open && !phone ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}<span>{open && !phone ? 'Close' : label}</span>
    </button>
  );
  if (phone) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="dk-sheet">
            <SheetTitle className="dk-sheet__t">{label}</SheetTitle>
            <SheetDescription className="sr-only">Search the fantasy pool</SheetDescription>
            <Palette model={model} cards={cards} taken={taken} onPick={(k) => { onPick(k); setOpen(false); }} autoFocus />
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <>
      {trigger}
      {open && <div className="dk-inline mo-pop"><Palette model={model} cards={cards} taken={taken} onPick={onPick} autoFocus /></div>}
    </>
  );
};
