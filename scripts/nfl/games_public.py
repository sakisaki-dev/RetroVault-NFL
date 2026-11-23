#!/usr/bin/env python3
"""NFL edition: one small game-log file per player under public/data/nfl/games/<slug>.json (loaded on demand).

    python3 scripts/nfl/games_public.py

From data/nfl/games/ (the weekly nflverse lines, scripts/nfl/build_players.py) joined with games.csv: per game the date,
whether his club was home, its score and the opponent's. Columns that are zero in every game of the player are dropped
(a quarterback has no tackles), numbers are rounded to two decimals, so the files stay small. slug = the key lower-cased,
runs of non-alphanumerics as "-" (the same on the site, src/utils/gameLogs.ts). Deterministic.
"""
import csv
import gzip
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "nfl" / "games"
OUT = ROOT / "public" / "data" / "nfl" / "games"
ABBR_FIX = {"LA": "LAR", "LAR": "LAR"}


def main():
    games = {}
    for r in csv.DictReader(gzip.open(ROOT / "data/nfl-cache/games.csv.gz", "rt")):
        games[r["game_id"]] = r
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    n = size = 0
    for f in sorted(SRC.glob("*.json")):
        d = json.loads(f.read_text())
        cols = d["cols"]
        keep = [i for i, c in enumerate(cols) if i < 6 or any(g[i] for g in d["games"])]
        out_cols = [cols[i] for i in keep] + ["date", "home", "pf", "pa"]
        rows = []
        for g in sorted(d["games"], key=lambda g: (g[0], g[1])):
            gm = games.get(g[5]) or {}
            home = gm.get("home_team") == g[3]
            try:
                pf, pa = (int(gm["home_score"]), int(gm["away_score"])) if home else (int(gm["away_score"]), int(gm["home_score"]))
            except (KeyError, ValueError):
                pf = pa = None
            row = [round(g[i], 2) if isinstance(g[i], float) and g[i] != int(g[i]) else (int(g[i]) if isinstance(g[i], float) else g[i]) for i in keep]
            rows.append(row + [gm.get("gameday", ""), 1 if home else 0, pf, pa])
        text = json.dumps({"key": d["key"], "cols": out_cols, "games": rows}, separators=(",", ":"))
        (OUT / f.name).write_text(text)
        n += 1
        size += len(text)
    print(f"game logs: {n} files, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
