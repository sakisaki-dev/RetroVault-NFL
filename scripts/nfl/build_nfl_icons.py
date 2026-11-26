#!/usr/bin/env python3
"""Retro Vault: NFL Edition icon set and launch screens ("Kickoff, night game", picked by the owner).

The Kickoff football under floodlights over a night stadium with a red, white and blue ribbon, drawn like the Retro
Bowl edition's icon (scripts/build_app_icons.py, whose helpers it reuses): a 24-cell design with 4 cells of bleed a
side, whole art pixels, nearest neighbour, deterministic. Writes public/nfl-icons/ (never public/ itself, which is the
Retro Bowl edition's): apple-touch-icon, icon-192/512, icon-maskable-192/512, favicon-32, favicon.ico, manifest.webmanifest
and splash/launch-<w>x<h>.png for every size in build_app_icons.SPLASH. vite.config.ts points the NFL build at the folder.

Run: python3 scripts/nfl/build_nfl_icons.py            (everything)
     python3 scripts/nfl/build_nfl_icons.py --icons    (icons and manifest only)
     python3 scripts/nfl/build_nfl_icons.py --splash   (launch screens only)
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "nfl"))
import build_app_icons as B  # noqa: E402

RGB = tuple
OUT = ROOT / "public" / "nfl-icons"
VERSION = "nightgame"
hexc, mix, up = B.hexc, B.mix, B.up
PAD = 4
N = 24 + 2 * PAD

# ---------------------------------------------------------------- palette (limited, shared by all three)
NIGHT_SKY = [hexc(c) for c in ("0a0f2e", "0f1844", "15225c", "1d2f78", "28408f", "3552a6")]
STAR = hexc("fff6d8")
STAR_DIM = hexc("8ea2e0")
BLOOM = (hexc("f4f8ff"), hexc("c9d8ff"), hexc("7f9be6"))  # floodlight bloom: core, ring, halo
LAMP = hexc("fffbe8")
LAMP_RIM = hexc("ffd86a")
STEEL_D = hexc("1b2238")
STANDS = hexc("1f3a9e")
STANDS_RIM = hexc("0f1c55")
RED = hexc("e8364a")
RED_D = hexc("a81f33")
WHITE = hexc("f4f7ee")
BLUE = hexc("2f56d8")
BLUE_D = hexc("1a2f86")
NAVY = hexc("12206a")
GRASS_N = (hexc("39a63a"), hexc("2d8a30"))
GOLD = B.GOLD
OUTLINE = (28, 18, 12)

# pixel caps for the tiny icon lettering (5 rows; widths vary)
TINY = {
    "N": ["#..#", "##.#", "#.##", "#..#", "#..#"], "F": ["###", "#..", "##.", "#..", "#.."],
    "L": ["#..", "#..", "#..", "#..", "###"], "R": ["##.", "#.#", "##.", "#.#", "#.#"],
    "V": ["#.#", "#.#", "#.#", "#.#", ".#."],
}


def tiny_width(word):
    return sum(len(TINY[c][0]) for c in word) + len(word) - 1


def tiny(a, word, x, y, col, shadow=None):
    """Draw a word in TINY caps with its top-left at array index (y, x)."""
    for ch in word:
        for gy, row in enumerate(TINY[ch]):
            for gx, v in enumerate(row):
                if v == "#":
                    if shadow is not None:
                        a[y + gy + 1, x + gx + 1] = shadow
        for gy, row in enumerate(TINY[ch]):
            for gx, v in enumerate(row):
                if v == "#":
                    a[y + gy, x + gx] = col
        x += len(TINY[ch][0]) + 1


def put(a, x, y, col):
    yy, xx = y + PAD, x + PAD
    if 0 <= yy < a.shape[0] and 0 <= xx < a.shape[1]:
        a[yy, xx] = col


def ball_rgba():
    return np.array(B.ball_mark())


def stamp(a, rgba, x, y):
    m = rgba[..., 3] > 0
    h, w = m.shape
    a[y + PAD:y + PAD + h, x + PAD:x + PAD + w][m] = rgba[..., :3][m]


def night_sky(a, rows, seed):
    rng = random.Random(seed)
    for y in range(rows + PAD):
        a[y] = NIGHT_SKY[min(5, max(0, (y - PAD) * 6 // rows))]
    for _ in range(14):
        x, y = rng.randrange(N), rng.randrange(rows + PAD - 1)
        a[y, x] = STAR if rng.random() < 0.5 else STAR_DIM


def bloom(a, cx, cy, r_core=4.6, r_ring=6.2, r_halo=8.2, rows=None):
    for y in range(a.shape[0] if rows is None else rows):
        for x in range(a.shape[1]):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if d <= r_core:
                a[y, x] = BLOOM[0]
            elif d <= r_ring:
                a[y, x] = BLOOM[1]
            elif d <= r_halo:
                a[y, x] = mix(tuple(int(v) for v in a[y, x]), BLOOM[2], 0.55)


def floodlight(a, x0, y0):
    """A 4 x 2 bank of lamps on a short pole (design cells)."""
    for dx in range(-1, 5):
        put(a, x0 + dx, y0 - 1, mix(tuple(int(v) for v in a[y0 - 1 + PAD, min(N - 1, x0 + dx + PAD)]), BLOOM[2], 0.6))
    for dx in range(4):
        for dy in range(2):
            put(a, x0 + dx, y0 + dy, LAMP if (dx + dy) % 2 == 0 else LAMP_RIM)
    for dy in range(2, 5):
        put(a, x0 + 1, y0 + dy, STEEL_D)
        put(a, x0 + 2, y0 + dy, STEEL_D)


def stands(a, y0, y1, seed=3, flashes=True):
    rng = random.Random(seed)
    a[y0 + PAD:y1 + PAD] = STANDS
    a[y0 + PAD] = STANDS_RIM
    for y in range(y0 + 1, y1, 2):
        for x in range(-PAD + (y // 2) % 2, 24 + PAD, 2):
            r = rng.random()
            put(a, x, y, GOLD if r < 0.55 else WHITE if r < 0.85 else hexc("6f8ff0"))
    if flashes:
        for _ in range(3):
            put(a, rng.randrange(0, 24), rng.randrange(y0 + 1, y1), hexc("ffffff"))


def turf(a, y0, chalk=True):
    a[y0 - 1 + PAD] = RED
    for y in range(y0, 24 + PAD):
        if y + PAD < N:
            a[y + PAD] = GRASS_N[((y - y0 + 1) // 3) % 2]
    if chalk:
        a[y0 + PAD] = WHITE


def star5(a, x, y, col):
    """A 3 x 3 plus-star centred on design cell (x, y)."""
    for dx, dy in ((0, -1), (-1, 0), (0, 0), (1, 0), (0, 1)):
        put(a, x + dx, y + dy, col)


def ribbon(a, ry, x0=5, x1=18, word="NFL"):
    """A banner: a white band (red edges) with the word in navy, blue swallow-tails folded behind with a white star."""
    for side in (-1, 1):
        for i in range(6):
            x = x0 - 1 - i if side < 0 else x1 + 1 + i
            for y in range(ry + 1, ry + 8):
                c = BLUE if y < ry + 7 else BLUE_D
                if i == 5 and y in (ry + 3, ry + 4, ry + 5):
                    continue  # the swallow-tail notch
                if i == 4 and y == ry + 4:
                    continue
                put(a, x, y, c)
            put(a, x, ry + 8, NAVY) if i < 5 else None
        put(a, x0 - 1 if side < 0 else x1 + 1, ry + 7, NAVY)  # the fold
        star5(a, x0 - 3 if side < 0 else x1 + 3, ry + 4, WHITE)
    for x in range(x0, x1 + 1):
        put(a, x, ry - 1, NAVY)
        put(a, x, ry, RED)
        for y in range(ry + 1, ry + 6):
            put(a, x, y, WHITE)
        put(a, x, ry + 6, RED)
        put(a, x, ry + 7, NAVY)
    w = tiny_width(word)
    tiny(a, word, PAD + x0 + (x1 - x0 + 1 - w + 1) // 2, PAD + ry + 1, NAVY)



def _n_rows():
    rows = []
    for r in range(11):
        row = ["."] * 10
        for x in (0, 1, 2, 7, 8, 9):
            row[x] = "#"
        c = 2 + round(r * 5 / 10)
        for x in (c, c + 1):
            if 0 <= x < 10:
                row[x] = "#"
        rows.append("".join(row))
    return rows


B.ROUND.update({
    "N": _n_rows(),
    "F": ["##########", "##########", "###.......", "###.......", "########..", "########..", "###.......",
          "###.......", "###.......", "###.......", "###......."],
    "D": ["########..", "#########.", "###...####", "###....###", "###....###", "###....###", "###....###",
          "###....###", "###...####", "#########.", "########.."],
    "I": ["###"] * 11,
})


def edition_word(cell: int, face_top: RGB, face_bot: RGB, inner: RGB, outer: RGB):
    """'NFL EDITION' in ROUND caps: a face ramp, an inner and an outer line (no shadow: it sits on a ribbon)."""
    parts = [B.glyph_mask(w, cell, cell) for w in ("NFL", "EDITION")]
    sp = cell * 5
    H = max(p.shape[0] for p in parts)
    W = parts[0].shape[1] + sp + parts[1].shape[1]
    m = np.zeros((H, W), bool)
    m[:, :parts[0].shape[1]] |= parts[0]
    m[:, parts[0].shape[1] + sp:] |= parts[1]
    inner_w, outer_w = max(1, cell // 2), max(1, cell // 2)
    pad = inner_w + outer_w + 1
    face = np.pad(m, pad)
    ring = B.dilate(face, inner_w)
    body = B.dilate(ring, outer_w)
    rgb = np.zeros((*face.shape, 3))
    rgb[body] = outer
    rgb[ring & ~face] = inner
    for y in range(face.shape[0]):
        t = (y - pad) / max(1, m.shape[0] - 1)
        rgb[y, face[y]] = mix(face_top, face_bot, min(1, max(0, t)))
    return rgb, body


def blit(arr, rgb, alpha, x, y):
    h, w = alpha.shape
    x, y = int(x), int(y)
    sub = arr[y:y + h, x:x + w]
    al = alpha[:sub.shape[0], :sub.shape[1]]
    sub[al] = rgb[:sub.shape[0], :sub.shape[1]][al]


def stepped_glow(arr, cx, cy, r, col, amount, rows=None):
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy) / r
    f = np.clip(1 - d, 0, 1)
    f = np.floor(f * 4) / 4 * amount
    if rows is not None:
        f[rows:] = 0
    arr[:] = arr * (1 - f[..., None]) + np.array(col) * f[..., None]


def night_backdrop(aw: int, ah: int, horizon: int, field: int, seed: str) -> np.ndarray:
    """A night stadium on aw x ah art pixels: banded night sky with stars, two floodlight towers with stepped beams,
    a bowl of stands (navy and red tiers with a gold and white crowd, camera flashes), mowed turf with yard lines."""
    rng = random.Random(seed)
    arr = np.zeros((ah, aw, 3), float)
    for y in range(horizon):
        t = y / horizon
        arr[y] = NIGHT_SKY[min(5, int(t * 6))]
        if y % 6 == 0 and int(t * 6) < 5:  # dithered band edges
            pass
    for _ in range(aw * horizon // 260):
        x, y = rng.randrange(aw), rng.randrange(int(horizon * 0.8))
        arr[y, x] = STAR if rng.random() < 0.4 else STAR_DIM
        if rng.random() < 0.08 and 0 < x < aw - 1 and 0 < y:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                arr[y + dy, x + dx] = STAR_DIM
    # the bowl
    rim = horizon
    S_rows = field - rim
    for y in range(rim, field):
        k = y - rim
        u = k / S_rows
        if k < 3:
            c = (hexc("4a6ae0"), hexc("2f4fd0"), hexc("12206a"))[k]
        elif u < 0.45:
            c = STANDS if (k % 3) else mix(STANDS, (0, 0, 0), 0.3)
        elif u < 0.5:
            c = RED if k % 4 else RED_D
        elif u < 0.92:
            c = hexc("1a2f86") if (k % 3) else mix(hexc("1a2f86"), (0, 0, 0), 0.3)
        else:
            c = RED
        arr[y] = c
    for y in range(rim + 4, int(rim + S_rows * 0.92) - 1, 3):
        for x in range((y // 3) % 2, aw, 2):
            r = rng.random()
            if r < 0.7:
                arr[y, x] = GOLD if r < 0.35 else WHITE if r < 0.55 else hexc("6f8ff0")
    for _ in range(aw // 6):  # camera flashes
        x, y = rng.randrange(1, aw - 1), rng.randrange(rim + 4, field - 4)
        arr[y, x] = (255, 255, 255)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            arr[y + dy, x + dx] = mix((255, 255, 255), tuple(int(v) for v in arr[y + dy, x + dx]), 0.4)
    # turf
    y, k = field, 0
    while y < ah:
        band = 6 + k * 3
        arr[y:min(ah, y + band)] = GRASS_N[k % 2]
        if k:
            arr[y:min(ah, y + 1 + k // 4)] = WHITE
        y += band
        k += 1
    arr[field] = WHITE
    ez = int(ah * 0.875)
    arr[ez - 3:ez] = WHITE  # the goal line
    arr[ez:] = NAVY
    for yy in range(ez, ah):
        for xx in range(aw):
            if ((xx + (yy - ez)) // 7) % 2 == 0:
                arr[yy, xx] = hexc("1a2f86")
    for row, y0 in enumerate(range(ez + 10, ah - 6, 16)):
        for x0 in range(10 + (row % 2) * 12, aw - 6, 24):
            for dx, dy in ((0, -2), (0, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (0, 1), (-1, 2), (1, 2)):
                arr[y0 + dy, x0 + dx] = WHITE
    for px in (3, aw - 12):
        arr[ez - 18:ez + 2, px:px + 9] = hexc("ff7a1a")
        arr[ez - 18:ez - 15, px:px + 9] = hexc("ffb060")
        arr[ez - 18:ez + 2, px + 7:px + 9] = hexc("c2500e")
    # floodlight towers and beams
    for side in (-1, 1):
        tx = aw // 2 + side * (aw // 2 - 22)
        top = max(56, horizon - 200)
        for yy in range(top + 18, rim + 2):
            arr[yy, tx - 1:tx + 2] = STEEL_D
            if yy % 6 == 0:
                arr[yy, tx - 2:tx + 3] = STEEL_D
        stepped_glow(arr, tx, top + 8, 46, BLOOM[2], 0.55)
        stepped_glow(arr, tx, top + 8, 24, BLOOM[1], 0.7)
        bx0 = tx - 15
        arr[top - 1:top + 17, bx0 - 1:bx0 + 31] = STEEL_D
        for j in range(4):
            for i in range(6):
                x0, y0 = bx0 + i * 5, top + j * 4
                arr[y0:y0 + 3, x0:x0 + 4] = LAMP if (i + j) % 2 == 0 else LAMP_RIM
                arr[y0, x0] = (255, 255, 255)
        # a beam down toward midfield, in two steps
        tgt = (aw / 2 - side * aw * 0.12, field + 40)
        for yy in range(top + 17, ah):
            f = (yy - top - 17) / (tgt[1] - top - 17)
            cxb = tx + (tgt[0] - tx) * f
            half = 6 + 40 * f
            x0, x1 = int(max(0, cxb - half)), int(min(aw, cxb + half))
            if x1 > x0:
                a = 0.07 * max(0.0, 1 - max(0, f - 1) * 1.5)
                arr[yy, x0:x1] = arr[yy, x0:x1] * (1 - a) + np.array(BLOOM[0]) * a
    return arr


def ribbon_big(arr, text_rgb, text_a, cy, aw):
    """A red ribbon with white edges under the text, swallow-tails in blue with white stars folded behind."""
    th, tw = text_a.shape
    pad_x, pad_y = 12, 5
    h = th + 2 * pad_y
    x0, x1 = (aw - tw) // 2 - pad_x, (aw + tw) // 2 + pad_x
    y0 = int(cy - h / 2)
    tail = max(0, min(34, x0 - 1))  # a narrow screen (250 art pixels) gets shorter tails
    for side in (-1, 1):
        for i in range(tail):
            x = x0 - 1 - i if side < 0 else x1 + i
            if not 0 <= x < aw:
                continue
            ys, ye = y0 + 6, y0 + h + 6
            notch = max(0, 12 - abs(i - (tail - 1)) * 1) if i > tail - 13 else 0
            mid = (ys + ye) / 2
            for y in range(ys, ye):
                if abs(y + 0.5 - mid) < notch * 0.9 and i > tail - 13:
                    continue
                arr[y, x] = BLUE if y < ye - 2 else BLUE_D
            arr[ys - 1, x] = NAVY
            arr[ye, x] = NAVY
        fx = x0 if side < 0 else x1 - 1
        for k in range(7):  # the fold: a dark triangle
            arr[y0 + h + k - 1, fx - (0 if side < 0 else 0)] = NAVY
        for k in range(6):
            xx = fx - k if side < 0 else fx + k
            arr[y0 + h:y0 + h + 6 - k, xx] = BLUE_D
        # stars on the tails
        sx = x0 - 14 if side < 0 else x1 + 13
        sy = y0 + 6 + h // 2
        if tail >= 20:
            for dx, dy in ((0, -2), (0, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (0, 1), (-1, 2), (1, 2)):
                arr[sy + dy, sx + dx] = WHITE
    arr[y0 - 2:y0 + h + 2, x0:x1] = NAVY
    arr[y0 - 1:y0 + h + 1, x0:x1] = WHITE
    arr[y0 + 1:y0 + h - 1, x0:x1] = RED
    arr[y0 + h - 3:y0 + h - 1, x0:x1] = RED_D
    blit(arr, text_rgb, text_a, (aw - tw) // 2, y0 + pad_y)


def mark_from(design_rgba: np.ndarray, k: int):
    big = np.repeat(np.repeat(design_rgba, k, 0), k, 1)
    return big[..., :3].astype(float), big[..., 3] > 0


def icon_from(design: Image.Image, size: int) -> Image.Image:
    k = math.ceil(size / 24)
    big = up(design, k)
    off = (big.width - size) // 2
    return big.crop((off, off, off + size, off + size))




def launch(w_css: int, h_css: int, dpr: int) -> Image.Image:
    """The launch screen for one phone: about 300 art pixels across, the ball and wordmark clear of the status bar
    (safe_rows), the ribbon and the end zone below."""
    w, h = w_css * dpr, h_css * dpr
    s = max(2, int(w / 300 + 0.5))
    aw, ah = math.ceil(w / s), math.ceil(h / s)
    top, _bottom = B.safe_rows(h_css, dpr, s)
    horizon, field = int(ah * 0.40), int(ah * 0.69)
    arr = night_backdrop(aw, ah, horizon, field, "night")
    wm_rgb, wm_a = B.varsity_wordmark(5 if aw >= 290 else 4, "gradient")
    ed_rgb, ed_a = edition_word(2, WHITE, hexc("dfe6ff"), NAVY, NAVY)
    rgb, al = mark_from(ball_rgba(), 7)
    my = top + 8
    stepped_glow(arr, aw / 2, my + al.shape[0] / 2, 120, BLOOM[1], 0.45)
    stepped_glow(arr, aw / 2, my + al.shape[0] / 2, 84, BLOOM[0], 0.5)
    blit(arr, rgb, al, (aw - al.shape[1]) // 2, my)
    wy = my + al.shape[0] + 8
    blit(arr, wm_rgb, wm_a, (aw - wm_a.shape[1]) // 2, wy)
    ey = wy + wm_a.shape[0] + 24
    ribbon_big(arr, ed_rgb, ed_a, ey, aw)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    big = up(img, s)
    ox = (big.width - w) // 2
    return big.crop((ox, 0, ox + w, h))


def design_night() -> Image.Image:
    a = np.zeros((N, N, 3), np.uint8)
    night_sky(a, 9, "night")
    bloom(a, N / 2, PAD + 8.5, rows=PAD + 9)
    floodlight(a, 0, 2)
    floodlight(a, 20, 2)
    stands(a, 9, 14)
    turf(a, 15)
    stamp(a, ball_rgba(), 2, 3)
    ribbon(a, 15)
    return Image.fromarray(a, "RGB")


def icon(size: int) -> Image.Image:
    return icon_from(design_night(), size)


def icon_maskable(size: int) -> Image.Image:
    """32 cells (the design plus its 4 cells of bleed a side): the ball and ribbon sit inside the 80% circle."""
    k = math.ceil(size / 32)
    big = up(design_night(), k)
    off = (big.width - size) // 2
    return big.crop((off, off, off + size, off + size))


def save(img: Image.Image, rel: str) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  nfl-icons/{rel} {img.size[0]}x{img.size[1]}")


def build_icons() -> None:
    print("Icons (Kickoff, night game):")
    save(icon(180), "apple-touch-icon.png")
    save(icon(192), "icon-192.png")
    save(icon(512), "icon-512.png")
    save(icon_maskable(192), "icon-maskable-192.png")
    save(icon_maskable(512), "icon-maskable-512.png")
    fav32 = design_night()  # the whole 32-cell design, one pixel a cell
    save(fav32, "favicon-32.png")
    fav16 = fav32.resize((16, 16), Image.NEAREST)
    icon(48).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[fav16, fav32])
    print("  nfl-icons/favicon.ico 16/32/48")
    manifest = {
        "id": "../",
        "name": "Retro Vault NFL",
        "short_name": "RV NFL",
        "description": "League hub for the NFL: stats, Hall of Fame, collection and more.",
        "lang": "en",
        "dir": "ltr",
        "start_url": "../",  # the manifest lives in nfl-icons/, the app one folder up
        "scope": "../",
        "display": "standalone",
        "background_color": "#090d1a",
        "theme_color": "#090d1a",
        "categories": ["sports", "entertainment", "games"],
        "icons": [
            {"src": f"icon-192.png?v={VERSION}", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": f"icon-512.png?v={VERSION}", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": f"icon-maskable-192.png?v={VERSION}", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},
            {"src": f"icon-maskable-512.png?v={VERSION}", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
            {"src": f"apple-touch-icon.png?v={VERSION}", "sizes": "180x180", "type": "image/png", "purpose": "any"},
        ],
    }
    (OUT / "manifest.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")
    print("  nfl-icons/manifest.webmanifest")


def build_splash() -> None:
    # The launch screen is the closed vault door on navy: index.html's pre-JS splash (scripts/nfl/vault_art.py) opens from it
    import vault_art as V  # noqa: E402

    print("Launch screens (the closed vault on navy):")
    for w, h, dpr in B.SPLASH:
        save(V.launch_image(w, h, dpr), B.splash_name(w, h, dpr))


def main() -> None:
    only_icons, only_splash = "--icons" in sys.argv, "--splash" in sys.argv
    if not only_splash:
        build_icons()
    if not only_icons:
        build_splash()


if __name__ == "__main__":
    main()
