#!/usr/bin/env python3
"""NFL edition: the game's jersey-number font and each club kit's number colours, written into index.json.

    python3 scripts/nfl/numbers.py

The save bakes a number into every kit sprite (white strokes, 7 rows tall from row 33, rows 34-35 crossing the
shoulder band in the band's accent colour). The number baked into a file is the one he wore at that club, not
necessarily his current one, and a file repainted into another club's kit keeps the old club's. So the site erases the
drawn number and draws his real one (gameKitPaint.ts, job.number). This learns, from real sprites, by vote:
  numberFont  per digit and slot (one: a lone digit, left, right) a 6 x 7 glyph, rows of '#' and '.'
  numberKit   per club: the number colour on the chest and the accent it takes in the band rows
  numberFix   the kit files whose baked number is not his real number (read against the font, visible pixels only):
              the site re-draws only those (and every repainted or painted-neutral sprite), the rest are already right
Slots: single digit window x 29-34, left 26-31, right 31-36, rows 33-39. Deterministic.
"""
import collections
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "private-sprites" / "nfl"
SLOT_X = {"one": 29, "left": 26, "right": 31}


def load(ix):
    nums = json.loads((ROOT / "public/data/player-extras.json").read_text()).get("realNumbers", {})
    pl = {f"{p['pos']}:{p['n']}": p for p in json.loads((ROOT / "data/y80/players.json").read_text())}
    return nums, pl


def px(a, y, x):
    return tuple(int(v) for v in a[y, x, :3]) if a[y, x, 3] else None


def chest(a):
    rows = range(36, 40)
    main = collections.Counter(px(a, y, x) for y in rows for x in range(26, 38) if a[y, x, 3])
    if not main:
        return None, None
    jersey = main.most_common(1)[0][0]
    edges = {px(a, y, x) for y in rows for x in (25, 26, 37, 38) if a[y, x, 3]}
    inner = collections.Counter(px(a, y, x) for y in rows for x in range(27, 37) if a[y, x, 3] and px(a, y, x) not in edges | {jersey})
    return jersey, (inner.most_common(1)[0][0] if inner else None)


def band_of(a):
    out = {}
    for y in (34, 35):
        cnt = collections.Counter(px(a, y, x) for x in range(27, 37) if a[y, x, 3])
        if not cnt:
            return None
        bg = cnt.most_common(1)[0][0]
        acc = [c for c, _ in cnt.most_common() if c != bg]
        out[y] = (bg, acc[0] if acc else None)
    return out


def mask_of(a, nc):
    m = np.zeros((64, 64), bool)
    band = band_of(a) or {}
    for y in range(33, 40):
        for x in range(27, 37):
            if not a[y, x, 3]:
                continue
            c = px(a, y, x)
            m[y, x] = (c != band[y][0]) if y in band else (c == nc)
    return m


def glyph_cells(font, number):
    s = str(number)
    out = []
    for d, slot in zip(s, ["one"] if len(s) == 1 else ["left", "right"]):
        g = font.get((d, slot)) or font.get((d, "right" if slot == "left" else "left"))
        if g is None:
            return None
        out += [(33 + gy, SLOT_X[slot] + gx) for gy in range(7) for gx in range(6) if g[gy][gx] == "#"]
    return out


def main():
    ix = json.loads((SPR / "index.json").read_text())
    nums, pl = load(ix)
    clubs = ix["clubs"]
    votes = collections.defaultdict(list)
    kit_nc = collections.defaultdict(collections.Counter)
    kit_acc = collections.defaultdict(collections.Counter)
    for key, e in ix["players"].items():
        n, p = nums.get(key), pl.get(key)
        if not n or not p or p["team"] not in e.get("kits", {}) or p["team"] not in clubs:
            continue
        f = SPR / f"{e['uid']}_{clubs[p['team']]:03d}.png"
        if not f.exists():
            continue
        a = np.asarray(Image.open(f).convert("RGBA")).astype(int)
        jersey, nc = chest(a)
        if nc is None:
            continue
        kit_nc[p["team"]][nc] += 1
        for y, (bg, acc) in (band_of(a) or {}).items():
            if acc:
                kit_acc[p["team"]][acc] += 1
        m = mask_of(a, nc)
        s = str(n)
        if len(s) == 1:
            votes[(s, "one")].append(m[33:40, 29:35])
        else:
            votes[(s[0], "left")].append(m[33:40, 26:32])
            votes[(s[1], "right")].append(m[33:40, 31:37])
    font = {k: ["".join("#" if c else "." for c in row) for row in (np.mean(v, axis=0) > 0.5)] for k, v in votes.items() if len(v) >= 3}
    kit = {c: {"nc": list(kit_nc[c].most_common(1)[0][0]), "acc": list((kit_acc[c].most_common(1) or kit_nc[c].most_common(1))[0][0])} for c in kit_nc}
    # which kit files carry a number that is not his real one (visible pixels only: a ball or arm may cover some)
    fix = []
    total = 0
    for key, e in ix["players"].items():
        n = nums.get(key)
        cells = glyph_cells(font, n) if n else None
        if cells is None:
            continue
        want = set(cells)
        for club, poses in e.get("kits", {}).items():
            if club not in clubs:
                continue
            for pose in poses:
                name = f"{e['uid']}_{clubs[club]:03d}{'_p%d' % pose if pose > 1 else ''}.png"
                f = SPR / name
                if not f.exists():
                    continue
                a = np.asarray(Image.open(f).convert("RGBA")).astype(int)
                jersey, nc = chest(a)
                if nc is None:
                    continue
                total += 1
                have = {(y, x) for y in range(33, 40) for x in range(27, 37) if mask_of(a, nc)[y, x]}
                vis = {(y, x) for y in range(33, 40) for x in range(26, 38) if a[y, x, 3] and (px(a, y, x) in {jersey, nc} or y in (34, 35))}
                if len((have ^ want) & vis) > 2:
                    fix.append(name)
    ix["numberFont"] = {f"{d}|{s}": g for (d, s), g in sorted(font.items())}
    ix["numberKit"] = kit
    ix["numberFix"] = sorted(fix)
    (SPR / "index.json").write_text(json.dumps(ix, indent=1))
    print(f"numberFont {len(font)} glyphs, numberKit {len(kit)} clubs, numberFix {len(fix)} of {total} kit files")


if __name__ == "__main__":
    main()
