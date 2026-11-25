#!/usr/bin/env python3
"""NFL edition: college and draft per player -> public/data/nfl/draft.json.

Joins data/y80/players.json (nfl.gsis, else name + position) to nflverse draft_picks.csv.gz (1980 on: season, round, pick,
team, college) and players.csv.gz (college_name, draft_*). Never guesses: a player with no college and no draft row gets no
entry; an undrafted player with a college gets [college] only. ESPN's college team list (id, short name, colours; cached in
data/nfl-cache/espn_college_teams.json, fetched once from site.api.espn.com) supplies the logo id and plate colours for the
schools it knows; a school it doesn't know keeps its plain name.

  {"x": {"QB:Joe Burrow": ["Ohio State"]}, "colleges": {"Michigan": {"id": 130, "s": "Michigan", "c": "ffcb05", "a": "00274c"}},
   "p": {"QB:Tom Brady": ["Michigan", 2000, 6, 199, "Patriots"], "WR:Some Undrafted": ["Utah State"]}}
"""
import csv
import gzip
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
ESPN = CACHE / "espn_college_teams.json"
OUT = ROOT / "public" / "data" / "nfl" / "draft.json"

# nflverse draft_picks team codes (old and new franchises) -> the site's club name
CLUB = {"NWE": "Patriots", "GNB": "Packers", "CIN": "Bengals", "DAL": "Cowboys", "PIT": "Steelers", "BUF": "Bills",
        "MIA": "Dolphins", "MIN": "Vikings", "SEA": "Seahawks", "CHI": "Bears", "PHI": "Eagles", "TAM": "Buccaneers",
        "NYJ": "Jets", "NYG": "Giants", "SFO": "49ers", "DEN": "Broncos", "DET": "Lions", "KAN": "Chiefs",
        "ATL": "Falcons", "WAS": "Commanders", "HOU": "Texans", "CLE": "Browns", "IND": "Colts", "NOR": "Saints",
        "SDG": "Chargers", "BAL": "Ravens", "STL": "Rams", "JAX": "Jaguars", "ARI": "Cardinals", "TEN": "Titans",
        "CAR": "Panthers", "OAK": "Raiders", "RAM": "Rams", "RAI": "Raiders", "LAR": "Rams", "LAC": "Chargers",
        "PHO": "Cardinals", "LVR": "Raiders",
        # players.csv spellings
        "NE": "Patriots", "GB": "Packers", "TB": "Buccaneers", "SF": "49ers", "KC": "Chiefs", "NO": "Saints",
        "SD": "Chargers", "LV": "Raiders", "LA": "Rams", "WSH": "Commanders", "HST": "Texans", "BLT": "Ravens",
        "CLV": "Browns", "ARZ": "Cardinals", "SL": "Rams"}
ALIAS = {"texaselpaso": "utep", "texassanantonio": "utsa", "miamifl": "miami", "miamioh": "miamioh", "miamifla": "miami",
         "mississippi": "olemiss", "louisianamonroe": "ulmonroe", "louisianalafayette": "louisiana",
         "southerncalifornia": "usc", "louisianastate": "lsu", "brighamyoung": "byu", "centralflorida": "ucf",
         "southernmethodist": "smu", "texaschristian": "tcu", "northcarolinastate": "ncstate", "pittsburgh": "pitt",
         "nevadalasvegas": "unlv", "alabamabirmingham": "uab", "southernmississippi": "southernmiss",
         "uclalosangeles": "ucla", "californialosangeles": "ucla", "mississippistate": "mississippistate",
         "florida": "florida", "bostoncollege": "bostoncollege", "northcarolinacharlotte": "charlotte",
         "centralmichigan": "centralmichigan", "appalachianstate": "appalachianstate",
         "sanjosestate": "sanjosestate", "ucdavis": "ucdavis", "washingtonstate": "washingtonstate",
         "texasamcommerce": "eastterxasamcommerce", "northernillinois": "northernillinois",
         "hawaii": "hawaii", "bowlinggreenstate": "bowlinggreen", "southflorida": "southflorida",
         "texasam": "texasam", "nebraskaomaha": "omaha", "arkansaspinebluff": "arkansaspinebluff",
         "appalachianstate": "appstate", "connecticut": "uconn", "albany": "ualbany", "gramblingstate": "grambling"}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\bst\.?(?=\s|$|\))", "state", s)
    s = re.sub(r"\bcol\.?(?=\s|$)", "college", s)
    s = s.replace("&", "and").replace("univ.", "").replace("university", "").replace("college of", "")
    return re.sub(r"[^a-z]", "", s)


def nname(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", " ", s)
    return re.sub(r"[^a-z]", "", s)


def fetch_espn():
    if ESPN.exists():
        return json.loads(ESPN.read_text())
    u = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000"
    with urllib.request.urlopen(u, timeout=40) as r:
        out = [x["team"] for x in json.load(r)["sports"][0]["leagues"][0]["teams"]]
    ESPN.write_text(json.dumps(out))
    return out


def main():
    espn = fetch_espn()
    index = {}
    for t in espn:
        for k in (t["location"], t["displayName"], t.get("shortDisplayName", ""), t["location"] + " " + t.get("nickname", "")):
            index.setdefault(norm(k), t)

    def school(name):
        n = norm(name)
        for k in (n, norm(re.sub(r"\(.*?\)", "", name)), ALIAS.get(n, ""), n.replace("state", "st"), re.sub(r"college$", "", n), re.sub(r"(state)?college$|university$", "", n)):
            if k and k in index:
                return index[k]
        return None

    players = json.loads((ROOT / "data/y80/players.json").read_text())
    dp_by_gsis, dp_by_name = {}, {}
    for r in csv.DictReader(gzip.open(CACHE / "draft_picks.csv.gz", "rt")):
        if r["gsis_id"]:
            dp_by_gsis[r["gsis_id"]] = r
        dp_by_name.setdefault((nname(r["pfr_player_name"]), r["category"] or r["position"]), []).append(r)
    pl_by_gsis = {r["gsis_id"]: r for r in csv.DictReader(gzip.open(CACHE / "players.csv.gz", "rt")) if r["gsis_id"]}

    colleges, out, also = {}, {}, {}
    for p in players:
        gsis = (p.get("nfl") or {}).get("gsis")
        dp = dp_by_gsis.get(gsis)
        pr = pl_by_gsis.get(gsis)
        if not dp and not gsis:  # a classic with no id: a unique name + position row only
            c = dp_by_name.get((nname(p["n"]), p["pos"]), [])
            dp = c[0] if len(c) == 1 else None
        full = ((pr or {}).get("college_name") or (dp or {}).get("college") or "").strip()
        # a transfer is listed as "Final school; earlier school; ..." (Burrow: "LSU; Ohio State"): the first is where he finished
        parts = [x.strip() for x in full.split(";") if x.strip()]
        college = parts[0] if parts else ""
        if len(parts) > 1:
            also[f'{p["pos"]}:{p["n"]}'] = parts[1:]
        rec = None
        if dp and dp["season"] and dp["round"] and dp["pick"]:
            rec = [int(dp["season"]), int(dp["round"]), int(dp["pick"]), CLUB.get(dp["team"])]
        elif pr and pr["draft_year"] and pr["draft_round"] and pr["draft_pick"]:
            rec = [int(float(pr["draft_year"])), int(float(pr["draft_round"])), int(float(pr["draft_pick"])), CLUB.get(pr["draft_team"])]
        if not college and not rec:
            continue
        key = f'{p["pos"]}:{p["n"]}'
        out[key] = ([college or None] + rec) if rec else [college]
        if college and college not in colleges:
            t = school(college)
            colleges[college] = ({"id": int(t["id"]), "s": t.get("shortDisplayName") or t["location"], "c": t.get("color"), "a": t.get("alternateColor")}
                                 if t else {"s": college})
    OUT.write_text(json.dumps({"colleges": dict(sorted(colleges.items())), "p": dict(sorted(out.items())), "x": dict(sorted(also.items()))}, separators=(",", ":"), ensure_ascii=False))
    drafted = sum(1 for v in out.values() if len(v) > 1)
    known = sum(1 for c in colleges.values() if "id" in c)
    print(f"draft: {len(out)} players ({drafted} drafted, {len(out) - drafted} undrafted with a college); "
          f"{known}/{len(colleges)} colleges have an ESPN logo -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    miss = sorted(c for c, v in colleges.items() if "id" not in v)
    print("unmatched colleges (plain-name plate):", len(miss), miss[:30])


if __name__ == "__main__":
    main()
