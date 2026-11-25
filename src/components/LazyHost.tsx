import { useEffect, useRef, useState, type ComponentType } from 'react';

/**
 * A global host that nothing on screen needs at first paint (the quick search dialog, the player quick look, the pack
 * toasts, the legend exchange): its code stays out of the entry bundle and loads `delay` ms after the page mounted, or at once when something wakes it. `wake` lists window events that load it immediately; the
 * event that woke it is fired again once it is mounted, so its own listener answers it ("open the search" from the
 * header before the chunk had arrived still opens it). `wakeKey` does the same for a shortcut: return the event name to
 * replay for a key press, or null.
 */
const LazyHost = ({
  load,
  wake = [],
  wakeKey,
  delay = 7000,
}: {
  load: () => Promise<{ default: ComponentType }>;
  wake?: string[];
  wakeKey?: (e: KeyboardEvent) => string | null;
  delay?: number;
}) => {
  const [Host, setHost] = useState<ComponentType | null>(null);
  const replay = useRef<string | null>(null);
  useEffect(() => {
    let dead = false;
    let started = false;
    const go = (event?: string | null) => {
      if (event) replay.current = event;
      if (started) return;
      started = true;
      load()
        .then((m) => !dead && setHost(() => m.default))
        .catch(() => {
          started = false;
        });
    };
    const onWake = (e: Event) => go(e.type);
    const onKey = (e: KeyboardEvent) => {
      const ev = wakeKey?.(e);
      if (ev) go(ev);
    };
    wake.forEach((w) => window.addEventListener(w, onWake));
    if (wakeKey) window.addEventListener('keydown', onKey);
    // not before `delay`: on a phone's first seconds the line belongs to the page's own data and chunks
    const timer = window.setTimeout(() => go(), delay);
    return () => {
      dead = true;
      wake.forEach((w) => window.removeEventListener(w, onWake));
      if (wakeKey) window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
    // the loader and wake list are module constants at the call sites
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!Host || !replay.current) return;
    const event = replay.current;
    replay.current = null;
    window.dispatchEvent(new Event(event));
  }, [Host]);
  return Host ? <Host /> : null;
};

export default LazyHost;
