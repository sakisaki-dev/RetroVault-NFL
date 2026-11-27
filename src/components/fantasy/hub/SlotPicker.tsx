import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import { ArcadeToggle } from '@/components/arcade';
import { useGamePool } from '@/utils/useOfficialOvr';
import { buildSearchIndex, keyOfPlayer, searchPlayers } from '@/utils/playerSearch';
import { bannerTeamOf } from '@/utils/playerExtras';
import { projectWeek, salaryOf, type FSlot } from '@/utils/nflFantasy';
import { NFL_TEAMS } from '@/utils/nflTeams';
import { searchTeams } from '@/utils/teamSearch';
import type { FantasyHub } from './useFantasyHub';
import { f1, isBenchId } from './useFantasyHub';

const FIXED = 300; // px: the list's height, never shrinks as results thin out
const MARGIN = 8;
const MIN_LIST = 120;
const LIMIT = 40;

/** Bottom edge of whatever is stuck over the top of the page (site header, tab bars): probe down the picker's column
 *  until the element under the point is no longer fixed or sticky. */
const stuckBottom = (from: HTMLElement): number => {
  const x = Math.round(from.getBoundingClientRect().left + 8);
  let bottom = 0;
  for (let y = 2; y < 260; y += 4) {
    let e = document.elementFromPoint(x, y) as HTMLElement | null;
    let stuck = false;
    while (e && e !== document.body) {
      const pos = getComputedStyle(e).position;
      if (pos === 'fixed' || pos === 'sticky') { stuck = true; bottom = Math.max(bottom, e.getBoundingClientRect().bottom); break; }
      e = e.parentElement;
    }
    if (!stuck && y > bottom + 8) break;
  }
  return bottom;
};

interface Row { key: string; pos: string; name: string; club: string; v: number; sal: number; szn?: number; onPick: () => void; current: boolean }

/** Fills one lineup slot with an inline panel directly under the slot's row (owner: "the search is supposed to be close to
 *  the point of +: when I say + Add a kicker it should open underneath the kicker section, condensing the information, and
 *  staying there"). Fixed height, the list scrolls inside; on open the page scrolls so the slot row sits near the top of
 *  the visual viewport and the list is sized to what the keyboard leaves. Players who can play the slot, best projection
 *  first; a defence for D/ST; the bench takes players (kickers included) or a defence. Rendered inside the slot's <li>. */
const SlotPicker = ({ hub, slot, onClose }: { hub: FantasyHub; slot: FSlot; onClose: () => void }) => {
  const { ctx, lab, fl, setFl, excludes, fctx, week, setF } = hub;
  const value = fl[slot.id] ?? '';
  const bench = isBenchId(slot.id);
  const [benchKind, setBenchKind] = useState<'players' | 'dst'>('players');
  const [query, setQuery] = useState('');
  const dst = slot.id === 'dst' || (bench && benchKind === 'dst');
  const { ovrMap } = useGamePool();
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [h, setH] = useState(FIXED);

  const pool = useMemo(() => {
    if (dst || !fctx) return [];
    const positions = bench ? ['QB', 'RB', 'WR', 'TE', 'K'] : (slot.positions as string[]);
    const used = new Set(Object.values(fl).filter(Boolean));
    return positions
      .flatMap((pos) => ctx.byPos.get(pos as never) ?? [])
      .filter((p) => lab?.p[p.key] && !excludes.has(p.key) && (!used.has(p.key) || p.key === value))
      .map((p) => ({ p, v: projectWeek(fctx, p.key, week) }))
      .sort((a, b) => b.v - a.v);
  }, [dst, slot, bench, ctx, lab, fl, excludes, fctx, week, value]);

  const done = (key: string) => {
    // the keyboard and the picker leave together (owner: on a phone "the search bar stays up")
    inputRef.current?.blur();
    setFl((l) => setF(l, slot.id, key));
    onClose();
  };
  // a tap on a result must not blur the search first: the keyboard would slide away, the list re-fit and the row move
  // from under the finger before the click lands, leaving the picker open with nothing picked
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    if (dst) {
      const teams = q ? searchTeams(q, 32) : [...NFL_TEAMS];
      const out = teams.map((t) => {
        const key = `DST:${t.abbreviation}`;
        return { key, pos: 'D/ST', name: t.fullName, club: t.name, v: fctx ? projectWeek(fctx, key, week) : 0, sal: lab ? salaryOf(lab, key) : 0, onPick: () => done(key), current: key === value };
      });
      return q ? out : out.sort((a, b) => b.v - a.v);
    }
    const byKey = new Map(pool.map((x) => [keyOfPlayer(x.p.player), x]));
    const toRow = (x: { p: { key: string; player: import('@/types/player').Player }; v: number }): Row => ({
      key: x.p.key, pos: x.p.player.position, name: x.p.player.name, club: bannerTeamOf(x.p.player), v: x.v,
      sal: lab ? salaryOf(lab, x.p.key) : 0, szn: ovrMap?.get(x.p.key), onPick: () => done(x.p.key), current: x.p.key === value,
    });
    if (!q) return pool.slice(0, LIMIT).map(toRow);
    const index = buildSearchIndex(pool.map((x) => x.p.player), { ovr: ovrMap });
    return searchPlayers(index, q, LIMIT).map((e) => byKey.get(e.key)).filter((x): x is NonNullable<typeof x> => !!x).map(toRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dst, query, pool, fctx, week, lab, ovrMap, value]);

  // Scroll so the slot row sits near the top of the visible viewport, then size the list to what the keyboard leaves.
  useLayoutEffect(() => {
    const el = root.current;
    const li = el?.parentElement;
    if (!el || !li) return;
    let first = true;
    const fit = () => {
      const vv = window.visualViewport;
      const vh = vv?.height ?? window.innerHeight;
      const top = vv?.offsetTop ?? 0;
      if (first) {
        first = false;
        const phone = window.innerWidth < 640;
        const want = stuckBottom(el) + (phone ? 6 : 10); // under the sticky header and tab bars
        const r = li.getBoundingClientRect();
        const over = el.getBoundingClientRect().bottom + MARGIN - (top + vh);
        if (phone || r.top < top + want || over > 0) window.scrollBy({ top: r.top - (top + want), behavior: 'auto' });
      }
      const list = el.querySelector<HTMLElement>('.fh-pick__list');
      const used = (list?.getBoundingClientRect().top ?? el.getBoundingClientRect().top) - top;
      setH(Math.round(Math.max(MIN_LIST, Math.min(FIXED, vh - used - MARGIN))));
    };
    fit();
    // the keyboard animates in after focus: re-measure as it settles
    const t = window.setTimeout(() => { first = false; fit(); }, 350);
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);
    return () => {
      window.clearTimeout(t);
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
    };
  }, [benchKind]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  const word = dst ? 'Search a defence' : `Search ${bench ? 'the bench' : slot.label}`;
  return (
    <div className="fh-pick" ref={root} role="group" aria-label={dst ? 'Pick a defence' : `Pick ${slot.label}`} onClick={(e) => e.stopPropagation()}>
      <div className="fh-pick__bar">
        <Search className="h-4 w-4" aria-hidden="true" />
        <input
          ref={inputRef}
          className="fh-pick__in"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={dst ? 'Club, city or abbreviation' : 'Name, nickname, club or city'}
          aria-label={word}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Enter' && rows[0]) rows[0].onPick(); }}
        />
        {query && <button type="button" className="fh-pick__x" aria-label="Clear the search" onClick={() => { setQuery(''); inputRef.current?.focus({ preventScroll: true }); }}><X className="h-4 w-4" aria-hidden="true" /></button>}
        <button type="button" className="fh-pick__cancel" onClick={onClose}>Cancel</button>
      </div>
      {bench && (
        <ArcadeToggle<'players' | 'dst'> fill label="Bench pick" size="sm" value={benchKind} onChange={(v) => { setBenchKind(v); setQuery(''); }} options={[{ value: 'players', label: 'Players' }, { value: 'dst', label: 'Defences' }]} />
      )}
      <div className="fh-pick__head" aria-hidden="true"><span>{query.trim() ? 'Matches' : 'Best this week'}</span><span>Proj</span><span>Sal</span><span>{dst ? '' : 'SZN'}</span></div>
      <ul className="fh-pick__list" style={{ height: h }}>
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" className="fh-pick__row" aria-current={r.current || undefined} onMouseDown={keepFocus} onClick={r.onPick}>
              <b className="fh-pick__pos">{r.pos}</b>
              <TeamLogo team={r.club} size={16} decorative backed />
              <span className="fh-pick__name">{r.name}</span>
              <span className="fh-pick__n">{f1(r.v)}</span>
              <span className="fh-pick__s">${r.sal}</span>
              <span className="fh-pick__z">{r.szn != null ? Math.round(r.szn) : ''}</span>
            </button>
          </li>
        ))}
        <li className="fh-pick__end" aria-live="polite">{rows.length ? (query.trim() ? 'No more matches' : 'Type to search the rest') : 'No matches'}</li>
      </ul>
    </div>
  );
};

export default SlotPicker;
