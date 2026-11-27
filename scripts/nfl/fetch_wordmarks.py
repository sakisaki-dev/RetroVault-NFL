#!/usr/bin/env python3
"""NFL edition: each club's official wordmark for the live view's end zones (owner: "use the official nfl endzone
designs"). The file is the one each team's English Wikipedia infobox names as its `wordmark` (Wikimedia Commons);
Wikimedia's own PNG rendering of it (a 600 px wide thumbnail) is saved, never the SVG itself, so nothing scriptable
ships. Writes public/data/nfl/wordmarks/<ABBR>.png and index.json {abbr: {file, source, w, h}}.
    python3 scripts/nfl/fetch_wordmarks.py
Standard library only.
"""
from __future__ import annotations

import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "nfl" / "wordmarks"
API = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "RetroVault-fan-site/1.0 (wordmark fetch)"}
try:
    CTX = ssl.create_default_context()
    urllib.request.urlopen("https://en.wikipedia.org", timeout=20, context=CTX)
except Exception:
    CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem")


def get(url: str) -> bytes:
    # Wikipedia rate-limits bursts (429): wait and retry, longer each time
    for attempt in range(6):
        req = urllib.request.Request(url, headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def api(**q) -> dict:
    q.setdefault("format", "json")
    return json.loads(get(API + "?" + urllib.parse.urlencode(q)))


def teams() -> list[tuple[str, str]]:
    """(abbreviation, full name) from the site's own club list, src/utils/nflTeams.ts"""
    src = (ROOT / "src" / "utils" / "nflTeams.ts").read_text()
    return re.findall(r"fullName: '([^']+)', abbreviation: '([A-Z]{2,3})'", src)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    index: dict[str, dict] = {}
    old = OUT / "index.json"
    if old.exists():
        index.update(json.loads(old.read_text()).get("clubs", {}))
    for full, abbr in teams():
        if abbr in index and (OUT / f"{abbr}.png").exists():
            continue
        try:
            wt = api(action="parse", page=full.replace(" ", "_"), prop="wikitext", section=0, redirects=1)["parse"]["wikitext"]["*"]
        except Exception as e:  # noqa: BLE001
            print(f"  {abbr}: page failed ({e})")
            continue
        m = re.search(r"\|\s*wordmark\s*=\s*([^\n|}]+)", wt)
        if not m or not m.group(1).strip():
            print(f"  {abbr}: no wordmark in the infobox")
            continue
        name = m.group(1).strip().removeprefix("File:").removeprefix("Image:")
        info = api(action="query", titles=f"File:{name}", prop="imageinfo", iiprop="url|size", iiurlwidth=600)
        page = next(iter(info["query"]["pages"].values()))
        ii = (page.get("imageinfo") or [{}])[0]
        url = ii.get("thumburl") or ii.get("url")
        if not url or not url.lower().split("?")[0].endswith(".png"):
            print(f"  {abbr}: no PNG rendering for {name}")
            continue
        png = get(url)
        if png[:8] != b"\x89PNG\r\n\x1a\n":
            print(f"  {abbr}: not a PNG")
            continue
        (OUT / f"{abbr}.png").write_bytes(png)
        index[abbr] = {"file": name, "source": ii.get("descriptionurl", ""), "w": ii.get("thumbwidth"), "h": ii.get("thumbheight")}
        print(f"  {abbr}: {name}")
        time.sleep(2.0)
    (OUT / "index.json").write_text(json.dumps({"about": "Official club wordmarks (Wikimedia Commons, as named in each team's English Wikipedia infobox), PNG renderings; scripts/nfl/fetch_wordmarks.py", "clubs": index}, indent=1) + "\n")
    print(f"wrote {len(index)} wordmarks to {OUT.relative_to(ROOT)}")
    if len(index) < 32:
        sys.exit(0)


if __name__ == "__main__":
    main()
