#!/usr/bin/env python3
"""Fetch well-attested NFL player nicknames from Wikipedia list pages into data/nfl/nicknames.json.
Sources: List_of_NFL_nicknames ("People" table; "Teams and units" for groups) and
List_of_North_American_football_nicknames ("Players" list; American-football "Teams" for groups).
Standard library only. Run: python3 -I scripts/nfl/fetch_nicknames.py"""
import re, json, os, sys, datetime, unicodedata, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikitab
from wikitab import squash
from fetch_hof import franchise, PLAYER_POS

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "data", "nfl", "nicknames.json")
HOF = os.path.join(HERE, "..", "..", "data", "nfl", "hof.json")
P1, P2 = "List_of_NFL_nicknames", "List_of_North_American_football_nicknames"
NONPLAYER = re.compile(r"\b(head coach|coach|coached|owner|commissioner|general manager|executive|broadcaster|announcer|"
                       r"referee|official|sportscaster|analyst|commentator|founder|president)\b", re.I)
PLAYERISH = re.compile(r"\b(quarterback|running back|receiver|tight end|linebacker|lineman|cornerback|safety|kicker|"
                       r"punter|player|defensive|offensive|fullback|halfback|center|guard|tackle|end|returner|rusher)\b", re.I)
POSWORDS = sorted(PLAYER_POS, key=len, reverse=True)

def norm(n):
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower()
    n = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", n)
    return re.sub(r"[^a-z0-9]+", " ", n).strip()

def unquote(s):
    return squash(s).strip(" \t\"'“”‘’«»`")

def era_from(text):
    t = text or ""
    yrs = [int(y) for y in re.findall(r"\b(19[2-9]\d|20[0-2]\d)\b", t)]
    dec = [int(d) for d in re.findall(r"\b(19[2-9]0|20[0-2]0)'?s\b", t)]
    allv = yrs + dec
    return (min(allv), max(allv) + (9 if dec and max(allv) in dec else 0)) if allv else None

def positions_in(text):
    found = []
    for w in POSWORDS:
        if re.search(r"\b" + re.escape(w) + r"\b", text, re.I):
            a = PLAYER_POS[w]
            if a not in found and not any(a == PLAYER_POS[x] for x in found): found.append(a)
    return found

def group_members(links):
    out = []
    for l in links:
        if re.search(r"season|playoffs|Super Bowl|NFL|AFL|Bowl|\d{4}|Stadium|Field|team$|football|defense|offense|line$", l, re.I): continue
        if franchise(l) and re.search(r"\s", l): continue  # a club, not a member
        out.append(l)
    return out

def parse_people(html, bad):
    p = wikitab.Node(); p.feed(html)
    t = [t for t in p.tables if t["sec"] == "People"][0]
    rows, nonp = [], []
    for r in t["rows"][1:]:
        if len(r) < 3: continue
        try:
            nick_cell, who, desc = r[0], r[1], squash(r[2]["t"])
            nicks = [unquote(b) for b in nick_cell["bold"]] or [unquote(x) for x in re.split(r",|\bor\b|/", squash(nick_cell["t"])) if unquote(x)]
            nicks = [re.sub(r"\s*\*$", "", n) for n in nicks if n]
            names = [squash(x) for x in re.split(r"\n|;|\band\b|&", who["t"]) if squash(x)] if len(who["links"]) > 1 else [squash(who["t"])]
            teams = []
            for l in who["links"] + r[2]["links"]:
                f = franchise(l) if re.search(r"\s", l) and not re.search(r"season|Bowl|\d{4}", l, re.I) else None
                if f and f not in teams: teams.append(f)
            rec = {"names": names, "nicknames": nicks, "description": desc, "teams": teams,
                   "positions": positions_in(desc), "era": era_from(desc), "page": P1}
            if not names or not nicks: raise ValueError("empty")
            (nonp if NONPLAYER.search(desc) and not PLAYERISH.search(desc.split(".")[0]) else rows).append(rec)
        except Exception as e:
            bad.append((P1, squash(r[0]["t"])[:40], repr(e)))
    return rows, nonp

def parse_na_players(html, bad):
    p = wikitab.Node(); p.feed(html)
    out = []
    for i in p.items:
        if i["sec"] != "Players": continue
        txt = squash(i["t"])
        m = re.match(r"^((?:[\"“‘'][^–—]*?[\"”’'])(?:\s*(?:,|/|or|and|aka)\s*[\"“‘'][^–—]*?[\"”’'])*)\s*[–—\-=]+\s*(.+)$", txt)
        if not m: bad.append((P2, txt[:80], "no match")); continue
        raw = m.group(1)
        nicks = [unquote(x) for x in re.findall(r"[\"“‘][^\"”’]+[\"”’]", raw)] or [unquote(raw)]
        if raw.count('"') + raw.count("“") + raw.count("”") > 2 and not re.search(r"\"\s*(,|/|or|and)\s*\"", raw):
            nicks = [re.sub(r"\s+", " ", re.sub(r"[\"“”‘’]", "", raw)).strip()]  # quotes inside a nickname, e.g. JJ Swatt
        rest = [x.strip() for x in m.group(2).split(",") if x.strip()]
        if not rest: bad.append((P2, txt[:80], "no name")); continue
        name, teams, pos, note = rest[0], [], [], []
        for tok in rest[1:]:
            f = franchise(tok); k = tok.lower()
            if k in PLAYER_POS: pos.append(PLAYER_POS[k])
            elif f and re.search(r"\s", tok) or (f and tok.lower() == f.lower()): teams.append(f) if f not in teams else None
            else: note.append(tok)
        out.append({"names": [name], "nicknames": [n for n in nicks if n], "description": ", ".join(note), "teams": teams,
                    "positions": pos, "era": era_from(txt), "page": P2})
    return out

def parse_groups(h1, h2, bad):
    out = []
    p = wikitab.Node(); p.feed(h1)
    for i in p.items:
        if i["sec"] == "Teams and units" or (len(i["sec"]) == 1 and i["sec"].isalpha()):
            if not i["bold"]: continue
            nick = unquote(i["bold"][0]); desc = squash(i["t"])
            desc = squash(desc.split(":", 1)[1]) if ":" in desc else desc
            out.append({"nickname": re.sub(r"\s*\*$", "", nick), "description": desc, "members": group_members(i["links"]),
                        "teams": sorted({franchise(l) for l in i["links"] if franchise(l) and " " in l}), "page": P1})
    q = wikitab.Node(); q.feed(h2)
    seen = {g["nickname"].lower() for g in out}
    for i in q.items:
        if i["sec"] != "American football": continue
        txt = squash(i["t"]); m = re.match(r"^[\"“‘]([^\"”’]+)[\"”’]\s*[–—\-:]+\s*(.+)$", txt)
        if not m: continue
        if m.group(1).lower() in seen: continue
        out.append({"nickname": m.group(1), "description": m.group(2), "members": group_members(i["links"]),
                    "teams": sorted({franchise(l) for l in i["links"] if franchise(l) and " " in l}), "page": P2})
    return out

def main():
    h1, h2 = wikitab.fetch(P1), wikitab.fetch(P2)
    bad = []
    r1, nonp = parse_people(h1, bad); r2 = parse_na_players(h2, bad)
    hof = {}
    if os.path.exists(HOF):
        for x in json.load(open(HOF))["inductees"]:
            if x["role"] == "player" and x["years_active"]: hof[norm(x["name"])] = x
    people = collections.OrderedDict(); groups_from_people = []
    for rec in r1 + r2:
        if len(rec["names"]) > 1:  # one nickname for a pair or trio: a group
            groups_from_people.append({"nickname": ", ".join(rec["nicknames"]), "description": rec["description"],
                                       "members": rec["names"], "teams": rec["teams"], "page": rec["page"]}); continue
        n = rec["names"][0]; k = norm(n)
        d = people.setdefault(k, {"name": n, "nicknames": [], "position": None, "teams": [], "era_hint": None,
                                  "notes": [], "sources": []})
        for x in rec["nicknames"]:
            if x.lower() not in [y.lower() for y in d["nicknames"]]: d["nicknames"].append(x)
        for t in rec["teams"]:
            if t not in d["teams"]: d["teams"].append(t)
        if rec["positions"] and not d["position"]: d["position"] = "/".join(rec["positions"][:2])
        if rec["era"] and not d["era_hint"]: d["era_hint"] = {"years": list(rec["era"]), "source": "wikipedia_text"}
        if rec["description"] and rec["description"] not in d["notes"]: d["notes"].append(rec["description"])
        if rec["page"] not in d["sources"]: d["sources"].append(rec["page"])
    for k, d in people.items():
        h = hof.get(k)
        if h:
            d["hall_of_fame"] = h["class"]
            if not d["era_hint"]: d["era_hint"] = {"years": h["years_active"], "source": "hof.json years_active"}
            if not d["position"] and h["positions"]: d["position"] = "/".join(h["positions"][:2])
            if not d["teams"]: d["teams"] = h["primary_teams"]; d["teams_source"] = "hof.json primary_teams"
    rows = sorted(people.values(), key=lambda d: d["name"].split()[-1].lower() + d["name"].lower())
    groups = parse_groups(h1, h2, bad) + groups_from_people
    doc = {"sources": ["https://en.wikipedia.org/wiki/" + P1, "https://en.wikipedia.org/wiki/" + P2],
           "fetched": datetime.date.today().isoformat(), "count": len(rows), "players": rows,
           "groups": groups, "non_players": [{"names": r["names"], "nicknames": r["nicknames"], "description": r["description"]} for r in nonp]}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f: json.dump(doc, f, indent=1, ensure_ascii=False); f.write("\n")
    print("players", len(rows), "groups", len(groups), "non_players(people/coaches etc.)", len(nonp), "nfl-page rows", len(r1), "na-page rows", len(r2))
    print("nicknames total", sum(len(d["nicknames"]) for d in rows), "multi-nickname players", sum(len(d["nicknames"]) > 1 for d in rows),
          "with position", sum(bool(d["position"]) for d in rows), "with teams", sum(bool(d["teams"]) for d in rows), "with era", sum(bool(d["era_hint"]) for d in rows))
    if bad: print("UNPARSED:", len(bad)); [print(" ", b) for b in bad[:30]]

if __name__ == "__main__": main()
