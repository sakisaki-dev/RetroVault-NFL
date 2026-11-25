#!/usr/bin/env bash
# Refreshes the NFL widget's data repo, the PUBLIC github.com/sakisaki-dev/rv-nfl-widget (branch main), with what only
# this Mac can make: the sprites, the art, the slow-changing inputs and the widget code. An occasional manual step
# (new players' sprites, a code change); the daily data refresh runs on GitHub Actions in that repo
# (.github/workflows/daily.yml, about 6 am Pacific), never here.
#
#   bash scripts/nfl/widget_publish.sh [path to a local clone, default ~/Code/rv-nfl-widget]
#
# Run `npm run nfl:rebuild` first (the sprites need this checkout's sprite pipeline and current data). It
#   1. reruns scripts/nfl/widget_data.py with RV_NFL_SPARE=1: the widget's sprites plus spares (every club's six best
#      skill players and both QBs, the MVP race's ten, every Vikings player with a game), so the daily build still
#      finds a sprite when the week's picks move on
#   2. writes the repo's inputs/ (scripts/nfl/widget_inputs.py: players who can play this season with gsis / pfr ids
#      and clubs, their ESPN ids, the art paths)
#   3. copies widget-sprites/, widget-art/ and the widget code (rv-nfl-widget.js, which rv-nfl-install.js loads)
#      (the widget names files as data/nfl/<x>; the repo keeps them without the data/nfl/ prefix)
#   4. commits when something changed, pushes, and starts the daily workflow so widget.json is rebuilt on GitHub
#      against the new inputs and sprites (gh CLI)
# Only the repo's own files are touched; no site code goes there (its scripts/ live only in that repo).
set -euo pipefail
export PATH="$PATH:/opt/homebrew/bin"  # gh and node; keep the usual python3 (numpy, Pillow) first
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/public/data/nfl"
DEST="${1:-$HOME/Code/rv-nfl-widget}"
REMOTE="https://github.com/sakisaki-dev/rv-nfl-widget.git"
REPO="sakisaki-dev/rv-nfl-widget"
# the sprites need numpy and Pillow: the first python3 that has them ($PYTHON wins)
PY=""
for c in "${PYTHON:-}" python3 /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 /opt/homebrew/bin/python3; do
  if [ -n "$c" ] && "$c" -c "import numpy, PIL" 2>/dev/null; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "no python3 with numpy and Pillow (set PYTHON=...)" >&2; exit 1; }

[ -f "$SRC/playoff_odds.json" ] || { echo "no $SRC/playoff_odds.json: run npm run nfl:rebuild" >&2; exit 1; }
if [ ! -d "$DEST/.git" ]; then
  git clone "$REMOTE" "$DEST"
fi
(cd "$DEST" && git checkout -q main && git pull -q --rebase origin main)

(cd "$ROOT" && RV_NFL_SPARE=1 "$PY" scripts/nfl/widget_data.py)
"$PY" "$ROOT/scripts/nfl/widget_inputs.py" "$DEST"

cd "$DEST"
cp "$ROOT/public/widgets/rv-nfl-widget.js" rv-nfl-widget.js
for d in widget-sprites widget-art; do
  rm -rf "$d" && mkdir -p "$d" && cp "$SRC/$d/"*.png "$d/"
done

git add -A rv-nfl-widget.js widget-sprites widget-art inputs
if git diff --cached --quiet; then
  echo "sprites, art, inputs and code unchanged: nothing to publish"
else
  git commit -q -m "Sprites, art and inputs from the NFL edition ($(ls widget-sprites | wc -l | tr -d ' ') sprites)"
  git push -q origin main
  echo "published sprites, art, inputs and code"
fi
gh workflow run daily.yml -R "$REPO" && echo "started the daily build on GitHub: gh run watch -R $REPO"
