import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Row } from '@/components/search/PlayerSearchSheet';
import '@/components/search/searchSheet.css';
import { cn } from '@/lib/utils';
import type { Player, Position } from '@/types/player';
import { f1 } from '@/utils/fantasy';
import { useJerseyNumbers } from '@/utils/jerseys';
import { usePlayerExtras } from '@/utils/playerExtras';
import { buildSearchIndex, keyOfPlayer, pushRecent, readRecent, searchPlayers } from '@/utils/playerSearch';
import { SCORING_LABEL, type TradeModel } from '@/utils/tradeSim';

const LIMIT = 20;

/**
 * "Add player" on a locker: a search that opens inline in the locker column, dressed like the header search (its field,
 * position chips and banner rows; clubs, cities and nicknames search too), restricted to the fantasy pool not already in
 * the trade. Each row keeps the desk's figures: position rank, points a game, rest of season and value. It stays open
 * and focused after a pick so several players go in a row; arrows and Enter work; Escape or Done closes it.
 */
export const DeskPicker = ({ model, cards, taken, onPick, label, big }: { model: TradeModel; cards: Map<string, Player>; taken: Set<string>; onPick: (k: string) => void; label: string; big?: boolean }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<Position | 'ALL'>('ALL');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const extras = usePlayerExtras();
  const { numberFor } = useJerseyNumbers();
  const unit = SCORING_LABEL[model.settings.scoring];
  const pool = useMemo(() => {
    if (!open) return [];
    const out: { pl: Player; key: string }[] = [];
    model.ranked.forEach((tp) => {
      const pl = cards.get(tp.key);
      if (pl && !taken.has(tp.key)) out.push({ pl, key: tp.key });
    });
    return out;
  }, [open, model, cards, taken]);
  const byPlayer = useMemo(() => new Map(pool.map((x) => [x.pl, x.key])), [pool]);
  const index = useMemo(() => buildSearchIndex(pool.map((x) => x.pl), { formerNames: extras.formerNames }), [pool, extras]);
  const positions = useMemo(() => {
    const have = new Set(pool.map((x) => x.pl.position));
    return (['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'] as Position[]).filter((p) => have.has(p));
  }, [pool]);
  const list = useMemo((): { label: string; players: Player[] } => {
    if (!open) return { label: '', players: [] };
    const keep = pos === 'ALL' ? undefined : (p: Player) => p.position === pos;
    if (query.trim()) return { label: 'Results', players: searchPlayers(index, query, LIMIT, keep).map((e) => e.p) };
    const recent = readRecent().map((k) => index.byKey.get(k)?.p).filter((p): p is Player => !!p && (!keep || keep(p)));
    const seen = new Set(recent);
    const best = pool.map((x) => x.pl).filter((p) => !seen.has(p) && (!keep || keep(p))).slice(0, LIMIT - recent.length);
    return { label: recent.length ? 'Recent and best values' : 'Best values', players: [...recent, ...best].slice(0, LIMIT) };
  }, [open, query, pos, index, pool]);
  const n = list.players.length;
  const act = Math.min(active, Math.max(0, n - 1));

  useEffect(() => setActive(0), [query, pos, open]);
  useLayoutEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelectorAll('.ss-row')[act]?.scrollIntoView({ block: 'nearest' });
  }, [act, n]);
  useEffect(() => {
    if (pos !== 'ALL' && !positions.includes(pos)) setPos('ALL');
  }, [pos, positions]);

  const close = () => { setOpen(false); setQuery(''); setPos('ALL'); };
  const pick = (p: Player) => {
    const k = byPlayer.get(p);
    if (!k) return;
    pushRecent(keyOfPlayer(p));
    setQuery('');
    onPick(k);
    inputRef.current?.focus({ preventScroll: true });
  };

  if (!open)
    return (
      <button type="button" className={cn('dk-add', big && 'dk-add--big')} onClick={() => setOpen(true)} aria-expanded={false}>
        <Plus className="h-4 w-4" aria-hidden="true" /><span>{label}</span>
      </button>
    );
  return (
    <div
      className="dk-search"
      data-peek-ok
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(n - 1, act + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, act - 1)); }
      }}
    >
      <form
        role="search"
        className="ss-field"
        onSubmit={(e) => { e.preventDefault(); const p = list.players[act]; if (p) pick(p); }}
      >
        <Search className="ss-field__icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="go"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label={label}
          placeholder="Name, nickname, club or city"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query ? (
          <button type="button" className="ss-clear" aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="dk-search__done" onClick={close}>Done</button>
        )}
      </form>
      <div className="dk-search__list" onMouseDown={(e) => e.preventDefault()}>
        {positions.length > 1 && (
        <div role="group" aria-label="Filter by position" className="ss-chips">
          {(['ALL', ...positions] as const).map((k) => (
            <button key={k} type="button" aria-pressed={pos === k} className="ss-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => setPos(pos === k && k !== 'ALL' ? 'ALL' : k)}>
              {k === 'ALL' ? 'All' : k}
            </button>
          ))}
        </div>
      )}
        {n === 0 ? (
          <p className="ss-empty">{query.trim() ? <>No players match <b>{query.trim()}</b>{pos !== 'ALL' ? ` at ${pos}` : ''}.</> : 'Everyone is already in the trade.'}</p>
        ) : (
          <>
            <h3 className="ss-head"><span className="lamp"><Search className="h-3 w-3" aria-hidden="true" />{list.label}{query.trim() && <b>{n >= LIMIT ? `Top ${LIMIT}` : n}</b>}</span></h3>
            <ul ref={listRef} className="ss-list">
              {list.players.map((p, i) => {
                const tp = model.players.get(byPlayer.get(p) ?? '');
                return (
                  <Row
                    key={keyOfPlayer(p)}
                    player={p}
                    number={numberFor(p)}
                    showActive
                    peek={false}
                    first={i === act}
                    selected={false}
                    onPick={pick}
                    extra={tp && (
                      <span className="ss-extra dk-ex">
                        <em>{tp.pos}{tp.posRank}</em>
                        <span>{f1(tp.ppg)}<i>{unit}/g</i></span>
                        <span>{tp.ros.toFixed(0)}<i>ROS</i></span>
                        <span className={tp.value > 0 ? 'is-val' : 'is-zero'}>{tp.value.toFixed(0)}<i>Value</i></span>
                      </span>
                    )}
                  />
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
