import type { ReactNode } from 'react';
import { Reveal } from '@/components/motion/Reveal';

/**
 * The programme's section band (concept C): a flat club-colour band with the secondary as its left edge, the title in
 * Barlow Condensed and an optional note on the right. A section's band and body rise in as it scrolls into view.
 */
export const Band = ({ title, note }: { title: string; note?: ReactNode }) => (
  <header className="pg-band mo-rise">
    <h3>{title}</h3>
    {note != null && note !== '' && <em>{note}</em>}
  </header>
);

export const Section = ({ title, note, children, className }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) => (
  <Reveal as="section" className={className ? `pg-sec ${className}` : 'pg-sec'}>
    <Band title={title} note={note} />
    {children}
  </Reveal>
);

/* ---- colour: flat club colours that stay readable on every club ---- */

const rgbOf = (css: string): [number, number, number] => {
  if (css === '#fff') return [255, 255, 255];
  if (css === '#000') return [0, 0, 0];
  const m = css.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return [128, 128, 128];
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
};
const lum = (css: string) => {
  const [r, g, b] = rgbOf(css).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio between two colours (hsl(), #fff or #000) */
export const contrast = (a: string, b: string) => {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const NIGHT = 'hsl(228 45% 9%)';
/** The accent on the club fill: its secondary when it reads (3:1 or better), else the readable ink */
export const accentOn = (fill: string, edge: string, ink: string) => (contrast(fill, edge) >= 3 ? edge : ink);
/** An accent for the night page from a club colour: the colour itself when it stands off the page, else lifted toward white */
export const liftOnNight = (c: string) => {
  const r = contrast(c, NIGHT);
  return r >= 4.5 ? c : `color-mix(in srgb, ${c} ${r >= 2.5 ? 62 : 45}%, #fff)`;
};
/** The text colour on a lifted accent: dark ink when the accent is light */
export const inkOn = (c: string) => (lum(c) > 0.32 ? '#14101f' : '#fff');
