import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SEARCH_MIN, bestMatch, isTypeKey, matchTier, plainText, typeBuffer } from '@/utils/typeahead';
import './arcade.css';

/**
 * PixelSelect: an accessible dropdown styled as an arcade menu (replaces a native select). A button (aria-haspopup
 * listbox) opens a pixel-bordered listbox; arrows, Home, End, Enter, Space and Escape work; typing picks the best match at once ("viking" for "Minnesota Vikings", shared rules in utils/typeahead.ts) and a menu of 8+ options has a search field that takes focus, a tap outside
 * closes it, and it opens upward when there is no room below. Props: options [{value, label, hint?}], value, onChange,
 * label (accessible name), prefix? (a pixel kicker inside the button, e.g. "SEASON"), placeholder?, className?. The menu
 * is absolutely positioned under the button, so an ancestor with overflow hidden can clip it: keep it out of those.
 *
 * PixelStepper: a ◀ value ▶ stepper for a number or a year. Props: value, onChange, label, and either min/max/step or
 * values (an explicit list, e.g. the seasons played), format? (value to text), wrap?. It is a spinbutton (ArrowLeft and
 * ArrowRight, Down and Up, Home and End step it); the arrows disable at the ends.
 */
export interface SelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  text?: string;
}
export const PixelSelect = <T extends string | number>({
  options,
  value,
  onChange,
  label,
  prefix,
  placeholder = 'Select',
  className,
}: {
  options: SelectOption<T>[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  label: string;
  prefix?: ReactNode;
  placeholder?: string;
  className?: string;
}) => {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [query, setQuery] = useState('');
  const sel = options.findIndex((o) => o.value === value);
  // `active` is an index into `options` (the full list), so ids and aria-activedescendant stay stable while filtering
  const [active, setActive] = useState(Math.max(0, sel));
  const typed = useRef(typeBuffer());
  const texts = useMemo(() => options.map((o) => o.text ?? plainText(o.label)), [options]);
  const searchable = options.length >= SEARCH_MIN;
  // the options shown: all of them, or the matches for the search field (best match kind first, then list order)
  const shown = useMemo(() => {
    if (!query.trim()) return options.map((_, i) => i);
    return options
      .map((_, i) => ({ i, t: matchTier(texts[i], query) }))
      .filter((x) => x.t > 0)
      .sort((a, b) => b.t - a.t || a.i - b.i)
      .map((x) => x.i);
  }, [options, texts, query]);

  const show = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    setUp(!!r && r.bottom + (searchable ? 320 : 260) > window.innerHeight && r.top > 260);
    setActive(Math.max(0, sel));
    setQuery('');
    typed.current.reset();
    setOpen(true);
  }, [sel, searchable]);
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);
  const pick = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, close]);
  // an open long menu takes the keyboard in its search field (a tap on a phone included)
  useEffect(() => {
    if (open && searchable) search.current?.focus({ preventScroll: true });
  }, [open, searchable]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-o${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);
  // typing narrows the list: the best match leads
  useEffect(() => {
    if (open && query.trim() && shown.length) setActive(shown[0]);
  }, [open, query, shown]);

  const step = (d: 1 | -1, to?: 'first' | 'last') => {
    if (!shown.length) return;
    const at = shown.indexOf(active);
    const next = to === 'first' ? 0 : to === 'last' ? shown.length - 1 : Math.min(shown.length - 1, Math.max(0, at + d));
    setActive(shown[next]);
  };
  const onKey = (e: KeyboardEvent) => {
    const inField = e.target === search.current;
    if (!open) {
      // closed: letters pick the best match at once, the way a native select does
      if (isTypeKey(e) && !(e.key === ' ' && !typed.current.active())) {
        const hit = bestMatch(texts, typed.current.push(e.key));
        e.preventDefault();
        if (hit >= 0 && options[hit].value !== value) onChange(options[hit].value);
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'Escape') return e.preventDefault(), close();
    if (e.key === 'Tab') return close(false);
    if (e.key === 'ArrowDown') return e.preventDefault(), step(1);
    if (e.key === 'ArrowUp') return e.preventDefault(), step(-1);
    if (e.key === 'Home' && !inField) return e.preventDefault(), step(1, 'first');
    if (e.key === 'End' && !inField) return e.preventDefault(), step(1, 'last');
    if (e.key === 'Enter') return e.preventDefault(), shown.length && pick(shown.includes(active) ? active : shown[0]);
    if (e.key === ' ' && !inField) return e.preventDefault(), shown.length && pick(active);
    if (!inField && isTypeKey(e)) {
      // an open menu with no search field (a short list): letters move the highlight
      const hit = bestMatch(texts, typed.current.push(e.key));
      if (hit >= 0) setActive(hit);
    }
  };

  const cur = sel >= 0 ? options[sel] : null;
  const activeId = open && shown.includes(active) ? `${id}-o${active}` : undefined;
  return (
    <div ref={root} className={cn('ax-select', open && 'is-open', up && 'is-up', className)} onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className="ax-select__btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={searchable ? undefined : activeId}
        aria-label={label}
        onClick={() => (open ? close() : show())}
      >
        {prefix && <span className="ax-kicker">{prefix}</span>}
        <span className="ax-select__val">{cur ? cur.label : placeholder}</span>
        <span className="ax-select__caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="ax-select__menu">
          {searchable && (
            <input
              ref={search}
              type="text"
              className="ax-select__search"
              role="combobox"
              aria-expanded
              aria-controls={`${id}-list`}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label={`Search ${label}`}
              placeholder="Type to search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="ax-select__list">
            {shown.map((i) => {
              const o = options[i];
              return (
                <li
                  key={String(o.value)}
                  id={`${id}-o${i}`}
                  role="option"
                  aria-selected={i === sel}
                  className={cn('ax-select__opt', i === active && 'is-active', i === sel && 'is-sel')}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(i)}
                >
                  <span>{o.label}</span>
                  {o.hint && <span className="ax-select__hint">{o.hint}</span>}
                </li>
              );
            })}
            {!shown.length && <li className="ax-select__none" role="presentation">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
};

export const PixelStepper = ({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  values,
  format,
  wrap,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  values?: number[];
  format?: (v: number) => string;
  wrap?: boolean;
  className?: string;
}) => {
  const idx = values ? values.indexOf(value) : -1;
  const lo = values ? 0 : (min ?? -Infinity);
  const hi = values ? values.length - 1 : (max ?? Infinity);
  const pos = values ? idx : value;
  const go = (d: number) => {
    let n = pos + d * (values ? 1 : step);
    if (n < lo) n = wrap ? hi : lo;
    if (n > hi) n = wrap ? lo : hi;
    onChange(values ? values[n] : n);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), go(1));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), go(-1));
    else if (e.key === 'Home' && Number.isFinite(lo)) (e.preventDefault(), onChange(values ? values[0] : lo));
    else if (e.key === 'End' && Number.isFinite(hi)) (e.preventDefault(), onChange(values ? values[hi] : hi));
  };
  return (
    <div className={cn('ax-stepper', className)} role="group" aria-label={label}>
      <button type="button" className="ax-stepper__btn" aria-label={`${label}: previous`} disabled={!wrap && pos <= lo} onClick={() => go(-1)}>
        <span className="ax-tri ax-tri--l" aria-hidden="true" />
      </button>
      <span className="ax-stepper__val" role="spinbutton" tabIndex={0} aria-label={label} aria-valuenow={value} aria-valuemin={Number.isFinite(lo) ? (values ? values[0] : lo) : undefined} aria-valuemax={Number.isFinite(hi) ? (values ? values[hi] : hi) : undefined} onKeyDown={onKey}>
        {format ? format(value) : value}
      </span>
      <button type="button" className="ax-stepper__btn" aria-label={`${label}: next`} disabled={!wrap && pos >= hi} onClick={() => go(1)}>
        <span className="ax-tri ax-tri--r" aria-hidden="true" />
      </button>
    </div>
  );
};
export default PixelSelect;
