#!/usr/bin/env bash
# Refreshes what only this Mac can make for the NFL widget, inside THIS repo (the widget lives in the site's repo,
# github.com/sakisaki-dev/RetroVault-NFL; the old rv-nfl-widget repo is archived): the sprites, the art and the
# slow-changing inputs. An occasional manual step (new players' sprites, a code change); the daily data refresh runs on
# GitHub Actions (.github/workflows/nfl-widget-daily.yml, about 6 am Pacific), never here.
#
#   bash scripts/nfl/widget_publish.sh [--push]
#
# Run `npm run nfl:rebuild` first (the sprites need this checkout's sprite pipeline and current data). It
#   1. reruns scripts/nfl/widget_data.py with RV_NFL_SPARE=1: the widget's sprites plus spares (every club's six best
#      skill players and both QBs, the MVP race's ten, every Vikings player with a game), so the daily build still
#      finds a sprite when the week's picks move on. They land in public/data/nfl/widget-sprites/ and widget-art/,
#      which the site serves and the widget reads (raw GitHub's main/public/, then Pages)
#   2. writes widget/inputs/ (scripts/nfl/widget_inputs.py: players who can play this season with gsis / pfr ids
#      and clubs, their ESPN ids, the art paths)
#   3. commits those paths on the current branch (nothing else), then with --push pushes it to the NFL repo's main
#      (`git push nfl HEAD:main`) and starts the daily workflow so widget.json is rebuilt on GitHub against the new
#      inputs and sprites (gh CLI). Without --push it stops after the commit; push the usual way.
# Only the widget's own paths are staged; the widget code (public/widgets/rv-nfl-widget.js) is edited and committed like
# any other site file.
set -euo pipefail
export PATH="$PATH:/opt/homebrew/bin"  # gh and node; keep the usual python3 (numpy, Pillow) first
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/public/data/nfl"
REPO="sakisaki-dev/RetroVault-NFL"
PUSH=0
[ "${1:-}" = "--push" ] && PUSH=1
# the sprites need numpy and Pillow: the first python3 that has them ($PYTHON wins)
PY=""
for c in "${PYTHON:-}" python3 /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 /opt/homebrew/bin/python3; do
  if [ -n "$c" ] && "$c" -c "import numpy, PIL" 2>/dev/null; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "no python3 with numpy and Pillow (set PYTHON=...)" >&2; exit 1; }

[ -f "$SRC/playoff_odds.json" ] || { echo "no $SRC/playoff_odds.json: run npm run nfl:rebuild" >&2; exit 1; }

cd "$ROOT"
RV_NFL_SPARE=1 "$PY" scripts/nfl/widget_data.py
"$PY" scripts/nfl/widget_inputs.py "$ROOT/widget"

git add -A widget/inputs public/data/nfl/widget-sprites public/data/nfl/widget-art
if git diff --cached --quiet -- widget/inputs public/data/nfl/widget-sprites public/data/nfl/widget-art; then
  echo "sprites, art and inputs unchanged: nothing to publish"
else
  git commit -q -m "NFL widget: sprites, art and inputs ($(ls public/data/nfl/widget-sprites | wc -l | tr -d ' ') sprites)" -- widget/inputs public/data/nfl/widget-sprites public/data/nfl/widget-art
  echo "committed sprites, art and inputs"
fi
if [ "$PUSH" = 1 ]; then
  git push nfl HEAD:main
  gh workflow run nfl-widget-daily.yml -R "$REPO" && echo "started the daily build on GitHub: gh run watch -R $REPO"
else
  echo "not pushed: git push nfl nfl-demo:main, then gh workflow run nfl-widget-daily.yml -R $REPO"
fi
