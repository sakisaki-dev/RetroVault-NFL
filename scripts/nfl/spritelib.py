"""NFL edition: what silhouettes.py and era_sprites.py share, the sprite folder's writer and the index format.

The writer (`Store`) saves a generated image only when no identical one exists: every image is hashed (its PNG bytes)
and a second file with the same pixels becomes an entry in index.json `aliases` ({virtual file name: file that holds
it}) instead of a file, which the site resolves when it builds a path (src/utils/gameSprites.ts `nflFile`). Anchors that
are the body template's own ([31.5, 58]) are left out of `anchors`: the site's default is the same. See
public/private-sprites/nfl/README.md for the whole index format.
"""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPR = ROOT / "public" / "private-sprites" / "nfl"
DEFAULT_ANCHOR = [31.5, 58]
ROLE_POSE = {"QB": 2, "RB": 4, "WR": 4, "TE": 4}


def fnv(text: str) -> int:
    h = 0x811C9DC5
    for b in text.encode():
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def fname(uid: str, kit, pose: int, era: bool = False) -> str:
    """{uid}_{kit:03d}[_era][_pN].png (kit = club uid, 800 the neutral kit; _era the club's era kit)."""
    k = f"{kit:03d}" if isinstance(kit, int) else str(kit)
    return f"{uid}_{k}{'_era' if era else ''}{'_p%d' % pose if pose > 1 else ''}.png"


def anchor_of(a: np.ndarray) -> list[float]:
    """scripts/private_nfl_sprites.py anchor() on an array: [centre x of his legs, last row of his feet]."""
    ys, xs = np.nonzero(a[:, :, 3] > 200)
    if not len(ys):
        return [a.shape[1] / 2, a.shape[0] - 1]
    foot = int(ys.max())
    legs = xs[ys >= foot - 9]
    return [round((int(legs.min()) + int(legs.max()) + 1) / 2, 1), foot]


def entry_files(ix: dict, e: dict) -> list[str]:
    """Every file name an index entry names (kits, neutral, eras)."""
    out = []
    for club, poses in (e.get("kits") or {}).items():
        out += [fname(e["uid"], ix["clubs"][club], p) for p in poses if club in ix["clubs"]]
    out += [fname(e["uid"], 800, p) for p in e.get("neutral") or []]
    for club, info in (e.get("eras") or {}).items():
        out += [fname(e["uid"], ix["clubs"][club], p, True) for p in info["poses"] if club in ix["clubs"]]
    return out


def load_index(spr: Path = SPR) -> dict:
    return json.loads((spr / "index.json").read_text())


def save_index(ix: dict, spr: Path = SPR) -> None:
    (spr / "index.json").write_text(json.dumps(ix, separators=(",", ":"), ensure_ascii=False) + "\n")


class Store:
    """Writes generated sprites into the folder, one file per distinct image."""

    def __init__(self, ix: dict, spr: Path = SPR):
        self.ix, self.spr = ix, spr
        self.alias: dict[str, str] = ix.setdefault("aliases", {})
        self.anchors: dict[str, list[float]] = ix.setdefault("anchors", {})
        self.by_hash: dict[str, str] = {}
        self.written = self.deduped = 0

    def put(self, name: str, a: np.ndarray) -> str:
        buf = io.BytesIO()
        Image.fromarray(a).save(buf, "PNG", optimize=True)
        data = buf.getvalue()
        h = hashlib.sha1(data).hexdigest()
        canon = self.by_hash.get(h)
        if canon is not None:
            if canon != name:
                self.alias[name] = canon
            self.deduped += 1
            return canon
        (self.spr / name).write_bytes(data)
        self.by_hash[h] = name
        an = anchor_of(a)
        if an != DEFAULT_ANCHOR:
            self.anchors[name] = an
        self.written += 1
        return name


def era_files(ix: dict, e: dict) -> list[str]:
    return [fname(e["uid"], ix["clubs"][c], p, True) for c, info in (e.get("eras") or {}).items() for p in info["poses"] if c in ix["clubs"]]


def forget(ix: dict, spr: Path, names) -> int:
    """Removes generated files (and their anchors and aliases) before they are made again."""
    names = set(names)
    for n in names:
        ix.get("anchors", {}).pop(n, None)
    al = ix.get("aliases", {})
    for k in [k for k, v in al.items() if k in names or v in names]:
        del al[k]
    n = 0
    for f in names:
        p = spr / f
        if p.exists():
            p.unlink()
            n += 1
    return n
