#!/usr/bin/env python3
"""NFL edition: the silhouette stand-in for every player with no sprite of his own, written as his own sprite files.

    python3 scripts/nfl/silhouettes.py        (after sprites.py, kit_colors.py and jersey_numbers.py: nfl:sprites)

Owner, 2026-11-23: "remove the random generation, the silhouette should apply to all players who don't have a sprite".
The approved look (scripts/nfl/shadow_mockup.py, read-only here):
  body + uniform  a real game sprite of a player AT HIS CLUB: the same position (LB and DL interchangeable), then the
                  nearest real height and weight; donors wearing the club's most common plain gear are preferred
                  (gloves, sleeves and wristbands matching the club's modal arm palette: no tattoos or coloured sleeves)
  number          the donor's erased and his own drawn in the game's font (index.json numberFont)
  head            the outline of a game face template (stable by his key), blacked out in a club-tinted near-black with
                  a 1px light rim: no eyes, hair or detail; bare arms, neck and legs' skin blacked out too
Written as <uid>_<club>[_pN].png for every pose the donor has at the club he is drawn in (his club; a free agent's last
club), indexed with "silhouette": true so a real sprite found later replaces them (sprites.py rebuilds the folder from
the save first; this step only fills the gaps). Donor fallbacks (owner, 2026-11-23): a club with no donor of a similar
build falls back to the nearest build at any position at that club (LB/DL first), then to the nearest build league-wide
repainted into the club's kit (the site's kit repaint at draw time: the file stays the donor's club kit, "from" set).
"""
import collections
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import private_nfl_sprites as P  # noqa: E402
import jersey_numbers as J  # noqa: E402

SPR = ROOT / "public" / "private-sprites" / "nfl"
SLOT = ("one", "left", "right")


def fnv(text):
    h = 0x811C9DC5
    for b in text.encode():
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def skinish(c):
    return c[0] > c[2] + 20 and c[0] > 60 and sum(c) < 600


def skin_set(a):
    """The donor's own skin colours: the warm colours of his face and neck (rows 8-28), so cloth that happens to be
    brown (the Browns' jersey) is never taken for skin."""
    cnt = collections.Counter(tuple(int(v) for v in a[y, x, :3]) for y in range(8, 29) for x in range(20, 44) if a[y, x, 3] and skinish(tuple(int(v) for v in a[y, x, :3])))
    return {c for c, n in cnt.items() if n >= 3}


def fname(uid, kit, pose):
    return SPR / f"{uid}_{kit}{'_p%d' % pose if pose > 1 else ''}.png"


def main():
    ix = json.loads((SPR / "index.json").read_text())
    clubs = ix["clubs"]
    font = {tuple(k.split("|")): v for k, v in ix["numberFont"].items()}
    nums = json.loads((ROOT / "public/data/player-extras.json").read_text())
    sig = nums.get("signatureTeams", {})
    nums = nums.get("realNumbers", {})
    players = json.loads((ROOT / "data/y80/players.json").read_text())
    byk = {f"{p['pos']}:{p['n']}": p for p in players}
    have = ix["players"]
    # real donors: own files of a real player (never an earlier silhouette), per club
    donors = collections.defaultdict(list)
    for key, e in have.items():
        if e.get("silhouette") or e.get("shot") or key not in byk:
            continue
        for club, poses in e["kits"].items():
            if club in clubs and 1 in poses and (SPR / f"{e['uid']}_{clubs[club]:03d}.png").exists():
                donors[club].append(key)

    def gear(key, club):
        """The colours on his arms and hands outside the jersey and skin: gloves, sleeves, wristbands, tattoos."""
        e = have[key]
        a = np.asarray(Image.open(SPR / f"{e['uid']}_{clubs[club]:03d}.png").convert("RGBA")).astype(int)
        cnt = collections.Counter()
        for y in range(34, 50):
            for x in list(range(14, 25)) + list(range(39, 50)):
                if a[y, x, 3] and not skinish(tuple(a[y, x, :3])):
                    cnt[tuple(int(v) for v in a[y, x, :3])] += 1
        return frozenset(c for c, n in cnt.items() if n >= 2)

    modal = {}
    for club, keys in donors.items():
        c = collections.Counter(gear(k, club) for k in keys)
        modal[club] = c.most_common(1)[0][0]
    heights = collections.defaultdict(list)
    for k in have:
        p = byk.get(k)
        nf = (p or {}).get("nfl") or {}
        if nf.get("height") and nf.get("weight"):
            heights[p["pos"]].append((nf["height"], nf["weight"]))
    med = {pos: (int(np.median([h for h, _ in v])), int(np.median([w for _, w in v]))) for pos, v in heights.items()}

    def pick(key, p, club):
        pos = p["pos"]
        nf = p.get("nfl") or {}
        ht, wt = (nf.get("height"), nf.get("weight")) if nf.get("height") and nf.get("weight") else med.get(pos, (74, 220))
        stage = []
        for tier, pool in (("club", donors.get(club, [])), ("any", [k for ks in donors.values() for k in ks])):
            best = None
            for k in pool:
                q = byk[k]
                qn = q.get("nfl") or {}
                if not qn.get("height") or not qn.get("weight"):
                    continue
                same = q["pos"] == pos or {q["pos"], pos} <= {"LB", "DL"}
                if tier == "club" and not same:
                    continue
                score = (0 if same else 40) + abs(qn["height"] - ht) * 3 + abs(qn["weight"] - wt) * 0.4
                if tier == "club" and gear(k, club) != modal[club]:
                    score += 12
                if best is None or score < best[0]:
                    best = (score, k)
            if best and (tier == "club" and best[0] < 60 or tier == "any"):
                stage.append((tier, best[1]))
                break
        if not stage:  # a club with no similar build: the nearest build at any position at the club
            pool = [k for k in donors.get(club, []) if (byk[k].get("nfl") or {}).get("height")]
            if pool:
                stage.append(("club-any", min(pool, key=lambda k: abs(byk[k]["nfl"]["height"] - ht) * 3 + abs(byk[k]["nfl"]["weight"] - wt) * 0.4)))
        return stage[0] if stage else None

    # head outlines only from templates whose head (rows above the shoulders) is within one pixel of the real players'
    # median size (owner, 2026-11-23: the silhouette heads looked oversized: long hair and big afros made them wider)
    def head_box(path):
        al = np.asarray(Image.open(path).convert("RGBA"))[:27, :, 3] > 0
        ys, xs = np.where(al)
        return int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)

    real_boxes = [head_box(SPR / f"{e['uid']}_800.png") for e in have.values() if not e.get("silhouette") and not e.get("shot") and 1 in e["neutral"]]
    mw, mh = (int(np.median([b[0] for b in real_boxes])), int(np.median([b[1] for b in real_boxes])))
    all_t = [s["uid"] for s in ix["standins"] if s["neutral"] == [1, 2, 3, 4, 5]]
    templates = sorted(u for u in all_t if abs(head_box(SPR / f"{u}_800.png")[0] - mw) <= 1 and abs(head_box(SPR / f"{u}_800.png")[1] - mh) <= 1)
    print(f"head templates within 1 px of {mw} x {mh}: {len(templates)} of {len(all_t)}")
    made = collections.Counter()
    for key, p in sorted(byk.items()):
        if key in have and not have[key].get("assigned"):
            continue
        club = p.get("team") if p.get("team") in clubs else (sig.get(p["n"]) or "")  # a free agent: his last club
        club = club if club in clubs else next((c for c in clubs if club and c.split()[-1] == club.split()[-1]), "")
        if not club:
            # on no club's books (no games, no stint): the silhouette in the game's neutral white kit, from the nearest
            # build with a neutral file; the site paints it into whatever club he is shown in
            nf = p.get("nfl") or {}
            ht, wt = (nf.get("height"), nf.get("weight")) if nf.get("height") and nf.get("weight") else med.get(p["pos"], (74, 220))
            pool = [k for k, e in have.items() if e.get("neutral") and not e.get("silhouette") and not e.get("shot") and k in byk and (byk[k].get("nfl") or {}).get("height")]
            if not pool:
                made["no club"] += 1
                continue
            dk = min(pool, key=lambda k: (0 if byk[k]["pos"] == p["pos"] or {byk[k]["pos"], p["pos"]} <= {"LB", "DL"} else 40) + abs(byk[k]["nfl"]["height"] - ht) * 3 + abs(byk[k]["nfl"]["weight"] - wt) * 0.4)
            de = have[dk]
            uid = str(nf.get("uid") or f"s{fnv(key):08x}")
            tpl = templates[fnv(key + "|head") % len(templates)]
            poses = []
            for pose in de["neutral"]:
                src = SPR / f"{de['uid']}_800{'_p%d' % pose if pose > 1 else ''}.png"
                a = np.asarray(Image.open(src).convert("RGBA")).copy()
                skin = skin_set(a)
                t = np.asarray(Image.open(SPR / f"{tpl}_800{'_p%d' % pose if pose > 1 else ''}.png").convert("RGBA"))
                night, rim, neck = (38, 40, 48), (150, 156, 175), 27
                a[:neck, 16:48] = 0
                head = t[:neck, 16:48, 3] > 0
                for y in range(neck):
                    for x in range(16, 48):
                        if head[y, x - 16]:
                            edge = any(not (0 <= y + dy < neck and 16 <= x + dx < 48 and head[y + dy, x + dx - 16]) for dy, dx in ((-1, 0), (0, -1), (0, 1)))
                            a[y, x] = (*(rim if edge else night), 255)
                for y in range(neck, 64):
                    for x in range(64):
                        if a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) in skin:
                            a[y, x, :3] = night
                # a neutral dark training kit (owner: no white kits): charcoal jersey and grey pants, number in light grey
                tone = {(0xBF, 0xBF, 0xBF): [(52, 56, 66), (122, 127, 140), (92, 97, 108)], (0x8F, 0x8F, 0x8F): [(34, 37, 45), (92, 97, 108), (60, 64, 74)], (0xFB, 0xFF, 0xFD): [(150, 156, 170), (150, 156, 170), (150, 156, 170)]}
                for y in range(27, 59):
                    band = 0 if y < 41 else 1 if y < 49 else 2
                    for x in range(64):
                        c = tuple(int(v) for v in a[y, x, :3])
                        if a[y, x, 3] and c in tone:
                            a[y, x, :3] = tone[c][band]
                num = nums.get(key) or (p.get("nfl") or {}).get("number")
                if num:
                    for (y, x) in J.glyph_cells(font, int(num)) or []:
                        if a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) in ((52, 56, 66), (34, 37, 45)):
                            a[y, x, :3] = (176, 182, 196) if y in (34, 35) else (214, 219, 230)
                out = fname(uid, "800", pose)
                Image.fromarray(a).save(out)
                ix["anchors"][out.name] = P.anchor(out)
                poses.append(pose)
            have[key] = {"uid": uid, "kits": {}, "neutral": sorted(poses), "silhouette": True, "training": True}
            made["neutral"] += 1
            continue
        choice = pick(key, p, club)
        if not choice:
            made["no donor"] += 1
            continue
        tier, dk = choice
        de = have[dk]
        dclub = club if tier in ("club", "club-any") else next(c for c in de["kits"] if c in clubs)
        uid = str((p.get("nfl") or {}).get("uid") or f"s{fnv(key):08x}")
        tpl = templates[fnv(key + "|head") % len(templates)]
        number = nums.get(key)
        poses = []
        for pose in de["kits"][dclub]:
            src = SPR / f"{de['uid']}_{clubs[dclub]:03d}{'_p%d' % pose if pose > 1 else ''}.png"
            if not src.exists():
                continue
            a = np.asarray(Image.open(src).convert("RGBA")).copy()
            jersey, nc = J.chest(a)
            band = J.band_of(a) or {}
            # erase the donor's number (every number-colour pixel on the chest, the band accent in rows 34-35)
            for y in range(33, 40):
                for x in range(26, 38):
                    if not a[y, x, 3]:
                        continue
                    c = tuple(int(v) for v in a[y, x, :3])
                    if y in band and band[y][1] and c == band[y][1]:
                        a[y, x, :3] = band[y][0]
                    elif y not in band and nc and c == nc:
                        a[y, x, :3] = jersey
            if number is not None and nc is not None:
                for (y, x) in J.glyph_cells(font, number) or []:
                    if a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) == (band[y][0] if y in band else jersey):
                        a[y, x, :3] = (band[y][1] or nc) if y in band else nc
            skin = skin_set(a)
            t = np.asarray(Image.open(SPR / f"{tpl}_800{'_p%d' % pose if pose > 1 else ''}.png").convert("RGBA"))
            night = tuple(int(v * 0.22 + 8) for v in jersey)
            rim = tuple(min(255, int(v * 0.45 + 120)) for v in jersey)
            neck = 27
            a[:neck, 16:48] = 0
            head = t[:neck, 16:48, 3] > 0
            for y in range(neck):
                for x in range(16, 48):
                    if head[y, x - 16]:
                        edge = any(not (0 <= y + dy < neck and 16 <= x + dx < 48 and head[y + dy, x + dx - 16]) for dy, dx in ((-1, 0), (0, -1), (0, 1)))
                        a[y, x] = (*(rim if edge else night), 255)
            for y in range(neck, 64):
                for x in range(64):
                    if a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) in skin:
                        a[y, x, :3] = night
            out = fname(uid, f"{clubs[dclub]:03d}", pose)
            Image.fromarray(a).save(out)
            ix["anchors"][out.name] = P.anchor(out)
            poses.append(pose)
        if not poses:
            made["no files"] += 1
            continue
        ent = {"uid": uid, "kits": {dclub: sorted(poses)}, "neutral": [], "silhouette": True}
        if dclub != club:
            ent["from"] = dclub  # drawn in another club's kit: the site repaints it into his club (gameKitPaint.ts)
        have[key] = ent
        made[tier] += 1
    ix["players"] = dict(sorted(have.items()))
    (SPR / "index.json").write_text(json.dumps(ix, indent=1, ensure_ascii=False) + "\n")
    print("silhouettes:", dict(made))


if __name__ == "__main__":
    main()
