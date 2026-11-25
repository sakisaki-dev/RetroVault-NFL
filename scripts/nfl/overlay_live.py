#!/usr/bin/env python3
"""NFL edition: lay the daily live-season files over a built site (deploy-nfl-pages.yml) and re-version them.

    python3 scripts/nfl/overlay_live.py <live-dir> <site-dir>

<live-dir> is the `site/nfl/` folder of the `widget-data` branch (written by nfl-widget-daily.yml: injuries, depth charts,
playoff odds, This season, fantasy). <site-dir> is the built site (dist/). Each file is copied to <site>/data/nfl/ and its
entry in <site>/data/manifest.json set to the first 8 hex of its sha1 (what scripts/perf/build_core.py writes), so the
site's data store (src/utils/dataStore.ts) fetches the new copy instead of its cached one.

Guard: main's own copies stay when they are newer. fantasy.json carries (season, week); the branch's files go over main's
only when its (season, week) is at least main's (a hand rebuild of a later week, pushed to main, is never rolled back).
No <live-dir> or nothing newer: the site is left exactly as built. Deterministic.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

FILES = ("thisseason.json", "fantasy.json", "injuries.json", "playoff_odds.json", "depth_charts.json")


def stamp(p: Path):
    try:
        d = json.loads(p.read_text())
        return (int(d["season"]), int(d["week"]))
    except Exception:
        return None


def main() -> None:
    live, site = Path(sys.argv[1]), Path(sys.argv[2])
    dest = site / "data" / "nfl"
    if not live.is_dir() or not dest.is_dir():
        print("live overlay: nothing to lay over")
        return
    new, old = stamp(live / "fantasy.json"), stamp(dest / "fantasy.json")
    if new is None:
        print("live overlay: the branch's fantasy.json is missing or unreadable, main's files stay")
        return
    if old is not None and new < old:
        print(f"live overlay: main is newer (season {old[0]} week {old[1]} > {new[0]} week {new[1]}), main's files stay")
        return
    mpath = site / "data" / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else None
    for name in FILES:
        src = live / name
        if not src.is_file() or src.stat().st_size == 0:
            continue
        json.loads(src.read_text())  # refuse a broken file
        shutil.copyfile(src, dest / name)
        if manifest is not None and f"data/nfl/{name}" in manifest["files"]:
            manifest["files"][f"data/nfl/{name}"] = hashlib.sha1(src.read_bytes()).hexdigest()[:8]
        print(f"live overlay: data/nfl/{name} <- season {new[0]} week {new[1]}")
    if manifest is not None:
        mpath.write_text(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
