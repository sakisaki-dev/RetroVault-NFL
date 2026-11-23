#!/usr/bin/env python3
"""NFL edition: what each club's kit looks like in the save's own sprite files, written into index.json as `kitColors`.

    python3 scripts/nfl/kit_colors.py

The game draws every kit on one body template (see src/utils/gameKitPaint.ts): the neutral kit's three colours
(#bfbfbf base, #8f8f8f shade, #fbfffd trim) in three row bands (jersey 27-40, pants 41-51, socks 52-55) become a
club's colours. A player the save drew only in another club's kit can be repainted into the one he is shown in: this
reads, for each club, the colour each (band, class) takes in its real kit files by comparing the same player's kit file
with his neutral file in the same pose (pixel for pixel the same body), taking the most common colour. The site then
maps those colours to the target club's palette (processSprite, paint "Target<Source"). Deterministic.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

D = Path(__file__).resolve().parents[2] / "public" / "private-sprites" / "nfl"
CLASSES = {(0xBF, 0xBF, 0xBF): "base", (0x8F, 0x8F, 0x8F): "shade", (0xFB, 0xFF, 0xFD): "trim"}
BANDS = [("jersey", 27, 41), ("pants", 41, 52), ("socks", 52, 56)]


def fname(uid, kit, pose):
    return D / f"{uid}_{kit:03d}{'_p%d' % pose if pose > 1 else ''}.png"


def main():
    idx = json.loads((D / "index.json").read_text())
    clubs = idx["clubs"]
    votes = defaultdict(Counter)  # (club, band, class) -> colour -> pixels
    for key, e in idx["players"].items():
        if not e["neutral"]:
            continue
        for club, poses in e["kits"].items():
            kit = clubs.get(club)
            if kit is None:
                continue
            for pose in poses:
                if pose not in e["neutral"]:
                    continue
                a, b = fname(e["uid"], kit, pose), fname(e["uid"], 800, pose)
                if not (a.exists() and b.exists()):
                    continue
                K, N = Image.open(a).convert("RGBA"), Image.open(b).convert("RGBA")
                for band, y0, y1 in BANDS:
                    for y in range(y0, y1):
                        for x in range(K.width):
                            n, k = N.getpixel((x, y)), K.getpixel((x, y))
                            cls = CLASSES.get(n[:3])
                            if cls and n[3] == 255 and k[3] == 255:
                                votes[(club, band, cls)][k[:3]] += 1
                # the jersey's outer outline (the leftmost and rightmost body pixel of each chest row, a shade pixel in the
                # neutral) is drawn in the club's accent: its own colour, apart from the inner shade
                for y in range(34, 41):
                    xs = [x for x in range(K.width) if N.getpixel((x, y))[3] == 255 and K.getpixel((x, y))[3] == 255 and CLASSES.get(N.getpixel((x, y))[:3]) == "shade"]
                    for x in ([min(xs), max(xs)] if xs else []):
                        votes[(club, "jersey", "side")][K.getpixel((x, y))[:3]] += 1
                break  # one pose per player and club is plenty
    out = {}
    for (club, band, cls), c in sorted(votes.items()):
        out.setdefault(club, {}).setdefault(band, {})[cls] = list(c.most_common(1)[0][0])
    idx["kitColors"] = out
    # the sock band's class template: rows 49-58 of the neutral kit per pose, the most common class of each pixel
    # (b base, s shade, t trim, . anything else: shoes, empty). The game's socks begin at row 49 (stripe rows 49-53), so a
    # file repainted into another club's kit maps its sock pixels by this template, not by their colours.
    tpl = {}
    for pose in range(1, 6):
        files = sorted(D.glob("*_800" + (f"_p{pose}" if pose > 1 else "") + ".png"))[:300]
        counts = defaultdict(Counter)
        for f in files:
            im = Image.open(f).convert("RGBA")
            for y in range(49, 59):
                for x in range(64):
                    p = im.getpixel((x, y))
                    counts[(x, y)][CLASSES.get(p[:3], "?") if p[3] == 255 else "."] += 1
        tpl[str(pose)] = ["".join({"base": "b", "shade": "s", "trim": "t"}.get(counts[(x, y)].most_common(1)[0][0], ".") if counts[(x, y)].most_common(1)[0][0] not in ("?", ".") else "." for x in range(64)) for y in range(49, 59)]
    idx["sockTemplate"] = tpl
    (D / "index.json").write_text(json.dumps(idx, indent=1))
    print(f"kitColors for {len(out)} clubs, {len(votes)} (band, class) cells")


if __name__ == "__main__":
    main()
