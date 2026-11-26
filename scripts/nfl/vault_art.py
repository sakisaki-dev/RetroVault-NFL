"""The pixel vault door: the app-open loader (index.html's inline SVG) and the iOS launch screens' static frame of it.

One 40 x 40 art-pixel grid drawn here is the single source: `svg_parts()` gives the three layers the splash animates
(the door body, the bolts that retract, the wheel that spins), `launch_image()` draws the same closed door on the navy.
`python3 scripts/nfl/vault_art.py --html` prints the markup that index.html carries (paste between the markers).
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image

N = 40
NAVY = "#080c18"
C = {
    "o": "#050810",  # outline
    "p": "#243153",  # plate
    "h": "#3d4f80",  # plate highlight
    "s": "#5d6f9c",  # door face
    "d": "#46567f",  # door face shade
    "r": "#2f3d66",  # door ring
    "l": "#a9b8dd",  # steel light
    "g": "#ffc83d",  # gold
    "G": "#c98a12",  # gold shade
    "k": "#0b1020",  # slot dark
}


def grid() -> tuple[dict, dict, dict]:
    body: dict[tuple[int, int], str] = {}
    bolts: dict[tuple[int, int], str] = {}
    wheel: dict[tuple[int, int], str] = {}
    cx = cy = 19.5
    # plate: chamfered square, outline, light top-left edge, dark bottom-right
    for y in range(N):
        for x in range(N):
            if 1 <= x <= 38 and 1 <= y <= 38 and not (min(x, 39 - x) + min(y, 39 - y) < 3):
                body[(x, y)] = "p"
    edge = {}
    for (x, y) in body:
        if any((x + dx, y + dy) not in body for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            edge[(x, y)] = "o"
    body.update(edge)
    for (x, y), c in list(body.items()):
        if c == "p" and ((x - 1, y) in edge or (x, y - 1) in edge):
            body[(x, y)] = "h"
    # door: disc with ring and face
    for y in range(N):
        for x in range(N):
            r = math.hypot(x - cx, y - cy)
            if r <= 16.5:
                body[(x, y)] = "o" if r > 15.4 else "r"
            if r <= 14.6:
                body[(x, y)] = "r" if r > 13.4 else ("s" if (x + y) < 39 else "d")
    # hinges on the left
    for hy in (8, 28):
        for y in range(hy, hy + 4):
            for x in range(0, 3):
                body[(x, y)] = "o" if x == 0 or y in (hy, hy + 3) else "l"
    # bolts: 8 gold 2x2 studs on r = 11.4
    for i in range(8):
        a = math.radians(45 * i + 22.5)
        bx, by = round(cx + 11.4 * math.cos(a) - 0.5), round(cy + 11.4 * math.sin(a) - 0.5)
        for dx in (0, 1):
            for dy in (0, 1):
                bolts[(bx + dx, by + dy)] = "g" if (dx, dy) != (1, 1) else "G"
    # wheel: ring r 8-9, eight spokes with knobs, gold hub, light dots
    for y in range(N):
        for x in range(N):
            r = math.hypot(x - cx, y - cy)
            if 7.6 <= r <= 9.2:
                wheel[(x, y)] = "l"
            if r <= 3.4:
                wheel[(x, y)] = "g" if r > 2.2 else "G"
            if r <= 1.2:
                wheel[(x, y)] = "o"
    for i in range(8):
        a = math.radians(45 * i)
        for t in range(3, 9):
            x, y = round(cx + t * math.cos(a)), round(cy + t * math.sin(a))
            wheel[(x, y)] = "g"
        kx, ky = round(cx + 11 * math.cos(a)), round(cy + 11 * math.sin(a))
        for dx in (0, 1):
            for dy in (0, 1):
                wheel[(min(39, kx + dx - (1 if math.cos(a) < -0.1 else 0)), ky + dy - (1 if math.sin(a) < -0.1 else 0))] = "g"
    return body, bolts, wheel


def runs_path(layer: dict) -> dict[str, str]:
    by: dict[str, list[tuple[int, int, int]]] = {}
    for y in range(N):
        x = 0
        while x < N:
            c = layer.get((x, y))
            if c is None:
                x += 1
                continue
            x2 = x
            while layer.get((x2 + 1, y)) == c:
                x2 += 1
            by.setdefault(c, []).append((x, y, x2 - x + 1))
            x = x2 + 1
    return {c: "".join(f"M{x} {y}h{w}v1h-{w}z" for x, y, w in rs) for c, rs in by.items()}


def svg_parts() -> tuple[str, str, str]:
    out = []
    for layer in grid():
        out.append("".join(f'<path fill="{C[c]}" d="{d}"/>' for c, d in runs_path(layer).items()))
    return tuple(out)  # type: ignore


def launch_image(w_css: int, h_css: int, dpr: int) -> Image.Image:
    """Closed door, centred, one art pixel = 5 css px (the HTML splash is 200 css px wide, so the two line up exactly)."""
    w, h = w_css * dpr, h_css * dpr
    img = Image.new("RGB", (w, h), NAVY)
    door = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    for layer in grid():
        for (x, y), c in layer.items():
            door.putpixel((x, y), tuple(int(C[c][i : i + 2], 16) for i in (1, 3, 5)) + (255,))
    size = 200 * dpr  # 40 art px x 5 css px x dpr: whole device pixels per art pixel
    door = door.resize((size, size), Image.NEAREST)
    img.paste(door, ((w - size) // 2, (h - size) // 2), door)
    return img


if __name__ == "__main__":
    if "--html" in sys.argv:
        b, o, wl = svg_parts()
        print(f'<svg id="rv-vault" viewBox="0 0 40 40" shape-rendering="crispEdges"><g id="rv-v-door">{b}<g id="rv-v-bolts">{o}</g><g id="rv-v-wheel">{wl}</g></g></svg>')
