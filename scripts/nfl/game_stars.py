#!/usr/bin/env python3
"""NFL edition: each game's star performer per club, one small lazy file per season.

    python3 scripts/nfl/game_stars.py

From the weekly nflverse player lines (data/nfl-cache/stats_player_week_<year>.csv.gz, every player of every season,
not only the site's pool) joined with games.csv. Per game and club the best performance: an offensive player by
fantasy points (PPR), a defender by the impact score of the Game log page (tackles, sacks, tackles for loss, hits,
interceptions, passes defended, forced fumbles, touchdowns); the offensive star stands unless he scored under 10 and the
defender's impact beats his score. Output public/data/league/stars/<year>.json:
  {"g": {"<week>-<away>-<home>": {"a": [key, name, line], "h": [key, name, line]}},
   "l": {"passing"|"rushing"|"receiving"|"sacks"|"interceptions": [[key, name, club, value], ... top 3]}}
(abbreviations as schedule.json; regular season totals for the leaders). key is the site's POS:Name (the card, if he
has one). Deterministic.
"""
import csv
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
OUT = ROOT / "public" / "data" / "league" / "stars"
ALIAS = {"LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS", "JAC": "JAX"}
SITE_POS = {"QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE", "DE": "DL", "DT": "DL", "NT": "DL", "DL": "DL",
            "LB": "LB", "ILB": "LB", "OLB": "LB", "MLB": "LB", "CB": "DB", "S": "DB", "FS": "DB", "SS": "DB", "DB": "DB"}
OFF = {"QB", "RB", "WR", "TE"}


def f(r, k):
    try:
        return float(r[k] or 0)
    except (KeyError, ValueError):
        return 0.0


def impact(r):
    return (f(r, "def_tackles_solo") + 0.5 * f(r, "def_tackle_assists") + 4 * f(r, "def_sacks") + 1.5 * f(r, "def_tackles_for_loss")
            + 0.8 * f(r, "def_qb_hits") + 6 * f(r, "def_interceptions") + 1.5 * f(r, "def_pass_defended")
            + 3 * f(r, "def_fumbles_forced") + 6 * f(r, "def_tds"))


def n(x):
    return str(int(x)) if x == int(x) else f"{x:.1f}"


def line(pos, r):
    if pos == "QB":
        bits = [f"{n(f(r, 'completions'))}/{n(f(r, 'attempts'))}", f"{n(f(r, 'passing_yards'))} yds"]
        if f(r, "passing_tds"): bits.append(f"{n(f(r, 'passing_tds'))} TD")
        if f(r, "passing_interceptions"): bits.append(f"{n(f(r, 'passing_interceptions'))} INT")
        if f(r, "rushing_yards") >= 40: bits.append(f"{n(f(r, 'rushing_yards'))} rush")
        return ", ".join(bits)
    if pos == "RB":
        bits = [f"{n(f(r, 'carries'))} car", f"{n(f(r, 'rushing_yards'))} yds"]
        td = f(r, "rushing_tds") + f(r, "receiving_tds")
        if f(r, "receptions") >= 3: bits.append(f"{n(f(r, 'receptions'))} rec, {n(f(r, 'receiving_yards'))} rec yds")
        if td: bits.append(f"{n(td)} TD")
        return ", ".join(bits)
    if pos in ("WR", "TE"):
        bits = [f"{n(f(r, 'receptions'))} rec", f"{n(f(r, 'receiving_yards'))} yds"]
        if f(r, "receiving_tds"): bits.append(f"{n(f(r, 'receiving_tds'))} TD")
        return ", ".join(bits)
    tk = f(r, "def_tackles_solo") + f(r, "def_tackle_assists")
    bits = [f"{n(tk)} tkl"] if tk else []
    for k, lab in (("def_sacks", "sck"), ("def_interceptions", "INT"), ("def_tackles_for_loss", "TFL"), ("def_pass_defended", "PD"),
                   ("def_fumbles_forced", "FF"), ("def_tds", "TD")):
        if f(r, k): bits.append(f"{n(f(r, k))} {lab}")
    return ", ".join(bits)


def main():
    games = {}
    for r in csv.DictReader(gzip.open(CACHE / "games.csv.gz", "rt")):
        games[r["game_id"]] = (int(r["week"]), ALIAS.get(r["away_team"], r["away_team"]), ALIAS.get(r["home_team"], r["home_team"]))
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for path in sorted(CACHE.glob("stats_player_week_*.csv.gz")):
        year = path.name.split("_")[-1].split(".")[0]
        tot = {}  # (key, name) -> {stat: total, "team": last club}
        best = {}  # (gid, side) -> {"off": (score, row, pos), "def": (...)}
        for r in csv.DictReader(gzip.open(path, "rt")):
            pos = SITE_POS.get(r["position"])
            gm = games.get(r["game_id"])
            if not pos or not gm:
                continue
            if r["season_type"] == "REG":
                t = tot.setdefault((f"{pos}:{r['player_display_name']}", r["player_display_name"]), {"team": ""})
                t["team"] = ALIAS.get(r["team"], r["team"])
                for stat, col in (("passing", "passing_yards"), ("rushing", "rushing_yards"), ("receiving", "receiving_yards"),
                                  ("sacks", "def_sacks"), ("interceptions", "def_interceptions")):
                    t[stat] = t.get(stat, 0) + f(r, col)
            side = "a" if ALIAS.get(r["team"], r["team"]) == gm[1] else "h"
            slot = best.setdefault((r["game_id"], side), {})
            if pos in OFF:
                sc, grp = f(r, "fantasy_points_ppr"), "off"
            else:
                sc, grp = impact(r), "def"
            if sc > slot.get(grp, (-1,))[0]:
                slot[grp] = (sc, r, pos)
        out = {}
        for (gid, side), slot in sorted(best.items()):
            off, de = slot.get("off"), slot.get("def")
            pick = off if off and (off[0] >= 10 or not de or de[0] <= off[0]) else de
            if not pick:
                continue
            sc, r, pos = pick
            wk, away, home = gm = games[gid]
            out.setdefault(f"{wk}-{away}-{home}", {})[side] = [f"{pos}:{r['player_display_name']}", r["player_display_name"], line(pos, r)]
        leaders = {}
        for stat in ("passing", "rushing", "receiving", "sacks", "interceptions"):
            top = sorted(((v.get(stat, 0), k) for k, v in tot.items() if v.get(stat, 0) > 0), key=lambda x: (-x[0], x[1]))[:3]
            leaders[stat] = [[k[0], k[1], tot[k]["team"], round(v, 1) if v != int(v) else int(v)] for v, k in top]
        out = {"g": out, "l": leaders}
        (OUT / f"{year}.json").write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
        total += len(out["g"])
    print(f"game stars: {total} games")


if __name__ == "__main__":
    main()
