import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './arcade.css';

/**
 * LedDigits: by default the site's display numbers (Barlow Condensed, tabular; dot sets the size, 10px a dot); matrix? draws the
 * dot-matrix text on a 5 x 7 grid, lit dots over dim "off" dots (digits, - : . / % + and the letters A-Z in
 * a compact set; anything else is blank). Props: value (string | number), color 'amber' | 'red' | 'green', width? (pad
 * with blank cells on the left to this many characters, so a counter keeps its size), dot? (px per dot, default 3),
 * label? (accessible text, default the value).
 *
 * LedBoard: a screen panel with a pixel kicker and LedDigits, for scores, counts and records. Props: label (kicker),
 * value, color?, width?, dot?, sub? (small line under the digits), className?. Use where the site already runs
 * scoreboards and jumbotrons; a plain stat elsewhere should stay text.
 */
const G: Record<string, string> = {
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00110 01000 10000 11111',
  '3': '11110 00001 00001 01110 00001 00001 11110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  ':': '00000 00100 00100 00000 00100 00100 00000',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  '/': '00001 00001 00010 00100 01000 10000 10000',
  '%': '11001 11010 00010 00100 01000 01011 10011',
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001',
  X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
};
const LED: Record<string, string> = { amber: '#ffb21e', red: '#ff4a3d', green: '#3ddc84' };
const INK: Record<string, string> = { amber: 'hsl(var(--gold))', red: '#ff6b5e', green: '#4ade80' };

export const LedDigits = ({ value, color = 'amber', width, dot = 3, label, className, matrix }: { value: string | number; color?: keyof typeof LED; width?: number; dot?: number; label?: string; className?: string; matrix?: boolean }) => {
  if (!matrix) {
    return (
      <span role="img" aria-label={label ?? String(value)} className={cn('ax-num', className)} style={{ fontSize: dot * 10, color: INK[color] } as CSSProperties}>
        {String(value)}
      </span>
    );
  }
  let text = String(value).toUpperCase();
  if (width && text.length < width) text = ' '.repeat(width - text.length) + text;
  const cells = [...text];
  const step = 6; // 5 columns + 1 gap
  const W = cells.length * step - 1;
  const rects: ReactNode[] = [];
  cells.forEach((ch, ci) => {
    const rows = (G[ch] ?? '00000 00000 00000 00000 00000 00000 00000').split(' ');
    rows.forEach((row, y) =>
      [...row].forEach((bit, x) => {
        rects.push(<rect key={`${ci}-${x}-${y}`} x={ci * step + x + 0.08} y={y + 0.08} width={0.84} height={0.84} className={bit === '1' ? 'ax-led__on' : 'ax-led__off'} />);
      }),
    );
  });
  return (
    <svg
      role="img"
      aria-label={label ?? String(value)}
      viewBox={`0 0 ${W} 7`}
      width={W * dot}
      height={7 * dot}
      shapeRendering="crispEdges"
      className={cn('ax-led', className)}
      style={{ '--led': LED[color] } as CSSProperties}
    >
      {rects}
    </svg>
  );
};

export const LedBoard = ({ label, value, color = 'amber', width, dot = 3, sub, className }: { label: ReactNode; value: string | number; color?: keyof typeof LED; width?: number; dot?: number; sub?: ReactNode; className?: string }) => (
  <div className={cn('ax-ledboard', className)}>
    <span className="ax-kicker">{label}</span>
    <LedDigits value={value} color={color} width={width} dot={dot} />
    {sub && <span className="ax-ledboard__sub">{sub}</span>}
  </div>
);
export default LedBoard;
