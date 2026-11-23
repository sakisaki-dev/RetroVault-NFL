#!/usr/bin/env python3
"""NFL edition: public/data/league/season_leaders.json, the live season's boards for the screensaver.

    python3 scripts/nfl/season_leaders.py

From each player's game log (data/nfl/games/) and players.json: this season's stat leaders, PPR fantasy leaders, the
latest week's best performances, the rookies of the season and a PROJECTED award race. The awards are a plain rule over
the season so far, not a prediction model and not a vote:
  MVP   a QB's score = passing yds + 20 x passing TD - 45 x INT + rushing yds + 6 x rushing TD, per game, 8+ games
  OPOY  a non-QB's PPR fantasy points per game (his scrimmage production), 8+ games
  DPOY  sacks x 4 + interceptions x 6 + forced fumbles x 3 + tackles x 0.5 + passes defended x 1, per game, 8+ games
  OROY / DROY  the same two rules, for rookies of the season (4+ games)
Deterministic.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NFL = ROOT / "data" / "nfl"
OUT = ROOT / "public" / "data" / "league" / "season_leaders.json"
SEASON = 2026


def main():
    players = {f"{p['pos']}:{p['n']}": p for p in json.loads((ROOT / "data" / "y80" / "players.json").read_text())}
    rows = []  # one per player with 2026 regular-season games
    for f in sorted((NFL / "games").glob("*.json")):
        d = json.loads(f.read_text())
        key = d["key"]
        p = players.get(key)
        if not p:
            continue
        cols = d["cols"]
        gs = [dict(zip(cols, g)) for g in d["games"] if g[0] == SEASON and g[2] == "REG"]
        if not gs:
            continue
        s = lambda c: sum(x.get(c, 0) or 0 for x in gs)
        rookie = str((p.get("nfl") or {}).get("rookie")) == str(SEASON)
        rows.append({
            "key": key, "pos": p["pos"], "g": len(gs), "rookie": rookie,
            "pass": int(s("passing_yards")), "ptd": int(s("passing_tds")), "int": int(s("passing_interceptions")),
            "rush": int(s("rushing_yards")), "rtd": int(s("rushing_tds")),
            "rec": int(s("receptions")), "recyds": int(s("receiving_yards")), "rectd": int(s("receiving_tds")),
            "tkl": int(s("def_tackles_solo") + s("def_tackle_assists")), "sck": round(s("def_sacks"), 1),
            "dint": int(s("def_interceptions")), "ff": int(s("def_fumbles_forced")), "pd": int(s("def_pass_defended")),
            "ppr": round(s("fantasy_points_ppr"), 1),
            "weeks": {x["week"]: x for x in gs},
        })

    def top(rs, fn, n=5, min_g=1):
        out = [r for r in rs if r["g"] >= min_g and fn(r) > 0]
        out.sort(key=lambda r: (-fn(r), r["key"]))
        return out[:n]

    leaders = {
        "passing": [(r["key"], r["pass"], f"{r['ptd']} TD, {r['int']} INT") for r in top(rows, lambda r: r["pass"] if r["pos"] == "QB" else 0)],
        "rushing": [(r["key"], r["rush"], f"{r['rtd']} TD") for r in top(rows, lambda r: r["rush"] if r["pos"] in ("RB", "QB") else 0)],
        "receiving": [(r["key"], r["recyds"], f"{r['rec']} rec, {r['rectd']} TD") for r in top(rows, lambda r: r["recyds"] if r["pos"] in ("WR", "TE", "RB") else 0)],
        "sacks": [(r["key"], r["sck"], f"{r['g']} games") for r in top(rows, lambda r: r["sck"])],
        "interceptions": [(r["key"], r["dint"], f"{r['pd']} passes defended") for r in top(rows, lambda r: r["dint"])],
    }
    fantasy = [(r["key"], r["ppr"], f"{round(r['ppr'] / r['g'], 1)} a game") for r in top(rows, lambda r: r["ppr"], 8)]

    mvp = lambda r: (r["pass"] + 20 * r["ptd"] - 45 * r["int"] + r["rush"] + 6 * r["rtd"]) / r["g"] if r["pos"] == "QB" else 0
    opoy = lambda r: r["ppr"] / r["g"] if r["pos"] != "QB" and r["pos"] != "OL" and r["pos"] in ("RB", "WR", "TE") else 0
    dpoy = lambda r: (4 * r["sck"] + 6 * r["dint"] + 3 * r["ff"] + 0.5 * r["tkl"] + r["pd"]) / r["g"] if r["pos"] in ("LB", "DB", "DL") else 0
    off_rook = lambda r: r["ppr"] / r["g"] if r["pos"] in ("QB", "RB", "WR", "TE") else 0
    awards = {
        "MVP": [(r["key"], round(mvp(r), 1), f"{r['pass']} pass yds, {r['ptd']} TD, {r['int']} INT") for r in top(rows, mvp, 3, 8)],
        "OPOY": [(r["key"], round(opoy(r), 1), f"{r['ppr']} PPR points in {r['g']} games") for r in top(rows, opoy, 3, 8)],
        "DPOY": [(r["key"], round(dpoy(r), 1), f"{r['sck']} sacks, {r['dint']} INT, {r['tkl']} tackles") for r in top(rows, dpoy, 3, 8)],
        "OROY": [(r["key"], round(off_rook(r), 1), f"{r['ppr']} PPR points in {r['g']} games") for r in top([x for x in rows if x["rookie"]], off_rook, 3, 4)],
        "DROY": [(r["key"], round(dpoy(r), 1), f"{r['sck']} sacks, {r['dint']} INT, {r['tkl']} tackles") for r in top([x for x in rows if x["rookie"]], dpoy, 3, 4)],
    }
    rookies = {
        "offense": [(r["key"], r["ppr"], f"{r['ppr']} PPR points, {r['g']} games") for r in top([x for x in rows if x["rookie"]], lambda r: r["ppr"] if r["pos"] in ("QB", "RB", "WR", "TE") else 0, 5)],
        "defense": [(r["key"], round(dpoy(r) * r["g"], 1), f"{r['sck']} sacks, {r['dint']} INT, {r['tkl']} tackles") for r in top([x for x in rows if x["rookie"]], lambda r: dpoy(r) * r["g"], 5)],
    }

    # the latest week with most of its games in: the best offensive and defensive lines of it
    by_week = {}
    for r in rows:
        for w in r["weeks"]:
            by_week[w] = by_week.get(w, 0) + 1
    week = max((w for w, n in by_week.items() if n >= 200), default=max(by_week))
    wk = [(r, r["weeks"][week]) for r in rows if week in r["weeks"]]

    def line_off(x):
        out = []
        if x["attempts"]:
            out.append(f"{int(x['completions'])}/{int(x['attempts'])}, {int(x['passing_yards'])} yds, {int(x['passing_tds'])} TD, {int(x['passing_interceptions'])} INT")
        if x["carries"]:
            out.append(f"{int(x['carries'])} car, {int(x['rushing_yards'])} yds, {int(x['rushing_tds'])} TD")
        if x["receptions"]:
            out.append(f"{int(x['receptions'])} rec, {int(x['receiving_yards'])} yds, {int(x['receiving_tds'])} TD")
        return "; ".join(out)

    def line_def(x):
        return f"{x['def_sacks']:g} sacks, {int(x['def_interceptions'])} INT, {int(x['def_tackles_solo'] + x['def_tackle_assists'])} tackles"

    best_off = sorted((t for t in wk if t[0]["pos"] in ("QB", "RB", "WR", "TE")), key=lambda t: (-t[1]["fantasy_points_ppr"], t[0]["key"]))[:3]
    best_def = sorted((t for t in wk if t[0]["pos"] in ("LB", "DB", "DL")),
                      key=lambda t: (-(4 * t[1]["def_sacks"] + 6 * t[1]["def_interceptions"] + 3 * t[1]["def_fumbles_forced"] + 0.5 * (t[1]["def_tackles_solo"] + t[1]["def_tackle_assists"])), t[0]["key"]))[:2]
    potw = {"week": week,
            "offense": [(r["key"], x["team"], x["opp"], round(x["fantasy_points_ppr"], 1), line_off(x)) for r, x in best_off],
            "defense": [(r["key"], x["team"], x["opp"], 0, line_def(x)) for r, x in best_def]}

    out = {"season": SEASON, "through": week, "leaders": leaders, "fantasy": fantasy, "awards": awards, "rookies": rookies, "potw": potw,
           "awardsAbout": "Projected from this season's games by a simple rule (see scripts/nfl/season_leaders.py); not a vote."}
    OUT.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"season_leaders: {len(rows)} players with {SEASON} games, through week {week}; MVP {awards['MVP'][:1]}, DPOY {awards['DPOY'][:1]}")


if __name__ == "__main__":
    main()
