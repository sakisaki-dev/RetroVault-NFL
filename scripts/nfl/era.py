"""NFL edition: era kits for the game's sprites, the pixel mapping shared by silhouettes.py and era_sprites.py.

A club's kit file from the save (any player's, in its modern kit) is repainted into the club's famous era kit
(src/components/collection/art/sprite/uniforms.ts ERAS, seasons in src/config/eraKits.ts; the palettes and spans come from
data/nfl/era_palettes.json, written by scripts/nfl/era_palettes.ts and rebuilt here when missing). It is the same
repaint the site runs when it draws a file in another club's kit (src/utils/gameKitPaint.ts repaintPixels, ported), with
the era's palette as the target, plus what the era kits add:
  jersey      the club's jersey cloth and shade become the era jersey and its shade
  shoulders   the accent colour of the shoulder caps (rows 27-33: not cloth, skin, white or outline) becomes the era trim
  number      erased and drawn again in the era's number colour (the band rows 34-35 take the number colour that reads on
              the era's band), his own number when it is given
  pants       the club's pants cloth, shade and side stripe become the era pants, shade and stripe
  socks       by the neutral kit's class template (index.json sockTemplate), never by the old colours
Skin, hair, gloves, wristbands, cleats and outlines keep their colours. Deterministic.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import jersey_numbers as J  # noqa: E402

PALETTES = ROOT / "data" / "nfl" / "era_palettes.json"
BASE, SHADE, TRIM = (0xBF, 0xBF, 0xBF), (0x8F, 0x8F, 0x8F), (0xFB, 0xFF, 0xFD)
CLASS = (("base", BASE), ("shade", SHADE), ("trim", TRIM))
BODY_TOP, PANTS_TOP, SOCKS_TOP, SHOES_TOP = 27, 41, 49, 59


def palettes() -> dict:
    """{club: {id, label, from, to, jersey, pants, socks, number, numberOutline}}; built with esbuild when missing."""
    if not PALETTES.exists():
        esbuild = ROOT / "node_modules" / ".bin" / "esbuild"
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "era_palettes.cjs"
            subprocess.run([str(esbuild), str(ROOT / "scripts/nfl/era_palettes.ts"), "--bundle", "--platform=node",
                            f"--alias:@={ROOT / 'src'}", f"--outfile={out}", "--log-level=error"], check=True, cwd=ROOT)
            subprocess.run(["node", str(out)], check=True, cwd=ROOT)
    return json.loads(PALETTES.read_text())


def era_window(pal: dict, club: str, stints: list[dict]):
    """The seasons of `stints` (all his stints at `club`) inside the club's era kit span: (first, last, middle) where
    middle is the middle season of his whole time with the club (the default / banner kit uses the era when it lies in
    the span), or None when none of his seasons fall inside it."""
    p = pal.get(club)
    if not p:
        return None
    seasons = sorted({s for st in stints if st["team"] == club for s in range(int(st["from"]), int(st["to"]) + 1)})
    inside = [s for s in seasons if p["from"] <= s <= p["to"]]
    if not inside:
        return None
    mid = seasons[len(seasons) // 2] if len(seasons) % 2 else seasons[len(seasons) // 2 - 1]
    return inside[0], inside[-1], p["from"] <= mid <= p["to"]


def _lum(c) -> float:
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] + 1


def _rel(c) -> float:
    f = [((v / 255) / 12.92 if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4) for v in c]
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]


def _contrast(a, b) -> float:
    la, lb = _rel(a), _rel(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def _readable(options, bg):
    for c in options:
        if _contrast(c, bg) >= 3:
            return tuple(c)
    return tuple(max(options, key=lambda c: _contrast(c, bg)))


def _skinlike(c) -> bool:
    return c[0] > c[2] + 20 and c[0] > 60 and sum(c) < 600


class Painter:
    """Repaints kit files into era kits. `ix` is the sprite index (kitColors, sockTemplate, numberFont)."""

    def __init__(self, ix: dict, pal: dict | None = None):
        self.kit = ix["kitColors"]
        self.socks = ix["sockTemplate"]
        self.font = {tuple(k.split("|")): v for k, v in ix["numberFont"].items()}
        self.pal = pal or palettes()
        J.set_kit(ix)

    def _target(self, era: dict) -> dict:
        t = {}
        for band, key in (("jersey", "jersey"), ("pants", "pants"), ("socks", "socks")):
            t[band] = {BASE: tuple(era[key]["base"]), SHADE: tuple(era[key]["shade"]), TRIM: tuple(era[key]["trim"])}
        # a pants stripe the same colour as the pants cloth would vanish: take the era's next distinct stripe, else a shade
        return t

    def paint(self, a: np.ndarray, src_club: str, era_club: str, pose: int = 1, number: int | None = None, blank: bool = False) -> np.ndarray:
        """`a`: a 64 x 64 x 4 uint8 kit file drawn in `src_club`'s kit; returns it in `era_club`'s era kit with the number
        redrawn (his `number`; with none given the file's own number stays, or nothing is drawn when `blank`)."""
        era = self.pal[era_club]
        src = self.kit.get(src_club)
        a = a.copy()
        if not src:
            return a
        tgt = self._target(era)
        jersey, nc = J.chest(a, src_club)
        band = J.band_of(a) or {}
        numcells = J.mask_of(a, nc) if nc is not None else np.zeros((64, 64), bool)
        # the number goes first: its cells become plain cloth, drawn again after the repaint
        for y, x in zip(*np.nonzero(numcells)):
            a[y, x, :3] = band[y][0] if y in band else jersey
        erased = a.copy()
        key = lambda c: (int(c[0]) << 16) | (int(c[1]) << 8) | int(c[2])  # noqa: E731
        # socks: the real kit files draw the sock in the club's colour on the template's shade cells (rows 49-51), the stripe
        # rows (trim cells) in the club's accent and white, and the ankles in the shoes' grey. The club's main sock colour
        # becomes the era's, its accent the era's first sock stripe; white and the greys stay.
        tpl = self.socks.get(str(pose)) or self.socks.get("1")
        if tpl:
            cells = [(y, x, tpl[y - SOCKS_TOP][x]) for y in range(SOCKS_TOP, SHOES_TOP) for x in range(64) if a[y, x, 3] == 255 and tpl[y - SOCKS_TOP][x] in "st"]
            vote: dict = {}
            for y, x, cls in cells:
                if cls == "s":
                    c = tuple(int(v) for v in a[y, x, :3])
                    vote[c] = vote.get(c, 0) + 1
            main = max(vote, key=vote.get) if vote else None
            keep = {(190, 198, 221), (137, 161, 171)}
            for y, x, cls in cells:
                c = tuple(int(v) for v in a[y, x, :3])
                if c == main:
                    a[y, x, :3] = tgt["socks"][TRIM]
                elif c not in keep and min(c) < 235:
                    a[y, x, :3] = tgt["socks"][BASE]
        for bname, y0, y1 in (("jersey", BODY_TOP, PANTS_TOP), ("pants", PANTS_TOP, SOCKS_TOP)):
            to = tgt[bname]
            sb = src.get(bname, {})
            cmap = {}
            for name, cls in CLASS:
                c = sb.get(name)
                if c and key(c) not in cmap:
                    cmap[key(c)] = to[cls]
            side = sb.get("side")
            if bname == "jersey" and side and key(side) not in cmap:
                cmap[key(side)] = to[TRIM]
            near = [(tuple(sb[n]), to[cls]) for n, cls in CLASS[:2] if sb.get(n)]
            # the club's own accent on the shoulders (rows 27-33), which the neutral kit's three colours don't carry
            cloth = [c for c, _ in near]
            for y in range(y0, min(y1, 64)):
                for x in range(64):
                    if a[y, x, 3] != 255:
                        continue
                    c = tuple(int(v) for v in a[y, x, :3])
                    t = cmap.get(key(c))
                    if t is None:
                        best = 36 * 36
                        for nc_, nt in near:
                            d = sum((c[i] - nc_[i]) ** 2 for i in range(3))
                            if d < best:
                                best = d
                                k = min(1.6, max(0.5, _lum(c) / _lum(nc_)))
                                t = tuple(min(255, int(round(v * k))) for v in nt)
                    if t is None and bname == "jersey" and y < 34 and not _skinlike(c) and min(c) < 215 and max(c) > 60 and all(sum((c[i] - cc[i]) ** 2 for i in range(3)) > 40 * 40 for cc in cloth):
                        t = to[TRIM]
                    if t is not None:
                        a[y, x, :3] = t
        # the number, in the era's colours
        jersey_to = tgt["jersey"][BASE]
        want = set(J.glyph_cells(self.font, number) or []) if number is not None else (set() if blank else {(int(y), int(x)) for y, x in zip(*np.nonzero(numcells))})
        num = _readable([tuple(era["number"]), tuple(era["numberOutline"]), (255, 255, 255), (20, 22, 27)], jersey_to)
        for y, x in want:
            if a[y, x, 3] != 255 or not (0 <= y < 64 and 0 <= x < 64):
                continue
            ref = tuple(int(v) for v in erased[y, x, :3])
            bg = band[y][0] if y in band else jersey
            if ref != bg:
                continue  # a ball or arm in front of the chest stays in front
            if y in (34, 35):
                bgc = tuple(int(v) for v in a[y, x, :3])
                a[y, x, :3] = _readable([tuple(era["number"]), tuple(era["numberOutline"]), (255, 255, 255), (20, 22, 27)], bgc)
            else:
                a[y, x, :3] = num
        return a
