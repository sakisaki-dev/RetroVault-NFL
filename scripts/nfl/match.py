#!/usr/bin/env python3
"""NFL edition demo: match every real player in the fresh 2026 save (slot 6) to nflverse and to his own sprites.

    python3 scripts/nfl/match.py [--save data/saves/<date>/nfl/Documents/rb_nfl_savedata_6.json]

Match key: date of birth + name (accents, punctuation and suffixes folded), position as a tie-break; then name +
rookie season; then name alone when it is unique. Sprites: the game's real-player folder (rb_nfl_players_2024/faces_img,
files <uid>_<kit>[_pN].png). Measurements: the save's height and weight against nflverse's.

Writes data/nfl/roster.json (one row per save player) and prints the players who don't match up.
"""
import csv
import gzip
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
OUT = ROOT / "data" / "nfl" / "roster.json"
SAVE_POS = {1: "QB", 2: "RB", 3: "TE", 4: "WR", 5: "OL", 6: "DL", 7: "LB", 8: "CB", 9: "S", 10: "K", 11: "P"}
CLUBS = ["Bills", "Dolphins", "Patriots", "Jets", "Broncos", "Chiefs", "Chargers", "Raiders", "Ravens", "Bengals",
         "Browns", "Steelers", "Texans", "Colts", "Jaguars", "Titans", "Cowboys", "Giants", "Eagles", "Commanders",
         "Cardinals", "Rams", "49ers", "Seahawks", "Bears", "Lions", "Packers", "Vikings", "Falcons", "Panthers",
         "Saints", "Buccaneers"]  # the save's teamid order (index = teamid)
# nflverse position groups → the save's groups
GROUP = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE", "OL": "OL", "T": "OL", "G": "OL", "C": "OL", "OT": "OL",
         "OG": "OL", "DL": "DL", "DE": "DL", "DT": "DL", "NT": "DL", "LB": "LB", "ILB": "LB", "OLB": "LB", "MLB": "LB",
         "DB": "DB", "CB": "DB", "S": "DB", "SS": "DB", "FS": "DB", "SPEC": "ST", "K": "ST", "P": "ST", "LS": "ST"}
GROUP_OF = {"CB": "DB", "S": "DB"}
SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = SUFFIX.sub(" ", s.replace(".", " "))
    return re.sub(r"[^a-z]", "", s)


def inches(h) -> int | None:
    m = re.match(r"(\d+)'\s*(\d+)", str(h or ""))
    if m:
        return int(m.group(1)) * 12 + int(m.group(2))
    try:
        return int(float(h))
    except (TypeError, ValueError):
        return None


def pounds(w) -> int | None:
    m = re.match(r"(\d+)", str(w or ""))
    return int(m.group(1)) if m else None


def find_save(argv) -> Path:
    if "--save" in argv:
        return Path(argv[argv.index("--save") + 1])
    for d in sorted((ROOT / "data" / "saves").glob("*/nfl/Documents"), reverse=True):
        for f in sorted(d.glob("rb_nfl_savedata_[0-9]*.json")):
            try:
                if int(json.loads(f.read_text())["settings"]["year"]) == 1:
                    return f
            except (ValueError, KeyError):
                continue
    sys.exit("no fresh (year 1) save slot found under data/saves")


def main():
    save = find_save(sys.argv)
    d = json.loads(save.read_text())
    pool = d["players"]["pool"]
    pool = list(pool.values()) if isinstance(pool, dict) else pool
    faces = save.parent / "rb_nfl_players_2024" / "faces_img"
    files = defaultdict(list)
    for f in faces.glob("*.png"):
        files[f.name.split("_")[0]].append(f.name)

    with gzip.open(CACHE / "players.csv.gz", "rt", encoding="utf-8") as fh:
        nv = list(csv.DictReader(fh))
    by_dob = defaultdict(list)
    by_name = defaultdict(list)
    for r in nv:
        for nm in {norm(r["display_name"]), norm(f"{r['first_name']} {r['last_name']}"),
                   norm(f"{r['common_first_name']} {r['last_name']}"), norm(r.get("football_name", "") + " " + r["last_name"])}:
            if nm:
                by_name[nm].append(r)
                if r["birth_date"]:
                    by_dob[(r["birth_date"], nm)].append(r)

    rows, unmatched, measure, nosprite = [], [], [], []
    for p in pool:
        if not p.get("is_real_crew") or int(float(p.get("uid", 0))) >= 900000:
            continue
        pos = SAVE_POS.get(int(float(p["position"])), "?")
        if pos in ("K", "P"):
            continue
        name = f"{p['fname']} {p['lname']}".strip()
        nm = norm(name)
        dob = str(p.get("dob") or "")
        dob = f"{dob[:4]}-{dob[4:6]}-{dob[6:]}" if len(dob) == 8 else ""
        tid = int(float(p["teamid"]))
        club = CLUBS[tid] if 0 <= tid < 32 else "FA"
        cands = by_dob.get((dob, nm), [])
        how = "dob+name"
        w = pounds(p.get("weight"))

        def fits(r):
            # a namesake at another position or a very different build is someone else (OL Michael Jordan, 315 lb)
            g = GROUP.get(r["position_group"] or r["position"], "?")
            same = g == GROUP_OF.get(pos, pos) or {g, GROUP_OF.get(pos, pos)} <= {"DL", "LB"}
            rw = pounds(r["weight"])
            return same and not (w and rw and abs(w - rw) > 40)

        def same_group(r):
            g = GROUP.get(r["position_group"] or r["position"], "?")
            return g == GROUP_OF.get(pos, pos) or {g, GROUP_OF.get(pos, pos)} <= {"DL", "LB"}

        if len(cands) == 1 and not same_group(cands[0]):
            # the game gave him a namesake's birthday (its OL Josh Jones carries the safety's): the namesake at his
            # position wins when there is exactly one
            named = [r for r in by_name.get(nm, []) if fits(r)]
            if len(named) == 1:
                cands, how = named, "name+pos (save dob is a namesake's)"
        if len(cands) != 1:
            named = [r for r in by_name.get(nm, []) if fits(r)]
            alt = [r for r in named if r["rookie_season"] == str(p.get("rookie_year"))]
            if len(alt) == 1:
                cands, how = alt, "name+rookie"
            elif len(named) == 1:
                cands, how = named, "name"
            elif dob:
                # a renamed player (nickname vs legal name): same birthday and last name
                ln = norm(p["lname"])
                alt = [r for r in nv if r["birth_date"] == dob and norm(r["last_name"]) == ln]
                cands, how = (alt, "dob+last") if len(alt) == 1 else ([], "none")
            else:
                cands, how = [], "none"
        r = cands[0] if len(cands) == 1 else None
        uid = str(p["uid"])
        sprites = sorted(files.get(uid, []))
        row = {"uid": uid, "name": name, "pos": pos, "spos": pos, "club": club, "number": p.get("number"),
               "age": int(float(p.get("age") or 0)), "dob": dob, "rookie": p.get("rookie_year"),
               "height": inches(p.get("height")), "weight": pounds(p.get("weight")),
               "salary": p.get("salary"), "contract": p.get("contract"),
               "ratings": {k: p.get(k) for k in ("skill", "speed", "strength", "stamina")},
               "sprites": len(sprites), "match": how if r else None}
        if pos in ("CB", "S"):
            row["pos"] = "DB"
        if r:
            row.update({"gsis": r["gsis_id"], "pfr": r["pfr_id"], "espn": r["espn_id"], "nv_name": r["display_name"],
                        "nv_pos": r["position"], "nv_height": inches(r["height"]), "nv_weight": pounds(r["weight"]),
                        "draft": [r["draft_year"], r["draft_round"], r["draft_pick"], r["draft_team"]]})
            dh = abs((row["height"] or 0) - (row["nv_height"] or 0)) if row["height"] and row["nv_height"] else None
            dw = abs((row["weight"] or 0) - (row["nv_weight"] or 0)) if row["weight"] and row["nv_weight"] else None
            if (dh and dh > 1) or (dw and dw > 10):
                measure.append((name, pos, club, row["height"], row["nv_height"], row["weight"], row["nv_weight"]))
        else:
            unmatched.append((name, pos, club, dob, p.get("rookie_year"), len(cands)))
        if not sprites:
            nosprite.append((name, pos, club, uid))
        rows.append(row)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"save": str(save.relative_to(ROOT)), "players": rows}, indent=1) + "\n")
    n = len(rows)
    on = sum(1 for r in rows if r["club"] != "FA")
    print(f"{n} real players in the save ({on} on a club, {n - on} free agents); "
          f"{n - len(unmatched)} matched to nflverse, {n - len(nosprite)} with their own sprites")
    print(f"  matched by: " + ", ".join(f"{k} {v}" for k, v in sorted(
        {h: sum(1 for r in rows if r["match"] == h) for h in {r["match"] for r in rows}}.items(), key=lambda x: str(x[0]))))
    for title, lst in (("NOT MATCHED", unmatched), ("NO SPRITE FILES", nosprite),
                       ("MEASUREMENTS DIFFER (save vs nflverse: height in, weight lb)", measure)):
        print(f"\n{title} ({len(lst)})")
        for x in lst:
            print("  " + " · ".join(str(v) for v in x))


if __name__ == "__main__":
    main()
