#!/usr/bin/env python3
"""NFL edition: nicknames from each player's own Wikipedia infobox (the "nickname" field), for everyone who has a page.

    python3 scripts/nfl/fetch_nicknames.py        (needs data/y80/players.json: build_players.py first)

Wikipedia is the attestation: a player counts only when the first paragraph of his page is a football biography whose
birth year matches his date of birth (so a namesake's page never lends a nickname) and it says he is nicknamed or known
by a quoted name. Pages are
asked for by "<Name> (American football)" then "<Name>", 25 titles to a request. Writes data/nfl/nicknames_infobox.json
{gsis: nickname}. Standard library only (/etc/ssl/cert.pem fallback like fetch_awards.py).
"""
import html
import json
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "https://en.wikipedia.org/w/api.php"
CTX = ssl.create_default_context()
if not CTX.get_ca_certs() and os.path.exists("/etc/ssl/cert.pem"):
    CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem")


def query(titles):
    qs = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": 2, "redirects": 1, "prop": "extracts", "exintro": 1, "explaintext": 1, "exlimit": "max", "titles": "|".join(titles)})
    req = urllib.request.Request(f"{API}?{qs}", headers={"User-Agent": "RetroVaultDemo/1.0"})
    for attempt in range(8):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=90, context=CTX).read())
        except urllib.error.HTTPError as e:  # 429: wait as long as Wikipedia says
            time.sleep(int(e.headers.get("retry-after") or 10) + 2)
        except Exception:  # noqa: BLE001
            time.sleep(3 + attempt * 3)
    return {}


NICK = re.compile(r"(?:nicknamed|nickname[sd]?(?: is| was| of)?|known (?:by the nickname|as|simply as)|dubbed)\s+[\"“‘']([^\"”’']{2,28})[\"”’']", re.I)


def nickname(text, year):
    """The nickname the first paragraph gives, when it is a biography of someone born in `year`."""
    head = text[:400]
    if year not in head or not re.search(r"football|quarterback|running back|receiver|linebacker|lineman|safety|cornerback|tight end", text[:600], re.I):
        return None
    m = NICK.search(text[:1500])
    return m.group(1).strip() if m else None


def main():
    players = json.loads((ROOT / "data/y80/players.json").read_text())
    want = {}
    for p in players:
        nf = p.get("nfl") or {}
        # players with a page worth the asking: 40+ games, or a ring or an award (the rest almost never have a nickname)
        notable = p["g"] >= 40 or any(p.get(k) for k in ("rings", "mvp", "opoy", "dpoy", "sbmvp", "roty"))
        if nf.get("gsis") and nf.get("dob") and notable:
            name = re.sub(r" \(.*\)$", "", p["n"]).strip()
            want[nf["gsis"]] = (name, nf["dob"][:4])
    out, tried = {}, 0
    # most notable first (awards, rings, then games), so a time budget still covers the players people know
    pri = {}
    for p in players:
        g = (p.get("nfl") or {}).get("gsis")
        pri[g] = -(100 * sum(p.get(k) or 0 for k in ("mvp", "opoy", "dpoy", "sbmvp", "roty")) + 40 * (p.get("rings") or 0) + p["g"])
    items = sorted(want.items(), key=lambda kv: (pri.get(kv[0], 0), kv[0]))
    budget = float(os.environ.get("NICK_MINUTES", "14")) * 60
    t0 = time.time()
    path = ROOT / "data/nfl/nicknames_infobox.json"
    if path.exists():
        out = json.loads(path.read_text())  # earlier runs count; a rerun adds to them
    for i in range(0, len(items), 10):
        chunk = items[i:i + 10]
        titles = []
        for g, (name, _) in chunk:
            titles += [f"{name} (American football)", name]
        by_title = {}
        d = query(titles)
        redirects = {r["from"]: r["to"] for r in d.get("query", {}).get("redirects", [])}
        pages = {pg["title"]: pg for pg in d.get("query", {}).get("pages", []) if not pg.get("missing")}
        for g, (name, year) in chunk:
            for t in (f"{name} (American football)", name):
                pg = pages.get(redirects.get(t, t))
                if not pg:
                    continue
                nick = nickname(pg.get("extract") or "", year)
                if nick:
                    out[g] = nick
                    break
        tried += len(chunk)
        if time.time() - t0 > budget:
            print(f"time budget reached after {tried} players")
            break
        if (i // 10) % 10 == 9:
            path.write_text(json.dumps(dict(sorted(out.items())), indent=0, ensure_ascii=False) + "\n")
        if (i // 10) % 10 == 0:
            print(f"  {tried}/{len(items)} asked, {len(out)} nicknames", flush=True)
        time.sleep(1.0)
    path.write_text(json.dumps(dict(sorted(out.items())), indent=0, ensure_ascii=False) + "\n")
    print(f"{len(out)} nicknames from {len(items)} players' pages")


if __name__ == "__main__":
    main()
