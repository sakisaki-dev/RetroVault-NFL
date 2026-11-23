#!/usr/bin/env python3
"""Mockup: a sprite for a player the game has no art for, built from data (owner, 2026-11-23: "we don't have sprites
but we need a good workaround"; first try Brady, Ray Lewis, Megatron).

    python3 scripts/nfl/looks_mockup.py <photo dir> <out dir>

1. Look from a photo (the NFL headshot when it is a clear portrait, else the freely licensed Commons photo): skin =
   median of the face's skin pixels, hair = the median of the non-skin pixels just above the face, beard = how much of
   the chin is dark, hair volume = how far the hair rises above the forehead.
2. The game's own look templates (the 104 generic faces in the save) measured the same way on their 64 x 64 heads;
   the closest wins (skin first, then hair colour, beard, volume; templates with headgear or shades are skipped).
3. Body from his real height and weight (a row repeated in the chest and thigh bands when tall, a column a side when
   broad), the neutral kit painted into each club he played for, his real number on the chest.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "private-sprites" / "nfl"

PLAYERS = [
    {"name": "Tom Brady", "photo": "brady_c.img", "height": 76, "weight": 225, "pos": "QB", "number": 12,
     "clubs": [("Patriots", "2000–2019"), ("Buccaneers", "2020–2022")]},
    {"name": "Ray Lewis", "photo": "raylewis_c.img", "height": 73, "weight": 240, "pos": "LB", "number": 52,
     "clubs": [("Ravens", "1996–2012")]},
    {"name": "Calvin Johnson", "nick": "Megatron", "photo": "megatron_c.img", "height": 77, "weight": 237, "pos": "WR",
     "number": 81, "clubs": [("Lions", "2007–2015")]},
]
# home kits: jersey, jersey shade, trim, pants, pants shade, socks
KITS = {
    "Patriots": ("#002244", "#001428", "#C60C30", "#B0B7BC", "#8A9196", "#002244"),
    "Buccaneers": ("#D50A0A", "#A30808", "#FFFFFF", "#B1BABF", "#8C9499", "#D50A0A"),
    "Ravens": ("#241773", "#170F4D", "#FFFFFF", "#FFFFFF", "#D4D4D4", "#241773"),
    "Lions": ("#0076B6", "#005A8C", "#FFFFFF", "#B0B7BC", "#8A9196", "#0076B6"),
}
CLOTH, SHADE, TRIM = (191, 191, 191), (143, 143, 143), (251, 255, 253)
GLYPHS = {"0": ["###", "#.#", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", ".#.", "###"],
          "2": ["###", "..#", "..#", "###", "#..", "###"], "3": ["###", "..#", ".##", "..#", "..#", "###"],
          "4": ["#.#", "#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "..#", "###"],
          "6": ["###", "#..", "###", "#.#", "#.#", "###"], "7": ["###", "..#", "..#", ".#.", ".#.", ".#."],
          "8": ["###", "#.#", "###", "#.#", "#.#", "###"], "9": ["###", "#.#", "#.#", "###", "..#", "###"]}
DIGITS = {  # 3 x 5 (unused)
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"], "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"]}


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def is_skin(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b
    cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b
    return (cr > 135) & (cr < 180) & (cb > 80) & (cb < 135) & (y > 35) & (r > b)


def look_from_photo(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((240, 240))
    a = np.asarray(im)
    sk = is_skin(a)
    # the face: the skin rows in the top 60% of the photo, the densest column band
    h, w = sk.shape
    top = sk[: int(h * 0.6)]
    cols = top.sum(axis=0)
    cx = int(np.argmax(np.convolve(cols, np.ones(w // 5), "same")))
    band = top[:, max(0, cx - w // 8): cx + w // 8]
    rows = np.where(band.sum(axis=1) > band.shape[1] * 0.35)[0]
    y0, y1 = int(rows.min()), int(rows.max())
    x0, x1 = max(0, cx - w // 8), min(w, cx + w // 8)
    face = a[y0:y1, x0:x1][sk[y0:y1, x0:x1]]
    skin = tuple(int(v) for v in np.median(face, axis=0))
    # hair: the band just above the forehead, middle of the face's width (light-brown hair passes the skin test, so
    # no skin test here); sides: hair-coloured pixels hugging the face below the eyes (long hair, dreads)
    fh = y1 - y0
    m0, m1 = x0 + (x1 - x0) // 5, x1 - (x1 - x0) // 5
    above = a[max(0, y0 - fh // 8): y0 + 1, m0:m1].reshape(-1, 3)
    # brown or blond hair passes the skin test, so the face box can start at the hairline: read the hair inside its top
    # strip first, then just above it
    strip = a[y0: y0 + max(2, fh // 7), m0:m1].reshape(-1, 3)
    distinct = np.concatenate([strip, above])
    distinct = distinct[np.abs(distinct.astype(int) - np.array(skin)).sum(axis=1) > 45]
    hair = tuple(int(v) for v in np.median(distinct, axis=0)) if len(distinct) > 5 else skin
    side = np.concatenate([a[y0 + fh // 2: y1, max(0, x0 - (x1 - x0) // 6): x0].reshape(-1, 3),
                           a[y0 + fh // 2: y1, x1: min(w, x1 + (x1 - x0) // 6)].reshape(-1, 3)])
    sides = float((np.abs(side.astype(int) - np.array(hair)).sum(axis=1) < 60).mean()) if len(side) else 0.0
    # beard: the chin quarter's share of pixels much darker than the skin
    chin = a[y0 + 3 * (y1 - y0) // 4: y1, x0:x1].reshape(-1, 3).mean(axis=1)
    beard = float((chin < np.mean(skin) * 0.55).mean())
    # volume: rows of hair-coloured pixels above the face
    vol = 0
    for yy in range(y0 - 1, max(0, y0 - (y1 - y0) // 2), -1):
        row = a[yy, x0:x1].astype(int)
        if (np.abs(row - np.array(hair)).sum(axis=1) < 90).mean() > 0.3:
            vol += 1
        else:
            break
    return {"skin": skin, "hair": hair, "beard": round(beard, 2), "volume": round(vol / max(1, y1 - y0), 2), "sides": round(sides, 2)}


def template_look(path):
    """Every template's head sits at the same spot (anchored sprites), so its look is read at fixed pixels."""
    a = np.asarray(Image.open(path).convert("RGBA")).astype(int)
    def mode(cells):
        cells = [tuple(c[:3]) for c in cells if c[3]]
        return max(set(cells), key=cells.count) if cells else None
    skin = mode([a[y, x] for y in range(15, 23) for x in range(27, 37)])
    if skin is None:
        return None
    col = [y for y in range(6, 28) if a[y, 32, 3]]
    top = col[0] if col else 12
    crown = mode([a[y, x] for y in range(top, top + 2) for x in range(28, 36)])
    bald = crown is None or np.abs(np.array(crown) - skin).sum() < 40
    hair = skin if bald else crown
    far = lambda c: c[3] and np.abs(c[:3] - np.array(skin)).sum() > 60 and tuple(c[:3]) != (241, 122, 124)
    sides = float(np.mean([bool(far(a[y, x])) for y in range(20, 27) for x in (22, 23, 24, 25, 38, 39, 40, 41)]))
    beard = float(np.mean([bool(far(a[y, x])) and a[y, x, :3].sum() < 300 for y in range(23, 27) for x in range(28, 36)]))
    gear_px = [a[y, x, :3] for y in range(top, top + 4) for x in range(26, 38) if a[y, x, 3]]
    gear = any(c.max() - c.min() > 90 and c.sum() > 250 for c in gear_px)  # a coloured headband or cap
    first_skin = next((y for y in range(top, 28) if np.abs(a[y, 32, :3] - skin).sum() < 40), top)
    # tattoos or sleeves: the upper arms' share of pixels that aren't the skin tone
    arm = [a[y, x] for y in range(28, 40) for x in (17, 18, 19, 20, 21, 22, 41, 42, 43, 44, 45, 46) if a[y, x, 3]]
    ink = float(np.mean([np.abs(c[:3] - np.array(skin)).sum() > 60 for c in arm])) if arm else 0.0
    # a cap or a tall crown: the head starting above row 13
    capped = top < 13 and not bald
    return {"skin": tuple(int(v) for v in skin), "hair": tuple(int(v) for v in hair), "bald": bool(bald),
            "sides": round(sides, 2), "beard": round(beard, 2), "volume": int(first_skin - top), "gear": bool(gear),
            "ink": round(ink, 2), "capped": bool(capped)}


def dist(a, b):
    return float(np.sqrt(((np.array(a, float) - np.array(b, float)) ** 2).sum()))


def body(im, height, weight, pos):
    """Real measurements against the position's usual build: tall adds a row in the thigh and chest bands, broad
    a column a side (the head, feet row and centre line stay where they are)."""
    a = np.asarray(im).copy()
    bmi = weight / height ** 2 * 703
    tall = height >= {"QB": 76, "WR": 75, "LB": 75}.get(pos, 76)
    broad = bmi >= {"QB": 28.5, "WR": 28.5, "LB": 31}.get(pos, 30)
    if tall:  # repeat a chest row (31) and a thigh row (44), shifting everything above them up
        for r in (44, 31):
            a[: r] = a[1: r + 1]
    if broad:  # below the neck only: the head keeps its own width
        n = 28
        left, right = a[n:, :32].copy(), a[n:, 32:].copy()
        a[n:, :31] = left[:, 1:32]
        a[n:, 33:] = right[:, :31]
    return Image.fromarray(a), {"tall": tall, "broad": broad, "bmi": round(bmi, 1)}


def paint(im, club, number):
    jersey, jshade, trim, pants, pshade, socks = (hexrgb(c) for c in KITS[club])
    a = np.asarray(im.convert("RGBA")).copy()
    for y in range(64):
        for x in range(64):
            c = tuple(a[y, x, :3])
            if not a[y, x, 3]:
                continue
            band = "j" if y <= 40 else "p" if y <= 51 else "s"
            if c == CLOTH:
                a[y, x, :3] = jersey if band == "j" else pants if band == "p" else socks
            elif c == SHADE:
                a[y, x, :3] = jshade if band == "j" else pshade if band == "p" else socks
            elif c == TRIM and band == "j":
                a[y, x, :3] = trim
    # his number the way the game draws it (NUM_GLYPHS, as scripts/build_app_icons.py): 3 x 6, a one-pixel gap,
    # centred on his own torso (the jersey run between the arms at the chest), the top row shaded
    jrow = 32
    xs = [x for x in range(64) if a[jrow, x, 3] and tuple(a[jrow, x, :3]) in (jersey, jshade, trim)]
    runs, cur = [], [xs[0]] if xs else []
    for x in xs[1:]:
        if x == cur[-1] + 1:
            cur.append(x)
        else:
            runs.append(cur)
            cur = [x]
    if cur:
        runs.append(cur)
    torso = max(runs, key=len) if runs else list(range(26, 38))
    tl, tr = torso[0], torso[-1]
    digs = str(number)
    w = 4 * len(digs) - 1
    x0 = round((tl + tr + 1) / 2 - w / 2)
    shade = tuple(int(t * 0.6 + j * 0.4) for t, j in zip(trim, jersey))
    for i, d in enumerate(digs):
        for gy, row in enumerate(GLYPHS[d]):
            for gx, v in enumerate(row):
                y, x = 30 + gy, x0 + 4 * i + gx
                if v == "#" and a[y, x, 3] and tuple(a[y, x, :3]) in (jersey, jshade):
                    a[y, x, :3] = shade if gy == 0 else trim
    return Image.fromarray(a)


def main():
    photos, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    ix = json.loads((SPR / "index.json").read_text())
    temps = []
    for s in ix["standins"]:
        f = SPR / f"{s['uid']}_800.png"
        if f.exists():
            t = template_look(f)
            if t:
                temps.append((s["uid"], t))
    report = []
    for p in PLAYERS:
        lk = look_from_photo(photos / p["photo"])
        scored = sorted(((dist(lk["skin"], t["skin"]) * 1.2 + dist(lk["hair"], t["hair"]) * 0.5
                          + abs(lk["beard"] - t["beard"]) * 80 + t["sides"] * 150 + (500 if t["gear"] else 0)
                          + t["ink"] * 120 + (70 if t["capped"] else 0)
                          + (0 if t["bald"] == (dist(lk["hair"], lk["skin"]) < 22) else 60), uid, t)
                         for uid, t in temps), key=lambda x: x[0])
        best = scored[0]
        base = Image.open(SPR / f"{best[1]}_800.png").convert("RGBA")
        shaped, build = body(base, p["height"], p["weight"], p["pos"])
        files = []
        for club, years in p["clubs"]:
            f = f"{p['name'].replace(' ', '_')}_{club}.png"
            paint(shaped, club, p["number"]).save(out / f)
            files.append({"club": club, "years": years, "file": f})
        base.save(out / f"{p['name'].replace(' ', '_')}_template.png")
        report.append({"name": p["name"], "nick": p.get("nick"), "look": lk, "template": best[1], "templateLook": best[2],
                       "runnersUp": [s[1] for s in scored[1:6]], "build": build, "kits": files,
                       "measurements": f"{p['height'] // 12}'{p['height'] % 12}\" {p['weight']} lb"})
        print(p["name"], lk, "→", best[1], best[2], build)
    (out / "report.json").write_text(json.dumps(report, indent=1, default=lambda o: list(o)))


if __name__ == "__main__":
    main()
