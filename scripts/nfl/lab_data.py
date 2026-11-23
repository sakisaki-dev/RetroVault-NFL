#!/usr/bin/env python3
"""NFL edition: public/data/nfl/lab.json, the Team Lab's real numbers (matchups, fantasy, salary cap).

    python3 scripts/nfl/lab_data.py

Only the fields the Team Lab shows (data rule: add no data no page shows):
  p[key]   per player on a club with a game in the last two seasons: t club abbreviation, s salary (the game's, from
           data/nfl/roster.json, millions), n games in the sample, f recency-weighted per-game fantasy components
           [pass yds, pass TD, INT, rush yds, rush TD, rec, rec yds, rec TD, fumbles lost, 2-pt conversions],
           d defence per game [sacks, QB hits, passes defended, INT, tackles, TFL, forced fumbles] (defenders only),
           r [targets, carries, sacks taken] per game.
           Weights: his last 12 games (this and last season), each game 0.9 times the one after it.
  teams[T] this season's weighted (last 8 games) per-game team numbers: pf, pa, pyA / ryA (pass / rush yards allowed),
           sk (sacks made), skA (sacks allowed), int (takeaways via INT), and `vs` the opponent factor per position
           (fantasy points allowed to QB / RB / WR / TE against the league mean, shrunk toward 1 for few games).
  dst[T]   one row per played game this season [week, sacks, INT, fumble recoveries, TDs, safeties, blocks, points
           allowed], the team defence's fantasy line.
  cap      the game's cap (150, ten key players).
Deterministic.
"""
import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
SEASON = 2026
ABBR = {"Cardinals": "ARI", "Falcons": "ATL", "Ravens": "BAL", "Bills": "BUF", "Panthers": "CAR", "Bears": "CHI", "Bengals": "CIN", "Browns": "CLE", "Cowboys": "DAL", "Broncos": "DEN", "Lions": "DET", "Packers": "GB", "Texans": "HOU", "Colts": "IND", "Jaguars": "JAX", "Chiefs": "KC", "Raiders": "LV", "Chargers": "LAC", "Rams": "LAR", "Dolphins": "MIA", "Vikings": "MIN", "Patriots": "NE", "Saints": "NO", "Giants": "NYG", "Jets": "NYJ", "Eagles": "PHI", "Steelers": "PIT", "49ers": "SF", "Seahawks": "SEA", "Buccaneers": "TB", "Titans": "TEN", "Commanders": "WAS"}
FIX = {"LA": "LAR", "WSH": "WAS", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU", "SD": "LAC", "STL": "LAR", "OAK": "LV", "JAC": "JAX"}
DECAY = 0.9
LAST = 12
F = ["passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds", "receptions", "receiving_yards", "receiving_tds", "fumbles_lost_total"]
TWO = ["passing_2pt_conversions", "rushing_2pt_conversions", "receiving_2pt_conversions"]
D = ["def_sacks", "def_qb_hits", "def_pass_defended", "def_interceptions", None, "def_tackles_for_loss", "def_fumbles_forced"]


def r2(x):
    return round(x, 2) if x != int(x) else int(x)


def abbr(t):
    return FIX.get(t, t)


def main():
    roster = {f"{p['pos']}:{p['name']}": p for p in json.loads((ROOT / "data/nfl/roster.json").read_text())["players"]}
    out_p = {}
    allowed = defaultdict(lambda: defaultdict(list))  # (opp team) -> pos -> [(week, ppr pts)]
    for f in sorted((ROOT / "data/nfl/games").glob("*.json")):
        d = json.loads(f.read_text())
        key = d["key"]
        pos = key.split(":")[0]
        cols = d["cols"]
        ix = {c: i for i, c in enumerate(cols)}
        games = sorted(d["games"], key=lambda g: (g[0], g[1]))
        g = lambda row, c: (row[ix[c]] or 0) if c in ix else 0
        if pos in ("QB", "RB", "WR", "TE"):
            for row in games:
                if row[0] == SEASON and row[2] == "REG":
                    byw = allowed[abbr(row[4])][pos]
                    byw.append((row[1], key, g(row, "fantasy_points_ppr")))
        ro = roster.get(key)
        if not ro or ro["club"] == "FA" or not games or games[-1][0] < SEASON - 1:
            continue
        recent = [r for r in games if r[0] >= SEASON - 1][-LAST:]
        if not recent:
            continue
        ws = [DECAY ** k for k in range(len(recent) - 1, -1, -1)]
        tot = sum(ws)
        avg = lambda fn: sum(w * fn(r) for w, r in zip(ws, recent)) / tot
        f_ = [r2(round(avg(lambda r, c=c: g(r, c)), 2)) for c in F]
        f_.insert(9, r2(round(avg(lambda r: sum(g(r, c) for c in TWO)), 3)))
        d_ = [r2(round(avg(lambda r, c=c: g(r, c) if c else g(r, "def_tackles_solo") + g(r, "def_tackle_assists")), 2)) for c in D]
        entry = {"t": abbr(ABBR.get(ro["club"], ro["club"])), "s": ro["salary"], "n": len(recent), "f": f_, "r": [r2(round(avg(lambda r: g(r, "targets")), 2)), r2(round(avg(lambda r: g(r, "carries")), 2)), r2(round(avg(lambda r: g(r, "sacks_suffered")), 3))]}
        if pos in ("LB", "DB", "DL") or any(d_):
            entry["d"] = d_
        out_p[key] = entry

    # team numbers from stats_team + final scores
    scores = {}
    for r in csv.DictReader(gzip.open(CACHE / "games.csv.gz", "rt")):
        if r["season"] == str(SEASON) and r["home_score"] not in ("", "NA"):
            scores[r["game_id"]] = (abbr(r["home_team"]), float(r["home_score"]), abbr(r["away_team"]), float(r["away_score"]))
    rows = [r for r in csv.DictReader(gzip.open(CACHE / f"stats_team_week_{SEASON}.csv.gz", "rt")) if r["season_type"] == "REG"]
    rows.sort(key=lambda r: int(r["week"]))
    by_team = defaultdict(list)
    by_opp = defaultdict(list)
    for r in rows:
        r["team"], r["opponent_team"] = abbr(r["team"]), abbr(r["opponent_team"])
        by_team[r["team"]].append(r)
        by_opp[r["opponent_team"]].append(r)
    num = lambda r, c: float(r[c] or 0)

    def pa(r):
        s = scores.get(r["game_id"])
        if not s:
            return None
        return s[3] if s[0] == r["team"] else s[1]

    def pf(r):
        s = scores.get(r["game_id"])
        if not s:
            return None
        return s[1] if s[0] == r["team"] else s[3]

    teams, dst = {}, {}
    for t, rs in sorted(by_team.items()):
        last = rs[-8:]
        n = len(last)
        mean = lambda fn: round(sum(fn(r) for r in last) / n, 2)
        opp_rows = [o for o in by_opp[t]][-8:]
        m_o = lambda c: round(sum(num(o, c) for o in opp_rows) / len(opp_rows), 2) if opp_rows else 0
        teams[t] = {"g": len(rs), "pf": mean(lambda r: pf(r) or 0), "pa": mean(lambda r: pa(r) or 0), "pyA": m_o("passing_yards"), "ryA": m_o("rushing_yards"), "sk": mean(lambda r: num(r, "def_sacks")), "skA": mean(lambda r: num(r, "sacks_suffered")), "int": mean(lambda r: num(r, "def_interceptions"))}
        dst[t] = [[int(r["week"]), int(num(r, "def_sacks")), int(num(r, "def_interceptions")), int(num(r, "fumble_recovery_opp")), int(num(r, "def_tds") + num(r, "fumble_recovery_tds")), int(num(r, "def_safeties")), int(num(r, "def_fg_blocks") + num(r, "def_punt_blocks") + num(r, "def_pat_blocks")), int(pa(r) if pa(r) is not None else 0)] for r in rs]
    # opponent factors: PPR points allowed per game to a position's players, against the league mean
    per = {}  # team -> pos -> per-week totals
    for t, pos_d in allowed.items():
        for pos, lst in pos_d.items():
            wk = defaultdict(float)
            for w, _k, pts in lst:
                wk[w] += pts
            per.setdefault(t, {})[pos] = [wk[w] for w in sorted(wk)][-8:]
    for pos in ("QB", "RB", "WR", "TE"):
        vals = [sum(per[t][pos]) / len(per[t][pos]) for t in per if per[t].get(pos)]
        league = sum(vals) / len(vals)
        for t in per:
            xs = per[t].get(pos) or []
            if t in teams and xs:
                raw = (sum(xs) / len(xs)) / league
                teams[t].setdefault("vs", {})[pos] = round((len(xs) * raw + 4) / (len(xs) + 4), 3)
    dest = ROOT / "public/data/nfl/lab.json"
    dest.write_text(json.dumps({"season": SEASON, "cap": 150, "teams": teams, "dst": dst, "p": dict(sorted(out_p.items()))}, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"lab data: {len(out_p)} players, {len(teams)} teams, {dest.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
