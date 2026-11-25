#!/usr/bin/env python3
"""NFL edition: public/data/nfl/pnews.json, the Deep Dive News section's rule cards (no AI, nothing invented).

    python3 scripts/nfl/player_news.py

Reads the per-player game logs (public/data/nfl/games/, run after games_public.py), data/y80/players.json (career totals),
public/data/nfl/lab.json (the opponent factors) and public/data/league/upcoming.json. Writes:
  season, week   the live season and the latest week any log holds
  teams          clubs counted in the defence ranks
  vs[POS][ABBR]  [rank, factor]: the club's defence against that position (QB RB WR TE), rank 1 = allows the most fantasy
                 points to the position (the softest), 32 = the toughest; factor = lab.json's points allowed against the
                 league mean (weighted over the club's last 8 games)
  ppr[key]       [rank, total, games, ppg]: this season's regular-season PPR points, rank among his position (QB RB WR TE)
  m[key]         up to three milestones in reach for a player still active: [label, have, target, perGame, gamesToGo].
                 target = the next multiple of a quarter of his career total's power of ten above it (32,599 yards: 35,000;
                 234 TDs: 250; under 100, multiples of 5); perGame = his average over his last 17 games on file; kept when gamesToGo <= 17.
Deterministic.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public" / "data"
GAMES = PUB / "nfl" / "games"

# position -> (label, players.json field, game-log columns summed)
STATS = {
    "QB": [("passing yards", "yds", ["passing_yards"]), ("passing TDs", "td", ["passing_tds"]), ("rushing yards", "ryds", ["rushing_yards"])],
    "RB": [("rushing yards", "ryds", ["rushing_yards"]), ("rushing TDs", "rtd", ["rushing_tds"]), ("receiving yards", "recyds", ["receiving_yards"]), ("receptions", "rec", ["receptions"])],
    "WR": [("receiving yards", "yds", ["receiving_yards"]), ("receptions", "rec", ["receptions"]), ("receiving TDs", "td", ["receiving_tds"])],
    "TE": [("receiving yards", "yds", ["receiving_yards"]), ("receptions", "rec", ["receptions"]), ("receiving TDs", "td", ["receiving_tds"])],
    "DL": [("sacks", "sck", ["def_sacks"]), ("tackles", "tkl", ["def_tackles_solo", "def_tackle_assists"])],
    "LB": [("tackles", "tkl", ["def_tackles_solo", "def_tackle_assists"]), ("sacks", "sck", ["def_sacks"]), ("interceptions", "int", ["def_interceptions"])],
    "DB": [("interceptions", "int", ["def_interceptions"]), ("tackles", "tkl", ["def_tackles_solo", "def_tackle_assists"])],
}
FANTASY = ("QB", "RB", "WR", "TE")
SEASON = 2026
PACE_GAMES = 17


def next_round(v):
    """The next multiple of a quarter of v's power of ten above v (at least v + 1)."""
    if v < 1:
        return 10
    m = 10 ** int(math.floor(math.log10(v)))
    step = m // 4 if m >= 100 else (5 if m == 10 else 1)
    return (int(v) // step + 1) * step


def main():
    players = {f"{p['pos']}:{p['n']}": p for p in json.loads((ROOT / "data/y80/players.json").read_text())}
    ppr_rows = {pos: [] for pos in FANTASY}
    milestones = {}
    week = 0
    for f in sorted(GAMES.glob("*.json")):
        d = json.loads(f.read_text())
        key = d["key"]
        p = players.get(key)
        if not p:
            continue
        cols = d["cols"]
        ix = {c: i for i, c in enumerate(cols)}
        rows = d["games"]
        pos = p["pos"]
        cur = [r for r in rows if r[ix["season"]] == SEASON and r[ix["type"]] == "REG"]
        if cur:
            week = max(week, max(r[ix["week"]] for r in cur))
        if pos in FANTASY and cur and "fantasy_points_ppr" in ix:
            tot = round(sum(r[ix["fantasy_points_ppr"]] or 0 for r in cur), 1)
            ppr_rows[pos].append((key, tot, len(cur)))
        nfl = p.get("nfl") or {}
        if pos in STATS and not nfl.get("retired") and cur:
            last = rows[-PACE_GAMES:]
            found = []
            for label, field, src in STATS[pos]:
                have = p.get(field)
                if not isinstance(have, (int, float)) or have <= 0 or any(c not in ix for c in src):
                    continue
                pace = sum((r[ix[c]] or 0) for r in last for c in src) / len(last)
                if pace <= 0:
                    continue
                target = next_round(have)
                togo = (target - have) / pace
                if togo <= PACE_GAMES:
                    found.append([label, have, target, round(pace, 1), round(togo, 1)])
            found.sort(key=lambda x: x[4])
            if found:
                milestones[key] = found[:3]
    ppr = {}
    for pos, lst in ppr_rows.items():
        lst.sort(key=lambda x: (-x[1], x[0]))
        for i, (key, tot, g) in enumerate(lst):
            ppr[key] = [i + 1, tot, g, round(tot / g, 1)]
    vs = {}
    lab = PUB / "nfl" / "lab.json"
    teams = json.loads(lab.read_text())["teams"] if lab.exists() else {}
    for pos in FANTASY:
        lst = sorted(((t, v["vs"][pos]) for t, v in teams.items() if v.get("vs", {}).get(pos) is not None), key=lambda x: (-x[1], x[0]))
        vs[pos] = {t: [i + 1, f] for i, (t, f) in enumerate(lst)}
    out = {"season": SEASON, "week": week, "teams": len(teams), "vs": vs, "ppr": dict(sorted(ppr.items())), "m": dict(sorted(milestones.items()))}
    (PUB / "nfl" / "pnews.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"pnews: {len(ppr)} PPR ranks, {len(milestones)} players with milestones, week {week}")


if __name__ == "__main__":
    main()
