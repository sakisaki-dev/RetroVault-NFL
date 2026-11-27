import { useEffect, useState } from 'react';
import { clubPlate } from '@/components/arcade';
import { FIELD_ART } from '@/components/teamlab/fieldArt';

/**
 * The live view's field: Retro Bowl's own full field (scripts/private_field_art.py → field-full-<turf>.png, 1300 × 237,
 * both end zones), painted the way the game paints it at runtime (owner: "the game files have a real field with endzone
 * designs, use that"): each end zone in its club's colour with a second-colour trim and the club's name in pixel type
 * (away left, home right, as the view draws them), the sideline crew's key colours in the home club's. Cropped to the
 * playing width (x 50–1250: 10 yards of end zone each side of 100, the same 1/12 the view's fx() uses). Only in a build
 * with the private sprites; elsewhere null and the CSS field stays. Cached per clubs and turf as a data URL.
 */
export type FieldTurf = 'day' | 'night' | 'snow';

const W = 1300;
const H = 237;
const X0 = 50;
const X1 = 1250;
const EZ_TOP = 33;
const EZ_BOTTOM = 201;
const EZ_L: [number, number] = [50, 149];
const EZ_R: [number, number] = [1151, 1250];
const KEYS: Record<string, 'p' | 's' | 't'> = { '0,255,0': 'p', '255,0,255': 's', '0,255,255': 't' };

/** The playing surface's rows inside the image: the view places the art so they land at 20%–92% of the field box */
export const ART_FIELD = { top: EZ_TOP, bottom: EZ_BOTTOM, height: H, width: X1 - X0 };

const cache = new Map<string, Promise<string | null>>();

const rgbOf = (css: string): [number, number, number] => {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const x = c.getContext('2d')!;
  x.fillStyle = css;
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
};

const paintZone = (x: CanvasRenderingContext2D, [a, b]: [number, number], club: string, name: string, left: boolean) => {
  const p = clubPlate(club);
  const w = b - a + 1;
  const h = EZ_BOTTOM - EZ_TOP + 1;
  x.fillStyle = p.fill;
  x.fillRect(a, EZ_TOP, w, h);
  // a second-colour trim inside the lines, like the game's painted end zones
  x.strokeStyle = p.edge;
  x.lineWidth = 3;
  x.strokeRect(a + 5.5, EZ_TOP + 5.5, w - 11, h - 11);
  // the club's name along the zone, reading toward the field from each side
  x.save();
  x.translate(a + w / 2, EZ_TOP + h / 2);
  x.rotate(left ? -Math.PI / 2 : Math.PI / 2);
  x.fillStyle = p.ink;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const text = name.toUpperCase();
  let size = 34;
  x.font = `${size}px Silkscreen, monospace`;
  while (x.measureText(text).width > h - 26 && size > 12) x.font = `${(size -= 2)}px Silkscreen, monospace`;
  x.fillStyle = 'rgba(0,0,0,0.45)';
  x.fillText(text, 2, 2);
  x.fillStyle = p.ink;
  x.fillText(text, 0, 0);
  x.restore();
};

const build = async (away: string, awayName: string, home: string, homeName: string, turf: FieldTurf): Promise<string | null> => {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}private-sprites/field/field-full-${turf}.png`;
  try {
    await img.decode();
    await document.fonts?.load?.('34px Silkscreen');
  } catch {
    return null;
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return null;
  x.imageSmoothingEnabled = false;
  x.drawImage(img, 0, 0);
  // the crew and the sideline props wear the game's key colours: the home club's
  const hp = clubPlate(home);
  const ink = { p: rgbOf(hp.fill), s: rgbOf(hp.edge), t: rgbOf('hsl(0 0% 92%)') };
  const data = x.getImageData(0, 0, W, H);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = KEYS[`${d[i]},${d[i + 1]},${d[i + 2]}`];
    if (k) [d[i], d[i + 1], d[i + 2]] = ink[k];
  }
  x.putImageData(data, 0, 0);
  paintZone(x, EZ_L, away, awayName, true);
  paintZone(x, EZ_R, home, homeName, false);
  const out = document.createElement('canvas');
  out.width = X1 - X0;
  out.height = H;
  out.getContext('2d')!.drawImage(c, X0, 0, X1 - X0, H, 0, 0, X1 - X0, H);
  return out.toDataURL('image/png');
};

/** The painted full field for a game, or null (no private sprites, or it couldn't load) */
export const useLiveFieldArt = (away: string, awayName: string, home: string, homeName: string, turf: FieldTurf): string | null => {
  const key = `${away}|${home}|${turf}`;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!FIELD_ART) return;
    let live = true;
    if (!cache.has(key)) cache.set(key, build(away, awayName, home, homeName, turf));
    void cache.get(key)!.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [key, away, awayName, home, homeName, turf]);
  return url;
};

/** Night for an evening kickoff (local 5 pm on), snow when the weather says so, else day */
export const turfFor = (kick: number, weather: string): FieldTurf => {
  if (/snow/i.test(weather)) return 'snow';
  const h = new Date(kick).getHours();
  return h >= 17 || h < 5 ? 'night' : 'day';
};
