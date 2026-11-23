#!/usr/bin/env python3
"""Mockup: stand-ins for players with no game sprite that don't pretend to be his face (owner, 2026-11-23: "in place
of the player sprite give me other options to stand in visually").

A helmet on (front), B from behind (surname and number on his back), C silhouette (club colour, light rim, number),
D his jersey on a hanger. Bodies come from a game template so the size and pose match the real sprites.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import looks_mockup as M  # noqa: E402

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
# helmet shell, facemask/stripe, logo dot
HELMET = {"Patriots": ("#B0B7BC", "#C60C30", "#002244"), "Lions": ("#B0B7BC", "#0076B6", "#0076B6"),
          "Ravens": ("#241773", "#000000", "#9E7C0C"), "Buccaneers": ("#34302B", "#D50A0A", "#D50A0A")}
FONT = {  # 3 x 5 caps for a surname on his back
    "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"], "C": ["011", "100", "100", "100", "011"],
    "D": ["110", "101", "101", "101", "110"], "E": ["111", "100", "110", "100", "111"], "F": ["111", "100", "110", "100", "100"],
    "G": ["011", "100", "101", "101", "011"], "H": ["101", "101", "111", "101", "101"], "I": ["111", "010", "010", "010", "111"],
    "J": ["001", "001", "001", "101", "010"], "K": ["101", "110", "100", "110", "101"], "L": ["100", "100", "100", "100", "111"],
    "M": ["101", "111", "111", "101", "101"], "N": ["110", "101", "101", "101", "101"], "O": ["010", "101", "101", "101", "010"],
    "P": ["110", "101", "110", "100", "100"], "R": ["110", "101", "110", "101", "101"], "S": ["011", "100", "010", "001", "110"],
    "T": ["111", "010", "010", "010", "010"], "U": ["101", "101", "101", "101", "111"], "W": ["101", "101", "111", "111", "101"],
    "Y": ["101", "101", "010", "010", "010"], "V": ["101", "101", "101", "101", "010"], "Z": ["111", "001", "010", "100", "111"]}

h = M.hexrgb


def head_box(a):
    rows = [y for y in range(0, 28) if a[y, 26:38, 3].any()]
    return rows[0], 27


def helmet_on(base, club, number, back=False):
    a = np.asarray(M.paint(base, club, number)).copy()
    shell, accent, logo = (h(c) for c in HELMET[club])
    top, neck = head_box(a)
    top = min(top, 11)
    # clear the head, then a rounded shell: half-widths row by row (dome, widest at the ears, tucked at the jaw)
    for y in range(top - 2, neck):
        for x in range(20, 44):
            if y >= 0:
                a[y, x, 3] = 0
    prof = [3, 5, 6, 7, 7, 8, 8, 8, 8, 8, 8, 7, 7, 6]
    t0 = neck - len(prof)
    dark = tuple(int(c * 0.55) for c in shell)
    for i, half in enumerate(prof):
        y = t0 + i
        for x in range(32 - half, 32 + half):
            a[y, x] = (*shell, 255)
        a[y, 32 - half, :3] = dark
        a[y, 31 + half, :3] = dark
        if i < 9:
            a[y, 31, :3] = accent
            a[y, 32, :3] = accent
    a[t0, 29:35, :3] = dark
    if not back:
        # facemask: two grey bars and a cage over the dark opening, the logo on the side of the shell
        for y in range(t0 + 6, neck):
            for x in range(27, 37):
                a[y, x, :3] = (18, 20, 28)
        for y in (t0 + 8, t0 + 11):
            a[y, 26:38, :3] = (160, 162, 172)
        for x in (27, 36):
            a[t0 + 7: neck, x, :3] = (160, 162, 172)
        a[t0 + 5: t0 + 7, 38:40, :3] = logo
    else:
        a[t0 + 5: t0 + 7, 24:26, :3] = logo
        a[t0 + 5: t0 + 7, 38:40, :3] = logo
    return Image.fromarray(a)


def from_behind(base, club, number, surname):
    im = helmet_on(base, club, "", back=True)  # no chest number: this is his back
    a = np.asarray(im).copy()
    jersey, jshade, trim = h(M.KITS[club][0]), h(M.KITS[club][1]), h(M.KITS[club][2])
    # a back shows no chest number: clear the front number, then the surname across the shoulders and a big number
    for y in range(29, 41):
        for x in range(24, 40):
            if a[y, x, 3] and tuple(a[y, x, :3]) not in (jersey, jshade) and abs(int(a[y, x, 0]) - trim[0]) < 40 and abs(int(a[y, x, 2]) - trim[2]) < 40:
                a[y, x, :3] = jersey
    # his number big across the back (each glyph pixel 2 wide, 1 tall for the 6-row glyph doubled to 2 x 2 where it fits)
    digs = str(number)
    gw = 7 * len(digs) - 1
    x0 = round(32 - gw / 2)
    for i, d in enumerate(digs):
        for gy, row in enumerate(M.GLYPHS[d]):
            for gx, v in enumerate(row):
                if v == "#":
                    for yy in (29 + 2 * gy, 30 + 2 * gy):
                        for xx in (x0 + 7 * i + 2 * gx, x0 + 7 * i + 2 * gx + 1):
                            if yy < 41 and a[yy, xx, 3]:
                                a[yy, xx, :3] = trim
    return Image.fromarray(a)


def silhouette(base, club, number):
    a = np.asarray(M.paint(base, club, number)).copy()
    jersey = h(M.KITS[club][0])
    deep = tuple(int(c * 0.35) for c in jersey)
    rim = tuple(min(255, int(c * 0.6 + 255 * 0.4)) for c in jersey)
    solid = a[..., 3] > 0
    solid[57:, :] = False  # the drop shadow
    num = np.zeros_like(solid)
    trim = h(M.KITS[club][2])
    for y in range(30, 37):
        for x in range(24, 40):
            if solid[y, x] and tuple(a[y, x, :3]) == trim:
                num[y, x] = True
    out = np.zeros_like(a)
    for y in range(64):
        for x in range(64):
            if not solid[y, x]:
                continue
            edge = any(not solid[y + dy, x + dx] for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)) if 0 <= y + dy < 64 and 0 <= x + dx < 64)
            out[y, x] = (*(rim if edge else (trim if num[y, x] else deep)), 255)
    return Image.fromarray(out)


def jersey_card(club, number, surname):
    jersey, jshade, trim = h(M.KITS[club][0]), h(M.KITS[club][1]), h(M.KITS[club][2])
    im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.line([(32, 6), (32, 10)], fill=(120, 110, 90))  # hanger hook
    d.line([(20, 13), (32, 10), (44, 13)], fill=(150, 130, 100))
    body = [(18, 14), (26, 12), (38, 12), (46, 14), (54, 22), (49, 27), (45, 24), (45, 54), (19, 54), (19, 24), (15, 27), (10, 22)]
    d.polygon(body, fill=jersey, outline=jshade)
    d.polygon([(28, 12), (36, 12), (32, 16)], fill=jshade)  # collar
    d.line([(10, 22), (15, 27)], fill=trim)
    d.line([(54, 22), (49, 27)], fill=trim)
    a = np.asarray(im).copy()
    name = surname.upper()[:7]
    w = 4 * len(name) - 1
    x0 = 32 - (w + 1) // 2
    for i, ch in enumerate(name):
        for gy, row in enumerate(FONT.get(ch, ["000"] * 5)):
            for gx, v in enumerate(row):
                if v == "1":
                    a[20 + gy, x0 + 4 * i + gx, :3] = trim
    digs = str(number)
    for i, dg in enumerate(digs):  # a big number: each glyph pixel 2 x 2
        gw = 8 * len(digs) - 2
        bx = round(32 - gw / 2) + 8 * i
        for gy, row in enumerate(M.GLYPHS[dg]):
            for gx, v in enumerate(row):
                if v == "#":
                    a[29 + 2 * gy: 31 + 2 * gy, bx + 2 * gx: bx + 2 * gx + 2, :3] = trim
    return Image.fromarray(a)


PEOPLE = [("Tom Brady", "Brady", 12, "Patriots", 76, 225, "QB"), ("Calvin Johnson", "Johnson", 81, "Lions", 77, 237, "WR"),
          ("Ray Lewis", "Lewis", 52, "Ravens", 73, 240, "LB")]
TEMPLATE = "900207"  # any stock body: the face is covered or not shown in every option
S = 4
rows = []
for name, surname, num, club, ht, wt, pos in PEOPLE:
    base, _ = M.body(Image.open(M.SPR / f"{TEMPLATE}_800.png").convert("RGBA"), ht, wt, pos)
    rows.append([helmet_on(base, club, num), from_behind(base, club, num, surname), silhouette(base, club, num),
                 jersey_card(club, num, surname)])
sheet = Image.new("RGBA", (64 * S * 4 + 40, 64 * S * len(rows) + 60), (24, 28, 44, 255))
d = ImageDraw.Draw(sheet)
for j, t in enumerate(["A  Helmet on", "B  From behind", "C  Silhouette", "D  Jersey"]):
    d.text((20 + 64 * S * j + 90, 14), t, fill=(255, 214, 120))
for i, r in enumerate(rows):
    for j, im in enumerate(r):
        sheet.alpha_composite(im.resize((64 * S, 64 * S), Image.NEAREST), (20 + 64 * S * j, 40 + 64 * S * i))
sheet.save(OUT / "standins.png")
print(sheet.size)


# ---- E: the real kit (src/components/collection/art/sprite/uniforms.ts), his build, the face and skin in shadow ----
W_, K_ = "#f4f5f7", "#14161b"
UNI = {  # copied from uniforms.ts HOME / ERAS for the mockup
    "Patriots": dict(jersey="#002244", bands=["#c60c30", W_, "#c60c30"], collar="#c60c30", number=W_, outline="#c60c30",
                     pants="#b0b7bc", pstripes=["#002244", "#c60c30", "#002244"], socks="#002244", sstripes=["#c60c30"], cleats=K_),
    "Buccaneers": dict(jersey="#d50a0a", bands=["#5b5752", K_], collar="#5b5752", number=W_, outline=K_, outline2="#ff7900",
                       pants="#5b5752", pstripes=["#d50a0a", K_], socks="#d50a0a", sstripes=["#5b5752"], cleats=K_),
    "Ravens": dict(jersey="#241773", bands=[], shoulder=K_, collar=K_, number=W_, outline=K_, outline2="#9e7c0c",
                   pants=W_, pstripes=[K_, "#241773", K_], socks=K_, sstripes=["#241773"], cleats=K_),
    "Lions": dict(jersey="#0076b6", bands=[], shoulder=W_, collar=W_, number=W_, outline="#b0b7bc",
                  pants="#b0b7bc", pstripes=["#0076b6", "#0076b6"], socks="#0076b6", sstripes=[W_], cleats=K_),
}


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def kit_silhouette(base, club, number):
    u = {k: (h(v) if isinstance(v, str) else [h(x) for x in v]) for k, v in UNI[club].items()}
    a = np.asarray(base.convert("RGBA")).copy()
    solid = a[..., 3] > 0
    solid[57:, :] = False
    a[57:, :, 3] = np.where(a[57:, :, 3] > 0, a[57:, :, 3], 0)
    jersey_px, pants_px, socks_px = [], [], []
    for y in range(64):
        for x in range(64):
            if not a[y, x, 3]:
                continue
            c = tuple(int(v) for v in a[y, x, :3])
            band = "j" if y <= 40 else "p" if y <= 51 else "s"
            if c in (M.CLOTH, M.SHADE, M.TRIM):
                dark = c == M.SHADE
                col = u["jersey"] if band == "j" else u["pants"] if band == "p" else u["socks"]
                a[y, x, :3] = shade(col, 0.78) if dark else col
                (jersey_px if band == "j" else pants_px if band == "p" else socks_px).append((y, x))
    # sleeves: jersey pixels outside the torso run; stripe bands on their lowest rows; the shoulder cap on the top row
    torso = {}
    for y in range(28, 41):
        xs = [x for (yy, x) in jersey_px if yy == y]
        if xs:
            mid = [x for x in xs if 25 <= x <= 38]
            torso[y] = (min(mid), max(mid)) if mid else (32, 31)
    sleeve = [(y, x) for (y, x) in jersey_px if y in torso and (x < 26 or x > 37)]
    if sleeve:
        ys = sorted({y for y, _ in sleeve})
        bot = ys[-1]
        for i, col in enumerate(reversed(u.get("bands", []))):
            for (y, x) in sleeve:
                if y == bot - i:
                    a[y, x, :3] = col
        if u.get("shoulder"):
            for (y, x) in sleeve:
                if y == ys[0]:
                    a[y, x, :3] = u["shoulder"]
    # pants stripes down each leg's outer edge, sock stripes across the socks
    for y in range(41, 52):
        xs = sorted(x for (yy, x) in pants_px if yy == y)
        if xs:
            for i, col in enumerate(u.get("pstripes", [])[:2]):
                a[y, xs[0] + i, :3] = col
                a[y, xs[-1] - i, :3] = col
    for (y, x) in socks_px:
        if y == 53 and u.get("sstripes"):
            a[y, x, :3] = u["sstripes"][0]
    for y in range(52, 58):
        for x in range(64):
            if a[y, x, 3] and y >= 55 and tuple(a[y, x, :3]) not in [tuple(u["socks"])] + [tuple(s) for s in u.get("sstripes", [])]:
                pass
    # number: white with its outline colour around it
    num = np.zeros((64, 64), bool)
    digs = str(number)
    w = 4 * len(digs) - 1
    x0 = round(32 - w / 2)
    for i, d in enumerate(digs):
        for gy, row in enumerate(M.GLYPHS[d]):
            for gx, v in enumerate(row):
                if v == "#":
                    num[31 + gy, x0 + 4 * i + gx] = True
    for y in range(29, 40):
        for x in range(24, 40):
            if num[y, x]:
                a[y, x, :3] = u["number"]
            elif any(num[y + dy, x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) and tuple(a[y, x, :3]) == tuple(u["jersey"]):
                a[y, x, :3] = u["outline"]
    # the face, hair and bare skin go into shadow: a club-tinted near-black, with a light rim on his outer edge
    night = shade(u["jersey"], 0.22)
    rim = tuple(min(255, int(v * 0.5 + 200 * 0.5)) for v in u["jersey"])
    kit = {tuple(int(v) for v in a[y, x, :3]) for (y, x) in jersey_px + pants_px + socks_px}
    out = a.copy()
    for y in range(64):
        for x in range(64):
            if not a[y, x, 3]:
                continue
            c = tuple(int(v) for v in a[y, x, :3])
            skinlike = M.is_skin(np.array([[c]], dtype=np.uint8))[0, 0] or (y < 28)
            if (y < 28 or skinlike) and c not in kit and c not in ((236, 238, 241), (244, 245, 247)) and not (y >= 41 and c == tuple(u["cleats"])):
                edge = any(not a[y + dy, x + dx, 3] for dy, dx in ((-1, 0), (0, -1), (0, 1)) if 0 <= y + dy < 64 and 0 <= x + dx < 64)
                out[y, x, :3] = rim if edge else night
    return Image.fromarray(out)


rows_e = []
for name, surname, num, clubs, ht, wt, pos in [("Tom Brady", "Brady", 12, ["Patriots", "Buccaneers"], 76, 225, "QB"),
                                               ("Calvin Johnson", "Johnson", 81, ["Lions"], 77, 237, "WR"),
                                               ("Ray Lewis", "Lewis", 52, ["Ravens"], 73, 240, "LB")]:
    base, _ = M.body(Image.open(M.SPR / f"{TEMPLATE}_800.png").convert("RGBA"), ht, wt, pos)
    for c in clubs:
        rows_e.append((f"{name} · {c}", kit_silhouette(base, c, num)))
sheet = Image.new("RGBA", (64 * S * len(rows_e) + 40, 64 * S + 50), (24, 28, 44, 255))
d = ImageDraw.Draw(sheet)
for i, (t, im) in enumerate(rows_e):
    sheet.alpha_composite(im.resize((64 * S, 64 * S), Image.NEAREST), (20 + 64 * S * i, 10))
    d.text((20 + 64 * S * i + 60, 64 * S + 20), t, fill=(255, 214, 120))
sheet.save(OUT / "kit_silhouettes.png")
