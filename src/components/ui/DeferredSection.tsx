import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Mounts heavy page sections only when the reader nears them. A Stats page with a 10,000-player league renders a dozen
 * big sections (scatter plots, beeswarms, full tables); building all of them up front blocked the page for seconds
 * although only the first screen is visible. Until it mounts, a placeholder holds the section's place (min height) and
 * its anchor ids, so in-page jumps (#stats/players/leaders) still land: the jump scrolls to the placeholder, which is
 * then on screen and mounts at once. Once mounted a section stays mounted.
 *
 *   <DeferredSection ids={['analytics']} minHeight={640}><AnalyticsLab …/></DeferredSection>
 *
 * `eager` mounts immediately (print, tests, a section the route names). Without IntersectionObserver it mounts at once.
 */
let io: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();
const observer = () =>
  (io ??= new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io?.unobserve(e.target);
        callbacks.get(e.target)?.();
      }),
    { rootMargin: '700px 0px' },
  ));

const DeferredSection = ({ ids, minHeight = 600, eager = false, children }: { ids: string[]; minHeight?: number; eager?: boolean; children: ReactNode }) => {
  const [on, setOn] = useState(() => eager || typeof IntersectionObserver === 'undefined');
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (on || !el) return;
    callbacks.set(el, () => setOn(true));
    observer().observe(el);
    return () => {
      observer().unobserve(el);
      callbacks.delete(el);
    };
  }, [on]);
  if (on) return <>{children}</>;
  return (
    <div ref={ref} style={{ minHeight }} aria-hidden="true" data-deferred>
      {ids.map((id, i) => (
        <span key={id} id={id} style={i === 0 ? undefined : { display: 'block' }} />
      ))}
    </div>
  );
};

export default DeferredSection;
