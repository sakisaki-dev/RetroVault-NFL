#!/usr/bin/env python3
"""Records ESPN's public scoreboard and game summary for one finished game and trims them to the fields the NFL
widget (public/widgets/rv-nfl-widget.js) reads, so the harness (scripts/nfl/widget_harness.mjs) runs against real
shapes.

    python3 scripts/nfl/widget_fixtures/fetch_fixtures.py 20261122 401873077     # a game day (YYYYMMDD), a game's event id

Writes scoreboard.json (every game that day), summary.json (the one game) and scoreboard_upcoming.json (ESPN's current
week) next to this file. The harness turns the
finished game into a live one (status, situation, the win probability so far) for the live views; every other number
is ESPN's own. Public endpoints, no key.
"""
import json
import sys
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/"


def get(url):
    # curl: the system Python here has no CA bundle
    return json.loads(subprocess.run(["curl", "-s", "-m", "30", url], capture_output=True, text=True, check=True).stdout)


def team(t):
    return {k: t.get(k) for k in ("id", "abbreviation", "displayName", "shortDisplayName", "color", "alternateColor")}


def athlete(a):
    pos = (a.get("position") or {}).get("abbreviation")
    return {"id": a.get("id"), "shortName": a.get("shortName"), "displayName": a.get("displayName"), "jersey": a.get("jersey"),
            "position": {"abbreviation": pos}}


def leaders(ls):
    out = []
    for c in ls or []:
        out.append({"name": c.get("name"), "displayName": c.get("displayName"),
                    "leaders": [{"displayValue": x.get("displayValue"), "value": x.get("value"), "athlete": athlete(x.get("athlete") or {}),
                                 "team": {"id": (x.get("team") or {}).get("id")}} for x in (c.get("leaders") or [])[:1]]})
    return out


def trim_scoreboard(d):
    events = []
    for e in d["events"]:
        c = e["competitions"][0]
        events.append({
            "id": e["id"], "date": e["date"], "name": e["name"], "shortName": e["shortName"], "week": e.get("week"), "status": e["status"],
            "competitions": [{
                "id": c["id"], "date": c["date"], "neutralSite": c.get("neutralSite"), "status": c["status"],
                "venue": {"fullName": (c.get("venue") or {}).get("fullName"), "indoor": (c.get("venue") or {}).get("indoor")},
                "competitors": [{"id": x["id"], "homeAway": x["homeAway"], "score": x.get("score"), "winner": x.get("winner"),
                                 "linescores": [{"value": l.get("value")} for l in x.get("linescores", [])],
                                 "records": [r for r in x.get("records", []) if r.get("type") == "total"], "team": team(x["team"])}
                                for x in c["competitors"]],
                "leaders": leaders(c.get("leaders")), "broadcasts": c.get("broadcasts"),
                "headlines": [{"shortLinkText": h.get("shortLinkText")} for h in c.get("headlines", [])],
                **({"situation": c["situation"]} if c.get("situation") else {}), **({"odds": [{"details": o.get("details"), "spread": o.get("spread")} for o in c["odds"][:1]]} if c.get("odds") else {}),
            }],
        })
    return {"week": d.get("week"), "events": events}


def trim_summary(s):
    comp = s["header"]["competitions"][0]
    return {
        "boxscore": {"teams": [{"team": team(t["team"]), "statistics": [{k: x.get(k) for k in ("name", "displayValue", "label")} for x in t.get("statistics", [])]}
                               for t in s["boxscore"]["teams"]]},
        "winprobability": [{"homeWinPercentage": w["homeWinPercentage"], "playId": w.get("playId")} for w in s.get("winprobability", [])],
        "drives": {"previous": [{"id": p["id"], "description": p.get("description"), "result": p.get("result"), "team": {"abbreviation": p["team"]["abbreviation"]},
                                 "plays": len(p.get("plays", []))} for p in s.get("drives", {}).get("previous", [])]},
        "leaders": [{"team": {"id": l["team"]["id"], "abbreviation": l["team"]["abbreviation"]}, "leaders": leaders(l.get("leaders"))} for l in s.get("leaders", [])],
        "header": {"competitions": [{"competitors": [{"id": c["id"], "homeAway": c["homeAway"], "score": c.get("score"),
                                                     "linescores": [{"displayValue": l.get("displayValue")} for l in c.get("linescores", [])],
                                                     "team": team(c["team"])} for c in comp["competitors"]]}]},
        "scoringPlays": [{"text": p.get("text"), "period": (p.get("period") or {}).get("number"), "clock": (p.get("clock") or {}).get("displayValue"),
                          "awayScore": p.get("awayScore"), "homeScore": p.get("homeScore"), "team": {"abbreviation": (p.get("team") or {}).get("abbreviation")}}
                         for p in s.get("scoringPlays", [])],
        "gameInfo": {"venue": {"fullName": ((s.get("gameInfo") or {}).get("venue") or {}).get("fullName")}},
    }


if __name__ == "__main__":
    day, event = sys.argv[1], sys.argv[2]
    (HERE / "scoreboard.json").write_text(json.dumps(trim_scoreboard(get(f"{API}scoreboard?dates={day}")), separators=(",", ":")))
    (HERE / "summary.json").write_text(json.dumps(trim_summary(get(f"{API}summary?event={event}")), separators=(",", ":")))
    (HERE / "scoreboard_upcoming.json").write_text(json.dumps(trim_scoreboard(get(API + "scoreboard")), separators=(",", ":")))
    print("wrote scoreboard.json, summary.json, scoreboard_upcoming.json (the current week, not yet played) in", HERE)
