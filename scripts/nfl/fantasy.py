#!/usr/bin/env python3
"""NFL edition: fantasy metrics for QB / RB / WR / TE -> public/data/nfl/fantasy.json.

Source: nflverse stats_player_week_<latest>.csv.gz (REG), snap_counts_<latest>.csv.gz, games.csv.gz and players.csv.gz (gsis <-> pfr ids),
with the key mapping of data/y80/players.json (nfl.gsis). Everything is a sum, a ratio, a rank or a percentile of real weekly lines.
Nothing is imputed: a missing week is a missing week (bye or out), never a zero. Scoring is nflverse's fantasy_points_ppr (PPR); a kicker's week is scored 3 / 4 / 5 a field goal by distance, 1 an extra point, -1 a miss.

File: {season, week (last week with scores), n: {club: {bye, nx: [[week, opp, home, date] | [week, null]]}}, d: {defence: {pos: [allowed per game, rank, games]}},
       p: {"QB:Josh Allen": record}}.

Record (short keys):
  c club | g games | t PPR total | pg PPR per game | w [[week, ppr, opp, finish]] (his games, in week order; finish = his weekly rank at his position)
  rk [pos rank of total, of, overall rank of total, of, pos rank of per game, of]   (per-game rank among players with >= half his club's games)
  l3 last-3-games average | p3 the 3 games before | l3r [rank, of] of the last-3 average at his position (players with 3+ games, one in the last 3 weeks)
  sd weekly standard deviation | cv sd / mean | fl, md, ce 25th / 50th / 75th percentile of weekly PPR
  sw / bm / bu games start-worthy / boom / bust (finish thresholds below)
  op {ts target share, ay air yards share, cs carry share, og opportunities per game, sn offence snap %, po PPR per opportunity}: [value, rank, of]

Trade simulator inputs (src/utils/tradeSim.ts): wr receptions per game (aligned with w; re-scores half / standard / TE premium), tp touchdown points
  (4 per passing TD, 6 per rushing or receiving TD) and ot opportunities over his games; n[club].rm every remaining game as [week, opponent, home 1/0] or [week, null]
  (a bye; through week 18); lg[pos] league rates over every player line: po PPR per opportunity, tpo TD points per opportunity,
  rpo receptions per opportunity.

Thresholds (weekly finish at the position among every player with a line that week; N = 12 for QB and TE, 24 for RB and WR):
  start-worthy: finish <= N | boom: finish <= N / 2 | bust: finish > 1.5 N.
Shares are over the weeks he played (team totals in those weeks). Opportunities = carries + targets (QB: attempts + carries).
Ranks: competition ranking (ties share a place). Share / snap / opportunity ranks need games >= half his club's games; per-game ranks too.
Not computed (the weekly data cannot back them): red-zone or goal-line touches, fantasy points over expectation.
Matchup (d): PPR the defence allowed per game to the position this season (every player with a line against it), rank 1 = allows the most (softest).
"""
import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
OUT = ROOT / "public" / "data" / "nfl" / "fantasy.json"
POS = ("QB", "RB", "WR", "TE", "K")
START_N = {"QB": 12, "TE": 12, "RB": 24, "WR": 24, "K": 12}
# Kickers (owner, 2026-11-25): nflverse scores none, so a kicker's week is scored here: a field goal 3 / 4 / 5 by distance
# (0-39, 40-49, 50+), an extra point 1, each miss -1 (scripts/nfl/this_season.py kick_points). His projection is his own
# last-3 / season average like every position (nothing imputed).
import sys  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from this_season import kick_points  # noqa: E402


def week_ppr(pos, r):
    return kick_points(r) if pos == "K" else f(r["fantasy_points_ppr"])


def f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def rank_of(vals, v):
    return 1 + sum(1 for x in vals if x > v)


def pct(xs, q):
    s = sorted(xs)
    if not s:
        return None
    k = (len(s) - 1) * q
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def r1(x):
    return None if x is None else round(x + 0.0, 1)


def main():
    games = list(csv.DictReader(gzip.open(CACHE / "games.csv.gz", "rt")))
    season = max(int(g["season"]) for g in games if g["home_score"] != "")
    sg = [g for g in games if g["season"] == str(season) and g["game_type"] == "REG"]
    last_week = max(int(g["week"]) for g in sg if g["home_score"] != "")

    key_by_gsis = {}
    for p in json.loads((ROOT / "data/y80/players.json").read_text()):
        g = (p.get("nfl") or {}).get("gsis")
        if g and p["pos"] in POS:
            key_by_gsis[g] = (f'{p["pos"]}:{p["n"]}', p["pos"])
    pfr_to_gsis = {}
    for r in csv.DictReader(gzip.open(CACHE / "players.csv.gz", "rt")):
        if r["pfr_id"] and r["gsis_id"] in key_by_gsis:
            pfr_to_gsis[r["pfr_id"]] = r["gsis_id"]

    # weekly lines
    rows = []  # (gsis, week, team, opp, csvpos, line)
    team_weeks = defaultdict(set)
    team_wk = defaultdict(lambda: defaultdict(float))  # (team, week) -> field sums
    pool = defaultdict(list)  # (week, pos) -> [ppr]
    allowed = defaultdict(float)  # (defence, pos) -> ppr
    lgsum = defaultdict(lambda: defaultdict(float))  # pos -> {pts, td, rec, opp} over every player line (league rates per opportunity)
    for r in csv.DictReader(gzip.open(CACHE / f"stats_player_week_{season}.csv.gz", "rt")):
        if r["season_type"] != "REG":
            continue
        wk = int(r["week"])
        team_weeks[r["team"]].add(wk)
        for k in ("targets", "receiving_air_yards", "carries"):
            team_wk[(r["team"], wk)][k] += f(r[k])
        pos = "RB" if r["position"] == "FB" else r["position"]
        if pos in POS:
            ppr = week_ppr(pos, r)
            pool[(wk, pos)].append(ppr)
            allowed[(r["opponent_team"], pos)] += ppr
            lg = lgsum[pos]
            lg["pts"] += ppr
            lg["td"] += 4 * f(r["passing_tds"]) + 6 * (f(r["rushing_tds"]) + f(r["receiving_tds"]))
            lg["rec"] += f(r["receptions"])
            lg["opp"] += f(r["carries"]) + (f(r["attempts"]) if pos == "QB" else f(r["targets"]))
        if r["player_id"] in key_by_gsis:
            rows.append((r["player_id"], wk, r["team"], r["opponent_team"], pos, r))
    played_weeks = {t: len(w) for t, w in team_weeks.items()}

    # snap counts: offence share, and games with snaps but no stat line (a real zero)
    snaps = defaultdict(dict)  # gsis -> week -> (offense_pct, team, opp)
    for r in csv.DictReader(gzip.open(CACHE / f"snap_counts_{season}.csv.gz", "rt")):
        if r["game_type"] != "REG":
            continue
        g = pfr_to_gsis.get(r["pfr_player_id"])
        if g and f(r["offense_snaps"]) > 0:
            snaps[g][int(r["week"])] = (f(r["offense_pct"]), r["team"], r["opponent"])

    lines = defaultdict(dict)  # gsis -> week -> dict
    for g, wk, team, opp, pos, r in rows:
        lines[g][wk] = {"team": team, "opp": opp, "ppr": week_ppr(pos, r), "car": f(r["carries"]), "tgt": f(r["targets"]),
                        "ay": f(r["receiving_air_yards"]), "att": f(r["attempts"]), "rec": f(r["receptions"]),
                        "td": 4 * f(r["passing_tds"]) + 6 * (f(r["rushing_tds"]) + f(r["receiving_tds"]))}
    for g, sw in snaps.items():
        for wk, (_, team, opp) in sw.items():
            if wk not in lines[g]:
                lines[g][wk] = {"team": team, "opp": opp, "ppr": 0.0, "car": 0.0, "tgt": 0.0, "ay": 0.0, "att": 0.0, "rec": 0.0, "td": 0.0}

    # weekly finish
    def finish(wk, pos, ppr):
        return rank_of(pool[(wk, pos)], ppr)

    club = {}
    rec = {}
    for g, wl in lines.items():
        key, pos = key_by_gsis[g]
        ws = sorted(wl)
        club[g] = wl[ws[-1]]["team"]
        n = len(ws)
        pp = [wl[w]["ppr"] for w in ws]
        tot = sum(pp)
        fin = [finish(w, pos, wl[w]["ppr"]) for w in ws]
        N = START_N[pos]
        r = {"c": club[g], "g": n, "t": r1(tot), "pg": r1(tot / n),
             "w": [[w, r1(wl[w]["ppr"]), wl[w]["opp"], fi] for w, fi in zip(ws, fin)],
             "sw": sum(1 for x in fin if x <= N), "bm": sum(1 for x in fin if x <= N / 2), "bu": sum(1 for x in fin if x > 1.5 * N)}
        if n >= 3:
            r["l3"] = r1(sum(pp[-3:]) / 3)
            r["_l3"] = sum(pp[-3:]) / 3
            if n >= 6:
                r["p3"] = r1(sum(pp[-6:-3]) / 3)
            mean = tot / n
            sd = (sum((x - mean) ** 2 for x in pp) / (n - 1)) ** 0.5
            r["sd"] = r1(sd)
            r["cv"] = round(sd / mean, 2) if mean > 0 else None
            r["fl"], r["md"], r["ce"] = r1(pct(pp, 0.25)), r1(pct(pp, 0.5)), r1(pct(pp, 0.75))
        r["wr"] = [int(wl[w]["rec"]) for w in ws]
        r["tp"] = r1(sum(wl[w]["td"] for w in ws))
        r["_ws"] = ws
        r["_pos"] = pos
        # opportunity metrics over his games
        tg = sum(wl[w]["tgt"] for w in ws)
        car = sum(wl[w]["car"] for w in ws)
        att = sum(wl[w]["att"] for w in ws)
        t_tgt = sum(team_wk[(wl[w]["team"], w)]["targets"] for w in ws)
        t_ay = sum(team_wk[(wl[w]["team"], w)]["receiving_air_yards"] for w in ws)
        t_car = sum(team_wk[(wl[w]["team"], w)]["carries"] for w in ws)
        opps = car + (att if pos == "QB" else tg)
        r["ot"] = int(opps)
        raw = {"og": opps / n, "po": tot / opps if opps else None}
        if pos != "QB":
            if t_tgt and tg:
                raw["ts"] = 100 * tg / t_tgt
            if t_ay and sum(wl[w]["ay"] for w in ws) > 0:
                raw["ay"] = 100 * sum(wl[w]["ay"] for w in ws) / t_ay
        if pos == "RB" and t_car and car:
            raw["cs"] = 100 * car / t_car
        sn = [snaps[g][w][0] for w in ws if w in snaps[g]]
        if sn and len(sn) >= n * 0.5:
            raw["sn"] = 100 * sum(sn) / len(sn)
        r["_raw"] = raw
        rec[key] = (g, r)

    # ranks
    qual = lambda g, r: r["g"] * 2 >= played_weeks.get(r["c"], 0) and r["g"] >= 2
    by_pos = defaultdict(list)
    for key, (g, r) in rec.items():
        by_pos[r["_pos"]].append((key, g, r))
    all_tot = [r["t"] for _, (g, r) in rec.items()]
    recent = last_week - 2
    for pos, items in by_pos.items():
        tots = [r["t"] for _, _, r in items]
        qpg = [r["pg"] for _, g, r in items if qual(g, r)]
        l3pool = [r["_l3"] for _, g, r in items if "_l3" in r and r["_ws"][-1] >= recent]
        for key, g, r in items:
            r["rk"] = [rank_of(tots, r["t"]), len(tots), rank_of(all_tot, r["t"]), len(all_tot),
                       rank_of(qpg, r["pg"]) if qual(g, r) else None, len(qpg)]
            if "_l3" in r and r["_ws"][-1] >= recent:
                r["l3r"] = [rank_of(l3pool, r["_l3"]), len(l3pool)]
        op = {}
        for k in ("ts", "ay", "cs", "og", "po", "sn"):
            vals = [r["_raw"][k] for _, g, r in items if qual(g, r) and r["_raw"].get(k) is not None]
            for key, g, r in items:
                v = r["_raw"].get(k)
                if v is None:
                    continue
                rk = (rank_of(vals, v), len(vals)) if qual(g, r) else (None, None)
                r.setdefault("op", {})[k] = [round(v, 2 if k == "po" else 1), *rk]
    out = {}
    for key, (g, r) in sorted(rec.items()):
        for k in [k for k in r if k.startswith("_")]:
            del r[k]
        if r["g"] >= 1:
            out[key] = r

    # matchups: PPR allowed per game to a position, rank 1 = softest
    d = defaultdict(dict)
    for pos in POS:
        vals = {t: allowed[(t, pos)] / played_weeks[t] for t in played_weeks}
        for t, v in vals.items():
            d[t][pos] = [round(v, 1), rank_of(list(vals.values()), v), played_weeks[t]]
    # schedule: next three games per club, a bye slot where it falls
    n = {}
    for t in sorted(played_weeks):
        mine = sorted((g for g in sg if t in (g["home_team"], g["away_team"])), key=lambda g: int(g["week"]))
        wks = {int(g["week"]) for g in mine}
        bye = next((w for w in range(1, 19) if w not in wks), None)
        done = max((int(g["week"]) for g in mine if g["home_score"] != ""), default=0)
        nx, games_left = [], 0
        for w in range(done + 1, 19):
            if w == bye:
                if games_left < 3:
                    nx.append([w, None])
                continue
            gm = next((g for g in mine if int(g["week"]) == w), None)
            if gm and games_left < 3:
                home = gm["home_team"] == t
                nx.append([w, gm["away_team"] if home else gm["home_team"], int(home), gm["gameday"]])
                games_left += 1
            if games_left >= 3:
                break
        rm = []
        for w in range(done + 1, 19):
            gm = next((x for x in mine if int(x["week"]) == w), None)
            if gm:
                home = gm["home_team"] == t
                rm.append([w, gm["away_team"] if home else gm["home_team"], int(home)])
            elif w == bye:
                rm.append([w, None])
        n[t] = {"bye": bye, "nx": nx, "rm": rm}
    lg = {pos: {"po": round(v["pts"] / v["opp"], 4), "tpo": round(v["td"] / v["opp"], 4), "rpo": round(v["rec"] / v["opp"], 4)}
          for pos, v in sorted(lgsum.items()) if v["opp"]}
    OUT.write_text(json.dumps({"season": season, "week": last_week, "lg": lg, "n": n, "d": dict(sorted(d.items())), "p": out},
                              separators=(",", ":"), ensure_ascii=False, sort_keys=True))
    print(f"fantasy: {len(out)} players, {len(n)} clubs, week {last_week} -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
