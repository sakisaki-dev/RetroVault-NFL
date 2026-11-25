/**
 * Marks the scroller of a pinned table (.rv-pin, src/index.css) with .rv-scrolled once it has scrolled sideways, which
 * switches on the pinned column's edge shadow. One passive capture listener (scroll events don't bubble); nothing
 * is attached to the tables themselves.
 */
let on = false;
export const initPinScroll = () => {
  if (on || typeof document === 'undefined') return;
  on = true;
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || el.scrollWidth <= el.clientWidth) return;
      el.classList.toggle('rv-scrolled', el.scrollLeft > 1);
    },
    { capture: true, passive: true },
  );
};
