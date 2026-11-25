import { useRef, type KeyboardEvent, type ReactNode, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';
import { clubVars } from './clubInk';
import { PixelSelect } from './PixelSelect';
import './arcade.css';

/**
 * PixelChip: one chunky pixel button with a Silkscreen label. Props: pressed? (lit gold, aria-pressed), onClick,
 * icon?, children, disabled?, club? (the lit colour becomes the club's flat primary), className?.
 *
 * ArcadeToggle: a segmented control of pixel buttons, an ARIA radio group with a roving tabindex (arrows, Home and End
 * move and select). Props: options [{value, label, icon?, disabled?}], value, onChange, label (accessible name),
 * size? 'sm' | 'md', club?, wrap? (let the segments wrap to rows instead of scrolling), className?.
 * It never makes the page scroll sideways. A long list (more than 6 options, or more than 32 characters of labels) is
 * shown as a select (PixelSelect) with the current value instead of a row that scrolls; `compact` = 'never' keeps the
 * row. The select's kicker is the label when it is short.
 */
export const PixelChip = ({
  pressed,
  onClick,
  icon,
  children,
  disabled,
  club,
  className,
  ...rest
}: {
  pressed?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children?: ReactNode;
  disabled?: boolean;
  club?: string | null;
  className?: string;
  [k: string]: unknown;
}) => (
  <button
    type="button"
    {...rest}
    disabled={disabled}
    aria-pressed={pressed === undefined ? undefined : pressed}
    onClick={onClick}
    className={cn('ax-chip', pressed && 'is-on', className)}
    style={club ? clubVars(club) : undefined}
  >
    {icon}
    {children}
  </button>
);

export interface ToggleOption<T extends string | number> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}
export const ArcadeToggle = <T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  club,
  wrap,
  compact = 'auto',
  className,
}: {
  options: ToggleOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
  club?: string | null;
  wrap?: boolean;
  compact?: 'auto' | 'never' | 'always';
  className?: string;
}) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const move = (from: number, to: number) => {
    const o = options[to];
    if (!o) return;
    onChange(o.value);
    refs.current[to]?.focus();
    void from;
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const at = enabled.indexOf(i);
    let to: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = enabled[(at + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') to = enabled[0];
    else if (e.key === 'End') to = enabled[enabled.length - 1];
    if (to === undefined) return;
    e.preventDefault();
    move(i, to);
  };
  const cur = Math.max(0, options.findIndex((o) => o.value === value));
  const boxRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (wrap) return;
    const place = () => {
      const btn = refs.current[cur];
      const th = thumbRef.current;
      if (!btn || !th) return;
      // the first placement doesn't animate (no slide in from the left edge on mount)
      if (!placed.current) th.style.transition = 'none';
      th.style.width = `${btn.offsetWidth}px`;
      th.style.height = `${btn.offsetHeight}px`;
      th.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
      th.style.opacity = '1';
      if (!placed.current) {
        void th.offsetWidth;
        th.style.transition = '';
        placed.current = true;
      }
    };
    place();
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    ro.observe(box);
    refs.current.forEach((b) => b && ro.observe(b));
    return () => ro.disconnect();
  }, [cur, wrap, options.length]);
  const chars = options.reduce((n, o) => n + (typeof o.label === 'string' || typeof o.label === 'number' ? String(o.label).length : 4), 0);
  if (!wrap && compact !== 'never' && (compact === 'always' || options.length > 6 || chars > 32)) {
    return (
      <PixelSelect
        label={label}
        prefix={label.length <= 10 ? label : undefined}
        className={className}
        value={value}
        onChange={onChange}
        options={options.map((o) => ({ value: o.value, label: o.label, text: typeof o.label === 'string' ? o.label : undefined }))}
      />
    );
  }
  return (
    <div ref={boxRef} role="radiogroup" aria-label={label} className={cn('ax-toggle', `ax-toggle--${size}`, wrap && 'ax-toggle--wrap', !wrap && 'ax-toggle--slide', className)} style={club ? clubVars(club) : undefined}>
      {/* the highlight is one pill that slides to the chosen option (owner: "the pill switcher should animate the switch
          instead of snapping") */}
      {!wrap && <span ref={thumbRef} className="ax-toggle__thumb" aria-hidden="true" />}
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === cur ? 0 : -1}
            disabled={o.disabled}
            className={cn('ax-seg', on && 'is-on')}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
};
export default ArcadeToggle;
