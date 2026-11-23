#!/usr/bin/env python3
"""NFL edition: era-kit sprites for the players who have a game sprite of their own (the silhouettes get theirs in
silhouettes.py, which paints each donor into the era kit before blacking the head out).

    python3 scripts/nfl/era_sprites.py        (after silhouettes.py: nfl:sprites)
    options: --players F --stints F --extras F --sprites DIR  as silhouettes.py; --poses auto|all

Owner, 2026-11-23: a player whose seasons at a club fall in the years its famous era kit was worn (src/config/eraKits.ts,
uniforms.ts ERAS; 2001 Patriots, 1990s Lions ...) is also drawn in that kit. His own kit file at the club (else his file
in another club's kit, repainted: scripts/nfl/era.py) is recoloured into the era kit, with his real number, and written
as <uid>_<club>_era[_pN].png beside his modern files; the index entry gets `eras` {club: {poses, mid}} (`mid`: the middle
season of his time with the club lies in the era, so the era kit is his default kit there) and the index `eraKits`
{club: {id, label, from, to}} the site tests a season against. Skin, face, gloves and cleats are his own.
"""
import argparse
import collections
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import era as E  # noqa: E402
import spritelib as L  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--players", default=str(ROOT / "data/y80/players.json"))
    ap.add_argument("--stints", default=str(ROOT / "data/y80/stints.json"))
    ap.add_argument("--extras", default=str(ROOT / "public/data/player-extras.json"))
    ap.add_argument("--sprites", default=str(L.SPR))
    ap.add_argument("--poses", default="auto", choices=["auto", "all"])
    args = ap.parse_args()
    SPR = Path(args.sprites)
    ix = L.load_index(SPR)
    clubs = ix["clubs"]
    painter = E.Painter(ix)
    nums = json.loads(Path(args.extras).read_text()).get("realNumbers", {})
    byk = {f"{p['pos']}:{p['n']}": p for p in json.loads(Path(args.players).read_text())}
    stints_all = json.loads(Path(args.stints).read_text()) if Path(args.stints).exists() else {}
    real = {k: e for k, e in ix["players"].items() if not e.get("silhouette") and not e.get("shot")}
    # drop the eras an earlier run drew for real players
    L.forget(ix, SPR, [f for e in real.values() for f in L.era_files(ix, e)])
    for e in real.values():
        e.pop("eras", None)
    store = L.Store(ix, SPR)
    made = collections.Counter()
    for key, e in sorted(real.items()):
        p = byk.get(key)
        if not p:
            continue
        st = (stints_all.get(p["n"]) or {}).get("stints") or []
        number = nums.get(key)
        retired = bool((p.get("nfl") or {}).get("past") or (p.get("nfl") or {}).get("retired"))
        for club in dict.fromkeys(s["team"] for s in st):
            window = E.era_window(painter.pal, club, st)
            if not window or club not in clubs:
                continue
            # his own file at the club, else one in another club's kit (the pose he is drawn in decides which)
            src_club = club if club in e["kits"] else next((c for c in e["kits"] if c in clubs and 1 in e["kits"][c]), None)
            if src_club is None:
                made["no kit file"] += 1
                continue
            have_poses = e["kits"][src_club]
            want = sorted(have_poses) if args.poses == "all" or not retired else sorted({1, L.ROLE_POSE.get(p["pos"], 1)} & set(have_poses)) or [min(have_poses)]
            poses = []
            for pose in want:
                f = SPR / L.fname(e["uid"], clubs[src_club], pose)
                if not f.exists():
                    continue
                a = np.asarray(Image.open(f).convert("RGBA"))
                store.put(L.fname(e["uid"], clubs[club], pose, True), painter.paint(a, src_club, club, pose, number))
                poses.append(pose)
            if poses:
                e.setdefault("eras", {})[club] = {"poses": poses, "mid": window[2]}
                made["era clubs"] += 1
    ix["eraKits"] = {c: {"id": v["id"], "label": v["label"], "from": v["from"], "to": v["to"]} for c, v in painter.pal.items()}
    ix["anchors"] = {k: v for k, v in sorted(store.anchors.items()) if v != L.DEFAULT_ANCHOR}
    ix["aliases"] = dict(sorted(store.alias.items()))
    L.save_index(ix, SPR)
    print(f"era sprites for own-sprite players: {dict(made)}; {store.written} files, {store.deduped} identical stored once")


if __name__ == "__main__":
    main()
