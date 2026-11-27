#!/usr/bin/env python3
"""NFL edition: the screensaver's small pick lists, computed from the per-game files (public/data/nfl/game/<year>.json).

    python3 scripts/nfl/saver_picks.py

Output public/data/nfl/saver_picks.json (a few KB, loaded by the screensaver only):
  cold   the 12 coldest outdoor games on record (temp, wind as the game file has them), coldest first
  long   each season's longest made field goal (kicker, yards, game id); the 14 longest, longest first
  close  one-score finishes (margin of 3 or less) in the playoffs or overtime, newest first (the file keeps no
         play-by-play or quarter scores, so "a late finish" is only claimed as a final margin)
Deterministic: the same game files give the same lists. Nothing here is a model output.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / "public" / "data" / "nfl" / "game"
OUT = ROOT / "public" / "data" / "nfl" / "saver_picks.json"


def main():
    cold, close, longest = [], [], []
    for f in sorted(GAME.glob("[12][0-9][0-9][0-9].json")):
        d = json.loads(f.read_text())
        season = d["season"]
        fg = d["pc"].index("fg_long")
        best = None
        for g in d["g"]:
            if g.get("as") is None or g.get("hs") is None:
                continue
            if g.get("temp") is not None and g.get("roof") not in ("dome", "closed"):
                cold.append({"id": g["id"], "season": season, "temp": g["temp"], "wind": g.get("wind")})
            if abs(g["as"] - g["hs"]) <= 3 and (g["t"] != "REG" or g.get("ot")):
                close.append({"id": g["id"], "season": season, "d": g["d"]})
            for r in g.get("r", []):
                row = r[3]
                for k in range(0, len(row), 2):
                    if row[k] == fg and (best is None or row[k + 1] > best["yards"]):
                        best = {"name": d["p"][r[0]][0], "yards": int(row[k + 1]), "id": g["id"], "season": season}
        if best:
            longest.append(best)
    cold.sort(key=lambda x: (x["temp"], x["id"]))
    longest.sort(key=lambda x: (-x["yards"], x["id"]))
    close.sort(key=lambda x: x["d"], reverse=True)
    out = {
        "_about": "scripts/nfl/saver_picks.py: the screensaver's pick lists from public/data/nfl/game/*.json",
        "cold": cold[:12],
        "long": longest[:14],
        "close": [{"id": c["id"], "season": c["season"]} for c in close[:40]],
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"saver_picks: {len(out['cold'])} cold, {len(out['long'])} long, {len(out['close'])} close")


if __name__ == "__main__":
    main()
