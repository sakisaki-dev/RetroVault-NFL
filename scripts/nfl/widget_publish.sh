#!/usr/bin/env bash
# Publishes the NFL widget's data to the private repo github.com/sakisaki-dev/rv-nfl-widget (branch main), which the
# Scriptable widget reads through GitHub's contents API with a read-only token.
#
#   bash scripts/nfl/widget_publish.sh [path to a local clone, default ~/Code/rv-nfl-widget]
#
# Run `npm run nfl:rebuild` (or `python3 scripts/nfl/widget_data.py`) first. Copies widget.json, widget-sprites/ and
# widget-art/ and the widget code itself (public/widgets/rv-nfl-widget.js, which public/widgets/rv-nfl-install.js loads)
# (the widget names them as data/nfl/<x>; the repo keeps them without the data/nfl/ prefix), commits when
# something changed and pushes. Only the repo's own files are touched; nothing from this site's repo is pushed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/public/data/nfl"
DEST="${1:-$HOME/Code/rv-nfl-widget}"
REMOTE="https://github.com/sakisaki-dev/rv-nfl-widget.git"

[ -f "$SRC/widget.json" ] || { echo "no $SRC/widget.json: run python3 scripts/nfl/widget_data.py" >&2; exit 1; }
if [ ! -d "$DEST/.git" ]; then
  git clone "$REMOTE" "$DEST"
fi
cd "$DEST"
git checkout main 2>/dev/null || git checkout -b main
git pull --ff-only origin main 2>/dev/null || true

cp "$SRC/widget.json" widget.json
cp "$ROOT/public/widgets/rv-nfl-widget.js" rv-nfl-widget.js
for d in widget-sprites widget-art; do
  rm -rf "$d" && mkdir -p "$d" && cp "$SRC/$d/"*.png "$d/"
done

git add -A
if git diff --cached --quiet; then
  echo "widget data unchanged: nothing to publish"
  exit 0
fi
SEASON_WEEK="$(python3 -c "import json;d=json.load(open('widget.json'));print(f\"{d['season']} week {d['week']}\")")"
git commit -q -m "Widget data: $SEASON_WEEK"
git push origin main
echo "published $SEASON_WEEK"
