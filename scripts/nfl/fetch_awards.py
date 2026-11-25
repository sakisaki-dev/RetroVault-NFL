#!/usr/bin/env python3
"""Fetch NFL award winners and Super Bowl champions from Wikipedia into data/nfl/awards.json.
Standard library only. Run: python3 -I scripts/nfl/fetch_awards.py"""
import re, json, sys, urllib.request, datetime, os
from html.parser import HTMLParser
from urllib.parse import quote

UA = "RetroVaultDemo/1.0"
BASE = "https://en.wikipedia.org/wiki/"
PAGES = {
    "mvp": "AP_NFL_Most_Valuable_Player_Award",
    "opoy": "AP_NFL_Offensive_Player_of_the_Year_Award",
    "dpoy": "AP_NFL_Defensive_Player_of_the_Year_Award",
    "oroy": "AP_NFL_Offensive_Rookie_of_the_Year_Award",
    "droy": "AP_NFL_Defensive_Rookie_of_the_Year_Award",
    "cpoy": "AP_NFL_Comeback_Player_of_the_Year_Award",
    "sbmvp": "Super_Bowl_Most_Valuable_Player_Award",
    "champions": "List_of_Super_Bowl_champions",
}
# table caption fragment identifying the right table on each page
CAPTION = {
    "mvp": "Most Valuable Player winners", "opoy": "Offensive Player of the Year winners",
    "dpoy": "Defensive Player of the Year winners", "oroy": "Offensive Rookie of the Year winners",
    "droy": "Defensive Rookie of the Year winners", "cpoy": "Comeback Player of the Year winners", "sbmvp": "Super Bowl Most Valuable Players",
    "champions": "Super Bowl championships",
}
POS = {
    "quarterback": "QB", "running back": "RB", "fullback": "FB", "halfback": "HB", "wide receiver": "WR",
    "tight end": "TE", "linebacker": "LB", "defensive end": "DE", "defensive tackle": "DT",
    "cornerback": "CB", "safety": "S", "defensive back": "DB", "offensive tackle": "OT", "guard": "G",
    "center": "C", "kicker": "K", "punter": "P", "placekicker": "K", "kick returner": "KR",
    "punt returner": "PR", "return specialist": "KR", "defensive lineman": "DL", "offensive lineman": "OL",
    "end": "E", "split end": "WR", "flanker": "WR", "tackle": "T", "defensive halfback": "DB", "linebacker/defensive end": "LB",
}
# last-word fallback handles most; these full-name overrides map historic names to today's nickname
TEAM_OVERRIDE = {
    "washington redskins": "Commanders", "washington football team": "Commanders",
    "washington commanders": "Commanders", "houston oilers": "Titans", "tennessee oilers": "Titans",
    "tennessee titans": "Titans", "boston patriots": "Patriots", "dallas texans": "Chiefs",
    "oakland raiders": "Raiders", "los angeles raiders": "Raiders", "las vegas raiders": "Raiders",
    "san diego chargers": "Chargers", "st. louis rams": "Rams", "cleveland rams": "Rams",
    "baltimore colts": "Colts", "phoenix cardinals": "Cardinals", "st. louis cardinals": "Cardinals",
    "chicago cardinals": "Cardinals", "arizona cardinals": "Cardinals", "new york jets": "Jets",
    "new york giants": "Giants", "san francisco 49ers": "49ers",
}

# city-only team cells (the DPOY page lists "Minnesota", "NY Giants", "LA Rams" ...)
CITY = {
    "minnesota": "Vikings", "pittsburgh": "Steelers", "miami": "Dolphins", "dallas": "Cowboys",
    "denver": "Broncos", "tampa bay": "Buccaneers", "oakland": "Raiders", "ny giants": "Giants",
    "ny jets": "Jets", "chicago": "Bears", "philadelphia": "Eagles", "buffalo": "Bills",
    "new orleans": "Saints", "seattle": "Seahawks", "san francisco": "49ers", "green bay": "Packers",
    "baltimore": "Ravens", "indianapolis": "Colts", "houston": "Texans", "carolina": "Panthers",
    "la rams": "Rams", "la chargers": "Chargers", "la raiders": "Raiders", "new england": "Patriots",
    "cleveland": "Browns", "detroit": "Lions", "atlanta": "Falcons", "kansas city": "Chiefs",
    "cincinnati": "Bengals", "tennessee": "Titans", "jacksonville": "Jaguars", "arizona": "Cardinals",
    "washington": "Commanders", "las vegas": "Raiders", "san diego": "Chargers",
}

class TP(HTMLParser):
    def __init__(s):
        super().__init__(); s.tables = []; s.stack = []; s.skip = 0
    def handle_starttag(s, t, a):
        a = dict(a)
        if t == "table": s.stack.append({"cap": "", "rows": [], "cur": None})
        elif not s.stack: return
        elif t == "tr": s.stack[-1]["rows"].append([])
        elif t in ("td", "th"):
            c = {"t": "", "rs": int(re.sub(r"\D", "", a.get("rowspan", "1")) or 1),
                 "cs": int(re.sub(r"\D", "", a.get("colspan", "1")) or 1)}
            if s.stack[-1]["rows"]: s.stack[-1]["rows"][-1].append(c)
            s.stack[-1]["cur"] = c
        elif t == "caption": s.stack[-1]["cur"] = s.stack[-1]
        elif t in ("sup", "style"): s.skip += 1
        elif t == "br":
            c = s.stack[-1]["cur"]
            if c is not None and "rows" not in c: c["t"] += "\n"
    def handle_endtag(s, t):
        if not s.stack: return
        if t == "table": s.tables.append(s.stack.pop())
        elif t in ("td", "th", "caption"): s.stack[-1]["cur"] = None
        elif t in ("sup", "style"): s.skip = max(0, s.skip - 1)
    def handle_data(s, d):
        if not s.stack or s.skip: return
        c = s.stack[-1]["cur"]
        if c is not None:
            if "rows" in c: c["cap"] += d
            else: c["t"] += d

def grid(t):
    out = []; pend = {}
    for r in t["rows"]:
        row = []; ci = 0; cells = list(r)
        while cells or ci in pend:
            if ci in pend:
                c, n = pend[ci]; row.append(c)
                if n > 1: pend[ci] = (c, n - 1)
                else: del pend[ci]
                ci += 1; continue
            c = cells.pop(0)
            for _ in range(c["cs"]):
                row.append(c)
                if c["rs"] > 1: pend[ci] = (c, c["rs"] - 1)
                ci += 1
        out.append(row)
    return out

def fetch(page):
    req = urllib.request.Request(BASE + quote(page), headers={"User-Agent": UA})
    import ssl
    ctx = ssl.create_default_context()
    if not ctx.get_ca_certs() and os.path.exists("/etc/ssl/cert.pem"):  # python.org builds ship no CA bundle
        ctx = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    return urllib.request.urlopen(req, timeout=60, context=ctx).read().decode("utf-8")

def find_table(html, frag):
    p = TP(); p.feed(html)
    for t in p.tables:
        if frag.lower() in t["cap"].lower() and len(t["rows"]) > 20: return grid(t)
    for t in p.tables:  # some pages (DPOY) have no caption: match the header row instead
        g = grid(t) if len(t["rows"]) > 20 else None
        if g and [c["t"].strip().lower() for c in g[0]][:4] == ["season", "player", "position", "team"]: return g
    raise SystemExit("table not found: " + frag)

def clean(s):
    s = re.sub(r"\[[^\]]*\]", "", s)
    s = re.sub(r"[†‡§¶*⁑∗#^~]+", "", s)
    s = re.sub(r"\((?:\d+|[^)]*)\)\s*$", "", s.strip()) if re.search(r"\(\d+\)\s*$", s.strip()) else s
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()

def strip_paren(s):
    return re.sub(r"\s+", " ", re.sub(r"\([^)]*\)", "", clean(s))).strip()

def lines(s):
    return [x for x in (strip_paren(l) for l in s.split("\n")) if x]

def nickname(team):
    t = strip_paren(team)
    # a cell holding several teams (e.g. traded) keeps the first, flagged by the caller
    key = t.lower()
    if key in TEAM_OVERRIDE: return TEAM_OVERRIDE[key]
    if key in CITY: return CITY[key]
    if key.endswith("49ers"): return "49ers"
    return t.split(" ")[-1]

def pos(p):
    p = strip_paren(p); k = p.lower()
    return POS.get(k, p)

def awards_rows(html, key, bad):
    g = find_table(html, CAPTION[key]); out = []
    hdr = [c["t"].strip().lower() for c in g[0]]
    ci = {n: hdr.index(n) for n in ("season", "player", "position", "team")}
    for r in g[1:]:
        try:
            season = int(re.search(r"\d{4}", r[ci["season"]]["t"]).group())
            names = lines(r[ci["player"]]["t"]); teams = lines(r[ci["team"]]["t"]); ps = lines(r[ci["position"]]["t"])
            if not names: raise ValueError("empty name")
            # co-winners share one row, one line per player (teams and positions line up, or one shared)
            for i, name in enumerate(names):
                out.append({"season": season, "player": strip_paren(name),
                            "team": nickname(teams[i] if len(teams) == len(names) else teams[0]),
                            "position": pos(ps[i] if len(ps) == len(names) else ps[0])})
        except Exception as e:
            bad.append((key, [c["t"].strip()[:30] for c in r], str(e)))
    return out

def sbmvp_rows(html, bad):
    g = find_table(html, CAPTION["sbmvp"]); out = []
    for r in g[1:]:
        try:
            year = int(re.search(r"\d{4}", r[0]["t"]).group())
            name = strip_paren(r[2]["t"])
            if not name: raise ValueError("empty name")
            out.append({"season": year - 1, "superbowl": r[1]["t"].strip(), "player": name,
                        "team": nickname(r[3]["t"]), "position": pos(r[4]["t"])})
        except Exception as e:
            bad.append(("sbmvp", [c["t"].strip()[:30] for c in r], str(e)))
    return out

def champion_rows(html, bad):
    g = find_table(html, CAPTION["champions"]); out = []
    for r in g[1:]:
        try:
            m = re.search(r"\((\d{4})", r[1]["t"])
            ws, ls = int(r[3]["t"].strip()), int(r[5]["t"].strip())
            out.append({"season": int(m.group(1)), "superbowl": r[0]["t"].strip(),
                        "winner": nickname(r[2]["t"]), "loser": nickname(r[4]["t"]),
                        "score": "%d-%d" % (ws, ls)})
        except Exception as e:
            bad.append(("champions", [c["t"].strip()[:30] for c in r], str(e)))
    return out

def main():
    bad = []; pages = {}
    awards = {}
    for key, page in PAGES.items():
        if page not in pages: pages[page] = fetch(page)
    for key in ("mvp", "opoy", "dpoy", "oroy", "droy", "cpoy"):
        awards[key] = awards_rows(pages[PAGES[key]], key, bad)
    awards["sbmvp"] = sbmvp_rows(pages[PAGES["sbmvp"]], bad)
    champs = champion_rows(pages[PAGES["champions"]], bad)
    data = {"source": {k: BASE + v for k, v in PAGES.items()},
            "fetched": datetime.date.today().isoformat(), "awards": awards, "champions": champs}
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, "data", "nfl", "awards.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f: json.dump(data, f, indent=1, ensure_ascii=False); f.write("\n")
    validate(data, bad)

def validate(d, bad):
    a = d["awards"]
    for k, rows in list(a.items()) + [("champions", d["champions"])]:
        print(k, len(rows))
        for r in rows[-3:]: print("   ", r)
    for k, rows in a.items():
        assert all(isinstance(r["season"], int) and r["player"] for r in rows), k
    seasons = [r["season"] for r in a["mvp"]]
    missing = [s for s in range(1957, max(seasons) + 1) if s not in seasons]
    print("MVP missing seasons:", missing, "| ties:", sorted({s for s in seasons if seasons.count(s) > 1}))
    sb = [r["superbowl"] for r in a["sbmvp"]]
    cs = [r["superbowl"] for r in d["champions"]]
    print("SB MVP games:", len(set(sb)), "champion games:", len(set(cs)), "same set:", set(sb) == set(cs))
    print("SB MVP multi-rows:", [s for s in set(sb) if sb.count(s) > 1])
    print("positions:", sorted({r["position"] for rows in a.values() for r in rows}))
    print("teams:", sorted({r["team"] for rows in a.values() for r in rows} | {c["winner"] for c in d["champions"]} | {c["loser"] for c in d["champions"]}))
    print("unparsed rows:", bad or "none")

if __name__ == "__main__":
    main()
