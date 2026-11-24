#!/usr/bin/env python3
"""NFL edition: the game's jersey-number font and each club kit's number colours, written into index.json.

    python3 scripts/nfl/numbers.py

The save bakes a number into every kit sprite (white strokes, 7 rows tall from row 33, rows 34-35 crossing the
shoulder band in the band's accent colour). The number baked into a file is the one he wore at that club, not
necessarily his current one, and a file repainted into another club's kit keeps the old club's. So the site erases the
drawn number and draws his real one (gameKitPaint.ts, job.number). This learns, from real sprites, by vote:
  numberFont  per digit and slot (one: a lone digit, left, right) a 6 x 7 glyph, rows of '#' and '.'
  numberKit   per club: the number colour on the chest and the accent it takes in the band rows
  numberFix   now always empty: this step bakes his real number into every real kit file (bake()), the site re-draws only
              what it repaints (a file drawn in another club's kit, a painted neutral)
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


KIT_NC = {}  # club -> the number colour of its kit (index.json numberKit), set by set_kit()
KIT_ACC = {}  # club -> the colour the number takes in the band rows 34-35


def set_kit(ix):
    KIT_NC.clear()
    KIT_ACC.clear()
    KIT_NC.update({c: tuple(v["nc"]) for c, v in ix.get("numberKit", {}).items()})
    KIT_ACC.update({c: tuple(v["acc"]) for c, v in ix.get("numberKit", {}).items()})


def chest(a, club=None):
    """(jersey colour, number colour) of a kit file. The number colour is voted from the chest, but a ball or an arm held in
    front of it (poses 3-5) out-votes a thin number, so when the club's kit number colour is known (`club`, numberKit) and
    it really is on the chest, that wins."""
    rows = range(36, 40)
    main = collections.Counter(px(a, y, x) for y in rows for x in range(26, 38) if a[y, x, 3])
    if not main:
        return None, None
    jersey = main.most_common(1)[0][0]
    hint = KIT_NC.get(club)
    if hint and hint != jersey and sum(1 for y in range(33, 40) for x in range(27, 37) if px(a, y, x) == hint) >= 3:
        return jersey, hint
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
        g = next((font[(d, k)] for k in (slot, "one", "right", "left") if (d, k) in font), None)  # a 0 alone has no glyph of its own
        if g is None:
            return None
        out += [(33 + gy, SLOT_X[slot] + gx) for gy in range(7) for gx in range(6) if g[gy][gx] == "#"]
    return out


def ref_of(a, club=None):
    """What the standing-pose file of a kit says about its number: jersey, number colour, band rows (background, accent) and the
    cells the number is drawn on. Every pose of a kit shares one body, so the other poses (a ball tucked across the chest
    hides part of it) are read through this."""
    jersey, nc = chest(a, club)
    if nc is None:
        # a jersey with no number on it (the save leaves some players' kits blank): nothing to erase, and the number is drawn
        # in the club's number colours (numberKit)
        nc = KIT_NC.get(club)
        if jersey is None or nc is None or nc == jersey:
            return None
        band = band_of(a) or {}
        acc = KIT_ACC.get(club) or nc
        return {"jersey": jersey, "nc": nc, "band": {y: (bg, acc if acc != bg else None) for y, (bg, _) in band.items()}, "mask": np.zeros((64, 64), bool)}
    return {"jersey": jersey, "nc": nc, "band": band_of(a) or {}, "mask": mask_of(a, nc)}


def ink(a, y, x, ref):
    """Is this pixel the number's own colour (the band accent in rows 34-35)?"""
    c = px(a, y, x)
    if c is None:
        return False
    if y in ref["band"]:
        return ref["band"][y][1] is not None and c == ref["band"][y][1]
    return c == ref["nc"]


def bg_of(y, ref):
    return ref["band"][y][0] if y in ref["band"] else ref["jersey"]


def number_cells(a, ref):
    """The cells of the file carrying number ink that belong to the standing pose's number (a ball's laces do not)."""
    return {(y, x) for y in range(33, 40) for x in range(26, 38) if ref["mask"][y, x] and ink(a, y, x, ref)}


def bake(a, number, font, ref):
    """The file's number erased (the cells the standing pose drew it on, where the colour is still the number's) and `number`
    drawn in the game's font on whatever is still plain cloth there; None draws nothing (a blank jersey). In place."""
    for y, x in number_cells(a, ref):
        a[y, x, :3] = bg_of(y, ref)
    if number is not None:
        for y, x in glyph_cells(font, number) or []:
            if a[y, x, 3] and px(a, y, x) == bg_of(y, ref):
                a[y, x, :3] = (ref["band"][y][1] or ref["nc"]) if y in ref["band"] else ref["nc"]
    return a


def wrong_cells(a, number, font, ref):
    """How many visible cells differ between the number on the file and `number` (None: no ink wanted); None = no glyphs."""
    cells = set(glyph_cells(font, number) or []) if number is not None else set()
    if number is not None and not cells:
        return None
    have = {(y, x) for y in range(33, 40) for x in range(27, 37) if ink(a, y, x, ref)}
    cloth = {ref["jersey"], ref["nc"]}
    vis = {(y, x) for y in range(33, 40) for x in range(26, 38) if a[y, x, 3] and (px(a, y, x) in cloth or y in (34, 35) and px(a, y, x) in set(ref["band"][y]))}
    return len((have ^ cells) & vis)


def mirror_keep_number(a, club=None):
    """`a` (64 x 64 x 4, ints) flipped left to right with its chest number still reading the right way round: the number
    window (rows 33-39, columns 26-37) maps onto itself, so the ink of the original is put back there. Same rule as the
    site's mirrorKeepNumber (gameKitPaint.ts). Returns a new array."""
    out = a[:, ::-1].copy()
    ref = ref_of(a, club)
    if ref is None:
        return out
    for y in range(33, 40):
        for x in range(26, 38):
            if ink(out, y, x, ref):
                out[y, x, :3] = bg_of(y, ref)
    for y in range(33, 40):
        for x in range(26, 38):
            if ink(a, y, x, ref):
                out[y, x] = a[y, x]
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
        if e.get("shot") or e.get("silhouette") or not n or not p or p["team"] not in e.get("kits", {}) or p["team"] not in clubs:
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
    # Bake his real number into every real kit file that carries another (the one he wore at another club), pose by pose,
    # through the standing pose's reading of the kit (ball-proof). Players a screenshot drew (`shot`: a different pixel grid)
    # and silhouettes (silhouettes.py draws those) are left alone. The site then redraws only what it repaints.
    ix["numberFont"] = {f"{d}|{s}": g for (d, s), g in sorted(font.items())}
    ix["numberKit"] = kit
    set_kit(ix)
    aliased = set(ix.get("aliases", {})) | set(ix.get("aliases", {}).values())
    baked = left = total = 0
    for key, e in ix["players"].items():
        n = nums.get(key)
        if e.get("shot") or e.get("silhouette") or n is None or glyph_cells(font, n) is None:
            continue
        for club, poses in e.get("kits", {}).items():
            if club not in clubs:
                continue
            name = lambda pose: f"{e['uid']}_{clubs[club]:03d}{'_p%d' % pose if pose > 1 else ''}.png"
            if not (SPR / name(1)).exists():
                continue
            ref = ref_of(np.asarray(Image.open(SPR / name(1)).convert("RGBA")).astype(int), club)
            if ref is None:
                continue
            for pose in poses:
                f = SPR / name(pose)
                if not f.exists() or name(pose) in aliased:
                    continue
                a = np.asarray(Image.open(f).convert("RGBA")).astype(int)
                total += 1
                if (wrong_cells(a, n, font, ref) or 0) <= 2:
                    continue
                bake(a, n, font, ref)
                Image.fromarray(a.astype(np.uint8), "RGBA").save(f)
                baked += 1
                if (wrong_cells(a, n, font, ref) or 0) > 2:
                    left += 1
    ix["numberFix"] = []
    (SPR / "index.json").write_text(json.dumps(ix, indent=1))
    print(f"numberFont {len(font)} glyphs, numberKit {len(kit)} clubs, {baked} of {total} real kit files re-numbered ({left} still off)")


if __name__ == "__main__":
    main()
