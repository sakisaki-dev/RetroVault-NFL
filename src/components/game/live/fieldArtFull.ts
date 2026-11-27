import { useEffect, useState } from 'react';
import { clubPlate } from '@/components/arcade';
import { FIELD_ART } from '@/components/teamlab/fieldArt';
import { findNFLTeam } from '@/utils/nflTeams';

/**
 * The live view's field: Retro Bowl's own full field (scripts/private_field_art.py → field-full-<turf>.png, 1300 × 237,
 * both end zones), painted the way the game paints it at runtime (owner: "the game files have a real field with endzone
 * designs, use that"): each end zone the game's own texture tinted to its club and the club's name in white
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

/** A loaded image, or null when it can't load (a club without a wordmark file keeps its name in pixel type) */
const loadImg = async (src: string): Promise<HTMLImageElement | null> => {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
    return img;
  } catch {
    return null;
  }
};

/** Relative luminance of an RGB triple (WCAG) */
const lum = ([r, g, b]: number[]) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/**
 * One end zone as the club paints it (owner: "use the official nfl endzone designs"): the club's colour over the game's
 * grass grain (the grey spr_endzone texture, multiplied), and the club's official wordmark (public/data/nfl/wordmarks,
 * scripts/nfl/fetch_wordmarks.py) running along the zone toward the field. A wordmark too close to its own end zone
 * colour (navy on navy, black on black) is drawn as a white silhouette with a shadow, as many real end zones do.
 */
const paintZone = (x: CanvasRenderingContext2D, tex: HTMLImageElement, mark: HTMLImageElement | null, [a]: [number, number], club: string, name: string, left: boolean) => {
  const team = findNFLTeam(club);
  const colour = team ? `hsl(${team.primaryColor})` : 'hsl(220 30% 30%)';
  const w = tex.naturalWidth;
  const h = tex.naturalHeight;
  const t = document.createElement('canvas');
  t.width = w;
  t.height = h;
  const tx = t.getContext('2d', { willReadFrequently: true })!;
  tx.imageSmoothingEnabled = false;
  tx.drawImage(tex, 0, 0);
  tx.globalCompositeOperation = 'multiply';
  tx.fillStyle = colour;
  tx.fillRect(0, 0, w, h);
  tx.globalCompositeOperation = 'destination-in';
  tx.drawImage(tex, 0, 0);
  tx.globalCompositeOperation = 'source-over';
  const fill = Array.from(tx.getImageData(w >> 1, h >> 1, 1, 1).data.slice(0, 3));
  x.drawImage(t, a, EZ_TOP);
  x.save();
  x.translate(a + w / 2, EZ_TOP + h / 2);
  x.rotate(left ? -Math.PI / 2 : Math.PI / 2);
  if (mark) {
    // fit along the zone (its length is the zone's height) and inside its depth
    const maxL = h - 18;
    const maxT = w - 22;
    const k = Math.min(maxL / mark.naturalWidth, maxT / mark.naturalHeight);
    const mw = mark.naturalWidth * k;
    const mh = mark.naturalHeight * k;
    // the wordmark's own average colour against the fill: too close and it is drawn white
    const probe = document.createElement('canvas');
    probe.width = 48;
    probe.height = 16;
    const px = probe.getContext('2d', { willReadFrequently: true })!;
    px.drawImage(mark, 0, 0, 48, 16);
    const d = px.getImageData(0, 0, 48, 16).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    const avg = n ? [r / n, g / n, b / n] : [255, 255, 255];
    const [l1, l2] = [lum(avg), lum(fill)].sort((p, q) => q - p);
    const contrast = (l1 + 0.05) / (l2 + 0.05);
    let art: CanvasImageSource = mark;
    if (contrast < 2.2) {
      const wc = document.createElement('canvas');
      wc.width = Math.ceil(mw);
      wc.height = Math.ceil(mh);
      const wx = wc.getContext('2d')!;
      wx.drawImage(mark, 0, 0, mw, mh);
      wx.globalCompositeOperation = 'source-in';
      wx.fillStyle = '#ffffff';
      wx.fillRect(0, 0, mw, mh);
      art = wc;
    }
    x.shadowColor = 'rgba(0,0,0,0.5)';
    x.shadowOffsetX = 2;
    x.shadowOffsetY = 2;
    x.imageSmoothingEnabled = true;
    x.drawImage(art, -mw / 2, -mh / 2, mw, mh);
  } else {
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const text = name.toUpperCase();
    let size = 34;
    x.font = `${size}px Silkscreen, monospace`;
    while (x.measureText(text).width > h - 22 && size > 12) x.font = `${(size -= 2)}px Silkscreen, monospace`;
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillText(text, 3, 3);
    x.fillStyle = '#ffffff';
    x.fillText(text, 0, 0);
  }
  x.restore();
};

const build = async (away: string, awayName: string, home: string, homeName: string, turf: FieldTurf): Promise<string | null> => {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}private-sprites/field/field-full-${turf}.png`;
  const tex = new Image();
  tex.src = `${import.meta.env.BASE_URL}private-sprites/field/endzone-${turf}.png`;
  try {
    await Promise.all([img.decode(), tex.decode()]);
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
  const [ma, mh] = await Promise.all([away, home].map((c) => loadImg(`${import.meta.env.BASE_URL}data/nfl/wordmarks/${findNFLTeam(c)?.abbreviation ?? c}.png`)));
  paintZone(x, tex, ma, EZ_L, away, awayName, true);
  paintZone(x, tex, mh, EZ_R, home, homeName, false);
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
