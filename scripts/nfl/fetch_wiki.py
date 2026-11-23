#!/usr/bin/env python3
"""NFL edition: real Pro Football Hall of Fame inductees and well-known nicknames, from Wikipedia.

    python3 scripts/nfl/fetch_wiki.py

Writes data/nfl/hof.json  [{name, class, position, teams: [..], years}]  ("List of Pro Football Hall of Fame inductees")
       data/nfl/nicknames.json  [{nick, name, position?}]  ("List of North American football nicknames": only entries whose
       player is linked to his own article, i.e. attested enough to have a page)
Standard library only (the python.org build ships no CA bundle: /etc/ssl/cert.pem is the fallback), like fetch_awards.py.
"""
import html
import json
import os
import re
import ssl
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UA = "RetroVaultDemo/1.0"
TEAMISH = re.compile(r"\b(Bills|Dolphins|Patriots|Jets|Broncos|Chiefs|Chargers|Raiders|Ravens|Bengals|Browns|Steelers|Texans|Colts|Jaguars|Titans|Cowboys|Giants|Eagles|Redskins|Commanders|Cardinals|Rams|49ers|Seahawks|Bears|Lions|Packers|Vikings|Falcons|Panthers|Saints|Buccaneers|Division|Conference|NFL|Bowl|Line|Backfield|Secondary|Defense|Offense)\b")
API = "https://en.wikipedia.org/w/api.php?action=parse&prop=text&format=json&formatversion=2&page="


def get(page):
    ctx = ssl.create_default_context()
    if not ctx.get_ca_certs() and os.path.exists("/etc/ssl/cert.pem"):
        ctx = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    req = urllib.request.Request(API + page, headers={"User-Agent": UA})
    return json.loads(urllib.request.urlopen(req, timeout=90, context=ctx).read())["parse"]["text"]


def text(s):
    s = re.sub(r"<sup.*?</sup>", "", s, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", "", s)).replace("\xa0", " ").strip()


def inductees():
    h = get("List_of_Pro_Football_Hall_of_Fame_inductees")
    tbl = [t for t in re.findall(r"<table.*?</table>", h, flags=re.S) if "<th>Inductee" in t][0]
    out, cur = [], None
    for tr in re.findall(r"<tr.*?</tr>", tbl, flags=re.S):
        cells = re.findall(r"<t[dh][^>]*>.*?</t[dh]>", tr, flags=re.S)
        if "<th" in tr:
            continue
        vals = [text(c) for c in cells]
        # a first row of an inductee has name, class, position, club, years; later rows (more clubs) have club, years
        if len(cells) >= 5 or (len(cells) == 4 and re.fullmatch(r"\d{4}", vals[1] if len(vals) > 1 else "")):
            name = re.sub(r"[\*†§\^]+$", "", vals[0]).strip()
            cur = {"name": name, "class": int(re.sub(r"\D", "", vals[1])[:4]), "position": vals[2], "teams": [vals[3]] if len(vals) > 3 else [],
                   "years": [vals[4]] if len(vals) > 4 else []}
            out.append(cur)
        elif cur and len(vals) >= 2:
            cur["teams"].append(vals[0])
            cur["years"].append(vals[1])
    return out


def nicknames():
    h = get("List_of_North_American_football_nicknames")
    out = []
    for li in re.findall(r"<li>(.*?)</li>", h, flags=re.S):
        m = re.match(r"\s*[\"“”']+([^\"“”]+?)[\"“”']+\s*[-–—]\s*(.*)", re.sub(r"<sup.*?</sup>", "", li, flags=re.S), flags=re.S)
        if not m:
            continue
        nick, rest = html.unescape(m.group(1)).strip(), m.group(2)
        plain = text(rest)
        name = re.split(r",|\s+[(\[]", plain, maxsplit=1)[0].strip()
        tail = plain[len(name):].strip(" ,")
        # a person: two or three capitalised words and not a club / unit ("Dallas Cowboys", "defense")
        if not re.fullmatch(r"[A-Z][\w.'’-]+(?: [A-Z][\w.'’-]+){1,3}(?: (?:Jr|Sr|II|III)\.?)?", name) or TEAMISH.search(name):
            continue
        out.append({"nick": nick, "name": name, "tail": tail, "linked": bool(re.match(r"\s*<a href=\"/wiki/", rest))})
    return out


def main():
    d = ROOT / "data" / "nfl"
    ind = inductees()
    (d / "hof.json").write_text(json.dumps(ind, indent=0, ensure_ascii=False) + "\n")
    nk = nicknames()
    (d / "nicknames.json").write_text(json.dumps(nk, indent=0, ensure_ascii=False) + "\n")
    print(f"{len(ind)} inductees (classes {min(i['class'] for i in ind)}-{max(i['class'] for i in ind)}), {len(nk)} linked nicknames")


if __name__ == "__main__":
    main()
