#!/usr/bin/env python3
"""NFL edition: write the data/y80 inputs the shared builders read, from the real NFL data.

    python3 scripts/nfl/prepare.py

The fictional league's owner-entered inputs are replaced by stubs or real equivalents (the AI-authored lanes, the
coach, the save and the screenshot ledger do not exist in the NFL edition). build_players.py has already written
players.json and stints.json. Deterministic.
"""
import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
Y80 = ROOT / "data" / "y80"
CACHE = ROOT / "data" / "nfl-cache"
FIRST_SEASON = 2018  # schedules for the Season page


def put(name, value):
    (Y80 / name).write_text(json.dumps(value, indent=1, ensure_ascii=False) + "\n")


def games():
    rows = []
    with gzip.open(CACHE / "games.csv.gz", "rt") as f:
        for r in csv.DictReader(f):
            rows.append(r)
    return rows


STALE = ["league/stories", "league/tributes", "league/rewind", "league/takes.json", "league/save_state.json",
         "league/live_season.json", "widget.json", "widget-sprites", "transit"]


def clear_fictional_outputs():
    """Generated files of the fictional league that no NFL page reads."""
    import shutil
    for rel in STALE:
        p = ROOT / "public" / "data" / rel
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink(missing_ok=True)


def main():
    clear_fictional_outputs()
    teams = json.loads((Y80 / "teams.json").read_text())
    for k in ("CUR", "UNK"):
        teams.pop(k, None)
    put("teams.json", teams)
    abbr_alias = {"LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS", "JAC": "JAX"}
    by_abbr = {t["abbr"]: n for n, t in teams.items()}
    awards = json.loads((ROOT / "data" / "nfl" / "awards.json").read_text())
    allgames = games()
    season_now = max(int(r["season"]) for r in allgames if r["home_score"] != "")

    # ---- the facts the shared builders read (all empty: everyone is Active on his real club) ----
    put("spreadsheet_parsed.json", [])
    # players on no 2026 roster who debuted 1999 or later are Retired (build_players.py flags them); everyone else Active
    retired = {p["n"]: {"status": "Retired"} for p in json.loads((Y80 / "players.json").read_text())
               if (p.get("nfl") or {}).get("retired")}
    put("owner_facts.json", {"_about": "NFL edition: only the Retired status of past players.", "players": retired, "current_club": "",
                             "active_rosters": {}, "season_rosters": {}})
    put("records.json", {"note": "NFL edition: no club record board; league records are derived from the careers.",
                         "records": []})
    put("journal.json", {"notes": []})
    put("speeches.json", {"speeches": {}})
    put("stories.json", {"seasons": {}})
    put("hot_takes.json", {"seasons": {}})
    put("tributes.json", {"players": {}})
    put("sprites.json", {"players": {}})
    put("save_state.json", {})
    put("save_careers.json", {})
    put("mutations_log.json", {"applied": []})
    put("screenshot_extras.json", {"player_cards": {}, "name_changes": {}, "family": {}, "real_nfl_splits": {}})
    put("schedules_note.json", {})
    (Y80 / "schedules_note.json").unlink()
    (Y80 / "market_history.json").unlink(missing_ok=True)  # one snapshot: now

    # ---- Super Bowls: the real winners by season (the year is the season) ----
    sbs = []
    for c in awards["champions"]:
        if c["season"] < 1999:
            continue
        sbs.append({"number": 33 + (c["season"] - 1999), "roman": c["superbowl"], "year": str(c["season"]),
                    "winner": c["winner"], "score": c["score"], "loser": c["loser"], "your_result": "not in it",
                    "your_team": None})
    put("super_bowls.json", sbs)

    # ---- the coach does not exist: just the current season so "the latest season" resolves ----
    put("coach.json", {"name": "", "seasons": [{"year": season_now, "season": season_now, "team": "", "abbr": ""}],
                       "superBowlRecord": [], "currentStint": None, "record": {}, "bests": {}})

    # ---- weekly scores for the Season page (schedule.set shape), regular season, played games only ----
    seasons = {}
    for yr in range(FIRST_SEASON, season_now + 1):
        weeks = defaultdict(list)
        tally = defaultdict(lambda: {"w": 0, "l": 0, "t": 0, "pf": 0, "pa": 0})
        for r in allgames:
            if int(r["season"]) != yr or r["game_type"] != "REG" or r["home_score"] == "":
                continue
            a, h = (abbr_alias.get(r[k], r[k]) for k in ("away_team", "home_team"))
            sa, sh = int(float(r["away_score"])), int(float(r["home_score"]))
            weeks[int(r["week"])].append({"away": a, "away_score": sa, "home": h, "home_score": sh})
            for me, us, op in ((a, sa, sh), (h, sh, sa)):
                t = tally[me]
                t["w" if us > op else "l" if us < op else "t"] += 1
                t["pf"] += us
                t["pa"] += op
        if not weeks:
            continue
        standings = defaultdict(list)
        for abbr, t in tally.items():
            club = by_abbr.get(abbr)
            if club:
                tm = teams[club]
                standings[f"{tm['conference']} {tm['division']}"].append({"team": club, **{k: t[k] for k in "wlt"}})
        for rows in standings.values():
            rows.sort(key=lambda x: (-(x["w"] + x["t"] / 2) / max(1, x["w"] + x["l"] + x["t"]),
                                     -(tally[teams[x["team"]]["abbr"]]["pf"] - tally[teams[x["team"]]["abbr"]]["pa"]),
                                     x["team"]))
        seasons[str(yr)] = {"team": "", "abbr": "", "complete": yr < season_now,
                            "weeks": [{"week": w, "games": sorted(gs, key=lambda g: (g["home"], g["away"]))}
                                      for w, gs in sorted(weeks.items())],
                            "standings": dict(sorted(standings.items())),
                            "coachOpponents": [], "coachPlayoffs": [], "opponentTotals": {}}
    # ---- the games still to play this season (kickoff day and time, Eastern), for the Season page ----
    up = [{"week": int(r["week"]), "day": r["weekday"][:3], "date": r["gameday"], "time": r["gametime"],
           "away": abbr_alias.get(r["away_team"], r["away_team"]), "home": abbr_alias.get(r["home_team"], r["home_team"])}
          for r in allgames if int(r["season"]) == season_now and r["game_type"] == "REG" and r["home_score"] == ""]
    up.sort(key=lambda g: (g["week"], g["date"], g["time"], g["home"]))
    (ROOT / "public" / "data" / "league" / "upcoming.json").write_text(json.dumps(
        {"season": season_now, "games": up}, separators=(",", ":")) + "\n")
    put("schedules.json", {"_about": "NFL edition: every league game by week from nflverse games.csv.", "seasons": seasons})
    print(f"prepare: season {season_now}, {len(sbs)} Super Bowls, schedules {sorted(seasons)}")


if __name__ == "__main__":
    main()
