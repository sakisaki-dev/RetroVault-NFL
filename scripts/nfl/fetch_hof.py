#!/usr/bin/env python3
"""Fetch every Pro Football Hall of Fame inductee from Wikipedia into data/nfl/hof.json.
Source: https://en.wikipedia.org/wiki/List_of_Pro_Football_Hall_of_Fame_inductees
Standard library only. Run: python3 -I scripts/nfl/fetch_hof.py"""
import re, json, os, sys, datetime, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wikitab
from wikitab import squash

PAGE = "List_of_Pro_Football_Hall_of_Fame_inductees"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "nfl", "hof.json")

NICK = ["Cardinals", "Falcons", "Ravens", "Bills", "Panthers", "Bears", "Bengals", "Browns", "Cowboys", "Broncos",
        "Lions", "Packers", "Texans", "Colts", "Jaguars", "Chiefs", "Raiders", "Chargers", "Rams", "Dolphins",
        "Vikings", "Patriots", "Saints", "Giants", "Jets", "Eagles", "Steelers", "49ers", "Seahawks",
        "Buccaneers", "Titans", "Commanders"]
# historic names -> today's franchise nickname (same mapping idea as fetch_awards.py)
HIST = {"redskins": "Commanders", "oilers": "Titans", "staleys": "Bears", "pirates": "Steelers"}
# clubs that no longer exist (or are not today's franchises): kept by their own name, no franchise nickname
DEFUNCT = ("yankees", "yanks", "canton", "bulldogs", "milwaukee", "rock island", "duluth", "brooklyn", "pottsville",
           "providence", "frankford", "oorang", "kansas city cowboys", "hammond", "columbus", "detroit panthers",
           "detroit wolverines", "washington senators", "staten island", "steagles", "card-pitt", "dons", "hornets",
           "rockets", "akron", "cleveland indians", "dallas texans", "1950 colts", "n/a", "nfl.com")
NONPLAYER = {"coach", "general manager", "team owner", "team owner/founder", "team administrator", "personnel administrator",
             "nfl commissioner", "nfl co-organizer", "afl co-founder", "founder", "owner", "contributor", "administrator",
             "league founder", "commissioner", "co-founder"}
PLAYER_POS = {
    "quarterback": "QB", "running back": "RB", "fullback": "FB", "halfback": "HB", "wide receiver": "WR", "flanker": "WR",
    "tight end": "TE", "linebacker": "LB", "middle linebacker": "LB", "defensive end": "DE", "defensive tackle": "DT",
    "nose tackle": "NT", "cornerback": "CB", "safety": "S", "free safety": "S", "defensive back": "DB", "offensive tackle": "OT",
    "tackle": "T", "guard": "G", "center": "C", "placekicker": "K", "kicker": "K", "punter": "P", "end": "E",
    "kick returner": "KR", "kickoff returner": "KR", "punt returner": "PR", "return specialist": "KR", "kickoff/punt returner": "KR",
}

def franchise(raw):
    """Current franchise nickname for a team cell, or None for a defunct club."""
    t = re.sub(r"\([^)]*\)", lambda m: "" if "1950" not in m.group() else m.group(), squash(raw)).strip()
    last = [s.strip() for s in t.split("/") if s.strip()]
    if not last: return None
    last = last[-1]; low = last.lower()
    # "Dallas Texans (AFL)/ Kansas City Chiefs" -> last segment already Chiefs; a lone Dallas Texans is defunct
    if any(d in low for d in DEFUNCT): return None
    w = re.sub(r"[^A-Za-z0-9 ]", "", low).split()
    if not w: return None
    nick = w[-1]
    if nick in HIST: return HIST[nick]
    for n in NICK:
        if n.lower() == nick: return n
    return None

def split_pos(raw):
    """-> (positions, premodern, roles) from a Position cell."""
    t = squash(raw); pre = "Pre-Modern Era" in t
    t = re.sub(r"Pre-Modern Era: Two-Way Performer", "/", t)
    t = re.sub(r"\s+(?=Punter|Kicker)", "/", t)
    toks = [x.strip() for x in re.split(r"/", t) if x.strip()]
    pos, roles = [], set()
    for x in toks:
        k = x.lower()
        if k in NONPLAYER or "coach" in k and k not in PLAYER_POS:
            roles.add("coach" if "coach" in k else "contributor")
        elif k in PLAYER_POS:
            pos.append(PLAYER_POS[k]); roles.add("player")
        else:
            roles.add("player"); pos.append(x)  # unknown: keep the raw word, flagged in WIKI.md gaps
    return pos, pre, roles

def years(raw):
    ys = [int(y) for y in re.findall(r"\b(1[89]\d\d|20\d\d)\b", raw)]
    return ys

def person_flags(name):
    f = {}
    if "**" in name: f["first_year_eligible"] = True
    if "^" in name: f["first_year_finalist"] = True
    if "§" in name: f["charter_member"] = True
    if "†" in name: f["centennial_slate"] = True
    return f

def main():
    p = wikitab.Node(); p.feed(wikitab.fetch(PAGE))
    big = [t for t in p.tables if len(t["rows"]) > 100]
    if len(big) < 2: raise SystemExit("inductee tables not found")
    nfl, other = wikitab.grid(big[0]["rows"]), wikitab.grid(big[1]["rows"])
    people = collections.OrderedDict(); bad = []
    def add(r, league):
        if not r or not squash(r[0]["t"]): return
        try:
            c0 = r[0]; name = re.sub(r"[†‡§¶*^]+", "", squash(c0["t"])).strip()
            cls = int(re.search(r"\d{4}", r[1]["t"]).group())
            key = (c0["links"][0] if c0["links"] else name, cls)
            d = people.setdefault(key, {"name": name, "class": cls, "wikipedia_title": c0["links"][0] if c0["links"] else None,
                                        "_pos": [], "_pre": False, "_roles": set(), "teams_detail": [], **{"_f": {}}})
            d["_f"].update(person_flags(squash(c0["t"])))
            pos, pre, roles = split_pos(r[2]["t"])
            for x in pos:
                if x not in d["_pos"]: d["_pos"].append(x)
            d["_pre"] |= pre; d["_roles"] |= roles
            tcol = 3 if league is None else 4
            raw = squash(r[tcol]["t"]).rstrip("*").strip(); ys = years(r[tcol + 1]["t"])
            d["teams_detail"].append({"team_raw": raw, "franchise": franchise(raw), "years": squash(r[tcol + 1]["t"]),
                                      **({"league": squash(r[3]["t"])} if league else {})})
            d.setdefault("_ys", []).extend(ys)
        except Exception as e:
            bad.append((str([squash(c["t"])[:25] for c in r]), repr(e)))
    for r in nfl[1:]: add(r, None)
    for r in other[1:]: add(r, "x")
    out = []
    for (title, cls), d in people.items():
        roles = d["_roles"] or {"player"}
        role = "player" if "player" in roles else ("coach" if "coach" in roles else "contributor")
        teams = []
        for t in d["teams_detail"]:
            if t["franchise"] and t["franchise"] not in teams: teams.append(t["franchise"])
        ys = d.get("_ys", [])
        # primary teams: the franchises with the most years for him (all of them when a single one)
        span = {}
        for t in d["teams_detail"]:
            if not t["franchise"]: continue
            yy = years(t["years"]); span[t["franchise"]] = span.get(t["franchise"], 0) + (max(yy) - min(yy) + 1 if yy else 0)
        top = max(span.values()) if span else 0
        primary = [t for t in teams if span.get(t, 0) >= top * 0.5] if top else teams
        rec = {"name": d["name"], "class": cls, "role": role,
               "also_roles": sorted(roles - {role}),
               "positions": d["_pos"], "teams": teams, "primary_teams": primary,
               "defunct_teams": sorted({t["team_raw"] for t in d["teams_detail"] if not t["franchise"] and t["team_raw"] not in ("n/a", "NFL.com", "")}),
               "years_active": [min(ys), max(ys)] if ys else None,
               "premodern_era": d["_pre"], "wikipedia_title": d["wikipedia_title"],
               "teams_detail": d["teams_detail"]}
        rec.update(d["_f"])
        out.append(rec)
    out.sort(key=lambda r: (r["class"], r["name"].split()[-1], r["name"]))
    doc = {"source": "https://en.wikipedia.org/wiki/" + PAGE, "fetched": datetime.date.today().isoformat(),
           "count": len(out), "inductees": out}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f: json.dump(doc, f, indent=1, ensure_ascii=False); f.write("\n")
    c = collections.Counter(r["class"] for r in out); rc = collections.Counter(r["role"] for r in out)
    print("inductees", len(out), "roles", dict(rc), "classes", len(c), "latest", max(c), c[max(c)])
    print("per class:", " ".join("%d:%d" % kv for kv in sorted(c.items())))
    if bad: print("UNPARSED rows:", len(bad)); [print(" ", b) for b in bad[:20]]

if __name__ == "__main__": main()
