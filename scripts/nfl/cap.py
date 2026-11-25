#!/usr/bin/env python3
"""NFL edition: public/data/nfl/cap/<year>.json, each club's contracts in force for a season (the club season page).

    python3 scripts/nfl/cap.py

Source: nflverse's contracts release (OverTheCap), historical_contracts.csv.gz, cached in data/nfl-cache. It is a list of
CONTRACTS (year signed, years, total value, average per year `apy`, guaranteed, `apy_cap_pct` = apy / the salary cap of
the year it was signed), not per-season cap hits, and it stops at deals signed in 2022. So the page says what it has:
  * a contract is "in force" in season Y when year_signed <= Y < year_signed + years, and it counts for a club only when
    the player is on that club's roster file for Y (so a traded or cut player's contract is not counted twice);
    when a player has overlapping deals the latest signed counts;
  * the figures are AVERAGE PER YEAR (apy), never a cap hit; "committed" is their sum and `players` how many contracts
    the file holds for that club-season (older seasons hold a handful of the biggest deals);
  * the league cap of a year is derived, not typed: the median of apy / apy_cap_pct over the contracts signed that
    year whose cap share is 4% or more (rounding of the share is then under 1%), shown only with 8 or more such deals;
  * a season with no contracts for a club, or after the file's last signing year, has no file entry (the page says
    "no cap data for this season"); nothing is estimated.
Deterministic.
"""
import csv
import gzip
import json
import re
import statistics
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache" / "historical_contracts.csv.gz"
URL = "https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.csv.gz"
OUT = ROOT / "public" / "data" / "nfl" / "cap"
CLUB = {"Cardinals": "ARI", "Falcons": "ATL", "Ravens": "BAL", "Bills": "BUF", "Panthers": "CAR", "Bears": "CHI", "Bengals": "CIN", "Browns": "CLE",
        "Cowboys": "DAL", "Broncos": "DEN", "Lions": "DET", "Packers": "GB", "Texans": "HOU", "Colts": "IND", "Jaguars": "JAX", "Chiefs": "KC",
        "Chargers": "LAC", "Rams": "LAR", "Raiders": "LV", "Dolphins": "MIA", "Vikings": "MIN", "Patriots": "NE", "Saints": "NO", "Giants": "NYG",
        "Jets": "NYJ", "Eagles": "PHI", "Steelers": "PIT", "Seahawks": "SEA", "49ers": "SF", "Buccaneers": "TB", "Titans": "TEN", "Commanders": "WAS"}
ABBR = {"OAK": "LV", "SD": "LAC", "STL": "LAR", "LA": "LAR", "JAC": "JAX", "WSH": "WAS"}
GROUP = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE", "LT": "OL", "LG": "OL", "C": "OL", "RG": "OL", "RT": "OL",
         "IDL": "DL", "ED": "DL", "LB": "LB", "CB": "DB", "S": "DB", "K": "ST", "P": "ST", "LS": "ST"}


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower().replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", ""))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def main():
    if not CACHE.exists():
        urllib.request.urlretrieve(URL, CACHE)
    rows = []
    for r in csv.DictReader(gzip.open(CACHE, "rt")):
        y, n, apy = num(r["year_signed"]), num(r["years"]), num(r["apy"])
        if not y or not n or not apy or r["team"] not in CLUB or r["position"] not in GROUP:
            continue
        rows.append({"name": r["player"], "pos": r["position"], "club": CLUB[r["team"]], "y": int(y), "n": int(n), "apy": apy, "pct": num(r["apy_cap_pct"])})
    last = max(r["y"] for r in rows)
    caps = defaultdict(list)
    for r in rows:
        if r["pct"] and r["pct"] >= 0.04:
            caps[r["y"]].append(r["apy"] / r["pct"])
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    files = 0
    for season in range(1999, last + 1):
        roster = defaultdict(set)
        rf = ROOT / "data" / "nfl-cache" / f"roster_{season}.csv"
        if not rf.exists():
            continue
        for r in csv.DictReader(open(rf, newline="")):
            roster[ABBR.get(r["team"], r["team"])].add(norm(r["full_name"]))
        best = {}
        for r in rows:
            if r["y"] <= season < r["y"] + r["n"] and norm(r["name"]) in roster[r["club"]]:
                k = (r["club"], norm(r["name"]))
                if k not in best or r["y"] > best[k]["y"]:
                    best[k] = r
        clubs = {}
        for c in sorted({k[0] for k in best}):
            rs = sorted((r for k, r in best.items() if k[0] == c), key=lambda r: (-r["apy"], r["name"]))
            groups = defaultdict(float)
            for r in rs:
                groups[GROUP[r["pos"]]] += r["apy"]
            clubs[c] = {"n": len(rs), "total": round(sum(r["apy"] for r in rs)),
                        "top": [[r["name"], r["pos"], round(r["apy"]), r["y"], r["n"]] for r in rs[:6]],
                        "groups": {g: round(v) for g, v in sorted(groups.items())}}
        v = caps.get(season, [])
        cap = round(statistics.median(v) / 1e5) / 10 if len(v) >= 8 else None
        (OUT / f"{season}.json").write_text(json.dumps({"season": season, "cap": cap, "lastSigned": last, "clubs": clubs}, separators=(",", ":")))
        files += 1
    print(f"cap: {files} seasons, deals signed through {last}")


if __name__ == "__main__":
    main()
