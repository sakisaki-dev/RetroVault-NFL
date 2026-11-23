#!/usr/bin/env python3
"""NFL edition: the real players' own game sprites, from the fresh save, into public/private-sprites/nfl/.

    python3 scripts/nfl/sprites.py

Every player of data/y80/players.json carries his save uid (the `nfl` block, scripts/nfl/match.py), so there is no name
matching here. His club kits and poses are copied from faces_img/<uid>_<kit>[_pN].png (kit = club uid, 800 = neutral).
A player the save has no sprite for (mostly rookies) gets a look from the pool of the game's generic templates and real
players' neutral sprites, fitted to his skin and seeded by his key, painted into his club's kit on the site: the same
`assigned` mechanism the fictional league used. The folder is rebuilt from scratch. Same index.json format as
scripts/private_nfl_sprites.py (the site's gameSprites.ts reads it). Deterministic.
"""
from __future__ import annotations

import collections
import json
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import private_nfl_sprites as P  # noqa: E402  (anchor, SPRITE)
import save_read  # noqa: E402

OUT = ROOT / "public" / "private-sprites" / "nfl"
DOCS = ROOT / "data" / "saves" / "2026-11-21" / "nfl" / "Documents"
SLOT = DOCS / "rb_nfl_savedata_6.json"


def fnv(text: str) -> int:
    h = 0x811C9DC5
    for b in text.encode():
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def main() -> None:
    save = save_read.Save(SLOT)
    clubs = {uid: t["name"] for uid, t in save.teams.items()}
    img_dir = DOCS / "rb_nfl_players_2024" / "faces_img"
    sprites: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
    for f in img_dir.iterdir():
        m = P.SPRITE.match(f.name)
        if m:
            sprites[m.group(1)].append((int(m.group(2)), int(m.group(3) or 1), f.name))
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    anchors: dict[str, list[float]] = {}

    def put(name: str) -> None:
        shutil.copy2(img_dir / name, OUT / name)
        anchors[name] = P.anchor(OUT / name)

    players_json = json.loads((ROOT / "data" / "y80" / "players.json").read_text())
    looks_by_uid: dict[str, set] = defaultdict(set)
    raw_by_uid = {}
    for q in save.players:
        raw = q["raw"]
        raw_by_uid[q["uid"]] = raw
        skin, col = int(float(raw.get("skin", -1))), int(float(raw.get("col_skin", -1)))
        if skin >= 0 and col >= 0:
            looks_by_uid[q["uid"]].add((str(skin), col))

    players: dict[str, dict] = {}
    missing: list[dict] = []
    for p in players_json:
        key = f"{p['pos']}:{p['n']}"
        uid = str((p.get("nfl") or {}).get("uid") or "")
        files = sprites.get(uid) if uid else None
        if not files:
            missing.append({"key": key, "uid": uid, "team": p.get("team")})
            continue
        kits: dict[str, list[int]] = defaultdict(list)
        neutral: list[int] = []
        for kit, pose, name in sorted(files):
            if kit == 800:
                neutral.append(pose)
            elif kit in clubs:
                kits[clubs[kit]].append(pose)
            else:
                continue
            put(name)
        players[key] = {"uid": uid, "kits": dict(kits), "neutral": neutral}

    # stand-in pool: the game's generic templates (900xxx uids, not in this save's players) with all five neutral
    # poses. The save has no skin group for them, so it is read from the sprite itself: the median brightness of the
    # skin pixels of the head, matched to the nearest group of the real players' own sprites (0 dark, 1 mix, 2 light)
    from PIL import Image

    def skin_colour(name: str):
        """The skin pixel colour of a sprite's head: the commonest bright, warm colour in the face rows."""
        px = Image.open(img_dir / name).convert("RGBA").load()
        c = collections.Counter(px[x, y][:3] for y in range(8, 24) for x in range(22, 42)
                                if px[x, y][3] == 255 and px[x, y][0] >= 95 and px[x, y][0] > px[x, y][1] > px[x, y][2])
        return c.most_common(1)[0][0] if c else None

    by_group: dict[int, collections.Counter] = defaultdict(collections.Counter)
    for key, e in sorted(players.items()):
        raw = raw_by_uid.get(e["uid"])
        if raw and 1 in e["neutral"]:
            c = skin_colour(P.sprite_name(e["uid"], 800, 1))
            if c:
                by_group[int(float(raw["skin"]))][c] += 1
    standins: dict[str, dict] = {}
    for uid in sorted(sprites):
        if not uid.startswith("9") or uid in raw_by_uid:
            continue
        poses = sorted(pose for kit, pose, _ in sprites[uid] if kit == 800)
        c = skin_colour(P.sprite_name(uid, 800, 1)) if poses == [1, 2, 3, 4, 5] else None
        if c is None:
            continue
        # the game's skin group whose real players most often wear this skin colour
        share = {g: n[c] / sum(n.values()) for g, n in by_group.items()}
        standins[uid] = {"uid": uid, "skin": max(share, key=share.get), "neutral": poses}
    print("stand-in templates by skin group:", {g: sum(1 for x in standins.values() if x["skin"] == g) for g in sorted(by_group)})
    have = {e["uid"] for e in players.values()}
    pool = [{"uid": u, "skin": x["skin"], "col": -1, "pool": "generic"} for u, x in sorted(standins.items())]
    used_pos: dict[str, set] = defaultdict(set)
    used_club: dict[str, set] = defaultdict(set)
    club_of = {f"{p['pos']}:{p['n']}": p.get("team") or "" for p in players_json}
    for key, e in players.items():
        used_pos[key.split(":")[0]].add(e["uid"])
        used_club[club_of[key]].add(e["uid"])
    assigned = {"generic": 0, "real": 0}
    for m in sorted(missing, key=lambda m: m["key"]):
        key, pos, club = m["key"], m["key"].split(":")[0], m["team"] or ""
        raw = raw_by_uid.get(m["uid"])
        fits = []
        if raw:
            skin, col = int(float(raw.get("skin", -1))), int(float(raw.get("col_skin", -1)))
            fits = [x for x in pool if x["skin"] == skin]
        ranked = sorted(fits or pool, key=lambda x: fnv(f"{key}|{x['uid']}"), reverse=True)
        x = next((x for x in ranked if x["uid"] not in used_pos[pos] and x["uid"] not in used_club[club]),
                 next((x for x in ranked if x["uid"] not in used_pos[pos]), ranked[0]))
        for kit, pose, name in sprites[x["uid"]]:
            if kit == 800:
                put(name)
        players[key] = {"uid": x["uid"], "kits": {}, "neutral": [1, 2, 3, 4, 5], "assigned": True, "pool": x["pool"]}
        used_pos[pos].add(x["uid"])
        used_club[club].add(x["uid"])
        assigned[x["pool"]] += 1
    for u in {e["uid"] for e in players.values() if e.get("assigned")}:
        if u in standins:
            continue
    # the stand-in list keeps only the templates a player's look needs elsewhere (the site picks a look for a player
    # without an entry); the generic ones are small, so all that were copied stay
    used_standins = sorted({e["uid"] for e in players.values() if e.get("assigned")} & set(standins))
    for u in sorted(standins):
        if u not in used_standins:
            for pose in standins[u]["neutral"]:
                put(P.sprite_name(u, 800, pose))
    index = {
        "about": "NFL edition demo: the real players' own game sprites (New Star Games, NFL/NFLPA marks), copied by "
                 "scripts/nfl/sprites.py from the 2026 save. Local only.",
        "size": [64, 64],
        "file": "{uid}_{kit:03d}{suffix}.png (kit = club uid, 800 neutral; suffix '' for pose 1, else _p<pose>)",
        "clubs": {name: uid for uid, name in sorted(clubs.items())},
        "save": {"slot": SLOT.name, "year": save.year, "myteam": clubs.get(save.my_team)},
        "saveYears": [save.year],
        "players": dict(sorted(players.items())),
        "legends": {},
        "standins": [standins[u] for u in sorted(standins)],
        "coaches": {},
        "anchors": dict(sorted(anchors.items())),
        "unmatched": [],
        "ambiguous": [],
    }
    (OUT / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n")
    n_real = len(players) - sum(assigned.values())
    print(f"sprites: {len(players)} players ({n_real} with their own, {assigned['generic']} generic + "
          f"{assigned['real']} real stand-in looks), {len(list(OUT.glob('*.png')))} files, pool {len(pool)}")


if __name__ == "__main__":
    main()
