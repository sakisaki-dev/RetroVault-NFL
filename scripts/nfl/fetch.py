#!/usr/bin/env python3
"""NFL edition demo: download the public nflverse data into data/nfl-cache/ (git-ignored).

    python3 scripts/nfl/fetch.py            # everything missing, plus the current season's files again
    python3 scripts/nfl/fetch.py --all      # everything again

Source: https://github.com/nflverse/nflverse-data (releases; CC-BY 4.0). Files kept as downloaded (.csv.gz where offered).
The current season's files change every week in season, so they are always fetched again.
"""
import ssl
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
BASE = "https://github.com/nflverse/nflverse-data/releases/download"
FIRST = 1999  # play-by-play era: every active player's career starts after it
# python.org builds ship without a CA bundle: fall back to the system one
try:
    CTX = ssl.create_default_context()
    urllib.request.urlopen("https://github.com", timeout=20, context=CTX)
except Exception:
    CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
NOW = date.today().year if date.today().month >= 8 else date.today().year - 1  # the season in progress

FILES: list[tuple[str, str, bool]] = [  # (release tag, asset, changes in season)
    ("players", "players.csv.gz", True),
    ("schedules", "games.csv.gz", True),
    ("draft_picks", "draft_picks.csv.gz", False),
    ("nextgen_stats", "ngs_passing.csv.gz", True),
    ("nextgen_stats", "ngs_receiving.csv.gz", True),
    ("nextgen_stats", "ngs_rushing.csv.gz", True),
]
for y in range(FIRST, NOW + 1):
    cur = y == NOW
    FILES.append(("stats_player", f"stats_player_week_{y}.csv.gz", cur))
    FILES.append(("stats_team", f"stats_team_week_{y}.csv.gz", cur))
    FILES.append(("rosters", f"roster_{y}.csv", cur))
    if y >= 2018:
        for k in ("pass", "rush", "rec", "def"):
            FILES.append(("pfr_advstats", f"advstats_week_{k}_{y}.csv{'.gz' if y >= 2024 else ''}", cur))
    if y >= NOW - 1:  # the weekly injury reports: only the latest week is shown
        FILES.append(("injuries", f"injuries_{y}.csv", cur))
    if y >= 2013:
        FILES.append(("snap_counts", f"snap_counts_{y}.csv.gz", cur))


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    again = "--all" in sys.argv
    got = skipped = 0
    missing = []
    for tag, name, live in FILES:
        dst = CACHE / name
        if dst.exists() and dst.stat().st_size > 0 and not (again or live):
            skipped += 1
            continue
        url = f"{BASE}/{tag}/{name}"
        req = urllib.request.Request(url, headers={"User-Agent": "RetroVaultDemo/1.0"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=120, context=CTX) as r:
                    data = r.read()
                tmp = dst.with_suffix(dst.suffix + ".part")
                tmp.write_bytes(data)
                tmp.replace(dst)
                got += 1
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    missing.append(name)
                    break
                time.sleep(2 * (attempt + 1))
            except Exception as e:
                print(f"  retry {name}: {e}", file=sys.stderr)
                time.sleep(2 * (attempt + 1))
        else:
            missing.append(name)
    size = sum(f.stat().st_size for f in CACHE.iterdir()) / 1e6
    print(f"nflverse: {got} downloaded, {skipped} cached, {len(missing)} missing ({size:.0f} MB in {CACHE.relative_to(ROOT)})")
    if missing:
        print("  missing: " + ", ".join(missing))


if __name__ == "__main__":
    main()
