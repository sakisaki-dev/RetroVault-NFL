#!/usr/bin/env python3
"""NFL edition: public/data/nfl/depth_charts.json, Team Lab's "Load the club" (real current starters).

    python3 scripts/nfl/depth_charts.py            # reads data/nfl-cache/depth_charts_<season>.csv.gz
    RV_DEPTH_DIR=<dir> python3 scripts/nfl/depth_charts.py   # when the file sits elsewhere

Source: nflverse depth_charts release (ESPN's depth charts, one snapshot per day). Only the latest snapshot, only
the fields the Team Lab uses (data rule: add no data no page shows): per club its base defence ("3-4" / "4-3") and,
per depth-chart slot, up to three player keys (`POS:Name`, matched to players.json by gsis id), best first.
Offense slots: QB RB WR TE LT LG C RG RT (WR: every receiver, in depth order). Defense slots follow the base:
3-4 LDE NT RDE WLB LILB RILB SLB LCB RCB SS FS; 4-3 LDE LDT RDT RDE WLB MLB SLB LCB RCB SS FS.
Injuries are applied on the site (public/data/nfl/injuries.json). Deterministic.
"""
import csv
import gzip
import json
from datetime import date
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEASON = date.today().year if date.today().month >= 8 else date.today().year - 1  # the season in progress (as fetch.py)
SRC = Path(os.environ.get("RV_DEPTH_DIR") or ROOT / "data" / "nfl-cache") / f"depth_charts_{SEASON}.csv.gz"
ABBR = {"LA": "LAR", "WSH": "WAS", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU", "SD": "LAC", "STL": "LAR", "OAK": "LV", "JAC": "JAX"}
OFF = ["QB", "RB", "WR", "TE", "LT", "LG", "C", "RG", "RT"]
DEF = {
    "Base 3-4 D": ("3-4", ["LDE", "NT", "RDE", "WLB", "LILB", "RILB", "SLB", "LCB", "RCB", "SS", "FS"]),
    "Base 4-3 D": ("4-3", ["LDE", "LDT", "RDT", "RDE", "WLB", "MLB", "SLB", "LCB", "RCB", "SS", "FS"]),
}
DEPTH = 3


def main():
    gsis = {p["nfl"]["gsis"]: f"{p['pos']}:{p['n']}" for p in json.loads((ROOT / "data/y80/players.json").read_text()) if p.get("nfl") and p["nfl"].get("gsis")}
    rows = list(csv.DictReader(gzip.open(SRC, "rt")))
    at = max(r["dt"] for r in rows)
    rows = [r for r in rows if r["dt"] == at]
    clubs: dict[str, dict] = {}
    for r in rows:
        t = ABBR.get(r["team"], r["team"])
        c = clubs.setdefault(t, {"off": {}, "def": {}})
        key = gsis.get(r["gsis_id"])
        if not key:
            continue
        rank = int(r["pos_rank"])
        if r["pos_grp"] == "Special Teams" and r["pos_abb"] == "PK":   # the kicker (owner, 2026-11-25; punters stay out)
            c.setdefault("st", {}).setdefault("K", {})[rank] = key
        elif r["pos_grp"] == "3WR 1TE" and r["pos_abb"] in OFF:
            c["off"].setdefault(r["pos_abb"], {})[rank] = key
        elif r["pos_grp"] in DEF and r["pos_abb"] in DEF[r["pos_grp"]][1]:
            c["def"].setdefault(r["pos_grp"], {}).setdefault(r["pos_abb"], {})[rank] = key
    out = {}
    for t, c in sorted(clubs.items()):
        # the base defence: the formation whose eleven slots all have a starter (the one with more depth when both do)
        best = None
        for grp, (name, slots) in DEF.items():
            d = c["def"].get(grp, {})
            full = sum(1 for s in slots if d.get(s))
            tot = sum(len(v) for v in d.values())
            if best is None or (full, tot) > best[0]:
                best = ((full, tot), name, grp, slots)
        _, name, grp, slots = best
        d = c["def"].get(grp, {})
        o = {s: [v for _, v in sorted(c["off"].get(s, {}).items())][: (8 if s == "WR" else DEPTH)] for s in OFF}
        out[t] = {"base": name, "o": o, "st": {"K": [v for _, v in sorted(c.get("st", {}).get("K", {}).items())][:DEPTH]}, "d": {s: [v for _, v in sorted(d.get(s, {}).items())][:DEPTH] for s in slots}}
    dest = ROOT / "public/data/nfl/depth_charts.json"
    dest.write_text(json.dumps({"season": SEASON, "at": at[:10], "clubs": out}, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"depth charts: {len(out)} clubs, snapshot {at}, {dest.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
