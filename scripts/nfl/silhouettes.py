#!/usr/bin/env python3
"""NFL edition: the silhouette stand-in for every player with no sprite of his own, written as his own sprite files.

    python3 scripts/nfl/silhouettes.py        (after sprites.py, kit_colors.py and jersey_numbers.py: nfl:sprites)
    options: --players F --stints F --extras F   other player / stint / player-extras files (default data/y80, public/data)
             --sprites DIR                       another sprite folder (a copy of public/private-sprites/nfl)
             --poses auto|min|all                which poses (default auto: active players all the donor's, retired ones the
                                                 standing pose and the role pose); --limit N the first N players (tests)
             --no-era                            no era kits

Owner, 2026-11-23: "remove the random generation, the silhouette should apply to all players who don't have a sprite".
It works for any player list: whatever players.json / stints.json hold when it runs (the 3,000 on the rosters, plus the
past players a branch adds) get a silhouette for EVERY club in their stints, and an era kit for each of those clubs that
has a famous era kit when he played there (scripts/nfl/era.py, src/config/eraKits.ts).
The approved look (scripts/nfl/shadow_mockup.py, read-only here):
  body + uniform  a real game sprite of a player AT THE CLUB: the same position (LB and DL interchangeable), then the
                  nearest real height and weight; donors wearing the club's most common plain gear are preferred
                  (gloves, sleeves and wristbands matching the club's modal arm palette: no tattoos or coloured sleeves)
  number          the donor's erased and his own drawn in the game's font (index.json numberFont)
  head            the outline of a game face template (stable by his key), blacked out in a club-tinted near-black with
                  a 1px light rim: no eyes, hair or detail; bare arms, neck and legs' skin blacked out too
Donor fallbacks (owner, 2026-11-23): a club with no donor of a similar build falls back to the nearest build at any
position at that club (LB/DL first), then to the nearest build league-wide repainted into the club's kit (the site's kit
repaint at draw time: the file stays the donor's club kit, "from" set).
Written as <uid>_<club>[_era][_pN].png, indexed with "silhouette": true so a real sprite found later replaces them
(sprites.py rebuilds the folder from the save first; this step only fills the gaps). One file per distinct image
(spritelib.Store: identical pixels are an alias in index.json), standing pose and role pose only for retired players.
"""
import argparse
import collections
import functools
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import era as E  # noqa: E402
import jersey_numbers as J  # noqa: E402
import spritelib as L  # noqa: E402

fnv = L.fnv
NIGHT_NEUTRAL, RIM_NEUTRAL = (38, 40, 48), (150, 156, 175)


def skinish(c):
    return c[0] > c[2] + 20 and c[0] > 60 and sum(c) < 600


def skin_set(a):
    """The donor's own skin colours: the warm colours of his face and neck (rows 8-28), so cloth that happens to be
    brown (the Browns' jersey) is never taken for skin."""
    cnt = collections.Counter(tuple(int(v) for v in a[y, x, :3]) for y in range(8, 29) for x in range(20, 44) if a[y, x, 3] and skinish(tuple(int(v) for v in a[y, x, :3])))
    return {c for c, n in cnt.items() if n >= 3}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--players", default=str(ROOT / "data/y80/players.json"))
    ap.add_argument("--stints", default=str(ROOT / "data/y80/stints.json"))
    ap.add_argument("--extras", default=str(ROOT / "public/data/player-extras.json"))
    ap.add_argument("--sprites", default=str(L.SPR))
    ap.add_argument("--poses", default="auto", choices=["auto", "min", "all"])
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-era", action="store_true")
    args = ap.parse_args()
    SPR = Path(args.sprites)
    t0 = time.time()
    ix = L.load_index(SPR)
    clubs = ix["clubs"]
    font = {tuple(k.split("|")): v for k, v in ix["numberFont"].items()}
    extras = json.loads(Path(args.extras).read_text())
    sig = extras.get("signatureTeams", {})
    nums = extras.get("realNumbers", {})
    players = json.loads(Path(args.players).read_text())
    stints_all = json.loads(Path(args.stints).read_text()) if Path(args.stints).exists() else {}
    byk = {f"{p['pos']}:{p['n']}": p for p in players}
    painter = None if args.no_era else E.Painter(ix)

    # forget an earlier run's silhouettes (and the eras that were drawn for them), then fill every gap again
    have = {k: e for k, e in ix["players"].items() if not e.get("silhouette")}
    gone = [k for k, e in ix["players"].items() if e.get("silhouette")]
    n_gone = L.forget(ix, SPR, [f for k in gone for f in L.entry_files(ix, ix["players"][k])])
    print(f"cleared {len(gone)} earlier silhouettes ({n_gone} files)")
    store = L.Store(ix, SPR)

    # real donors: own files of a real player (never an earlier silhouette), per club
    donors = collections.defaultdict(list)
    for key, e in have.items():
        if e.get("shot") or key not in byk:
            continue
        for club, poses in e["kits"].items():
            if club in clubs and 1 in poses and (SPR / L.fname(e["uid"], clubs[club], 1)).exists():
                donors[club].append(key)

    @functools.lru_cache(maxsize=4096)
    def load(name):
        a = np.asarray(Image.open(SPR / name).convert("RGBA")).copy()
        a.flags.writeable = False
        return a

    @functools.lru_cache(maxsize=None)
    def gear(key, club):
        """The colours on his arms and hands outside the jersey and skin: gloves, sleeves, wristbands, tattoos."""
        a = load(L.fname(have[key]["uid"], clubs[club], 1)).astype(int)
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
    any_pool = [k for ks in donors.values() for k in ks]

    @functools.lru_cache(maxsize=None)
    def pick(pos, ht, wt, club):
        """(tier, donor key): the club's donors of his position nearest in build, else the nearest build at any position at
        the club, else the nearest build league-wide (drawn in the donor's club kit and repainted by the site)."""
        for tier, pool in (("club", donors.get(club, [])), ("any", any_pool)):
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
                return tier, best[1]
        pool = [k for k in donors.get(club, []) if (byk[k].get("nfl") or {}).get("height")]
        if pool:  # a club with no similar build: the nearest build at any position at the club
            return "club-any", min(pool, key=lambda k: abs(byk[k]["nfl"]["height"] - ht) * 3 + abs(byk[k]["nfl"]["weight"] - wt) * 0.4)
        return None

    # head outlines only from templates whose head (rows above the shoulders) is within one pixel of the real players'
    # median size (owner, 2026-11-23: the silhouette heads looked oversized: long hair and big afros made them wider)
    def head_box(path):
        al = np.asarray(Image.open(path).convert("RGBA"))[:27, :, 3] > 0
        ys, xs = np.where(al)
        return int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)

    real_boxes = [head_box(SPR / f"{e['uid']}_800.png") for e in have.values() if not e.get("shot") and 1 in e["neutral"]]
    mw, mh = (int(np.median([b[0] for b in real_boxes])), int(np.median([b[1] for b in real_boxes])))
    all_t = [s["uid"] for s in ix["standins"] if s["neutral"] == [1, 2, 3, 4, 5]]
    templates = sorted(u for u in all_t if abs(head_box(SPR / f"{u}_800.png")[0] - mw) <= 1 and abs(head_box(SPR / f"{u}_800.png")[1] - mh) <= 1)
    print(f"head templates within 1 px of {mw} x {mh}: {len(templates)} of {len(all_t)}")

    @functools.lru_cache(maxsize=None)
    def head_of(tpl, pose):
        t = np.asarray(Image.open(SPR / f"{tpl}_800{'_p%d' % pose if pose > 1 else ''}.png").convert("RGBA"))
        neck = 27
        h = t[:neck, 16:48, 3] > 0
        pad = np.pad(h, 1, constant_values=False)
        # an edge pixel: the one above, left or right of it is not head
        edge = h & ~(pad[:-2, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
        return h, edge

    def blackout(a, skin, jersey, pose, tpl, training=False):
        night = NIGHT_NEUTRAL if training else tuple(int(v * 0.22 + 8) for v in jersey)
        rim = RIM_NEUTRAL if training else tuple(min(255, int(v * 0.45 + 120)) for v in jersey)
        neck = 27
        h, edge = head_of(tpl, pose)
        a[:neck, 16:48] = 0
        for y, x in zip(*np.nonzero(h)):
            a[y, x + 16] = (*(rim if edge[y, x] else night), 255)
        for y in range(neck, 64):
            for x in range(64):
                if a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) in skin:
                    a[y, x, :3] = night
        return a

    def erase_draw_number(a, number):
        """The donor's number out of the chest (every number-colour pixel, the band accent in rows 34-35), his own in."""
        jersey, nc = J.chest(a)
        band = J.band_of(a) or {}
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
        return a

    made = collections.Counter()
    new_entries = {}

    def stint_clubs(p):
        """Every club in his stints, in order (names the site uses); else the club on his card / where he is best known."""
        st = (stints_all.get(p["n"]) or {}).get("stints") or []
        out = list(dict.fromkeys(s["team"] for s in st if s["team"] in clubs))
        if out:
            return out, st
        club = p.get("team") if p.get("team") in clubs else (sig.get(p["n"]) or "")  # a free agent: his last club
        club = club if club in clubs else next((c for c in clubs if club and c.split()[-1] == club.split()[-1]), "")
        return ([club] if club else []), st

    def want_poses(p, donor_poses, main=True):
        """All the donor's poses at the club he is drawn in now (an active player's club, a retired one: none); every other
        club the standing pose, plus his role pose (QB 2, RB / WR / TE 4) at the club he is best known for (most seasons).
        The site falls back to the standing pose where a pose is missing."""
        nf = p.get("nfl") or {}
        retired = bool(nf.get("past") or nf.get("retired"))
        mode = args.poses if args.poses != "auto" else ("min" if retired else "all")
        if mode == "all" and main:
            return sorted(donor_poses)
        got = sorted(({1, L.ROLE_POSE.get(p["pos"], 1)} if main else {1}) & set(donor_poses))
        return got or [min(donor_poses)]

    def main_club(st, club_list):
        """The club with most seasons in his stints (a tie: the later one)."""
        n = collections.Counter()
        for s in st:
            if s["team"] in clubs:
                n[s["team"]] += int(s["to"]) - int(s["from"]) + 1
        return max(club_list, key=lambda c: (n[c], club_list.index(c))) if club_list else None

    tone = {(0xBF, 0xBF, 0xBF): [(52, 56, 66), (122, 127, 140), (92, 97, 108)], (0x8F, 0x8F, 0x8F): [(34, 37, 45), (92, 97, 108), (60, 64, 74)], (0xFB, 0xFF, 0xFD): [(150, 156, 170), (150, 156, 170), (150, 156, 170)]}
    n_done = 0
    for key, p in sorted(byk.items()):
        if key in have:
            continue
        if args.limit and n_done >= args.limit:
            break
        n_done += 1
        nf = p.get("nfl") or {}
        number = nums.get(key)
        if number is None and str(nf.get("number") or "").isdigit():
            number = int(nf["number"])
        uid = str(nf.get("uid") or f"s{fnv(key):08x}")
        tpl = templates[fnv(key + "|head") % len(templates)]
        club_list, st = stint_clubs(p)
        ht, wt = (nf.get("height"), nf.get("weight")) if nf.get("height") and nf.get("weight") else med.get(p["pos"], (74, 220))
        if not club_list:
            # on no club's books (no games, no stint): the silhouette in a dark training kit, from the nearest build with a
            # neutral file; the site paints it into whatever club he is shown in
            pool = [k for k, e in have.items() if e.get("neutral") and not e.get("shot") and k in byk and (byk[k].get("nfl") or {}).get("height")]
            if not pool:
                made["no club"] += 1
                continue
            dk = min(pool, key=lambda k: (0 if byk[k]["pos"] == p["pos"] or {byk[k]["pos"], p["pos"]} <= {"LB", "DL"} else 40) + abs(byk[k]["nfl"]["height"] - ht) * 3 + abs(byk[k]["nfl"]["weight"] - wt) * 0.4)
            de = have[dk]
            poses = []
            for pose in want_poses(p, de["neutral"]):
                a = load(L.fname(de["uid"], 800, pose)).copy()
                a = blackout(a, skin_set(a), (0, 0, 0), pose, tpl, training=True)
                for y in range(27, 59):
                    band = 0 if y < 41 else 1 if y < 49 else 2
                    for x in range(64):
                        c = tuple(int(v) for v in a[y, x, :3])
                        if a[y, x, 3] and c in tone:
                            a[y, x, :3] = tone[c][band]
                if number:
                    for (y, x) in J.glyph_cells(font, int(number)) or []:
                        if a[y, x, 3] and tuple(int(v) for v in a[y, x, :3]) in ((52, 56, 66), (34, 37, 45)):
                            a[y, x, :3] = (176, 182, 196) if y in (34, 35) else (214, 219, 230)
                store.put(L.fname(uid, 800, pose), a)
                poses.append(pose)
            new_entries[key] = {"uid": uid, "kits": {}, "neutral": sorted(poses), "silhouette": True, "training": True}
            made["neutral"] += 1
            continue

        kits: dict[str, list[int]] = {}
        eras: dict[str, dict] = {}
        home = main_club(st, club_list)
        active_club = p.get("team") if p.get("team") in club_list and not (nf.get("past") or nf.get("retired")) else None
        first_from = None
        # clubs that have donors of their own first, so a league-wide fallback never takes a file name one of them needs
        for club in sorted(club_list, key=lambda c: 0 if donors.get(c) else 1):
            choice = pick(p["pos"], ht, wt, club)
            if not choice:
                made["no donor"] += 1
                continue
            tier, dk = choice
            de = have[dk]
            dclub = club if tier in ("club", "club-any") else next(c for c in de["kits"] if c in clubs)
            window = None if painter is None else E.era_window(painter.pal, club, st)
            want_kit = dclub not in kits and not (tier == "any" and dclub in club_list)
            for pose in want_poses(p, de["kits"][dclub], club == (active_club or home)):
                src = L.fname(de["uid"], clubs[dclub], pose)
                if not (SPR / src).exists():
                    continue
                donor = load(src)
                skin = skin_set(donor)
                if want_kit:
                    a = erase_draw_number(donor.copy(), number)
                    jersey, _ = J.chest(a)
                    a = blackout(a, skin, jersey or (40, 44, 60), pose, tpl)
                    store.put(L.fname(uid, clubs[dclub], pose), a)
                    kits.setdefault(dclub, []).append(pose)
                if window:
                    a = painter.paint(donor, dclub, club, pose, number, blank=True)
                    jersey, _ = J.chest(a)
                    a = blackout(a, skin, jersey or (40, 44, 60), pose, tpl)
                    store.put(L.fname(uid, clubs[club], pose, True), a)
                    eras.setdefault(club, {"poses": [], "mid": window[2]})["poses"].append(pose)
            if want_kit and dclub in kits:
                made[tier] += 1
                if dclub != club and first_from is None:
                    first_from = dclub
        if not kits and not eras:
            made["no files"] += 1
            continue
        ent = {"uid": uid, "kits": {c: sorted(v) for c, v in kits.items()}, "neutral": [], "silhouette": True}
        if first_from:
            ent["from"] = first_from  # drawn in another club's kit: the site repaints it into his club (gameKitPaint.ts)
        if eras:
            ent["eras"] = {c: {"poses": sorted(v["poses"]), "mid": v["mid"]} for c, v in eras.items()}
            made["era clubs"] += len(eras)
        new_entries[key] = ent

    ix["players"].update(new_entries)
    ix["players"] = dict(sorted(ix["players"].items()))
    if painter is not None:
        ix["eraKits"] = {c: {"id": v["id"], "label": v["label"], "from": v["from"], "to": v["to"]} for c, v in painter.pal.items()}
    ix["anchors"] = {k: v for k, v in sorted(store.anchors.items()) if v != L.DEFAULT_ANCHOR}  # the site's default is the same
    ix["aliases"] = dict(sorted(store.alias.items()))
    L.save_index(ix, SPR)
    print(f"silhouettes: {dict(made)}; {store.written} files written, {store.deduped} identical images stored once; {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
