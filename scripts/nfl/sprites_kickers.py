#!/usr/bin/env python3
"""NFL edition: the kickers' own game sprites (owner, 2026-11-25: kickers are in), added to public/private-sprites/nfl/.

    python3 scripts/nfl/sprites_kickers.py        (RV_SAVE_DOCS=<save Documents folder> when the save is not under data/saves/)

scripts/nfl/match.py skips the save's kickers and punters, so scripts/nfl/sprites.py never copied theirs. This step is
ADDITIVE (it never rebuilds the folder): every save kicker (position 10, a real player) is matched to a K of
data/y80/players.json by normalised name, and his faces_img/<uid>_<kit>[_pN].png files (club kits and the neutral 800) are
copied, listed in index.json `players` ("K:Name": {uid, kits, neutral}) and measured into `anchors`, the same shape
sprites.py writes. A kicker the save has no sprite for gets the silhouette stand-in from scripts/nfl/silhouettes.py like any
other player. Punters stay out. Deterministic; running it again changes nothing.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import private_nfl_sprites as P  # noqa: E402

OUT = ROOT / "public" / "private-sprites" / "nfl"
DOCS = Path(os.environ.get("RV_SAVE_DOCS") or ROOT / "data" / "saves" / "2026-11-21" / "nfl" / "Documents")
SLOT = DOCS / "rb_nfl_savedata_6.json"
KICKER = 10   # the save's position code


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", " ", s.replace(".", " "))
    return re.sub(r"[^a-z]", "", s)


def main() -> None:
    index = json.loads((OUT / "index.json").read_text())
    clubs = {uid: name for name, uid in index["clubs"].items()}
    d = json.loads(SLOT.read_text())
    pool = d["players"]["pool"]
    pool = list(pool.values()) if isinstance(pool, dict) else pool
    img_dir = DOCS / "rb_nfl_players_2024" / "faces_img"
    files = defaultdict(list)
    for f in img_dir.iterdir():
        m = P.SPRITE.match(f.name)
        if m:
            files[m.group(1)].append((int(m.group(2)), int(m.group(3) or 1), f.name))
    ours = defaultdict(list)
    for p in json.loads((ROOT / "data" / "y80" / "players.json").read_text()):
        if p["pos"] == "K":
            ours[norm(p["n"].split(" (")[0])].append(f"K:{p['n']}")
    added = unmatched = nosprite = 0
    for q in sorted(pool, key=lambda q: str(q["uid"])):
        if int(float(q["position"])) != KICKER or not q.get("is_real_crew"):
            continue
        keys = ours.get(norm(f"{q['fname']} {q['lname']}"), [])
        if len(keys) != 1:
            unmatched += 1
            continue
        uid = str(q["uid"])
        fs = files.get(uid)
        if not fs:
            nosprite += 1
            continue
        kits: dict[str, list[int]] = defaultdict(list)
        neutral: list[int] = []
        for kit, pose, name in sorted(fs):
            if kit == 800:
                neutral.append(pose)
            elif kit in clubs:
                kits[clubs[kit]].append(pose)
            else:
                continue
            shutil.copy2(img_dir / name, OUT / name)
            index["anchors"][name] = P.anchor(OUT / name)
        index["players"][keys[0]] = {"uid": uid, "kits": dict(kits), "neutral": neutral}
        added += 1
    index["players"] = dict(sorted(index["players"].items()))
    index["anchors"] = dict(sorted(index["anchors"].items()))
    (OUT / "index.json").write_text(json.dumps(index, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"kicker sprites: {added} kickers added, {nosprite} with no sprite in the save, {unmatched} save kickers not matched to a player")


if __name__ == "__main__":
    main()
