#!/usr/bin/env python3
"""NFL edition: the Deep Dive's "This season" panel -> public/data/nfl/thisseason.json.

From nflverse stats_player_week_<latest>.csv.gz (regular season), the key mapping of data/y80/players.json (nfl.gsis),
games.csv.gz and playoff_odds.json (picks). Everything is a sum or a ratio of real weekly lines; nothing is imputed.

  season, week (last week with scores), clubs {ABBR: next game}, p {"QB:Josh Allen": {c: club, g: games, s: [[label, shown, rank, of], ...],
  pace: [[label, projected], ...], ppr: [total, per game, rank, of]}}

Ranks: competition ranking (ties share a place) among players at his position with a game this season. Counting stats rank
on the season total; a rate ranks only among qualifiers (QB 14 attempts, RB 6.25 carries, WR/TE 1.875 catches per club
game played). Interceptions thrown carry no rank. Pace = per-game rate over his games played x 17 (a projection, counting
stats only, from his fourth game on). A count of zero is not ranked, and only players above zero are in the pool. Fantasy points are nflverse's fantasy_points_ppr (standard PPR scoring: 1 per catch, 0.1 per rush/rec yard,
0.04 per passing yard, 6 per TD, 4 per passing TD, -2 per INT or lost fumble, 2 per two-point conversion), QB/RB/WR/TE only.
Next game: the club's first unplayed game in games.csv, with its win chance from the odds model where it picked that game.
"""
import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
OUT = ROOT / "public" / "data" / "nfl" / "thisseason.json"
G17 = 17

# (label, fn(totals) -> value, kind, fmt)  kind: "count" ranks on value, "rate" ranks among qualifiers, "none" no rank
# qual(totals, teamgames) for rates
S = lambda d, *ks: sum(d.get(k, 0) for k in ks)
SPECS = {
    "QB": [
        ("Pass yds", lambda d: S(d, "passing_yards"), "count", "n"),
        ("Pass TD", lambda d: S(d, "passing_tds"), "count", "n"),
        ("INT", lambda d: S(d, "passing_interceptions"), "none", "n"),
        ("Cmp %", lambda d: 100 * S(d, "completions") / S(d, "attempts") if S(d, "attempts") else None, "rate:attempts:14", "p"),
        ("Rush yds", lambda d: S(d, "rushing_yards"), "count", "n"),
        ("Rush TD", lambda d: S(d, "rushing_tds"), "count", "n"),
        ("Sacked", lambda d: S(d, "sacks_suffered"), "none", "n"),
    ],
    "RB": [
        ("Rush yds", lambda d: S(d, "rushing_yards"), "count", "n"),
        ("Rush TD", lambda d: S(d, "rushing_tds"), "count", "n"),
        ("Yds / carry", lambda d: S(d, "rushing_yards") / S(d, "carries") if S(d, "carries") else None, "rate:carries:6.25", "1"),
        ("Rec", lambda d: S(d, "receptions"), "count", "n"),
        ("Rec yds", lambda d: S(d, "receiving_yards"), "count", "n"),
        ("Carries", lambda d: S(d, "carries"), "count", "n"),
        ("Rec TD", lambda d: S(d, "receiving_tds"), "count", "n"),
    ],
    "WR": [
        ("Rec", lambda d: S(d, "receptions"), "count", "n"),
        ("Rec yds", lambda d: S(d, "receiving_yards"), "count", "n"),
        ("Rec TD", lambda d: S(d, "receiving_tds"), "count", "n"),
        ("Yds / catch", lambda d: S(d, "receiving_yards") / S(d, "receptions") if S(d, "receptions") else None, "rate:receptions:1.875", "1"),
        ("Targets", lambda d: S(d, "targets"), "count", "n"),
        ("Catch %", lambda d: 100 * S(d, "receptions") / S(d, "targets") if S(d, "targets") else None, "rate:targets:3", "p"),
        ("1st downs", lambda d: S(d, "receiving_first_downs"), "count", "n"),
    ],
    "DL": [
        ("Tackles", lambda d: S(d, "def_tackles_solo", "def_tackle_assists"), "count", "n"),
        ("Sacks", lambda d: S(d, "def_sacks"), "count", "1"),
        ("TFL", lambda d: S(d, "def_tackles_for_loss"), "count", "n"),
        ("QB hits", lambda d: S(d, "def_qb_hits"), "count", "n"),
        ("FF", lambda d: S(d, "def_fumbles_forced"), "count", "n"),
        ("Pass def", lambda d: S(d, "def_pass_defended"), "count", "n"),
        ("INT", lambda d: S(d, "def_interceptions"), "count", "n"),
    ],
    "LB": [
        ("Tackles", lambda d: S(d, "def_tackles_solo", "def_tackle_assists"), "count", "n"),
        ("Sacks", lambda d: S(d, "def_sacks"), "count", "1"),
        ("TFL", lambda d: S(d, "def_tackles_for_loss"), "count", "n"),
        ("Pass def", lambda d: S(d, "def_pass_defended"), "count", "n"),
        ("INT", lambda d: S(d, "def_interceptions"), "count", "n"),
        ("QB hits", lambda d: S(d, "def_qb_hits"), "count", "n"),
        ("FF", lambda d: S(d, "def_fumbles_forced"), "count", "n"),
    ],
    "DB": [
        ("Tackles", lambda d: S(d, "def_tackles_solo", "def_tackle_assists"), "count", "n"),
        ("INT", lambda d: S(d, "def_interceptions"), "count", "n"),
        ("Pass def", lambda d: S(d, "def_pass_defended"), "count", "n"),
        ("Sacks", lambda d: S(d, "def_sacks"), "count", "1"),
        ("FF", lambda d: S(d, "def_fumbles_forced"), "count", "n"),
        ("TFL", lambda d: S(d, "def_tackles_for_loss"), "count", "n"),
        ("Def TD", lambda d: S(d, "def_tds"), "count", "n"),
    ],
}
SPECS["TE"] = SPECS["WR"]
PACE = {"QB": 2, "RB": 2, "WR": 3, "TE": 3, "DL": 2, "LB": 2, "DB": 2}  # how many leading specs project (all counting)
FANTASY = {"QB", "RB", "WR", "TE"}
FIELDS = sorted({k for sp in SPECS.values() for _, f, _, _ in sp for k in ()} | set())


def fnum(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return 0.0


def rank_of(vals, v, reverse=True):
    """Competition rank of v among vals (1 = best)."""
    return 1 + sum(1 for x in vals if (x > v if reverse else x < v))


def main():
    games = list(csv.DictReader(gzip.open(CACHE / "games.csv.gz", "rt")))
    season = max(int(g["season"]) for g in games if g["home_score"] != "")
    odds = json.loads((ROOT / "public/data/nfl/playoff_odds.json").read_text())
    picks = {g["id"]: g for g in (odds.get("picks") or {}).get("games", [])}
    key_by_gsis = {}
    for p in json.loads((ROOT / "data/y80/players.json").read_text()):
        g = (p.get("nfl") or {}).get("gsis")
        if g:
            key_by_gsis[g] = (f'{p["pos"]}:{p["n"]}', p["pos"])

    tot = defaultdict(lambda: defaultdict(float))  # gsis -> field sums
    gp = defaultdict(set)
    club = {}
    weeks_by_team = defaultdict(set)
    for r in csv.DictReader(gzip.open(CACHE / f"stats_player_week_{season}.csv.gz", "rt")):
        if r["season_type"] != "REG":
            continue
        weeks_by_team[r["team"]].add(int(r["week"]))
        g = r["player_id"]
        if g not in key_by_gsis:
            continue
        # a game counts when the player has a stat line that week
        gp[g].add(int(r["week"]))
        club[g] = (int(r["week"]), r["team"]) if g not in club or int(r["week"]) >= club[g][0] else club[g]
        for k, v in r.items():
            if k in ("player_id", "player_name", "player_display_name", "position", "position_group", "headshot_url", "season", "week",
                     "season_type", "game_id", "team", "opponent_team", "fg_made_list", "fg_missed_list", "fg_blocked_list"):
                continue
            tot[g][k] += fnum(v)
    teamg = {t: len(w) for t, w in weeks_by_team.items()}
    by_pos = defaultdict(list)
    for g in tot:
        by_pos[key_by_gsis[g][1]].append(g)

    # per-position ranking tables
    out = {}
    for pos, ids in by_pos.items():
        specs = SPECS.get(pos)
        if not specs:
            continue
        table = []
        for i, (label, fn, kind, fmt) in enumerate(specs):
            vals = {}
            for g in ids:
                v = fn(tot[g])
                if v is None:
                    continue
                if kind.startswith("rate"):
                    _, fld, per = kind.split(":")
                    if tot[g][fld] < float(per) * teamg.get(club[g][1], 0):
                        continue
                if kind == "count" and v <= 0:
                    continue  # a zero is not ranked
                vals[g] = v
            table.append(vals)
        ppr = {g: tot[g]["fantasy_points_ppr"] for g in ids} if pos in FANTASY else {}
        for g in ids:
            games_n = len(gp[g])
            rows = []
            for i, (label, fn, kind, fmt) in enumerate(specs):
                v = fn(tot[g])
                if v is None:
                    continue
                pool = list(table[i].values())
                rk = None
                if kind != "none" and g in table[i]:
                    rk = [rank_of(pool, v), len(pool)]
                shown = round(v) if fmt == "n" else round(v, 1) if fmt in ("1", "p") else v
                rows.append([label, shown, *(rk or [None, None])])
            if not any(r[1] for r in rows):
                continue
            rec = {"c": club[g][1], "g": games_n, "s": rows}
            pace = []
            for (label, fn, kind, fmt) in specs[: PACE.get(pos, 0)]:
                v = fn(tot[g])
                if kind == "count" or (kind == "none" and fmt == "n"):
                    pace.append([label, round(v / games_n * G17)])
            if pace and games_n >= 4:  # a projection needs a few games behind it
                rec["pace"] = pace
            if ppr and games_n:
                rec["ppr"] = [round(ppr[g], 1), round(ppr[g] / games_n, 1), rank_of(list(ppr.values()), ppr[g]), len(ppr)]
            out[key_by_gsis[g][0]] = rec

    # next game per club
    last_week = max(int(g["week"]) for g in games if g["season"] == str(season) and g["home_score"] != "" and g["game_type"] == "REG")
    clubs = {}
    for gm in sorted((g for g in games if g["season"] == str(season) and g["home_score"] == ""), key=lambda g: (g["gameday"], g["gametime"])):
        for side, opp, home in (("home_team", "away_team", True), ("away_team", "home_team", False)):
            t = gm[side]
            if t in clubs:
                continue
            pk = picks.get(gm["game_id"])
            clubs[t] = {"opp": gm[opp], "home": home, "week": int(gm["week"]), "date": gm["gameday"], "time": gm["gametime"],
                        **({"p": round(pk["pHome"] if home else 1 - pk["pHome"], 3)} if pk else {})}
    OUT.write_text(json.dumps({"season": season, "week": last_week, "clubs": dict(sorted(clubs.items())), "p": dict(sorted(out.items()))},
                              separators=(",", ":"), ensure_ascii=False))
    print(f"this season: {len(out)} players, {len(clubs)} clubs with a next game -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
