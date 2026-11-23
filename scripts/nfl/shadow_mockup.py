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


def number_colour(a, jersey):
    box = a[33:40, 26:38]
    cols = collections.Counter(tuple(int(v) for v in c[:3]) for row in box for c in row if c[3])
    cand = [(c, k) for c, k in cols.items() if c not in jersey and sum(c) > 400]
    return max(cand, key=lambda x: x[1])[0] if cand else (251, 255, 253)


def jersey_colours(a):
    box = a[36:40, 26:38]
    cols = collections.Counter(tuple(int(v) for v in c[:3]) for row in box for c in row if c[3])
    return [c for c, _ in cols.most_common(2)]


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
        jer = jersey_colours(a)
        nc = number_colour(a, jer)
        m = np.array([[tuple(a[y, x, :3]) == nc and a[y, x, 3] > 0 for x in range(64)] for y in range(64)])
        s = str(n)
        if len(s) == 1:
            votes[s].append(m[33:40, 30:34])
        else:
            votes[s[0]].append(m[33:40, 27:31])
            votes[s[1]].append(m[33:40, 32:36])
    return {d: (np.mean(v, axis=0) > 0.5) for d, v in votes.items() if len(v) >= 5}


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


def build(name, number, club, pos, height, weight, template):
    donor = donor_for(club, pos, height, weight)
    a = np.asarray(Image.open(file_for(donor, club)).convert("RGBA")).copy()
    jer = jersey_colours(a)
    nc = number_colour(a, jer)
    # erase his number: each number pixel takes the jersey colour of its row (the shade where the row is shaded)
    for y in range(33, 40):
        row = [tuple(int(v) for v in a[y, x, :3]) for x in range(26, 38) if a[y, x, 3]]
        fill = collections.Counter(c for c in row if c != nc).most_common(1)
        for x in range(26, 38):
            if a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) == nc and fill:
                a[y, x, :3] = fill[0][0]
    # his number in the game's font
    s = str(number)
    slots = [30] if len(s) == 1 else [27, 32]
    for d, x0 in zip(s, slots):
        g = GLYPHS.get(d)
        if g is None:
            continue
        for gy in range(7):
            for gx in range(4):
                y, x = 33 + gy, x0 + gx
                if g[gy, gx] and a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) in jer:
                    a[y, x, :3] = nc
    # the matched head on the anchor (rows above the collar)
    t = np.asarray(Image.open(SPR / f"{template}_800.png").convert("RGBA"))
    neck = 27
    a[:neck, 18:46] = 0
    for y in range(neck):
        for x in range(18, 46):
            if t[y, x, 3]:
                a[y, x] = t[y, x]
    # shadow: every skin pixel (the template's skin tones on the head, the donor's on the arms and neck)
    tl = M.template_look(SPR / f"{template}_800.png")
    hair = np.array(tl["hair"])
    deep = jer[0]
    night = tuple(int(v * 0.25 + 10) for v in deep)
    rim = tuple(min(255, int(v * 0.45 + 130)) for v in deep)
    out = a.copy()
    for y in range(64):
        for x in range(64):
            if not a[y, x, 3]:
                continue
            c = a[y, x, :3].astype(int)
            warm = M.is_skin(np.array([[c]], dtype=np.uint8))[0, 0] or (c[0] > c[2] + 20 and c[0] > 60 and c.sum() < 600)
            is_hair = y < neck and not tl["bald"] and np.abs(c - hair).sum() < 60
            eye_mouth = y < neck and (tuple(c) in ((255, 255, 255), (241, 122, 124), (12, 24, 38), (15, 72, 127), (40, 26, 18)))
            if (warm and not is_hair) or (eye_mouth and not is_hair):
                if tuple(c) in jer or tuple(c) == nc:
                    continue
                edge = any(not a[y + dy, x + dx, 3] for dy, dx in ((-1, 0), (0, -1), (0, 1), (1, 0)) if 0 <= y + dy < 64 and 0 <= x + dx < 64)
                out[y, x, :3] = rim if (edge and y < neck) else night
    return Image.fromarray(out), donor


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
    print("digits learned:", sorted(GLYPHS))


if __name__ == "__main__":
    main()
