#!/usr/bin/env python3
"""ESPN athlete id -> Retro Vault player key ("POS:Name"), so a news article that tags an athlete opens his Deep Dive and
his Deep Dive lists the articles that tag him. Reads data/nfl/roster.json (the save match, field `espn`), writes
public/data/nfl/espn_ids.json (about 70 KB)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
roster = json.loads((ROOT / "data/nfl/roster.json").read_text())["players"]
# the site's key is players.json's "POS:Name", joined to the roster by gsis id
keys = {p["nfl"]["gsis"]: f'{p["pos"]}:{p["n"]}' for p in json.loads((ROOT / "data/y80/players.json").read_text()) if p.get("nfl") and p["nfl"].get("gsis")}
out = {str(p["espn"]): keys[p["gsis"]] for p in roster if p.get("espn") and p.get("gsis") in keys}
# kickers (owner, 2026-11-25) are not in the save match: their ESPN ids come from nflverse players.csv by gsis id
import csv
import gzip
kick = {p["nfl"]["gsis"] for p in json.loads((ROOT / "data/y80/players.json").read_text()) if p["pos"] == "K" and p.get("nfl") and p["nfl"].get("gsis")}
for r in csv.DictReader(gzip.open(ROOT / "data/nfl-cache/players.csv.gz", "rt")):
    if r["gsis_id"] in kick and r["espn_id"] and r["gsis_id"] in keys:
        out.setdefault(str(r["espn_id"]), keys[r["gsis_id"]])
dest = ROOT / "public/data/nfl/espn_ids.json"
dest.write_text(json.dumps(dict(sorted(out.items())), separators=(",", ":"), ensure_ascii=False))
print(f"{len(out)} ids -> {dest.relative_to(ROOT)}")
