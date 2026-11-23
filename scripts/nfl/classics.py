"""Pre-1999 careers from Wikipedia (data/nfl/classics.json, scripts/nfl/fetch_classics.py) for build_players.py.

Two kinds of entry: `from: "partial"` replaces the 1999-on line of a player already in the data (his game logs stay), anything
else is a career-only player with no weekly data at all (no per-season lines, no game log). Standard library only."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "data" / "nfl" / "classics.json"


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", " ", s.replace(".", " "))
    return re.sub(r"[^a-z]", "", s)


# the regular season's length: 14 games to 1977, 16 from 1978; the 1982 strike left 9, the 1987 strike 15
SEASON_GAMES = {**{y: 14 for y in range(1960, 1978)}, **{y: 16 for y in range(1978, 2021)}, 1982: 9, 1987: 15}


def games_estimate(years):
    """Games a career would hold if he played every game of every season he was on a roster (used only when Wikipedia has no
    games figure; flagged nfl.gEst)."""
    return sum(SEASON_GAMES.get(y, 17) for y in years)


def load():
    if not PATH.exists():
        return {"partial": {}, "new": []}
    d = json.loads(PATH.read_text())
    out = {"partial": {}, "new": []}
    for e in d["players"]:
        e["years"] = sorted({y for c in e["clubs"] for y in c["years"]})
        if not e["clubs"]:
            continue
        if e["from"] == "partial":
            out["partial"][(norm(e["name"]), e["pos"])] = e
        else:
            out["new"].append(e)
    return out


def new_rows(entries):
    """Roster rows (build_players.legend_rows shape) for the career-only players."""
    rows = []
    for e in entries:
        last = e["clubs"][-1]["team"]
        debut = min(e["years"])
        spos = e.get("spos") or {"DB": "CB"}.get(e["pos"], e["pos"])
        slug = re.sub(r"[^a-z0-9]", "", norm(e["name"]))
        rows.append({"uid": "c" + slug, "name": e["name"], "pos": e["pos"], "spos": spos, "club": last,
                     "number": e.get("number"), "age": None, "dob": e.get("dob"), "rookie": str(debut),
                     "height": e.get("height"), "weight": e.get("weight"), "salary": None, "contract": None, "sprites": 0,
                     "match": "legend", "gsis": None, "pfr": None, "espn": None, "nv_name": e["name"], "nv_pos": e["pos"],
                     "nv_height": e.get("height"), "nv_weight": e.get("weight"), "draft": e.get("draft"), "legend": True,
                     "partial": False, "classic": e, "debut": debut, "games": int(e["stats"].get("g") or 0),
                     "lastSeason": max(e["years"])})
    return rows
