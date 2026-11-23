#!/usr/bin/env python3
"""Mockup: the stand-in drawn exactly like a real game sprite (owner, 2026-11-23: "keep the sprites for the standin
consistent with the real ones, the only difference being the face and skin tone is hidden, with the heads matched up
the best we can, the numbers etc").

  body + uniform  a real game sprite of a player at that club, the nearest in position, height and weight (the game's
                  own kit, pads, gloves, cleats), his number erased
  number          his own, in the game's jersey font learned from the real sprites by vote (4 x 7 glyphs from row 33,
                  rows 34-35 under the shoulder band; one digit at x 30, two at x 27 and 32), in the kit's number colour
  head            the face template that best matches his photo (scripts/nfl/looks_mockup.py), pasted on the anchor
  shadow          his skin (face, neck, arms) in a club-tinted shadow, eyes and mouth gone, the hair and beard keeping
                  their own colour so the head's shape reads, a light rim round the head
"""
import collections
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import looks_mockup as M  # noqa: E402

ROOT = M.ROOT
SPR = M.SPR
IX = json.loads((SPR / "index.json").read_text())
NUMS = json.loads((ROOT / "public" / "data" / "player-extras.json").read_text()).get("realNumbers", {})
PLAYERS = {f"{p['pos']}:{p['n']}": p for p in json.loads((ROOT / "data" / "y80" / "players.json").read_text())}
CLUBS = IX["clubs"]


def file_for(key, club, pose=""):
    e = IX["players"][key]
    return SPR / f"{e['uid']}_{CLUBS[club]:03d}{pose}.png"


def chest(a):
    """The jersey colour (most common on the chest under the band) and the number colour (the most common other colour
    inside the number columns, never the colours at the chest's edges, which are the side outline)."""
    rows = range(36, 40)
    main = collections.Counter(tuple(int(v) for v in a[y, x, :3]) for y in rows for x in range(26, 38) if a[y, x, 3])
    jersey = main.most_common(1)[0][0]
    edges = {tuple(int(v) for v in a[y, x, :3]) for y in rows for x in (25, 26, 37, 38) if a[y, x, 3]}
    inner = collections.Counter(tuple(int(v) for v in a[y, x, :3]) for y in rows for x in range(27, 37)
                                if a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) not in edges | {jersey})
    num = inner.most_common(1)[0][0] if inner else None
    return jersey, num


def number_colour(a, jersey):
    return chest(a)[1]


def jersey_colours(a):
    return [chest(a)[0]]


def learn_glyphs():
    """Each digit's visible rows (0, 3..6 of 7), by vote over players whose own club-kit sprite shows a known number."""
    votes = collections.defaultdict(list)
    for key, e in IX["players"].items():
        n, p = NUMS.get(key), PLAYERS.get(key)
        if not n or not p or p["team"] not in e.get("kits", {}):
            continue
        f = file_for(key, p["team"])
        if not f.exists():
            continue
        a = np.asarray(Image.open(f).convert("RGBA")).astype(int)
        jersey, nc = chest(a)
        if nc is None:
            continue
        m = np.zeros((64, 64), bool)
        for y in range(33, 40):
            if y in (34, 35):  # the band: the number is the band row's minority colour
                cnt = collections.Counter(tuple(int(v) for v in a[y, x, :3]) for x in range(27, 37) if a[y, x, 3])
                bg = cnt.most_common(1)[0][0] if cnt else None
                for x in range(27, 37):
                    m[y, x] = bool(a[y, x, 3]) and tuple(int(v) for v in a[y, x, :3]) != bg
            else:
                for x in range(27, 37):
                    m[y, x] = bool(a[y, x, 3]) and tuple(int(v) for v in a[y, x, :3]) == nc
        s = str(n)
        # each digit by slot (the game shifts a narrow 1 differently alone, on the left and on the right): a wider
        # window per slot so a shifted glyph still lands inside it
        if len(s) == 1:
            votes[(s, "one")].append(m[33:40, 29:35])
        else:
            votes[(s[0], "left")].append(m[33:40, 26:32])
            votes[(s[1], "right")].append(m[33:40, 31:37])
    return {k: (np.mean(v, axis=0) > 0.5) for k, v in votes.items() if len(v) >= 3}


GLYPHS = learn_glyphs()


def donor_for(club, pos, height, weight):
    best = None
    for key, e in IX["players"].items():
        p = PLAYERS.get(key)
        if not p or p["team"] != club or club not in e.get("kits", {}) or e.get("assigned"):
            continue
        nf = p.get("nfl") or {}
        if not nf.get("height") or not nf.get("weight"):
            continue
        same = (p["pos"] == pos) or ({p["pos"], pos} <= {"LB", "DL"})
        score = (0 if same else 40) + abs(nf["height"] - height) * 3 + abs(nf["weight"] - weight) * 0.4
        if file_for(key, club).exists() and (best is None or score < best[0]):
            best = (score, key)
    return best[1]


SLOT_X = {"one": 29, "left": 26, "right": 31}


def glyph_cells(number):
    out = []
    s_ = str(number)
    for d, slot in zip(s_, ["one"] if len(s_) == 1 else ["left", "right"]):
        g = GLYPHS.get((d, slot)) if GLYPHS.get((d, slot)) is not None else GLYPHS.get((d, "right" if slot == "left" else "left"))
        if g is not None:
            out += [(33 + gy, SLOT_X[slot] + gx) for gy in range(7) for gx in range(g.shape[1]) if g[gy, gx]]
    return out


def build(name, number, club, pos, height, weight, template):
    donor = donor_for(club, pos, height, weight)
    a = np.asarray(Image.open(file_for(donor, club)).convert("RGBA")).copy()
    jersey, nc = chest(a)
    # the band rows' own background and number colours (the number crosses the band in the band's accent)
    band = {}
    for y in (34, 35):
        cnt = collections.Counter(tuple(int(v) for v in a[y, x, :3]) for x in range(27, 37) if a[y, x, 3])
        bg = cnt.most_common(1)[0][0]
        acc = [c for c, _ in cnt.most_common() if c != bg]
        band[y] = (bg, acc[0] if acc else nc)
    # erase the donor's number at its glyph cells (plus any stray number pixel in the box)
    for (y, x) in glyph_cells(NUMS.get(donor, "")):
        if a[y, x, 3]:
            a[y, x, :3] = band[y][0] if y in band else jersey
    for y in range(33, 40):
        for x in range(26, 38):
            if not a[y, x, 3]:
                continue
            c = tuple(int(v) for v in a[y, x, :3])
            if y in band and c == band[y][1]:
                a[y, x, :3] = band[y][0]
            elif y not in band and c == nc:
                a[y, x, :3] = jersey
    # his number in the game font
    for (y, x) in glyph_cells(number):
        if a[y, x, 3]:
            a[y, x, :3] = band[y][1] if y in band else nc
    # the head: the matched template's head shape, blacked out with a light rim; skin on the body blacked out too
    t = np.asarray(Image.open(SPR / f"{template}_800.png").convert("RGBA"))
    neck = 27
    night = tuple(int(v * 0.22 + 8) for v in jersey)
    rim = tuple(min(255, int(v * 0.45 + 120)) for v in jersey)
    a[:neck, 16:48] = 0
    head = t[:neck, 16:48, 3] > 0
    for y in range(neck):
        for x in range(16, 48):
            if head[y, x - 16]:
                edge = any(not (0 <= y + dy < neck and 16 <= x + dx < 48 and head[y + dy, x + dx - 16])
                           for dy, dx in ((-1, 0), (0, -1), (0, 1)))
                a[y, x] = (*(rim if edge else night), 255)
    for y in range(neck, 64):
        for x in range(64):
            if not a[y, x, 3]:
                continue
            c = a[y, x, :3].astype(int)
            if tuple(int(v) for v in c) in (jersey, nc):
                continue
            warm = M.is_skin(np.array([[c]], dtype=np.uint8))[0, 0] or (c[0] > c[2] + 20 and c[0] > 60 and c.sum() < 600)
            if warm:
                a[y, x, :3] = night
    return Image.fromarray(a), donor


def main():
    out = Path(sys.argv[1])
    rep = {r["name"]: r for r in json.loads((out / "report.json").read_text())}
    people = [("Tom Brady", 12, "Patriots", "QB", 76, 225), ("Tom Brady", 12, "Buccaneers", "QB", 76, 225),
              ("Calvin Johnson", 81, "Lions", "WR", 77, 237), ("Ray Lewis", 52, "Ravens", "LB", 73, 240)]
    ray_pick = sys.argv[2] if len(sys.argv) > 2 else None
    S = 4
    tiles = []
    for name, num, club, pos, ht, wt in people:
        tpl = ray_pick if (name == "Ray Lewis" and ray_pick) else rep[name]["template"]
        im, donor = build(name, num, club, pos, ht, wt, tpl)
        # beside it, the donor's real sprite for comparison
        real = Image.open(file_for(donor, club)).convert("RGBA")
        tiles.append((f"{name} #{num} {club}", im, f"real: {donor.split(':', 1)[1]}", real))
    sheet = Image.new("RGBA", (64 * S * 2 * len(tiles) + 40, 64 * S + 60), (24, 28, 44, 255))
    d = ImageDraw.Draw(sheet)
    for i, (t, im, t2, real) in enumerate(tiles):
        x = 20 + 64 * S * 2 * i
        sheet.alpha_composite(im.resize((64 * S, 64 * S), Image.NEAREST), (x, 10))
        sheet.alpha_composite(real.resize((64 * S // 2, 64 * S // 2), Image.NEAREST), (x + 64 * S, 10 + 64 * S // 2))
        d.text((x + 40, 64 * S + 20), t, fill=(255, 214, 120))
        d.text((x + 64 * S + 10, 64 * S + 20), t2, fill=(150, 156, 175))
    sheet.save(out / "shadow_standins.png")
    print("glyphs learned:", len(GLYPHS), sorted(k for k in GLYPHS if k[0]=="1"))


if __name__ == "__main__":
    main()
