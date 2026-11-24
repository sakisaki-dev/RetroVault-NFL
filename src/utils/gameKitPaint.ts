import { requestSpriteImage, type SpriteImage } from '@/utils/spriteLoader';
import { kitColorsOf, numberTables, sockTemplate } from '@/utils/kitColorTable';
import { homeUniform, pantsBands, sleeveBands, sockBands } from '@/components/collection/art/sprite/uniforms';

/**
 * The kit painter for the owner's private NFL Retro Bowl sprites (gameSprites.ts; loaded only on this Mac when a
 * sprite needs it). The save draws every player's neutral kit (800) on one fixed body template: the same pixels in the
 * same rows for every player and every pose, in three colours. Measured over the Y93 save's 484 neutral sprites (the
 * kit pixels agree at 90% or more between players, the rest are arm-dependent):
 *
 *   #bfbfbf  base cloth       #8f8f8f  its shading       #fbfffd  trim (shoulder caps, collar, belt, pants stripe, socks)
 *
 * Rows of the 64 x 64 frame (the body starts at row 27 whatever the head): 27-40 jersey and sleeves, 41-51 pants,
 * 52-55 socks, 56-58 shoes. Painting maps each colour by its row band into the club's home kit (uniforms.ts, the same
 * palette as the regular-game fallback): jersey, its shade and the sleeve stripe; pants, their shade and stripe;
 * socks. Skin, hair, shoes, gloves (#ffffff), the ball and outlines keep their own colours. The same pass reshapes the
 * body to his roll (`reshape`, below; src/config/bodyTypes.ts). No art lives here.
 */

const BASE = 0xbfbfbf;
const SHADE = 0x8f8f8f;
const TRIM = 0xfbfffd;
const BODY_TOP = 27;
const PANTS_TOP = 41;
// The socks begin at row 49 (stripe rows 49-53, the bottoms beside the shoes to row 58); measured over the neutral kits
const SOCKS_TOP = 49;
const SHOES_TOP = 59;

type RGB = [number, number, number];

/** A CSS colour (#rgb, #rrggbb, rgb(), hsl() with space or comma separators) without a canvas: Node scripts. */
const parseCss = (c: string): RGB | null => {
  const s = c.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const nums = (s.match(/-?[\d.]+/g) ?? []).map(Number);
  if (s.startsWith('rgb') && nums.length >= 3) return [nums[0], nums[1], nums[2]].map(Math.round) as RGB;
  if (s.startsWith('hsl') && nums.length >= 3) {
    const [h, sat, l] = [nums[0], nums[1] / 100, nums[2] / 100];
    const k = (n: number) => (n + h / 30) % 12;
    const a = sat * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as RGB;
  }
  return null;
};

let probe: CanvasRenderingContext2D | null = null;
const rgbOf = (c: string): RGB => {
  if (typeof document === 'undefined') return parseCss(c) ?? [128, 128, 128];
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe) return [128, 128, 128];
  probe.fillStyle = '#808080';
  probe.fillStyle = c;
  const v = String(probe.fillStyle);
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = v.match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
};
const shade = ([r, g, b]: RGB, f: number): RGB =>
  (f >= 0 ? [r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f] : [r * (1 + f), g * (1 + f), b * (1 + f)]).map(Math.round) as RGB;

/**
 * A club's neutral-kit palette: per band (jersey, pants, socks) the three neutral colours (as 0xRRGGBB) and the RGB
 * each becomes. Exported for scripts/kit_palettes.ts, which hands it to the widget's sprite builder
 * (scripts/widget_sprites.py), so the widget paints exactly like the site.
 */
export const paletteFor = (team: string) => {
  if (team === 'Training') {
    // the neutral dark training kit: charcoal jersey, grey pants and socks
    const c = (r: number, g: number, b: number): RGB => [r, g, b];
    return {
      jersey: { [BASE]: c(52, 56, 66), [SHADE]: c(34, 37, 45), [TRIM]: c(150, 156, 170) } as Record<number, RGB>,
      pants: { [BASE]: c(122, 127, 140), [SHADE]: c(92, 97, 108), [TRIM]: c(150, 156, 170) } as Record<number, RGB>,
      socks: { [BASE]: c(92, 97, 108), [SHADE]: c(60, 64, 74), [TRIM]: c(150, 156, 170) } as Record<number, RGB>,
    };
  }
  const u = homeUniform(team);
  const jersey = rgbOf(u.jersey);
  const pants = rgbOf(u.pants);
  const sleeve = sleeveBands(u).find(([c]) => c)?.[0] ?? u.trim;
  const pantsStripe = pantsBands(u)[0];
  return {
    jersey: { [BASE]: jersey, [SHADE]: shade(jersey, -0.32), [TRIM]: rgbOf(sleeve) } as Record<number, RGB>,
    pants: { [BASE]: pants, [SHADE]: shade(pants, -0.3), [TRIM]: pantsStripe ? rgbOf(pantsStripe) : shade(pants, 0.35) } as Record<number, RGB>,
    socks: { [TRIM]: rgbOf(u.socks), [BASE]: rgbOf(sockBands(u)[0] ?? u.socks), [SHADE]: shade(rgbOf(u.socks), -0.3) } as Record<number, RGB>,
  };
};

/** Paints the neutral kit's three colours, row band by row band, into `team`'s home kit (in place). */
const paintPixels = (px: Uint8ClampedArray, w: number, h: number, team: string) => {
  const pal = paletteFor(team);
  for (let y = BODY_TOP; y < Math.min(SHOES_TOP, h); y++) {
    const band = y < PANTS_TOP ? pal.jersey : y < SOCKS_TOP ? pal.pants : pal.socks;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 255) continue;
      const to = band[(px[i] << 16) | (px[i + 1] << 8) | px[i + 2]];
      if (to) [px[i], px[i + 1], px[i + 2]] = to;
    }
  }
};

const CLASS_KEY: [number, string][] = [[BASE, 'base'], [SHADE, 'shade'], [TRIM, 'trim']];

/**
 * Repaints a file the save drew in `from`'s own kit into `team`'s home kit (in place): each colour that file's club
 * wears in a band (kitColors: what the neutral colours became in the save's real kit files) becomes what the neutral
 * colour becomes in `team`'s palette (paintPixels). Skin, hair, gloves, shoes and the number keep their colours.
 */
const repaintPixels = (px: Uint8ClampedArray, w: number, h: number, from: string, team: string, pose = 1) => {
  const src = kitColorsOf(from);
  if (!src) return;
  const pal = paletteFor(team);
  const bands: [string, Record<number, RGB>, number, number][] = [
    ['jersey', pal.jersey, BODY_TOP, PANTS_TOP],
    ['pants', pal.pants, PANTS_TOP, SOCKS_TOP],
  ];
  // the socks by the neutral kit's class template (stripe rows and all), never by their old colours
  const tpl = sockTemplate(pose);
  if (tpl) {
    for (let y = SOCKS_TOP; y < Math.min(SHOES_TOP, h); y++) {
      const row = tpl[y - SOCKS_TOP] ?? '';
      for (let x = 0; x < w; x++) {
        const cls = row[x] === 'b' ? BASE : row[x] === 's' ? SHADE : row[x] === 't' ? TRIM : 0;
        const i = (y * w + x) * 4;
        if (cls && px[i + 3] === 255) [px[i], px[i + 1], px[i + 2]] = pal.socks[cls];
      }
    }
  }
  for (const [band, to, y0, y1] of bands) {
    const map = new Map<number, RGB>();
    for (const [cls, name] of CLASS_KEY) {
      const c = src[band]?.[name];
      const t = to[cls];
      if (c && t && !map.has((c[0] << 16) | (c[1] << 8) | c[2])) map.set((c[0] << 16) | (c[1] << 8) | c[2], t);
    }
    // the jersey's outer outline is drawn in the club's accent (kitColors `side`): the target's sleeve stripe colour
    const side = src[band]?.side;
    if (side && band === 'jersey' && to[TRIM]) {
      const k = (side[0] << 16) | (side[1] << 8) | side[2];
      if (!map.has(k)) map.set(k, to[TRIM]);
    }
    // sleeves and other cloth shades the neutral template has no class for: a colour near the club's base or shade
    // (RGB distance under 36, so never a skin tone) takes the target's base or shade scaled by the same brightness
    const near: { c: RGB; t: RGB }[] = [];
    for (const [cls, name] of CLASS_KEY.slice(0, 2)) {
      const c = src[band]?.[name];
      if (c && to[cls]) near.push({ c, t: to[cls] });
    }
    const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] + 1;
    for (let y = y0; y < Math.min(y1, h); y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (px[i + 3] < 255) continue;
        const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
        let t = map.get(key);
        if (!t) {
          let best = 36 * 36;
          for (const n of near) {
            const d = (px[i] - n.c[0]) ** 2 + (px[i + 1] - n.c[1]) ** 2 + (px[i + 2] - n.c[2]) ** 2;
            if (d < best) {
              best = d;
              const k = Math.min(1.6, Math.max(0.5, lum([px[i], px[i + 1], px[i + 2]]) / lum(n.c)));
              t = n.t.map((v) => Math.min(255, Math.round(v * k))) as RGB;
            }
          }
        }
        if (t) [px[i], px[i + 1], px[i + 2]] = t;
      }
    }
  }
};

/**
 * JERSEY NUMBER (NFL edition; scripts/nfl/jersey_numbers.py learned the font from the save's own sprites): the number
 * baked into a kit file is the one he wore at that club (a file repainted into another club's kit keeps the old
 * club's), so it is erased (every number-colour pixel on the chest, the band accent in rows 34-35) and his real number
 * drawn in the game's font, in the club's number colour, only on pixels that are jersey (a ball or arm in front of the
 * chest stays in front). Glyphs 6 x 7 from row 33; a lone digit at x 29, two at 26 and 31; band rows 34-35 take the
 * band's accent colour.
 */
const NUM_SLOT_X: Record<string, number> = { one: 29, left: 26, right: 31 };
const numberize = (px: Uint8ClampedArray, w: number, h: number, number: number, club: string, fileClub?: string): number | undefined => {
  const t = numberTables();
  if (!t || h < 40 || w < 38) return;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const key = (x: number, y: number) => (px[at(x, y)] << 16) | (px[at(x, y) + 1] << 8) | px[at(x, y) + 2];
  const vote = (cells: number[]) => {
    const c = new Map<number, number>();
    cells.forEach((k) => c.set(k, (c.get(k) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const solid = (x: number, y: number) => px[at(x, y) + 3] === 255;
  const chest: number[] = [];
  for (let y = 36; y < 40; y++) for (let x = 26; x < 38; x++) if (solid(x, y)) chest.push(key(x, y));
  const jersey = vote(chest)[0];
  if (jersey === undefined) return;
  const edges = new Set<number>();
  for (let y = 36; y < 40; y++) for (const x of [25, 26, 37, 38]) if (solid(x, y)) edges.add(key(x, y));
  const inner: number[] = [];
  for (let y = 36; y < 40; y++) for (let x = 27; x < 37; x++) if (solid(x, y) && !edges.has(key(x, y)) && key(x, y) !== jersey) inner.push(key(x, y));
  // a ball or an arm across the chest (poses 3-5) can out-vote a thin number, so the number colour the kit file was drawn in
  // is the club's own (numberKit) when it is on the chest; the vote is the fallback (a painted neutral, an unknown club)
  const kitFile = fileClub ? t.kit[fileClub]?.nc : undefined;
  const kitKey = kitFile ? (kitFile[0] << 16) | (kitFile[1] << 8) | kitFile[2] : undefined;
  const fileNc = kitKey !== undefined && kitKey !== jersey && chest.some((k) => k === kitKey) ? kitKey : vote(inner)[0];
  const bg: Record<number, number> = {};
  const accOf: Record<number, number | undefined> = {};
  for (const y of [34, 35]) {
    const row: number[] = [];
    for (let x = 27; x < 37; x++) if (solid(x, y)) row.push(key(x, y));
    const v = vote(row);
    bg[y] = v[0];
    accOf[y] = v.find((k) => k !== v[0]);
  }
  // erase
  for (let y = 33; y < 40; y++) {
    for (let x = 26; x < 38; x++) {
      if (!solid(x, y)) continue;
      const k = key(x, y);
      const band = y === 34 || y === 35;
      const to = band ? (accOf[y] !== undefined && k === accOf[y] ? bg[y] : undefined) : fileNc !== undefined && k === fileNc ? jersey : undefined;
      if (to !== undefined) [px[at(x, y)], px[at(x, y) + 1], px[at(x, y) + 2]] = [(to >> 16) & 255, (to >> 8) & 255, to & 255];
    }
  }
  const kit = t.kit[club];
  const nc: RGB = kit?.nc ?? (fileNc !== undefined ? [(fileNc >> 16) & 255, (fileNc >> 8) & 255, fileNc & 255] : [255, 255, 255]);
  const acc0: RGB = kit?.acc ?? nc;
  // a number that would vanish on the jersey the club wears (white on the Cowboys' white) takes the club's own dark
  // colour, as the real jerseys do (navy on white)
  const lumOf = (c: RGB) => {
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const contrast = (a: RGB, b: RGB) => (Math.max(lumOf(a), lumOf(b)) + 0.05) / (Math.min(lumOf(a), lumOf(b)) + 0.05);
  const jerseyRgb: RGB = [(jersey >> 16) & 255, (jersey >> 8) & 255, jersey & 255];
  const u = homeUniform(club);
  const readable = (c: RGB, bgc: RGB): RGB => {
    if (contrast(c, bgc) >= 3) return c;
    const cands = [kit?.acc, rgbOf(u.pants), rgbOf(u.socks), rgbOf(u.trim), [0, 0, 0] as RGB, [255, 255, 255] as RGB].filter(Boolean) as RGB[];
    return cands.find((x) => contrast(x, bgc) >= 3) ?? c;
  };
  const nc2 = readable(nc, jerseyRgb);
  const bg34 = bg[34] !== undefined ? ([(bg[34] >> 16) & 255, (bg[34] >> 8) & 255, bg[34] & 255] as RGB) : jerseyRgb;
  const acc: RGB = readable(nc2 === nc ? acc0 : nc2, bg34);
  const s = String(number);
  s.split('').forEach((d, i) => {
    const slot = s.length === 1 ? 'one' : i === 0 ? 'left' : 'right';
    const g = t.font[`${d}|${slot}`] ?? t.font[`${d}|${slot === 'left' ? 'right' : 'left'}`] ?? t.font[`${d}|one`] ?? t.font[`${d}|right`] ?? t.font[`${d}|left`];
    if (!g) return;
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 6; gx++) {
        if (g[gy][gx] !== '#') continue;
        const x = NUM_SLOT_X[slot] + gx;
        const y = 33 + gy;
        if (!solid(x, y)) continue;
        const band = y === 34 || y === 35;
        if (key(x, y) !== (band ? bg[y] : jersey)) continue;
        [px[at(x, y)], px[at(x, y) + 1], px[at(x, y) + 2]] = band ? acc : nc2;
      }
    }
  });
  return (nc2[0] << 16) | (nc2[1] << 8) | nc2[2];
};

/**
 * BODY RESHAPE (src/config/bodyTypes.ts rolls it): whole pixel rows and columns are repeated or dropped, never scaled,
 * so the sprite stays pixel-perfect. Every save sprite is drawn on one body template (all five poses, every kit, the
 * stand-ins), measured from his feet row `foot` (58) and centre line `cx` (31.5):
 *
 *   height  rows repeated (tall) or dropped (short), in this order: a thigh row (foot - 8, row 50), a chest row below
 *           the shoulders (foot - 27, row 31), a sock row (foot - 5, row 53). Everything above moves up or down as one
 *           piece, the head untouched; the feet stay on their row, so the baseline holds.
 *   build   one column a side repeated (broad) or dropped (lean), mirrored about the centre. Down to the shoulders
 *           (rows 0-33) columns cx - 8.5 and cx + 7.5 (23 and 39: just outside the head and long hair, inside the
 *           shoulder caps, so the shoulders, a raised arm or a ball move out while the head stays whole); in the
 *           chest and hips (rows 34-48, centred on column 31) cx - 5.5 and cx + 4.5 (26 and 36: inside the jersey, so
 *           the arms and hands move out with it); in the legs and shoes (rows 49 down, centred on 31.5) 26 and 37
 *           (inside each leg: thicker legs).
 *
 * The centre line and feet row don't move, so the anchors stay right and GameSprite's centring rules hold.
 */
const reshape = (src: Uint32Array, w: number, h: number, cx: number, foot: number, rows: number, cols: number): Uint32Array => {
  let cur = src;
  if (cols) {
    const out = new Uint32Array(w * h);
    const head = foot - 24;
    const legs = foot - 9;
    for (let y = 0; y < h; y++) {
      const [L, R] = y < head ? [cx - 8.5, cx + 7.5] : y < legs ? [cx - 5.5, cx + 4.5] : [cx - 5.5, cx + 5.5];
      for (let x = 0; x < w; x++) {
        let ox = x;
        if (x <= L) ox = cols > 0 ? Math.min(x + cols, L) : x + cols;
        else if (x >= R) ox = cols > 0 ? Math.max(x - cols, R) : x - cols;
        out[y * w + x] = ox >= 0 && ox < w ? cur[y * w + ox] : 0;
      }
    }
    cur = out;
  }
  if (rows) {
    const order = [foot - 8, foot - 27, foot - 5].slice(0, Math.abs(rows));
    const list: number[] = [];
    for (let y = 0; y < h; y++) {
      if (rows < 0 && order.includes(y)) continue;
      list.push(y);
      if (rows > 0 && order.includes(y)) list.push(y);
    }
    // keep the bottom (the feet) where it was: trim the empty top, or pad it
    while (list.length > h) list.shift();
    while (list.length < h) list.unshift(-1);
    const out = new Uint32Array(w * h);
    list.forEach((sy, y) => {
      if (sy >= 0) out.set(cur.subarray(sy * w, sy * w + w), y * w);
    });
    cur = out;
  }
  return cur;
};

/**
 * A coach's or coordinator's polo (gameSprites.ts coachSpriteFor): the game draws a club polo as his white neutral
 * sprite multiplied by one club colour on his outfit pixels (`mask`: 64 rows of 16 hex digits, bit 63 - x = column x;
 * scripts/private_nfl_sprites.py checked the rule over every staff file in the save). In place.
 */
const paintPolo = (px: Uint8ClampedArray, w: number, h: number, color: string, mask: string[]) => {
  const [r, g, b] = rgbOf(color);
  for (let y = 0; y < Math.min(h, mask.length); y++) {
    const row = (mask[y] || '').padStart(16, '0');
    const hi = parseInt(row.slice(0, 8), 16) || 0;
    const lo = parseInt(row.slice(8), 16) || 0;
    if (!hi && !lo) continue;
    for (let x = 0; x < Math.min(w, 64); x++) {
      if (!((x < 32 ? hi >>> (31 - x) : lo >>> (63 - x)) & 1)) continue;
      const i = (y * w + x) * 4;
      px[i] = (r * px[i]) / 255;
      px[i + 1] = (g * px[i + 1]) / 255;
      px[i + 2] = (b * px[i + 2]) / 255;
    }
  }
};

/**
 * NFL edition SILHOUETTE (the runtime twin of scripts/nfl/silhouettes.py, for a player the sprite index has no entry for):
 * the head (rows above 27, columns 16-47) is replaced by the outline of a game face template (`head`: its alpha), blacked out
 * in a club-tinted near-black with a 1px light rim, no features; bare skin below the neck is blacked out too. The kit and
 * number are already painted. Owner: never a random face.
 */
const silhouetteize = (px: Uint8ClampedArray, w: number, h: number, head: Uint8ClampedArray, training: boolean) => {
  if (w < 48 || h < 40) return;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const skinish = (r: number, g: number, b: number) => r > b + 20 && r > 60 && r + g + b < 600;
  const cnt = new Map<number, number>();
  for (let y = 8; y < 29; y++)
    for (let x = 20; x < 44; x++) {
      const i = at(x, y);
      if (px[i + 3] && skinish(px[i], px[i + 1], px[i + 2])) {
        const k = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
        cnt.set(k, (cnt.get(k) ?? 0) + 1);
      }
    }
  const skin = new Set([...cnt].filter(([, n]) => n >= 3).map(([k]) => k));
  const votes = new Map<number, number>();
  for (let y = 36; y < 40; y++)
    for (let x = 26; x < 38; x++) {
      const i = at(x, y);
      if (px[i + 3] === 255) votes.set((px[i] << 16) | (px[i + 1] << 8) | px[i + 2], (votes.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]) ?? 0) + 1);
    }
  const jk = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0x283c64;
  const j: RGB = [(jk >> 16) & 255, (jk >> 8) & 255, jk & 255];
  const night: RGB = training ? [38, 40, 48] : [Math.floor(j[0] * 0.22 + 8), Math.floor(j[1] * 0.22 + 8), Math.floor(j[2] * 0.22 + 8)];
  const rim: RGB = training ? [150, 156, 175] : [Math.min(255, Math.floor(j[0] * 0.45 + 120)), Math.min(255, Math.floor(j[1] * 0.45 + 120)), Math.min(255, Math.floor(j[2] * 0.45 + 120))];
  for (let y = 0; y < 27; y++) for (let x = 16; x < 48; x++) px[at(x, y) + 3] = 0;
  const on = (x: number, y: number) => y >= 0 && y < 27 && x >= 16 && x < 48 && head[y * 32 + (x - 16)] > 0;
  for (let y = 0; y < 27; y++)
    for (let x = 16; x < 48; x++) {
      if (!on(x, y)) continue;
      const edge = !on(x, y - 1) || !on(x - 1, y) || !on(x + 1, y);
      const c = edge ? rim : night;
      const i = at(x, y);
      [px[i], px[i + 1], px[i + 2], px[i + 3]] = [c[0], c[1], c[2], 255];
    }
  for (let y = 27; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (px[i + 3] && skin.has((px[i] << 16) | (px[i + 1] << 8) | px[i + 2])) [px[i], px[i + 1], px[i + 2]] = night;
    }
};

/**
 * MIRROR a sprite left to right (a home-side figure that faces the other way) WITHOUT reversing his number: the whole image
 * is flipped about the centre line (x -> w - 1 - x), then the chest's number window (rows 33-39, columns 26-37: it maps onto
 * itself, so it is the same cells) is put back the way the file drew it, so the digits still read left to right. The number
 * ink is the chest's number colour (the club's kit colour when the file's kit is known, else the vote) and, in the band rows
 * 34-35, its accent; a ball or an arm in front of the chest in the flipped image keeps its place.
 */
const mirrorKeepNumber = (px: Uint8ClampedArray, w: number, h: number, inkHint?: number) => {
  const src = px.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = (y * w + x) * 4;
    const b = (y * w + (w - 1 - x)) * 4;
    px[a] = src[b]; px[a + 1] = src[b + 1]; px[a + 2] = src[b + 2]; px[a + 3] = src[b + 3];
  }
  if (h < 40 || w < 38 || w !== 64) return;
  const key = (d: Uint8ClampedArray, x: number, y: number) => (d[(y * w + x) * 4] << 16) | (d[(y * w + x) * 4 + 1] << 8) | d[(y * w + x) * 4 + 2];
  const solid = (d: Uint8ClampedArray, x: number, y: number) => d[(y * w + x) * 4 + 3] === 255;
  const vote = (d: Uint8ClampedArray, cells: [number, number][]) => {
    const c = new Map<number, number>();
    cells.forEach(([x, y]) => solid(d, x, y) && c.set(key(d, x, y), (c.get(key(d, x, y)) ?? 0) + 1));
    return [...c.entries()].sort((p, q) => q[1] - p[1]).map(([k]) => k);
  };
  const cells = (ys: number[], x0: number, x1: number) => ys.flatMap((y) => Array.from({ length: x1 - x0 }, (_, i) => [x0 + i, y] as [number, number]));
  const jersey = vote(src, cells([36, 37, 38, 39], 26, 38))[0];
  if (jersey === undefined) return;
  const kk = inkHint;
  const edges = new Set<number>();
  for (let y = 36; y < 40; y++) for (const x of [25, 26, 37, 38]) if (solid(src, x, y)) edges.add(key(src, x, y));
  const inner = vote(src, cells([36, 37, 38, 39], 27, 37)).filter((k) => !edges.has(k) && k !== jersey);
  const nc = kk !== undefined && kk !== jersey && inner.includes(kk) ? kk : inner[0];
  const bg: Record<number, number> = {};
  const acc: Record<number, number | undefined> = {};
  for (const y of [34, 35]) {
    const v = vote(src, cells([y], 27, 37));
    bg[y] = v[0];
    acc[y] = v.find((k) => k !== v[0]);
  }
  const inkOf = (d: Uint8ClampedArray, x: number, y: number) => {
    if (!solid(d, x, y)) return false;
    const k = key(d, x, y);
    return y === 34 || y === 35 ? acc[y] !== undefined && k === acc[y] : nc !== undefined && k === nc;
  };
  const put = (x: number, y: number, k: number) => {
    const a = (y * w + x) * 4;
    px[a] = (k >> 16) & 255; px[a + 1] = (k >> 8) & 255; px[a + 2] = k & 255;
  };
  for (let y = 33; y < 40; y++) for (let x = 26; x < 38; x++) if (inkOf(px, x, y)) put(x, y, y === 34 || y === 35 ? bg[y] : jersey);
  for (let y = 33; y < 40; y++) for (let x = 26; x < 38; x++) {
    if (!inkOf(src, x, y)) continue;
    const a = (y * w + x) * 4;
    px[a] = src[a]; px[a + 1] = src[a + 1]; px[a + 2] = src[a + 2]; px[a + 3] = src[a + 3];
  }
};

export interface SpriteJob {
  /** NFL edition: draw the figure as a silhouette with this game face template's head outline (a file URL; silhouetteize) */
  silhouette?: string;
  /** Paint the neutral kit into this club's home kit */
  paint?: string;
  /** Paint a coach's white polo: a CSS colour and his outfit mask (paintPolo) */
  polo?: { color: string; mask: string[] };
  /** NFL edition: draw this jersey number in the game's font, in this club's number colours (numberize) */
  number?: number;
  numberClub?: string;
  /** Rows added (+) / removed (-) and columns a side (bodyTypes.ts BodyRoll) */
  rows?: number;
  cols?: number;
  /** The club kit the file is drawn in (its number colour reads the number when a mirror puts it back) */
  kit?: string;
  /** Mirror the figure left to right (a home side facing the other way); his number still reads the right way round */
  flip?: boolean;
  /** The figure's centre line and feet row (index anchors) */
  cx?: number;
  foot?: number;
}

interface Slot {
  promise: Promise<string>;
  /** callers holding it (a sprite on screen); a slot nobody holds and still waiting for its files is dropped */
  refs: number;
  settled: boolean;
  loads: Array<() => void>;
}
const cache = new Map<string, Slot>();
/** Most processed sprites kept (a formation, search and the Record Book stay well under it). */
const CACHE_MAX = 600;

/**
 * The sprite at `src` painted (job.paint) and reshaped to his body (job.rows, job.cols), as a data URL, cached per
 * sprite file x club x body (so per player key x kit x pose). Returns `src` itself when there is nothing to do.
 */
export const processSprite = (src: string, job: SpriteJob = {}): Promise<string> => {
  const slot = slotFor(src, job);
  if (!slot) return Promise.resolve(src);
  slot.refs++; // never released: a caller that is not a mounted sprite keeps the result
  return slot.promise;
};

/**
 * Same as processSprite, for a sprite on screen: `release()` when it unmounts or changes. A job still waiting for its
 * files (the row was typed past, scrolled away) is then dropped before it loads (spriteLoader.ts), so what is on screen
 * now is loaded first.
 */
export const processSpriteHeld = (src: string, job: SpriteJob = {}): { promise: Promise<string>; release: () => void } => {
  const slot = slotFor(src, job);
  if (!slot) return { promise: Promise.resolve(src), release: () => undefined };
  slot.refs++;
  let released = false;
  return {
    promise: slot.promise,
    release: () => {
      if (released) return;
      released = true;
      if (--slot.refs > 0 || slot.settled) return;
      for (const [k, v] of cache) if (v === slot) cache.delete(k);
      slot.loads.forEach((r) => r());
    },
  };
};

const sizeOf = (i: SpriteImage) => ('naturalWidth' in i ? [i.naturalWidth, i.naturalHeight] : [i.width, i.height]);

const slotFor = (src: string, job: SpriteJob): Slot | null => {
  const rows = job.rows ?? 0;
  const cols = job.cols ?? 0;
  const num = job.number !== undefined && job.numberClub ? job.number : undefined;
  if (!job.paint && !job.polo && !rows && !cols && num === undefined && !job.silhouette && !job.flip) return null;
  const key = `${src}|${job.paint ?? ''}|${job.polo?.color ?? ''}|${rows},${cols}|${num ?? ''}|${job.silhouette ?? ''}|${job.flip ? `f${job.kit ?? ''}` : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const reqs = [requestSpriteImage(src), job.silhouette ? requestSpriteImage(job.silhouette) : null];
  const job2 = Promise.all(reqs.map((r) => r?.promise ?? null)).then(([img, headImg]) => {
    if (!img) return src;
    const c = document.createElement('canvas');
    const [iw, ih] = sizeOf(img);
    const w = (c.width = iw);
    const h = (c.height = ih);
    const ctx = c.getContext('2d');
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    if (job.paint) {
      // "Vikings<Falcons": his file is the Falcons kit, shown in the Vikings' (repaintPixels); plain "Vikings": a neutral
      const [to, from] = job.paint.split('<');
      if (from) repaintPixels(data.data, w, h, from, to, Number(/_p(\d)\.png/.exec(src)?.[1] ?? 1));
      else paintPixels(data.data, w, h, to);
    }
    let inkHint: number | undefined;
    if (num !== undefined) inkHint = numberize(data.data, w, h, num, job.numberClub!, job.paint?.split('<')[1]);
    if (job.silhouette && headImg) {
      const hc = document.createElement('canvas');
      hc.width = 64;
      hc.height = 64;
      const hx = hc.getContext('2d');
      if (hx) {
        hx.drawImage(headImg, 0, 0);
        const hd = hx.getImageData(16, 0, 32, 27).data;
        const alpha = new Uint8ClampedArray(32 * 27);
        for (let i = 0; i < alpha.length; i++) alpha[i] = hd[i * 4 + 3];
        silhouetteize(data.data, w, h, alpha, job.paint === 'Training');
      }
    }
    if (job.polo) paintPolo(data.data, w, h, job.polo.color, job.polo.mask);
    if (job.flip) {
      const kc = inkHint === undefined && job.kit ? numberTables()?.kit[job.kit]?.nc : undefined;
      mirrorKeepNumber(data.data, w, h, inkHint ?? (kc ? (kc[0] << 16) | (kc[1] << 8) | kc[2] : undefined));
    }
    if (rows || cols) {
      const shaped = reshape(new Uint32Array(data.data.buffer), w, h, job.flip ? w - 1 - (job.cx ?? 31.5) : job.cx ?? 31.5, job.foot ?? 58, rows, cols);
      data.data.set(new Uint8ClampedArray(shaped.buffer));
    }
    ctx.putImageData(data, 0, 0);
    return c.toDataURL('image/png');
  });
  const slot: Slot = { promise: job2, refs: 0, settled: false, loads: reqs.flatMap((r) => (r ? [r.release] : [])) };
  job2.then(
    () => {
      slot.settled = true;
      slot.loads.forEach((r) => r()); // the images are decoded; nothing left to cancel
    },
    () => {
      slot.settled = true;
      if (cache.get(key) === slot) cache.delete(key);
    },
  );
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, slot);
  return slot;
};

/** The neutral-kit sprite at `src` painted into `team`'s home kit, as a data URL (cached per sprite × club). */
export const paintNeutral = (src: string, team: string): Promise<string> => processSprite(src, { paint: team });
