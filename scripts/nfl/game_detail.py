#!/usr/bin/env python3
"""NFL edition: per-game detail for the Game page, one lazy file per season.

    python3 scripts/nfl/game_detail.py

Joins games.csv with the weekly nflverse files in data/nfl-cache/: player lines (stats_player_week_<year>, 1999+), team
lines (stats_team_week_<year>), snap counts (2013+), PFR weekly advanced (pass / rush / rec / def, 2018+) and Next Gen
Stats (2016+, weekly). Output, under public/data/nfl/game/ (loaded when a game of that season opens):

  <year>.json  {"v":1,"season":Y,
                "pc":[stat column names],          player stat columns (PC below), each row carries only its non-zero ones
                "tc":[team stat column names],     team columns, dense per team
                "p":[[name,gsis]],                 every player of the season once
                "g":[{id,w,t,d,tm,a,h,as,hs,ot,sp,tl,ml,roof,surf,temp,wind,ac,hc,aq,hq,ref,sd,ar,hr,
                      ts:[[away team stats],[home team stats]],
                      r:[[pIdx,side(0 away 1 home),position,[col,value,col,value...]], ...]}]}
  ids.json     {"<year>":{"<week>-<away>-<home>":id, "p-<away>-<home>":id (playoffs)}}  (abbreviations as schedule.json)
  sb.json      {"<year>":id}  the Super Bowl of each season

Players with a stat line, offensive or defensive snaps or a snap-count row (offensive linemen only show up through
snaps, 2013+) are kept; special-teams-only snaps are dropped. Deterministic.
"""
import csv
import gzip
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
OUT = ROOT / "public" / "data" / "nfl" / "game"
ALIAS = {"LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR", "WSH": "WAS", "JAC": "JAX"}

# (column, source). source: "w" weekly stats row; "p" PFR pass; "r" PFR rush; "c" PFR rec; "d" PFR def; "n" NGS; "s" snaps
PC = [
    ("completions", "w"), ("attempts", "w"), ("passing_yards", "w"), ("passing_tds", "w"), ("passing_interceptions", "w"),
    ("sacks_suffered", "w"), ("passing_epa", "w"), ("passing_cpoe", "w"), ("passing_air_yards", "w"), ("passing_yards_after_catch", "w"),
    ("passing_first_downs", "w"), ("carries", "w"), ("rushing_yards", "w"), ("rushing_tds", "w"), ("rushing_epa", "w"),
    ("rushing_first_downs", "w"), ("receptions", "w"), ("targets", "w"), ("receiving_yards", "w"), ("receiving_tds", "w"),
    ("receiving_epa", "w"), ("receiving_air_yards", "w"), ("receiving_yards_after_catch", "w"), ("receiving_first_downs", "w"),
    ("fumbles_lost_total", "w"), ("def_tackles_solo", "w"), ("def_tackle_assists", "w"), ("def_tackles_for_loss", "w"),
    ("def_sacks", "w"), ("def_qb_hits", "w"), ("def_interceptions", "w"), ("def_pass_defended", "w"), ("def_fumbles_forced", "w"),
    ("fumble_recovery_opp", "w"), ("def_tds", "w"), ("fg_made", "w"), ("fg_att", "w"), ("fg_long", "w"), ("pat_made", "w"),
    ("pat_att", "w"), ("pt_att", "w"), ("pt_yards", "w"), ("punt_returns", "w"), ("punt_return_yards", "w"),
    ("kickoff_returns", "w"), ("kickoff_return_yards", "w"), ("special_teams_tds", "w"), ("fantasy_points_ppr", "w"),
    ("penalties", "w"), ("penalty_yards", "w"), ("def_safeties", "w"),
    # PFR advanced
    ("passing_drops", "p"), ("passing_bad_throws", "p"), ("times_pressured", "p"), ("times_hurried", "p"), ("times_hit", "p"),
    ("times_blitzed", "p"), ("rushing_yards_before_contact", "r"), ("rushing_yards_after_contact", "r"),
    ("rushing_broken_tackles", "r"), ("receiving_broken_tackles", "c"), ("receiving_drop", "c"),
    ("def_targets", "d"), ("def_completions_allowed", "d"), ("def_yards_allowed", "d"), ("def_passer_rating_allowed", "d"),
    ("def_pressures", "d"), ("def_missed_tackles", "d"), ("def_times_hurried", "d"), ("def_times_blitzed", "d"),
    # Next Gen Stats
    ("avg_time_to_throw", "n"), ("aggressiveness", "n"), ("avg_intended_air_yards", "n"), ("efficiency", "n"),
    ("rush_yards_over_expected", "n"), ("percent_attempts_gte_eight_defenders", "n"), ("avg_separation", "n"),
    ("avg_cushion", "n"), ("avg_yac_above_expectation", "n"),
    # snaps
    ("offense_snaps", "s"), ("defense_snaps", "s"),
]
COL = {c: i for i, (c, _) in enumerate(PC)}
NGS_COLS = {"avg_time_to_throw", "aggressiveness", "avg_intended_air_yards", "efficiency", "rush_yards_over_expected",
            "percent_attempts_gte_eight_defenders", "avg_separation", "avg_cushion", "avg_yac_above_expectation"}
NGS_SRC = {"avg_time_to_throw": "passing", "aggressiveness": "passing", "avg_intended_air_yards": "passing_or_receiving",
           "efficiency": "rushing", "rush_yards_over_expected": "rushing", "percent_attempts_gte_eight_defenders": "rushing",
           "avg_separation": "receiving", "avg_cushion": "receiving", "avg_yac_above_expectation": "receiving"}
# Advanced source columns that carry a different name in the PFR files
PFR_MAP = {"p": {"passing_drops": "passing_drops", "passing_bad_throws": "passing_bad_throws", "times_pressured": "times_pressured",
                 "times_hurried": "times_hurried", "times_hit": "times_hit", "times_blitzed": "times_blitzed"},
           "r": {"rushing_yards_before_contact": "rushing_yards_before_contact", "rushing_yards_after_contact": "rushing_yards_after_contact",
                 "rushing_broken_tackles": "rushing_broken_tackles"},
           "c": {"receiving_broken_tackles": "receiving_broken_tackles", "receiving_drop": "receiving_drop"},
           "d": {"def_targets": "def_targets", "def_completions_allowed": "def_completions_allowed", "def_yards_allowed": "def_yards_allowed",
                 "def_passer_rating_allowed": "def_passer_rating_allowed", "def_pressures": "def_pressures",
                 "def_missed_tackles": "def_missed_tackles", "def_times_hurried": "def_times_hurried", "def_times_blitzed": "def_times_blitzed"}}
ROUND = {"EPA": 2}
EPA_COLS = {"passing_epa", "rushing_epa", "receiving_epa"}

TC = ["completions", "attempts", "passing_yards", "passing_tds", "passing_interceptions", "sacks_suffered", "sack_yards_lost",
      "passing_epa", "passing_first_downs", "carries", "rushing_yards", "rushing_tds", "rushing_epa", "rushing_first_downs",
      "receiving_first_downs", "fumbles_lost_total", "def_sacks", "def_sack_yards", "def_tackles_for_loss", "def_qb_hits",
      "def_interceptions", "def_pass_defended", "def_fumbles_forced", "def_tds", "def_safeties", "fg_made", "fg_att", "pat_made",
      "pat_att", "pt_att", "pt_yards", "punt_returns", "punt_return_yards", "kickoff_returns", "kickoff_return_yards",
      "special_teams_tds", "penalties", "penalty_yards", "timeouts", "fumble_recovery_opp", "targets"]


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", s))


def num(x):
    if x in ("", None):
        return None
    try:
        v = float(x)
    except ValueError:
        return None
    return v


def clean(v, col=None):
    if v is None:
        return None
    if col in EPA_COLS or col in NGS_COLS or col in ("passing_cpoe", "fantasy_points_ppr", "def_passer_rating_allowed"):
        v = round(v, 2)
    if v == int(v):
        return int(v)
    return round(v, 2)


def read(name):
    p = CACHE / name
    if not p.exists():
        p = CACHE / (name + ".gz") if not name.endswith(".gz") else CACHE / name[:-3]
    if not p.exists():
        return []
    op = gzip.open if p.suffix == ".gz" else open
    with op(p, "rt") as f:
        return list(csv.DictReader(f))


def readany(stem):
    for suffix in (".csv.gz", ".csv"):
        p = CACHE / (stem + suffix)
        if p.exists():
            op = gzip.open if suffix.endswith(".gz") else open
            with op(p, "rt") as f:
                return list(csv.DictReader(f))
    return []


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    games = list(csv.DictReader(gzip.open(CACHE / "games.csv.gz", "rt")))
    by_season = {}
    for g in games:
        by_season.setdefault(g["season"], []).append(g)
    ngs = {}
    for kind in ("passing", "rushing", "receiving"):
        for r in read(f"ngs_{kind}.csv.gz"):
            if r["week"] == "0":
                continue
            ngs.setdefault((r["season"], r["season_type"], r["week"], norm(r["player_display_name"]), ALIAS.get(r["team_abbr"], r["team_abbr"])), {})[kind] = r
    ids = {}
    sbs = {}
    total = 0
    for year in sorted(by_season):
        pw = readany(f"stats_player_week_{year}")
        tw = readany(f"stats_team_week_{year}")
        snaps = readany(f"snap_counts_{year}")
        adv = {k: readany(f"advstats_week_{k}_{year}") for k in ("pass", "rush", "rec", "def")}
        per_game = {}  # gid -> {(side-team, normname): {...}}
        for r in pw:
            if not r["game_id"]:
                continue
            d = per_game.setdefault(r["game_id"], {})
            e = d.setdefault((ALIAS.get(r["team"], r["team"]), norm(r["player_display_name"])), {"name": r["player_display_name"], "gsis": r["player_id"], "pos": r["position"], "v": {}})
            for c, s in PC:
                if s == "w":
                    v = num(r.get(c))
                    if v:
                        e["v"][c] = v
        for k, src in (("pass", "p"), ("rush", "r"), ("rec", "c"), ("def", "d")):
            for r in adv[k]:
                d = per_game.setdefault(r["game_id"], {})
                e = d.get((ALIAS.get(r["team"], r["team"]), norm(r["pfr_player_name"])))
                if e is None:
                    e = d.setdefault((ALIAS.get(r["team"], r["team"]), norm(r["pfr_player_name"])), {"name": r["pfr_player_name"], "gsis": "", "pos": "", "v": {}})
                for c in PFR_MAP[src]:
                    v = num(r.get(c))
                    if v:
                        e["v"][c] = v
        for r in snaps:
            d = per_game.setdefault(r["game_id"], {})
            os_, ds_ = num(r["offense_snaps"]) or 0, num(r["defense_snaps"]) or 0
            key = (ALIAS.get(r["team"], r["team"]), norm(r["player"]))
            e = d.get(key)
            if e is None:
                if os_ <= 0 and ds_ <= 0:
                    continue
                e = d.setdefault(key, {"name": r["player"], "gsis": "", "pos": r["position"], "v": {}})
            if not e["pos"]:
                e["pos"] = r["position"]
            if os_:
                e["v"]["offense_snaps"] = os_
            if ds_:
                e["v"]["defense_snaps"] = ds_
        teamrows = {}
        for r in tw:
            teamrows[(r["game_id"], ALIAS.get(r["team"], r["team"]))] = r
        pidx, plist = {}, []
        out_games = []
        for g in sorted(by_season[year], key=lambda g: (g["gameday"], g["gametime"], g["game_id"])):
            gid = g["game_id"]
            away, home = ALIAS.get(g["away_team"], g["away_team"]), ALIAS.get(g["home_team"], g["home_team"])
            wk = int(g["week"])
            gt = g["game_type"]
            aa, hh = ALIAS.get(away, away), ALIAS.get(home, home)
            ids.setdefault(year, {})[f"{wk}-{aa}-{hh}"] = gid
            if gt != "REG":
                ids[year][f"p-{aa}-{hh}"] = gid
            if gt == "SB":
                sbs[year] = gid
            rec = {"id": gid, "w": wk, "t": gt, "d": g["gameday"], "tm": g["gametime"], "a": aa, "h": hh}
            for k, c in (("as", "away_score"), ("hs", "home_score")):
                v = num(g[c])
                if v is not None:
                    rec[k] = int(v)
            if g["overtime"] in ("1", "1.0"):
                rec["ot"] = 1
            for k, c in (("sp", "spread_line"), ("tl", "total_line"), ("temp", "temp"), ("wind", "wind"), ("ar", "away_rest"), ("hr", "home_rest")):
                v = num(g[c])
                if v is not None:
                    rec[k] = clean(v)
            ml = [num(g["away_moneyline"]), num(g["home_moneyline"])]
            if ml[0] is not None and ml[1] is not None:
                rec["ml"] = [int(ml[0]), int(ml[1])]
            for k, c in (("roof", "roof"), ("surf", "surface"), ("ac", "away_coach"), ("hc", "home_coach"), ("aq", "away_qb_name"),
                         ("hq", "home_qb_name"), ("ref", "referee"), ("sd", "stadium")):
                if g[c]:
                    rec[k] = g[c]
            ts = []
            for tm in (away, home):
                row = teamrows.get((gid, tm))
                ts.append([clean(num(row.get(c))) or 0 if row else 0 for c in TC] if row else None)
            if any(ts):
                rec["ts"] = ts
            rows = []
            for (tm, nn), e in sorted(per_game.get(gid, {}).items(), key=lambda kv: (kv[0][0], kv[1]["name"])):
                if tm not in (away, home):
                    continue
                if not e["v"]:
                    continue
                # Next Gen Stats (weekly) by name and club
                st = "REG" if gt == "REG" else "POST"
                for wkn in (str(wk), str(wk + 1)):
                    hit = ngs.get((year, st, wkn, nn, ALIAS.get(tm, tm)))
                    if hit:
                        for kind, r in hit.items():
                            for c in NGS_COLS:
                                if c in r:
                                    v = num(r[c])
                                    if v:
                                        e["v"][c] = v
                        break
                key = e["gsis"] or nn
                if key not in pidx:
                    pidx[key] = len(plist)
                    plist.append([e["name"], e["gsis"]])
                pairs = []
                for c, v in sorted(e["v"].items(), key=lambda kv: COL[kv[0]]):
                    vv = clean(v, c)
                    if vv:
                        pairs += [COL[c], vv]
                if not pairs:
                    continue
                rows.append([pidx[key], 0 if tm == away else 1, e["pos"], pairs])
            if rows:
                rec["r"] = rows
            out_games.append(rec)
        text = json.dumps({"v": 1, "season": int(year), "pc": [c for c, _ in PC], "tc": TC, "p": plist, "g": out_games},
                          separators=(",", ":"), ensure_ascii=False)
        (OUT / f"{year}.json").write_text(text)
        total += len(text)
    (OUT / "ids.json").write_text(json.dumps(ids, separators=(",", ":")))
    (OUT / "sb.json").write_text(json.dumps(sbs, separators=(",", ":")))
    print(f"game detail: {len(by_season)} seasons, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
