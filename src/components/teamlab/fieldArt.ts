import { useEffect, useState } from 'react';
import { PRIVATE_BASE } from '@/utils/gameSprites';
import { homeUniform } from '@/components/collection/art/sprite/uniforms';

/**
 * The game's own field art for the Team Lab stadium (scripts/private_field_art.py → public/private-sprites/field/):
 * the turf with its sideline crew, the crowd and the stand front. Only in a build that has the private sprites
 * (`__PRIVATE_SPRITES__`); elsewhere every URL is null and teamlab.css draws the CSS field. The crowd and the crew
 * wear the game's key colours (the stand front its two blues), painted here to a club's home kit (jersey, trim) once per club and cached as blob URLs.
 */
const ENABLED = typeof __PRIVATE_SPRITES__ !== 'undefined' && __PRIVATE_SPRITES__;
const BASE = `${PRIVATE_BASE}field/`;

export type Turf = 'day' | 'night' | 'snow';
export interface FieldArt {
  turf: string | null;
  crowd: string | null;
  stands: string | null;
  /** The first paint is still on its way: the field waits under a loader instead of flashing the CSS turf */
  pending?: boolean;
}

const parse = (css: string): [number, number, number] => {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return [128, 128, 128];
  probe.fillStyle = '#000';
  probe.fillStyle = css;
  const v = probe.fillStyle as string;
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = v.match(/\d+/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [128, 128, 128];
};

const cache = new Map<string, Promise<string | null>>();

/** The three colours a field piece is painted with (any CSS colour): the crowd's shirts, their trim, the crew's trim */
export interface FieldPalette {
  primary: string;
  secondary: string;
  trim: string;
}
const clubPalette = (club: string): FieldPalette => {
  const kit = homeUniform(club);
  return { primary: kit.jersey, secondary: kit.trim, trim: kit.number };
};

/** One field piece with its key colours painted to a palette (blob URL), or null when it can't load. */
const painted = (file: string, id: string, palette: () => FieldPalette): Promise<string | null> => {
  const key = `${file}|${id}`;
  let job = cache.get(key);
  if (job) return job;
  job = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext('2d');
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0);
        const pal = palette();
        const prim = parse(pal.primary);
        const sec = parse(pal.secondary);
        const trim = parse(pal.trim);
        const dark = prim.map((v) => Math.round(v * 0.62)) as [number, number, number];
        const d = g.getImageData(0, 0, c.width, c.height);
        const px = d.data;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i];
          const gr = px[i + 1];
          const b = px[i + 2];
          const to =
            r === 0 && gr === 255 && b === 0
              ? prim
              : r === 255 && gr === 0 && b === 255
                ? sec
                : r === 0 && gr === 255 && b === 255
                  ? trim
                  : // the stand front's two blues: the club's primary, shaded
                    r === 45 && gr === 45 && b === 183
                    ? dark
                    : r === 0 && gr === 0 && b === 188
                      ? prim
                      : null;
          if (to) [px[i], px[i + 1], px[i + 2]] = to;
        }
        g.putImageData(d, 0, 0);
        c.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png');
      } catch {
        resolve(null);
      }
    };
    img.src = BASE + file;
  });
  cache.set(key, job);
  return job;
};

const NONE: FieldArt = { turf: null, crowd: null, stands: null };

/** The painted turf, crowd and stand front for a club (all null in a build without the private sprites). */
export const useFieldArt = (club: string, turf: Turf, tall = false): FieldArt => {
  const [art, setArt] = useState<FieldArt & { key: string }>({ ...NONE, key: '' });
  const key = `${club}|${turf}|${tall ? 1 : 0}`;
  useEffect(() => {
    if (!ENABLED) return;
    let live = true;
    const pal = () => clubPalette(club);
    Promise.all([painted(`turf-${turf}${tall ? '-tall' : ''}.png`, club, pal), painted('crowd.png', club, pal), painted('stands.png', club, pal)]).then(([t, c, s]) => {
      if (live) setArt({ turf: t, crowd: c, stands: t ? s : null, key });
    });
    return () => {
      live = false;
    };
  }, [club, turf, tall, key]);
  // keep the last club's art while the next one paints (no flash to the CSS field)
  return ENABLED ? (art.key ? art : { ...art, pending: true }) : NONE;
};

/**
 * The same field painted to any palette (a college's colours on the College tab's school page): `id` names the palette
 * for the cache. Null pieces in a build without the private sprites.
 */
export const useFieldArtPalette = (id: string, palette: FieldPalette | null, turf: Turf, tall = false): FieldArt => {
  const [art, setArt] = useState<FieldArt & { key: string }>({ ...NONE, key: '' });
  const key = `${id}|${turf}|${tall ? 1 : 0}`;
  const p = palette ? `${palette.primary}|${palette.secondary}|${palette.trim}` : '';
  useEffect(() => {
    if (!ENABLED || !palette) return;
    let live = true;
    const pal = () => palette;
    const pid = `pal:${p}`;
    Promise.all([painted(`turf-${turf}${tall ? '-tall' : ''}.png`, pid, pal), painted('crowd.png', pid, pal), painted('stands.png', pid, pal)]).then(([t, c, s]) => {
      if (live) setArt({ turf: t, crowd: c, stands: t ? s : null, key });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, turf, tall, key]);
  return ENABLED ? (art.key === key ? art : { ...art, pending: true }) : NONE;
};

export const FIELD_ART = ENABLED;
