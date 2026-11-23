#!/usr/bin/env python3
"""NFL edition: public/data/nfl/injuries.json, the Injured tag's data.

    python3 scripts/nfl/injuries.py

Only the fields the tag shows (data rule: add no data no page shows): per player key `POS:Name`, [code, part]:
  IR   roster_<season>.csv status RES (reserve / injured), the club's own list
  Out / Doubtful / Questionable   the latest week's official report_status (nflverse injuries release), with the report's
       primary injury (and the secondary after a slash) as `part`, shown only in the tag's tooltip
IR beats a report line. The week is the latest report week of the season. Deterministic.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
SEASON = 2026
CODE = {"Out": "Out", "Doubtful": "Doubtful", "Questionable": "Questionable"}


def main():
    gsis = {p["nfl"]["gsis"]: f"{p['pos']}:{p['n']}" for p in json.loads((ROOT / "data/y80/players.json").read_text()) if p.get("nfl") and p["nfl"].get("gsis")}
    rep = list(csv.DictReader(open(CACHE / f"injuries_{SEASON}.csv")))
    week = max(int(r["week"]) for r in rep)
    out = {}
    for r in rep:
        if int(r["week"]) != week or r["report_status"] not in CODE or r["gsis_id"] not in gsis:
            continue
        part = " / ".join(x.strip().lower() for x in (r["report_primary_injury"], r["report_secondary_injury"]) if x.strip())
        out[gsis[r["gsis_id"]]] = [CODE[r["report_status"]], part]
    for r in csv.DictReader(open(CACHE / f"roster_{SEASON}.csv")):
        if r["status"] == "RES" and r["gsis_id"] in gsis:
            out[gsis[r["gsis_id"]]] = ["IR", out.get(gsis[r["gsis_id"]], ["", ""])[1]]
    dest = ROOT / "public/data/nfl/injuries.json"
    dest.write_text(json.dumps({"season": SEASON, "week": week, "p": dict(sorted(out.items()))}, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"injuries: {len(out)} players, week {week}")


if __name__ == "__main__":
    main()
