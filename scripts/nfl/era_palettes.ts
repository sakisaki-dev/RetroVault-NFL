/**
 * NFL edition: each club's famous era kit (uniforms.ts ERAS) as the neutral kit's palette, with the seasons it was
 * worn (src/config/eraKits.ts), so scripts/nfl/era.py can paint era sprites the way the site paints a club's home kit
 * (gameKitPaint.ts paletteFor): per band (jersey, pants, socks) the RGB each neutral colour becomes, plus the number
 * colour and its outline. Writes data/nfl/era_palettes.json
 * {club: {id, label, from, to, jersey: {base, shade, trim}, pants: {...}, socks: {...}, number, numberOutline}}.
 * Run by scripts/nfl/era.py when the file is missing (bundled with esbuild); rerun it after a change to either table:
 *
 *   esbuild scripts/nfl/era_palettes.ts --bundle --platform=node --alias:@=./src --outfile=node_modules/.tmp/era_palettes.cjs && node node_modules/.tmp/era_palettes.cjs
 */
import { writeFileSync } from 'node:fs';
import { ERA_SPANS } from '@/config/eraKits';
import { allEraKits, pantsBands, sleeveBands, sockBands } from '@/components/collection/art/sprite/uniforms';
import { findNFLTeam } from '@/utils/nflTeams';

type RGB = [number, number, number];
const rgb = (c: string): RGB => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c.trim().toLowerCase());
  if (!m) throw new Error(`colour ${c}`);
  const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const shade = ([r, g, b]: RGB, f: number): RGB =>
  (f >= 0 ? [r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f] : [r * (1 + f), g * (1 + f), b * (1 + f)]).map(Math.round) as RGB;

const out: Record<string, unknown> = {};
for (const { team, u } of allEraKits()) {
  const span = ERA_SPANS[team];
  if (!span) continue;
  const jersey = rgb(u.jersey);
  const pants = rgb(u.pants);
  const sleeve = sleeveBands(u).find(([c]) => c)?.[0] ?? u.trim;
  const pantsStripe = pantsBands(u)[0];
  out[findNFLTeam(team)?.name ?? team] = {
    id: u.id,
    label: u.label,
    from: span[0],
    to: span[1],
    jersey: { base: jersey, shade: shade(jersey, -0.32), trim: rgb(sleeve) },
    pants: { base: pants, shade: shade(pants, -0.3), trim: pantsStripe ? rgb(pantsStripe) : shade(pants, 0.35) },
    socks: { trim: rgb(u.socks), base: rgb(sockBands(u)[0] ?? u.socks), shade: shade(rgb(u.socks), -0.3) },
    number: rgb(u.number),
    numberOutline: rgb(u.numberOutline),
  };
}
writeFileSync('data/nfl/era_palettes.json', JSON.stringify(out, null, 1) + '\n');
console.log(`era palettes: ${Object.keys(out).join(', ')}`);
