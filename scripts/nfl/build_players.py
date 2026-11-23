#!/usr/bin/env python3
"""NFL edition demo: real careers for every matched save player, in Retro Vault's own data shapes.

    python3 scripts/nfl/build_players.py

Inputs: data/nfl/roster.json (scripts/nfl/match.py), data/nfl/awards.json (scripts/nfl/fetch_awards.py) and the nflverse
cache (scripts/nfl/fetch.py). Writes, in the formats the existing rebuild reads:
  data/y80/players.json   career lines (regular season) in Retro Vault keys, awards, rings, current club
  data/y80/stints.json    exact club stints from the games he played (no inference), rings per stint
  data/nfl/games/         per-player game logs (regular season and playoffs), for the game-by-game pages
  data/nfl/careers.json   per player per season lines (regular season, playoffs apart), for the career graphs

Rules (owner defaults, 2026-11-23): career totals are regular season (playoffs shown apart); his current club is the
real one (the latest week he appears on a roster or in a game this season; none = free agent); a ring = he played for
the Super Bowl winner in that Super Bowl, or was on its roster that season and played for it; awards from Wikipedia
by name, season and club; OL "blocks" = starts (50%+ of the offense's snaps, 2013 on, when snap counts exist).
"""
import csv
import gzip
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
NFL = ROOT / "data" / "nfl"
Y80 = ROOT / "data" / "y80"
FIRST, LAST = 1999, 2026

ABBR = {"BUF": "Bills", "MIA": "Dolphins", "NE": "Patriots", "NYJ": "Jets", "DEN": "Broncos", "KC": "Chiefs",
        "LAC": "Chargers", "SD": "Chargers", "LV": "Raiders", "OAK": "Raiders", "BAL": "Ravens", "CIN": "Bengals",
        "CLE": "Browns", "PIT": "Steelers", "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars", "JAC": "Jaguars",
        "TEN": "Titans", "DAL": "Cowboys", "NYG": "Giants", "PHI": "Eagles", "WAS": "Commanders", "ARI": "Cardinals",
        "LA": "Rams", "LAR": "Rams", "STL": "Rams", "SF": "49ers", "SEA": "Seahawks", "CHI": "Bears", "DET": "Lions",
        "GB": "Packers", "MIN": "Vikings", "ATL": "Falcons", "CAR": "Panthers", "NO": "Saints", "TB": "Buccaneers"}

# Retro Vault career keys per position, from nflverse weekly columns
def n(r, k):
    try:
        return float(r.get(k) or 0)
    except ValueError:
        return 0.0


FIELDS = {
    "QB": {"att": "attempts", "cmp": "completions", "yds": "passing_yards", "td": "passing_tds",
           "int": "passing_interceptions", "sck": "sacks_suffered", "ratt": "carries", "ryds": "rushing_yards",
           "rtd": "rushing_tds"},
    "RB": {"ratt": "carries", "ryds": "rushing_yards", "rtd": "rushing_tds", "fum": "fumbles_lost_total",
           "rec": "receptions", "recyds": "receiving_yards", "rectd": "receiving_tds"},
    "WR": {"rec": "receptions", "yds": "receiving_yards", "td": "receiving_tds", "fum": "fumbles_lost_total"},
    "TE": {"rec": "receptions", "yds": "receiving_yards", "td": "receiving_tds", "fum": "fumbles_lost_total"},
    "OL": {},
    "LB": {"tkl": None, "int": "def_interceptions", "sck": "def_sacks", "ff": "def_fumbles_forced"},
    "DB": {"tkl": None, "int": "def_interceptions", "sck": "def_sacks", "ff": "def_fumbles_forced"},
    "DL": {"tkl": None, "int": "def_interceptions", "sck": "def_sacks", "ff": "def_fumbles_forced"},
}
# the game log keeps every column a page shows (game-by-game, fantasy, advanced) and nothing else
LOG = ["completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions", "sacks_suffered",
       "passing_epa", "passing_cpoe", "carries", "rushing_yards", "rushing_tds", "rushing_epa", "receptions", "targets",
       "receiving_yards", "receiving_tds", "receiving_air_yards", "receiving_yards_after_catch", "receiving_epa",
       "target_share", "air_yards_share", "wopr", "fumbles_lost_total", "def_tackles_solo", "def_tackle_assists",
       "def_tackles_for_loss", "def_sacks", "def_qb_hits", "def_interceptions", "def_pass_defended",
       "def_fumbles_forced", "def_tds", "passing_2pt_conversions", "rushing_2pt_conversions",
       "receiving_2pt_conversions", "special_teams_tds", "fantasy_points", "fantasy_points_ppr"]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", " ", s.replace(".", " "))
    return re.sub(r"[^a-z]", "", s)


def rows(name):
    p = CACHE / name
    if not p.exists():
        return []
    op = gzip.open if name.endswith(".gz") else open
    with op(p, "rt", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def main():
    roster = json.loads((NFL / "roster.json").read_text())["players"]
    awards = json.loads((NFL / "awards.json").read_text())
    want = {p["gsis"]: p for p in roster if p.get("gsis")}
    by_pfr = {p["pfr"]: p for p in roster if p.get("pfr")}

    # names: Retro Vault keys stints, extras and banners by name, so a name two players share gets his club (and
    # position when that doesn't separate them): "Justin Jefferson (LB, Browns)"
    base = defaultdict(list)
    for p in roster:
        base[norm(p["name"])].append(p)
    for ps in base.values():
        for p in ps:
            if len(ps) == 1:
                p["display"] = p["name"]
            else:
                clash = sum(1 for q in ps if q["pos"] == p["pos"]) > 1
                tag = f"{p['pos']}, {p['club']}" if not clash else f"{p['pos']}, {p['club']} {p['uid'][-3:]}"
                # the best-known of the namesakes keeps the plain name (most career games)
                p["display"] = f"{p['name']} ({tag})"
            p["key"] = f"{p['pos']}:{p['display']}"

    games = {r["game_id"]: r for r in rows("games.csv.gz")}
    sb = {int(g["season"]): g for g in games.values() if g["game_type"] == "SB" and g["home_score"]}
    champ = {y: (g["home_team"] if int(g["home_score"]) > int(g["away_score"]) else g["away_team"]) for y, g in sb.items()}

    logs = defaultdict(list)          # gsis -> game rows
    played = defaultdict(set)         # gsis -> {(season, game_id)}
    team_games = defaultdict(lambda: defaultdict(int))  # gsis -> (season, club) -> games
    starts = defaultdict(int)         # OL starts
    for y in range(FIRST, LAST + 1):
        for r in rows(f"stats_player_week_{y}.csv.gz"):
            pid = r["player_id"]
            if pid not in want:
                continue
            logs[pid].append(r)
            played[pid].add((y, r["game_id"]))
        for r in rows(f"snap_counts_{y}.csv.gz"):
            p = by_pfr.get(r["pfr_player_id"])
            if not p or not p.get("gsis"):
                continue
            snaps = n(r, "offense_snaps") + n(r, "defense_snaps") + n(r, "st_snaps")
            if snaps <= 0:
                continue
            pid = p["gsis"]
            gid = r["game_id"]
            if (y, gid) not in played[pid]:
                played[pid].add((y, gid))
                # a game with snaps and no stat line (an OL, a quiet day): an empty log row keeps games and clubs true
                g = games.get(gid, {})
                logs[pid].append({"season": str(y), "week": r["week"], "season_type": "REG" if r["game_type"] == "REG" else "POST",
                                  "game_id": gid, "team": r["team"], "opponent_team": r["opponent"]})
            if r["game_type"] == "REG" and n(r, "offense_pct") >= 0.5:
                starts[pid] += 1

    for ps in base.values():
        if len(ps) > 1:
            top = max(ps, key=lambda q: len(logs.get(q.get("gsis"), [])))
            if logs.get(top.get("gsis")):
                top["display"] = top["name"]
                top["key"] = f"{top['pos']}:{top['name']}"
    # his club now: the latest week of the current season's roster that lists him on a club (cut players drop off)
    now = {}
    for r in rows(f"roster_{LAST}.csv"):
        if r["gsis_id"] in want and r["status"] not in ("CUT", "RET", ""):
            w = int(r["week"] or 0)
            if w >= now.get(r["gsis_id"], (-1, ""))[0]:
                now[r["gsis_id"]] = (w, ABBR.get(r["team"], r["team"]), r["status"])
    latest_week = max((v[0] for v in now.values()), default=0)
    players, stints, careers, moved = [], {}, {}, []
    (NFL / "games").mkdir(parents=True, exist_ok=True)
    award_rows = [(k, a) for k, lst in awards["awards"].items() for a in lst]
    for p in roster:
        pos = p["pos"]
        pid = p.get("gsis")
        L = sorted(logs.get(pid, []), key=lambda r: (int(r["season"]), r["season_type"] != "REG", int(r["week"])))
        reg = [r for r in L if r["season_type"] == "REG"]
        cur = now.get(pid)
        club = cur[1] if cur and cur[0] >= latest_week - 1 else "FA"  # off every roster the last two weeks: free agent
        rec = {"n": p["display"], "pos": pos, "team": club, "g": len(reg)}
        if club != p["club"]:
            moved.append((p["display"], p["club"], club))
        for key, col in FIELDS[pos].items():
            if key == "tkl":
                rec[key] = int(sum(n(r, "def_tackles_solo") + n(r, "def_tackle_assists") for r in reg))
            else:
                rec[key] = int(round(sum(n(r, col) for r in reg)))
        if pos in ("WR", "TE"):
            rec["lng"] = None  # not in the weekly data
        if pos == "OL":
            rec["blk"] = starts.get(pid, 0)
        # clubs by season (games played for each), rings, awards
        by_season = defaultdict(lambda: defaultdict(int))
        for r in L:
            by_season[int(r["season"])][ABBR.get(r["team"], r["team"])] += 1
        rings = []
        for y, w in champ.items():
            if any(r["game_id"] == sb[y]["game_id"] and r["team"] == w for r in L):
                rings.append(y)
        rec["rings"] = len(rings)
        mine = defaultdict(int)
        nm = norm(p["name"])
        for k, a in award_rows:
            if norm(a["player"]) == nm and a["season"] in by_season and a["team"] in by_season[a["season"]]:
                mine[k] += 1
        rec.update({"mvp": mine["mvp"], "opoy": mine["opoy"], "dpoy": mine["dpoy"], "sbmvp": mine["sbmvp"],
                    "roty": mine["oroy"] + mine["droy"]})
        rec["nfl"] = {"gsis": pid, "uid": p["uid"], "number": p.get("number"), "age": p.get("age"), "dob": p.get("dob"),
                      "height": p.get("nv_height") or p.get("height"), "weight": p.get("nv_weight") or p.get("weight"),
                      "draft": p.get("draft"), "rookie": p.get("rookie"), "salary": p.get("salary"),
                      "contract": p.get("contract"), "playoffGames": len(L) - len(reg)}
        players.append(rec)

        # stints: consecutive seasons with the same main club (most games that season); a mid-season trade adds the
        # second club that season too
        runs = []
        for y in sorted(by_season):
            for club, cnt in sorted(by_season[y].items(), key=lambda x: -x[1]):
                if runs and runs[-1]["team"] == club and runs[-1]["to"] in (y, y - 1):
                    runs[-1]["to"] = y
                else:
                    runs.append({"team": club, "from": y, "to": y})
        for s in runs:
            s["rings"] = [y for y in rings if s["from"] <= y <= s["to"] and ABBR.get(champ[y]) == s["team"]]
        stints[p["display"]] = {"stints": runs, "confidence": "confirmed",
                                "evidence": "Games played for each club, season by season (nflverse)."}
        careers[p["key"]] = {str(y): dict(c) for y, c in sorted(by_season.items())}
        if L:
            (NFL / "games" / (re.sub(r"[^a-z0-9]+", "-", p["key"].lower()).strip("-") + ".json")).write_text(json.dumps(
                {"key": p["key"], "games": [[int(r["season"]), int(r["week"]), r["season_type"], r["team"],
                                              r.get("opponent_team", ""), r["game_id"]] + [round(n(r, c), 3) for c in LOG]
                                             for r in L], "cols": ["season", "week", "type", "team", "opp", "game"] + LOG},
                separators=(",", ":")))

    Y80.mkdir(parents=True, exist_ok=True)
    (Y80 / "players.json").write_text(json.dumps(players, indent=1) + "\n")
    (Y80 / "stints.json").write_text(json.dumps(stints, indent=1) + "\n")
    (NFL / "careers.json").write_text(json.dumps(careers, separators=(",", ":")) + "\n")
    print(f"current clubs from the {LAST} week {latest_week} roster: {len(moved)} differ from the save "
          f"({sum(1 for m in moved if m[2] == 'FA')} now free agents, {sum(1 for m in moved if m[1] == 'FA')} signed since)")
    with_games = sum(1 for p in players if p["g"])
    print(f"{len(players)} players ({with_games} with NFL regular-season games), "
          f"{sum(p['rings'] for p in players)} rings, {sum(p['mvp'] for p in players)} MVPs on current players")
    for nm in ("Lamar Jackson", "Josh Allen", "Patrick Mahomes", "Justin Jefferson", "T.J. Watt", "Trent Williams"):
        p = next((x for x in players if x["n"] == nm), None)
        if p:
            print(" ", {k: v for k, v in p.items() if k != "nfl"}, stints[nm]["stints"][:4])


if __name__ == "__main__":
    main()
