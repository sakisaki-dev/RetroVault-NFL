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
import os
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
NFL = ROOT / "data" / "nfl"
Y80 = ROOT / "data" / "y80"
FIRST, LAST = 1999, 2026
LEGEND_MIN_GAMES = 16  # beyond the save: every player who debuted 1999 or later with this many career games, or any award
SNAPS_FROM = 2013       # offensive linemen have no weekly stat lines: their games come from snap counts, which start here
# Hall of Famers who debuted before 1999 (data only from 1999 on, so their lines are partial, nfl.partial = true): off until
# the owner decides. Set RV_INCLUDE_PRE1999_HOF=1 (needs data/nfl/hof.json)
INCLUDE_PRE1999_HOF = os.environ.get("RV_INCLUDE_PRE1999_HOF") == "1"
# nflverse position -> Retro Vault position group (the save's, as scripts/nfl/match.py)
RV_POS = {"QB": "QB", "RB": "RB", "FB": "RB", "HB": "RB", "WR": "WR", "TE": "TE", "OL": "OL", "T": "OL", "G": "OL", "C": "OL",
          "OT": "OL", "OG": "OL", "DL": "DL", "DE": "DL", "DT": "DL", "NT": "DL", "LB": "LB", "ILB": "LB", "OLB": "LB",
          "MLB": "LB", "DB": "DB", "CB": "DB", "S": "DB", "SS": "DB", "FS": "DB"}

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


def legend_rows(roster, awards):
    """Every player who debuted 1999 or later (complete careers in the data) with LEGEND_MIN_GAMES regular-season games
    or any Wikipedia award, beyond the save's players: roster rows in match.py's shape (uid "l<gsis digits>").
    Offensive linemen have no weekly stat lines, so only those who debuted when snap counts exist (2013) qualify."""
    have = {p.get("gsis") for p in roster}
    nv = {r["gsis_id"]: r for r in rows("players.csv.gz") if r["gsis_id"]}
    gsis_of = {r["pfr_id"]: g for g, r in nv.items() if r["pfr_id"]}
    games = defaultdict(set)                       # gsis -> {(season, game_id)} regular season
    first = {}                                     # gsis -> first season with any game
    seasons_team = defaultdict(lambda: defaultdict(set))   # gsis -> season -> {club abbr}
    last_game = {}                                 # gsis -> (season, week, team)
    for y in range(FIRST, LAST + 1):
        p = CACHE / f"stats_player_week_{y}.csv.gz"
        if not p.exists():
            continue
        with gzip.open(p, "rt", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                pid = r["player_id"]
                first.setdefault(pid, y)
                seasons_team[pid][y].add(r["team"])
                if r["season_type"] == "REG":
                    games[pid].add((y, r["game_id"]))
                    w = int(r["week"] or 0)
                    if (y, w) >= last_game.get(pid, (0, 0, ""))[:2]:
                        last_game[pid] = (y, w, r["team"])
        sp = CACHE / f"snap_counts_{y}.csv.gz"
        if sp.exists():
            with gzip.open(sp, "rt", encoding="utf-8") as fh:
                for r in csv.DictReader(fh):
                    pid = gsis_of.get(r["pfr_player_id"])
                    if not pid or n(r, "offense_snaps") + n(r, "defense_snaps") + n(r, "st_snaps") <= 0:
                        continue
                    first.setdefault(pid, y)
                    seasons_team[pid][y].add(r["team"])
                    if r["game_type"] == "REG":
                        games[pid].add((y, r["game_id"]))
                        w = int(r["week"] or 0)
                        if (y, w) >= last_game.get(pid, (0, 0, ""))[:2]:
                            last_game[pid] = (y, w, r["team"])
    hof_names = set()
    hp = NFL / "hof.json"
    if INCLUDE_PRE1999_HOF and hp.exists():
        hof_names = {norm(e["name"]) for e in json.loads(hp.read_text())}
    award_by = defaultdict(list)
    for k, lst in awards["awards"].items():
        for a in lst:
            if a["season"] >= FIRST:
                award_by[norm(a["player"])].append((a["season"], a["team"]))

    def num(v):
        try:
            return int(v)
        except (TypeError, ValueError):
            return None

    out = []
    for pid, r in nv.items():
        if pid in have or pid not in first:
            continue
        pos = RV_POS.get(r["position"])
        if not pos:
            continue
        fy, rk, dy = first[pid], num(r["rookie_season"]), num(r["draft_year"])
        early = bool(rk and 1988 <= rk <= 1998 or dy and 1988 <= dy <= 1998 or fy <= 2000 and not ((rk or 0) >= 1999 or (dy or 0) >= 1999))
        partial = False
        if early:
            # debuted before 1999: a partial (1999-on) career. Only with INCLUDE_PRE1999_HOF, and only real Hall of Famers.
            if not (INCLUDE_PRE1999_HOF and norm(r["display_name"]) in hof_names and (rk or 0) < 1999):
                continue
            partial = True
        debut = rk if rk and rk >= 1999 else fy
        if pos == "OL" and (debut < SNAPS_FROM or partial):
            continue
        g = len(games.get(pid, ()))
        awarded = any(a[0] in seasons_team[pid] and any(ABBR.get(t, t) == a[1] for t in seasons_team[pid][a[0]])
                      for a in award_by.get(norm(r["display_name"]), []))
        if g < LEGEND_MIN_GAMES and not awarded:
            continue
        lg = last_game.get(pid)
        club = ABBR.get(lg[2], lg[2]) if lg else "FA"
        dob = r["birth_date"]
        spos = {"CB": "CB", "S": "S", "SS": "S", "FS": "S"}.get(r["position"], pos)
        out.append({"uid": "l" + re.sub(r"\D", "", pid), "name": r["display_name"], "pos": pos, "spos": spos, "club": club,
                    "number": r["jersey_number"] or None, "age": None, "dob": dob, "rookie": str(debut),
                    "height": inches(r["height"]), "weight": num(r["weight"]), "salary": None, "contract": None,
                    "sprites": 0, "match": "legend", "gsis": pid, "pfr": r["pfr_id"], "espn": r["espn_id"],
                    "nv_name": r["display_name"], "nv_pos": r["position"], "nv_height": inches(r["height"]),
                    "nv_weight": num(r["weight"]), "draft": [r["draft_year"], r["draft_round"], r["draft_pick"], r["draft_team"]],
                    "legend": True, "partial": partial, "games": g, "lastSeason": lg[0] if lg else None})
    out.sort(key=lambda p: (-p["games"], p["gsis"]))
    return out


def inches(h):
    m = re.match(r"(\d+)'\s*(\d+)", str(h or ""))
    if m:
        return int(m.group(1)) * 12 + int(m.group(2))
    try:
        return int(float(h))
    except (TypeError, ValueError):
        return None


def apply_nicknames(players):
    """players.json `nick` for everyone with a well-attested nickname (data/nfl/nicknames.json from Wikipedia's list of
    football nicknames, scripts/nfl/fetch_wiki.py): the name matches, and the position agrees when the entry gives one;
    a name two players share goes to the one the entry's position fits, else the one with the most games."""
    path = NFL / "nicknames.json"
    if not path.exists():
        return
    words = {"quarterback": "QB", "running back": "RB", "halfback": "RB", "fullback": "RB", "wide receiver": "WR", "receiver": "WR",
             "tight end": "TE", "linebacker": "LB", "defensive end": "DL", "defensive tackle": "DL", "defensive lineman": "DL",
             "cornerback": "DB", "safety": "DB", "defensive back": "DB", "tackle": "OL", "guard": "OL", "center": "OL",
             "offensive lineman": "OL", "lineman": "OL"}
    by = defaultdict(list)
    for p in players:
        by[norm(p["n"].split(" (")[0])].append(p)
    given = 0
    for e in json.loads(path.read_text()):
        cands = by.get(norm(e["name"]), [])
        tail = e.get("tail", "").lower()
        want = {v for w, v in words.items() if w in tail}
        fit = [p for p in cands if p["pos"] in want] if want else []
        pick = fit or ([] if want else cands)
        if not pick:
            continue
        top = max(pick, key=lambda p: p["g"])
        if top["g"] > 0 and not top.get("nick"):
            top["nick"] = e["nick"]
            given += 1
    lead = NFL / "nicknames_infobox.json"   # the first paragraph of his own Wikipedia page (scripts/nfl/fetch_nicknames.py)
    own = json.loads(lead.read_text()) if lead.exists() else {}
    for p in players:
        nick = own.get((p.get("nfl") or {}).get("gsis"))
        if nick and not p.get("nick"):
            p["nick"] = nick
            given += 1
    print(f"nicknames: {given} players")


def main():
    roster = json.loads((NFL / "roster.json").read_text())["players"]
    awards = json.loads((NFL / "awards.json").read_text())
    legends = legend_rows(roster, awards)
    print(f"{len(legends)} retired and past players beyond the save (debut {FIRST}+, {LEGEND_MIN_GAMES}+ games or an award)")
    save_n = len(roster)
    allp = roster + legends
    want = {p["gsis"]: p for p in allp if p.get("gsis")}
    by_pfr = {p["pfr"]: p for p in allp if p.get("pfr")}

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
    starts_y = defaultdict(lambda: defaultdict(int))  # OL starts by season
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
                starts_y[pid][y] += 1

    for ps in base.values():
        if len(ps) > 1:
            top = max(ps, key=lambda q: len(logs.get(q.get("gsis"), [])))
            if logs.get(top.get("gsis")):
                top["display"] = top["name"]
                top["key"] = f"{top['pos']}:{top['name']}"
    # past players: the plain name unless a save player (or a better-known namesake) has it; stable keys for the save's
    taken = {norm(p["name"]) for p in roster}
    used = {p["display"] for p in roster}
    for p in legends:  # most career games first
        if norm(p["name"]) not in taken and p["name"] not in used:
            p["display"] = p["name"]
            taken.add(norm(p["name"]))
        else:
            tag = f"{p['pos']}, {p['club']}"
            p["display"] = f"{p['name']} ({tag})"
            if p["display"] in used:
                p["display"] = f"{p['name']} ({tag} {p['uid'][-3:]})"
        used.add(p["display"])
        p["key"] = f"{p['pos']}:{p['display']}"
    # his club now: the latest week of the current season's roster that lists him on a club (cut players drop off)
    now = {}
    for r in rows(f"roster_{LAST}.csv"):
        if r["gsis_id"] in want and r["status"] not in ("CUT", "RET", ""):
            w = int(r["week"] or 0)
            if w >= now.get(r["gsis_id"], (-1, ""))[0]:
                now[r["gsis_id"]] = (w, ABBR.get(r["team"], r["team"]), r["status"])
    latest_week = max((v[0] for v in now.values()), default=0)
    players, stints, careers, moved = [], {}, {}, []
    ends = {}  # key -> season -> the career line at that season's end (for the career graphs)
    (NFL / "games").mkdir(parents=True, exist_ok=True)
    award_rows = [(k, a) for k, lst in awards["awards"].items() for a in lst]
    award_by = defaultdict(list)   # normalised name -> [(kind, season, club)]
    for k, a in award_rows:
        award_by[norm(a["player"])].append((k, a["season"], a["team"]))
    for p in allp:
        pos = p["pos"]
        pid = p.get("gsis")
        L = sorted(logs.get(pid, []), key=lambda r: (int(r["season"]), r["season_type"] != "REG", int(r["week"])))
        reg = [r for r in L if r["season_type"] == "REG"]
        cur = now.get(pid)
        club = cur[1] if cur and cur[0] >= latest_week - 1 else "FA"  # off every roster the last two weeks: free agent
        retired = bool(p.get("legend")) and club == "FA"
        if retired:
            club = p["club"]  # a past player keeps his last club
        rec = {"n": p["display"], "pos": pos, "team": club, "g": len(reg)}
        if not p.get("legend") and club != p["club"]:
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
        mine_rows = [(k, ys, t) for k, ys, t in award_by.get(nm, []) if ys in by_season and t in by_season[ys]]
        for k, ys, t in mine_rows:
            mine[k] += 1
        rec.update({"mvp": mine["mvp"], "opoy": mine["opoy"], "dpoy": mine["dpoy"], "sbmvp": mine["sbmvp"],
                    "roty": mine["oroy"] + mine["droy"]})
        rec["nfl"] = {"gsis": pid, "uid": p["uid"], "number": p.get("number"), "age": p.get("age"), "dob": p.get("dob"),
                      "height": p.get("nv_height") or p.get("height"), "weight": p.get("nv_weight") or p.get("weight"),
                      "draft": p.get("draft"), "rookie": p.get("rookie"), "salary": p.get("salary"),
                      "contract": p.get("contract"), "playoffGames": len(L) - len(reg)}
        if p.get("legend"):
            if p.get("partial"):
                rec["nfl"]["partial"] = True  # debuted before 1999: only the 1999-on seasons are counted
            rec["nfl"]["past"] = True          # debuted 1999 or later, beyond the save (build_players.legend_rows)
            if retired:
                rec["nfl"]["retired"] = True   # on no 2026 roster: Retired (prepare.py writes the status fact)
        players.append(rec)
        # the career as it stood at the end of each season he had played (regular season, awards and rings to date)
        by_y = defaultdict(list)
        for r in reg:
            by_y[int(r["season"])].append(r)
        cum, line = defaultdict(float), {}
        for y in sorted(by_season):
            for r in by_y.get(y, []):
                for key, col in FIELDS[pos].items():
                    if key == "tkl":
                        cum[key] += n(r, "def_tackles_solo") + n(r, "def_tackle_assists")
                    else:
                        cum[key] += n(r, col)
            cum["g"] += len(by_y.get(y, []))
            if pos == "OL":
                cum["blk"] += starts_y[pid][y] if pid else 0
            won = {k: sum(1 for k2, ys, t in mine_rows if k2 == k and ys <= y)
                   for k in ("mvp", "opoy", "dpoy", "sbmvp", "oroy", "droy")}
            club_y = max(by_season[y].items(), key=lambda x: x[1])[0]
            line[y] = {"n": p["display"], "pos": pos, "team": club_y, "g": int(cum["g"]),
                       **{k: int(round(cum[k])) for k in FIELDS[pos]},
                       **({"lng": None} if pos in ("WR", "TE") else {}),
                       "rings": sum(1 for ry in rings if ry <= y), "mvp": won["mvp"], "opoy": won["opoy"],
                       "dpoy": won["dpoy"], "sbmvp": won["sbmvp"], "roty": won["oroy"] + won["droy"]}
        ends[p["key"]] = line

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

    apply_nicknames(players)
    Y80.mkdir(parents=True, exist_ok=True)
    (Y80 / "players.json").write_text(json.dumps(players, indent=1) + "\n")
    (Y80 / "stints.json").write_text(json.dumps(stints, indent=1) + "\n")
    (NFL / "season_ends.json").write_text(json.dumps(ends, separators=(",", ":")))
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
