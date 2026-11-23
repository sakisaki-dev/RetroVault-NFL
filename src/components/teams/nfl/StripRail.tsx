import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * A horizontally scrolling rail for the Teams page strips: snap, arrow keys (Home / End), drag with a mouse, native
 * swipe on a touch screen, edge fades and step buttons (desktop). `start` picks the end the rail opens at.
 */
const StripRail = ({ label, start = 'begin', pickKey, children }: { label: string; start?: 'begin' | 'end'; /** change to jump back to the start */ pickKey?: string; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ l: false, r: true });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft < el.scrollWidth - el.clientWidth - 4 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = start === 'end' ? el.scrollWidth : 0;
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, pickKey]);
  // content arrives after mount (a strip loads its data): keep the opening end once the width settles
  useEffect(() => {
    const el = ref.current;
    if (!el || start !== 'end') return;
    const t = window.setTimeout(() => {
      if (el.scrollLeft < 8) el.scrollLeft = el.scrollWidth;
      measure();
    }, 350);
    return () => window.clearTimeout(t);
  }, [start, measure, children]);

  const by = (dir: -1 | 1, mult = 0.8) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * mult, behavior: 'smooth' });
  const onKey = (e: KeyboardEvent) => {
    const el = ref.current;
    if (!el || e.target !== el) return;
    if (e.key === 'ArrowRight') (el.scrollBy({ left: 160, behavior: 'smooth' }), e.preventDefault());
    else if (e.key === 'ArrowLeft') (el.scrollBy({ left: -160, behavior: 'smooth' }), e.preventDefault());
    else if (e.key === 'Home') (el.scrollTo({ left: 0, behavior: 'smooth' }), e.preventDefault());
    else if (e.key === 'End') (el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' }), e.preventDefault());
  };
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) {
      d.moved = true;
      setDragging(true);
    }
    if (d.moved) ref.current.scrollLeft = d.left - dx;
  };
  const end = () => {
    if (drag.current?.moved) window.setTimeout(() => (drag.current = null), 0);
    else drag.current = null;
    setDragging(false);
  };

  return (
    <div className="ts__scroll">
      {edge.l && <span className="ts__fade ts__fade--l" aria-hidden />}
      {edge.r && <span className="ts__fade ts__fade--r" aria-hidden />}
      <button type="button" className="ts__btn ts__btn--l" aria-label="Scroll left" disabled={!edge.l} onClick={() => by(-1)} tabIndex={-1}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" className="ts__btn ts__btn--r" aria-label="Scroll right" disabled={!edge.r} onClick={() => by(1)} tabIndex={-1}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      <div
        ref={ref}
        className={`ts__rail${dragging ? ' is-drag' : ''}`}
        role="group"
        aria-label={label}
        tabIndex={0}
        onScroll={measure}
        onKeyDown={onKey}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        onClickCapture={(e) => {
          if (drag.current?.moved) (e.stopPropagation(), e.preventDefault());
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default StripRail;
