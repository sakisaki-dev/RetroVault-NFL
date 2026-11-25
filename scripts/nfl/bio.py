#!/usr/bin/env python3
"""NFL edition: height, weight and birth date per player -> public/data/nfl/bio.json (loaded on demand like draft.json).

Joins data/y80/players.json (nfl.gsis) to nflverse players.csv.gz (height in inches, weight in lbs, birth_date). A player
with none of the three gets no entry; a missing field is left out of his row, never guessed.

  {"p": {"QB:Josh Allen": [77, 237, "1996-05-21"]}}      # null for a missing field
"""
import csv
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "nfl" / "bio.json"


def num(s):
    try:
        v = int(float(s))
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def main():
    pl = {r["gsis_id"]: r for r in csv.DictReader(gzip.open(ROOT / "data/nfl-cache/players.csv.gz", "rt")) if r["gsis_id"]}
    out = {}
    for p in json.loads((ROOT / "data/y80/players.json").read_text()):
        n = p.get("nfl") or {}
        r = pl.get(n.get("gsis"))
        h = num((r or {}).get("height")) or num(n.get("height"))
        w = num((r or {}).get("weight")) or num(n.get("weight"))
        d = ((r or {}).get("birth_date") or n.get("dob") or "").strip() or None
        if h or w or d:
            out[f'{p["pos"]}:{p["n"]}'] = [h, w, d]
    OUT.write_text(json.dumps({"p": dict(sorted(out.items()))}, separators=(",", ":"), ensure_ascii=False))
    print(f"bio: {len(out)} players -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
