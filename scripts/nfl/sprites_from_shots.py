#!/usr/bin/env python3
"""NFL edition demo: a player's own game sprite from a screenshot of his player card (for the 2026 rookies the backup
can't hold; owner, 2026-11-23).

    python3 scripts/nfl/sprites_from_shots.py <dir with IMG_*.PNG> [IMG_7291=QB:Fernando Mendoza ...]

The card draws the sprite at a whole number of screen pixels per game pixel (9 on a 2622 x 1206 iPhone screenshot) on a
halftone panel. Each game pixel is a flat 9 x 9 block, the panel never is (its dots vary inside a block) except in a few
flat tones, which are sampled from the panel away from the sprite. The grid offset is the one with the most flat
blocks; the sprite is the largest connected group of flat, non-panel blocks (the drop shadow is a panel tone, so it
falls away). Written as a 64 x 64 PNG on the site's anchor (centre line 31.5, feet on row 58) to
data/nfl/shot-sprites/<uid>.png, with a preview sheet.
"""
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "nfl" / "shot-sprites"
S = 9                       # screen px per game px
REGION = (860, 180, 1260, 720)  # x0, y0, x1, y1 around the card's sprite (2622 x 1206 screenshot)
SIZE, CX, FEET = 64, 31.5, 58


def extract(path: Path) -> Image.Image:
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    x0, y0, x1, y1 = REGION
    reg = a[y0:y1, x0:x1]
    # flat panel tones: the most common colours of the panel left of the sprite
    panel = a[250:650, 690:870].reshape(-1, 3)
    # only the panel's blues: the card's white text sits in that area too, and white is a kit colour
    tones = [np.array(c) for c, k in Counter(map(tuple, panel)).most_common(12) if k > 200 and c[2] > c[0] + 60 and c[2] > c[1] + 40]

    def is_panel(c):
        return any(np.abs(c - t).sum() <= 18 for t in tones)

    best = None
    for oy in range(S):
        for ox in range(S):
            h, w = (reg.shape[0] - oy) // S, (reg.shape[1] - ox) // S
            blocks = reg[oy:oy + h * S, ox:ox + w * S].reshape(h, S, w, S, 3).transpose(0, 2, 1, 3, 4)
            inner = blocks[:, :, 2:S - 2, 2:S - 2].reshape(h, w, -1, 3)
            flat = (inner.max(axis=2) - inner.min(axis=2)).max(axis=2) <= 6
            score = flat.sum()
            if best is None or score > best[0]:
                best = (score, ox, oy, blocks, flat)
    _, ox, oy, blocks, flat = best
    h, w = flat.shape
    col = blocks[:, :, S // 2, S // 2]
    mask = flat & ~np.array([[is_panel(col[i, j]) for j in range(w)] for i in range(h)])
    # the largest 8-connected group is the player (drops the info button and stray flat panel blocks)
    seen = np.zeros_like(mask)
    groups = []
    for i in range(h):
        for j in range(w):
            if mask[i, j] and not seen[i, j]:
                stack, cells = [(i, j)], []
                seen[i, j] = True
                while stack:
                    y, x = stack.pop()
                    cells.append((y, x))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            yy, xx = y + dy, x + dx
                            if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                                seen[yy, xx] = True
                                stack.append((yy, xx))
                groups.append(cells)
    body = max(groups, key=len)
    # the drop shadow under his feet: the panel blue darkened, in the body's lowest rows
    low = max(y for y, _ in body)
    shadow = [np.array(c) for c in ((23, 54, 134), (34, 63, 134))]
    def dark_shadow(c):
        # the shadow's dark blues vary a little by card (21,50,121), (28,49,116); a jersey blue is brighter (Rams 0,53,148)
        return c[0] < 45 and c[1] < 70 and 105 <= c[2] <= 140 and c[2] - c[0] > 60

    def is_shadow(y, x):
        return any(np.abs(col[y, x] - t).sum() <= 14 for t in shadow) or dark_shadow(col[y, x])

    body = [(y, x) for y, x in body if not (y >= low - 6 and is_shadow(y, x))]
    keep = set(body)
    # small groups that touch him (a ball, a glove) stay; specks of the panel's dots nearby don't
    near = {(y + dy, x + dx) for y, x in body for dy in (-1, 0, 1) for dx in (-1, 0, 1)}
    for g in groups:
        if len(g) <= 30 and any(c in near for c in g):
            keep |= {c for c in g if not is_shadow(*c)}
    ys, xs = [c[0] for c in keep], [c[1] for c in keep]
    top, bot, left, right = min(ys), max(ys), min(xs), max(xs)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = out.load()
    # anchor: feet on row 58, the box's centre on the centre line
    dy = FEET - bot
    dx = int(round(CX - (left + right) / 2))
    for y, x in keep:
        r, g, b = (int(v) for v in col[y, x])
        ty, tx = y + dy, x + dx
        if 0 <= ty < SIZE and 0 <= tx < SIZE:
            px[tx, ty] = (r, g, b, 255)
    return out


def main():
    src = Path(sys.argv[1])
    names = dict(a.split("=", 1) for a in sys.argv[2:])
    roster = {f"{p['pos']}:{p['name']}": p for p in json.loads((ROOT / "data" / "nfl" / "roster.json").read_text())["players"]}
    # a player the roster lacks (a retired legend the league sheet still lists): KEY=uid pairs in `names` give his uid
    # (IMG_7384=DL:Aaron Donald@l000031388)
    for shot, key in list(names.items()):
        if "@" in key:
            key, uid = key.split("@", 1)
            roster[key] = {"uid": uid}
            names[shot] = key
    OUT.mkdir(parents=True, exist_ok=True)
    made = []
    for shot, key in names.items():
        p = roster.get(key)
        if not p:
            print(f"  {shot}: {key} not in the roster")
            continue
        im = extract(src / f"{shot}.PNG")
        im.save(OUT / f"{p['uid']}.png")
        made.append((key, im))
        n = int((np.asarray(im)[:, :, 3] > 0).sum())
        print(f"  {shot} → {key} (uid {p['uid']}): {n} pixels")
    if not made:
        return
    sheet = Image.new("RGBA", (SIZE * 4 * len(made), SIZE * 4), (40, 44, 60, 255))
    for k, (_, im) in enumerate(made):
        sheet.alpha_composite(im.resize((SIZE * 4, SIZE * 4), Image.NEAREST), (SIZE * 4 * k, 0))
    sheet.save(OUT / "_preview.png")
    ixp = OUT / "index.json"
    idx = json.loads(ixp.read_text()) if ixp.exists() else {}
    idx.update({k: roster[k]["uid"] for k, _ in made})  # earlier shots stay
    ixp.write_text(json.dumps(idx, indent=1) + "\n")


def apply_to_public():
    """Patch the built sprite folder the way sprites.py does for a shot sprite, without the save: pose 1 in the player's
    current club kit (`<uid>_<club>.png`), anchor recorded, `"shot": true`; the silhouette that stood in for him (every
    pose file, era kits, aliases, anchors) goes. A full `npm run nfl:sprites` gives the same result."""
    def anchor(path):  # private_nfl_sprites.anchor: the middle of the legs and shoes, the last row of the feet
        a = np.asarray(Image.open(path).convert("RGBA"))
        ys, xs = np.nonzero(a[:, :, 3] > 200)
        foot = ys.max()
        legs = xs[ys >= foot - 9]
        return [round((int(legs.min()) + int(legs.max()) + 1) / 2, 1), int(foot)]
    spr = ROOT / "public" / "private-sprites" / "nfl"
    ixp = spr / "index.json"
    ix = json.loads(ixp.read_text())
    clubs = {name: uid for name, uid in ix["clubs"].items()}
    for key, suid in json.loads((OUT / "index.json").read_text()).items():
        e = ix["players"].get(key)
        if not e or not e.get("silhouette"):
            continue  # a real save sprite (or an earlier shot) stays
        club = next(iter(e["kits"]), None)
        if club not in clubs:
            continue
        uid = e["uid"]
        for f in list(spr.glob(f"{uid}_*.png")):
            f.unlink()
            ix["anchors"].pop(f.name, None)
        for a in [a for a, t in ix["aliases"].items() if a.startswith(f"{uid}_") or t.startswith(f"{uid}_")]:
            ix["aliases"].pop(a)
        name = f"{uid}_{clubs[club]:03d}.png"
        shutil.copy2(OUT / f"{suid}.png", spr / name)
        ix["anchors"][name] = anchor(spr / name)
        ix["players"][key] = {"uid": uid, "kits": {club: [1]}, "neutral": [], "shot": True}
        print(f"  {key}: {name}, anchor {ix['anchors'][name]}")
    ixp.write_text(json.dumps(ix, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    if sys.argv[1:] == ["--apply"]:
        apply_to_public()
    else:
        main()
