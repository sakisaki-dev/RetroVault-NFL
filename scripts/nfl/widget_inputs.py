#!/usr/bin/env python3
"""The slow-changing inputs of the NFL widget's daily build on GitHub (github.com/sakisaki-dev/rv-nfl-widget,
scripts/ there), written into that repo's inputs/ folder. Run by `bash scripts/nfl/widget_publish.sh --refresh`.

    python3 scripts/nfl/widget_inputs.py <clone dir>

  players.json   every player who can play this season (on a roster of the last two seasons, or a game or snap this
                 season): key `POS:Name`, gsis id, pfr id (nflverse players.csv, for snap counts) and his club now
                 (data/y80/players.json). The daily build brings the club up to date from the season's roster.
  espn_ids.json  ESPN athlete id -> key for the same players (public/data/nfl/espn_ids.json), so ESPN's live leaders map to sprites
  art.json       the widget-art paths (widget.json `art`, as scripts/nfl/widget_data.py wrote them)
Deterministic. Nothing else from this repo goes there.
"""
import csv
import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
SEASON = 2026


def main():
    dest = Path(sys.argv[1]) / "inputs"
    dest.mkdir(parents=True, exist_ok=True)
    live = set()
    for y in (SEASON - 1, SEASON):
        f = CACHE / f"roster_{y}.csv"
        if f.exists():
            live |= {r["gsis_id"] for r in csv.DictReader(open(f, newline=""))}
    f = CACHE / f"stats_player_week_{SEASON}.csv.gz"
    if f.exists():
        live |= {r["player_id"] for r in csv.DictReader(gzip.open(f, "rt"))}
    pfr = {}
    for r in csv.DictReader(gzip.open(CACHE / "players.csv.gz", "rt")):
        if r.get("pfr_id") and r.get("gsis_id"):
            pfr[r["gsis_id"]] = r["pfr_id"]
    snapped = set()
    f = CACHE / f"snap_counts_{SEASON}.csv.gz"
    if f.exists():
        snapped = {r["pfr_player_id"] for r in csv.DictReader(gzip.open(f, "rt"))}
    rows = []
    for p in json.loads((ROOT / "data/y80/players.json").read_text()):
        g = (p.get("nfl") or {}).get("gsis")
        if not g or not (g in live or pfr.get(g) in snapped):
            continue
        rows.append([f"{p['pos']}:{p['n']}", g, pfr.get(g), p["team"]])
    rows.sort()
    keys = {r[0] for r in rows}
    w = lambda name, data: (dest / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")  # noqa: E731
    w("players.json", {"_about": "Players who can play this season, for the daily widget build. Written by the Retro Vault NFL edition (scripts/nfl/widget_inputs.py).",
                       "season": SEASON, "cols": ["key", "gsis", "pfr", "team"], "rows": rows})
    espn = json.loads((ROOT / "public/data/nfl/espn_ids.json").read_text())
    w("espn_ids.json", {k: v for k, v in sorted(espn.items()) if v in keys})
    w("art.json", json.loads((ROOT / "public/data/nfl/widget.json").read_text())["art"])
    print(f"widget inputs: {len(rows)} players, {sum(1 for v in espn.values() if v in keys)} ESPN ids -> {dest}")


if __name__ == "__main__":
    main()
