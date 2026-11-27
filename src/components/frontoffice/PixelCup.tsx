import type { CSSProperties } from 'react';

/**
 * The championship cup as pixel art (owner, 2026-11-18, concept A "soft 16-bit"; the trophy cabinet and the
 * screensaver's trophy room): the cabinet cup redrawn on an 18 × 28
 * grid in its exact colours, the five silver stops left to right, the star, the plinth and a club-colour band, with a
 * pixel sparkle that blinks on the rim now and then
 */
export const PIXEL_CUP = [
  "....DDDDDDDDDD....",
  ".D.DMwWWmmLLLDD.D.",
  "DmDDMwWWmmLLLDDDmD",
  "DmDDMWWWmmLLLDDDmD",
  "DmDDMWWWmsLLLDDDmD",
  "DmDDMWWWsssLLDDDmD",
  ".DmDMWWWmsLLLDDmD.",
  "..DDMWWWmmLLLDDD..",
  "...DMWWWmmLLLDD...",
  "...DMWWWmmLLLDD...",
  "....DMWWmmLLDD....",
  ".....DMWmmLDD.....",
  "......DMWmLD......",
  ".......DWLD.......",
  ".......DWLD.......",
  "......DMWmLD......",
  ".......DWLD.......",
  "....DMWWmmLLDD....",
  "...rrrrrrrrrrrr...",
  "...rPPPPPPPPPPr...",
  "...rPPPPPPPPPPr...",
  "...rBBBBBBBBBBr...",
  "...rBBBBBBBBBBr...",
  "...rPPPPPPPPPPr...",
  "...rPPPPPPPPPPr...",
  "..rppppppppppppr..",
  "..rppppppppppppr..",
  "..rrrrrrrrrrrrrr..",
];
const CUP_INK: Record<string, string> = {
  M: '#8d96a8',
  W: '#f4f7fb',
  m: '#c3cad6',
  L: '#eef1f6',
  D: '#7c8597',
  s: '#9aa3b5',
  w: '#ffffff',
  P: '#2a2f3d',
  p: '#151a24',
  r: '#3a4152',
};
/** The cup as runs of one colour per row (perf: ~4× fewer nodes than a rect per pixel; the trophy case draws many) */
const CUP_RUNS = PIXEL_CUP.flatMap((row, y) => {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  for (let x = 0; x < row.length; ) {
    const c = row[x];
    let w = 1;
    while (row[x + w] === c) w++;
    if (c !== '.') out.push({ x, y, w, c });
    x += w;
  }
  return out;
});
export const PixelCup = ({ band, className, spark }: { band: string; className?: string; spark?: number }) => (
  <svg viewBox="0 0 18 28" className={className} shapeRendering="crispEdges" aria-hidden="true">
    {CUP_RUNS.map((r) => (
      <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w + 0.02} height={1.02} fill={r.c === 'B' ? `hsl(${band})` : CUP_INK[r.c]} />
    ))}
    {spark !== undefined && (
      <g className="px-cup__spark" style={{ '--k': spark } as CSSProperties}>
        <rect x={5} y={0} width={1} height={3} fill="#fff" />
        <rect x={4} y={1} width={3} height={1} fill="#fff" />
      </g>
    )}
  </svg>
);
export default PixelCup;
