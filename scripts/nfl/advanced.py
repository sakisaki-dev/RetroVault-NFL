#!/usr/bin/env python3
"""NFL edition: the advanced-stat factors, public/data/nfl/advanced.json (the Deep Dive's Advanced factors, the skill
grades' advanced tiles and the leaders under them).

    python3 scripts/nfl/advanced.py

Sources, all nflverse (data/nfl-cache): weekly player stats (EPA, CPOE, target share, WOPR, air-yards share,
QB hits, tackles for loss, passes defended), Next Gen Stats (time to throw, intended air yards, separation, rush yards
over expected, yards after catch above expectation: their season rows, week 0, 2016 on), PFR advanced stats (yards after
contact, broken tackles, drops, pressures, missed tackles, coverage allowed: 2018 on) and snap counts (2013 on). Only
seasons a source covers count: a metric from a source starts that source's first season, never a zero before it.
What is NOT here, because no source has it: success rate, catch % over expected, OL pressure allowed, and penalties (nflverse's weekly stats have no offensive linemen).

Every metric is ranked only within its position, in a season or over the career (2018 on, the seasons all sources
share), among players who meet its minimum sample (MIN: per season; the career minimum is 2.5 x). A value is
[value, percentile 0-100 (higher = better after the metric's direction), rank, pool size]. Deterministic.
"""
import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
OUT = ROOT / "public" / "data" / "nfl" / "advanced.json"
FIRST, NOW = 2018, 2026
OFF = ("QB", "RB", "WR", "TE", "OL")


def rows(name):
    f = CACHE / name
    if not f.exists():
        return []
    op = gzip.open if name.endswith(".gz") else open
    with op(f, "rt") as fh:
        return list(csv.DictReader(fh))


def fl(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


# id: (label, positions, source, direction, unit, decimals, minimum-sample key, min, description)
# direction: high = more is better, low = less is better, style = a trait, graded by rank only (neither end is "good")
M = {
    "epa_play": ("EPA / play", ("QB",), "nflverse weekly", "high", "", 2, "db", 150, "Expected points added per dropback"),
    "cpoe": ("CPOE", ("QB",), "nflverse weekly", "high", "%", 1, "att", 150, "Completion % over the expected given each throw"),
    "sack_rate": ("Sack rate", ("QB",), "nflverse weekly", "low", "%", 1, "db", 150, "Sacks per dropback"),
    "ttt": ("Time to throw", ("QB",), "NGS", "style", "s", 2, "att", 150, "Seconds from snap to release (NGS)"),
    "adot_qb": ("aDOT", ("QB",), "NGS", "style", " yds", 1, "att", 150, "Average intended air yards per throw (NGS)"),
    "ryoe": ("Rush yds over exp / att", ("RB",), "NGS", "high", "", 2, "car", 60, "Rushing yards over expected per attempt (NGS)"),
    "yac_contact": ("Yds after contact / att", ("RB",), "PFR", "high", "", 2, "car", 60, "Rushing yards after contact per carry (PFR)"),
    "broken": ("Broken tackles / carry", ("RB",), "PFR", "high", "", 3, "car", 60, "Tackles broken per carry (PFR)"),
    "tgt_share": ("Target share", ("RB", "WR", "TE"), "nflverse weekly", "high", "%", 1, "tgt", 30, "Share of his team's targets while he played"),
    "rec_epa_tgt": ("EPA / target", ("RB", "WR", "TE"), "nflverse weekly", "high", "", 2, "tgt", 30, "Receiving EPA per target"),
    "wopr": ("WOPR", ("WR", "TE"), "nflverse weekly", "high", "", 2, "tgt", 30, "Weighted opportunity rating (target share and air-yards share)"),
    "air_share": ("Air-yards share", ("WR", "TE"), "nflverse weekly", "high", "%", 1, "tgt", 30, "Share of his team's intended air yards"),
    "sep": ("Separation", ("WR", "TE"), "NGS", "high", " yds", 2, "tgt", 30, "Average yards of separation at the catch (NGS)"),
    "yac_exp": ("YAC above expected", ("WR", "TE", "RB"), "NGS", "high", " yds", 2, "tgt", 30, "Yards after the catch above the expected (NGS)"),
    "drop_pct": ("Drop rate", ("WR", "TE", "RB"), "PFR", "low", "%", 1, "tgt", 30, "Drops per target (PFR)"),
    "yac_rec": ("YAC / reception", ("WR", "TE"), "nflverse weekly", "high", " yds", 1, "rec", 20, "Yards after the catch per reception"),
    "adot_rec": ("aDOT", ("WR", "TE"), "nflverse weekly", "style", " yds", 1, "tgt", 30, "Average depth of target"),
    "snap_share": ("Snap share", ("TE", "OL", "LB", "DB", "DL"), "snap counts", "high", "%", 0, "gm", 6, "Share of his side's snaps in the games he played"),
    "full_games": ("Full-time games", ("OL",), "snap counts", "high", "", 0, "gm", 6, "Games with 70%+ of the offensive snaps"),
    "pressures_g": ("Pressures / game", ("DL", "LB"), "PFR", "high", "", 2, "gm", 6, "Hurries, hits and sacks per game (PFR)"),
    "qbhits_g": ("QB hits / game", ("DL", "LB"), "nflverse weekly", "high", "", 2, "gm", 6, "Quarterback hits per game"),
    "tfl_g": ("Tackles for loss / game", ("DL", "LB", "DB"), "nflverse weekly", "high", "", 2, "gm", 6, "Tackles for loss per game"),
    "missed_pct": ("Missed tackle rate", ("LB", "DB", "DL"), "PFR", "low", "%", 1, "tk", 20, "Missed tackles per attempt (PFR)"),
    "pr_allowed": ("Passer rating allowed", ("DB", "LB"), "PFR", "low", "", 1, "dtgt", 20, "Passer rating when targeted (PFR)"),
    "ypt_allowed": ("Yds / target allowed", ("DB", "LB"), "PFR", "low", "", 2, "dtgt", 20, "Yards allowed per target (PFR)"),
    "pd_g": ("Passes defended / game", ("DB", "LB", "DL"), "nflverse weekly", "high", "", 2, "gm", 6, "Passes defended per game"),
}
CAREER_MIN = 2.5


def main():
    players = {p["nfl"]["gsis"]: f"{p['pos']}:{p['n']}" for p in json.loads((ROOT / "data/y80/players.json").read_text()) if p.get("nfl") and p["nfl"].get("gsis")}
    pfr = {r["pfr_id"]: r["gsis_id"] for r in rows("players.csv.gz") if r.get("pfr_id") and r.get("gsis_id")}
    S = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))  # key -> season -> sums

    def add(key, y, **kw):
        s = S[key][y]
        for k, v in kw.items():
            s[k] += v

    for y in range(FIRST, NOW + 1):
        for r in rows(f"stats_player_week_{y}.csv.gz"):
            k = players.get(r["player_id"])
            if not k or r["season_type"] != "REG":
                continue
            att, sk = fl(r["attempts"]), fl(r["sacks_suffered"])
            add(k, y, g=1, att=att, db=att + sk, sacks=sk, epa=fl(r["passing_epa"]), cpoe_w=fl(r["passing_cpoe"]) * att,
                tgt=fl(r["targets"]), rec=fl(r["receptions"]), rec_epa=fl(r["receiving_epa"]), air=fl(r["receiving_air_yards"]), yac=fl(r["receiving_yards_after_catch"]),
                ts_w=fl(r["target_share"]) if fl(r["targets"]) > 0 else 0.0, ts_n=1 if fl(r["targets"]) > 0 else 0,
                wopr_s=fl(r["wopr"]) if fl(r["targets"]) > 0 else 0.0, as_s=fl(r["air_yards_share"]) if fl(r["targets"]) > 0 else 0.0,
                pen=fl(r["penalties"]), qbh=fl(r["def_qb_hits"]), tfl=fl(r["def_tackles_for_loss"]), pd=fl(r["def_pass_defended"]),
                carries=fl(r["carries"]))
    # Next Gen Stats season rows (week 0): weighted by their attempts / targets / carries
    for name, sel in (("ngs_passing.csv.gz", "p"), ("ngs_receiving.csv.gz", "r"), ("ngs_rushing.csv.gz", "u")):
        for r in rows(name):
            k = players.get(r["player_gsis_id"])
            y = int(r["season"])
            if not k or r["week"] != "0" or r["season_type"] != "REG" or y < FIRST:
                continue
            if sel == "p":
                n = fl(r["attempts"])
                add(k, y, ngs_n=n, ttt_w=fl(r["avg_time_to_throw"]) * n, adot_w=fl(r["avg_intended_air_yards"]) * n)
            elif sel == "r":
                n = fl(r["targets"])
                add(k, y, ngsr_n=n, sep_w=fl(r["avg_separation"]) * n, yace_w=fl(r["avg_yac_above_expectation"]) * n)
            else:
                n = fl(r["rush_attempts"])
                add(k, y, ngsu_n=n, ryoe_w=fl(r["rush_yards_over_expected_per_att"]) * n)
    # PFR advanced stats
    for y in range(FIRST, NOW + 1):
        gz = ".gz" if y >= 2024 else ""
        for kind in ("rush", "rec", "def"):
            for r in rows(f"advstats_week_{kind}_{y}.csv{gz}"):
                k = players.get(pfr.get(r["pfr_player_id"], ""))
                if not k or r["game_type"] != "REG":
                    continue
                if kind == "rush":
                    add(k, y, pfr_c=fl(r["carries"]), yco=fl(r["rushing_yards_after_contact"]), brk=fl(r["rushing_broken_tackles"]))
                elif kind == "rec":
                    add(k, y, drops=fl(r["receiving_drop"]), pfr_rec=1)
                else:
                    t = fl(r["def_targets"])
                    add(k, y, pres=fl(r["def_pressures"]), pfr_d=1, miss=fl(r["def_missed_tackles"]), tk=fl(r["def_tackles_combined"]),
                        dtgt=t, dyds=fl(r["def_yards_allowed"]), prw=fl(r["def_passer_rating_allowed"]) * t)
    # snap counts
    for y in range(2013, NOW + 1):
        for r in rows(f"snap_counts_{y}.csv.gz"):
            k = players.get(pfr.get(r["pfr_player_id"], ""))
            if not k or r["game_type"] != "REG" or y < FIRST:
                continue
            pos = k.split(":")[0]
            pct = fl(r["offense_pct"]) if pos in OFF else fl(r["defense_pct"])
            if pct > 0:
                add(k, y, snap_n=1, snap_s=pct, full=1 if (pos == "OL" and pct >= 0.7) else 0)

    def value(mid, s):
        """(value, sample size) from a season's sums, or None."""
        g = lambda k: s.get(k, 0.0)
        if mid == "epa_play":
            return (g("epa") / g("db"), g("db")) if g("db") else None
        if mid == "cpoe":
            return (g("cpoe_w") / g("att"), g("att")) if g("att") else None
        if mid == "sack_rate":
            return (100 * g("sacks") / g("db"), g("db")) if g("db") else None
        if mid == "ttt":
            return (g("ttt_w") / g("ngs_n"), g("ngs_n")) if g("ngs_n") else None
        if mid == "adot_qb":
            return (g("adot_w") / g("ngs_n"), g("ngs_n")) if g("ngs_n") else None
        if mid == "ryoe":
            return (g("ryoe_w") / g("ngsu_n"), g("ngsu_n")) if g("ngsu_n") else None
        if mid == "yac_contact":
            return (g("yco") / g("pfr_c"), g("pfr_c")) if g("pfr_c") else None
        if mid == "broken":
            return (g("brk") / g("pfr_c"), g("pfr_c")) if g("pfr_c") else None
        if mid == "tgt_share":
            return (100 * g("ts_w") / g("ts_n"), g("tgt")) if g("ts_n") else None
        if mid == "rec_epa_tgt":
            return (g("rec_epa") / g("tgt"), g("tgt")) if g("tgt") else None
        if mid == "wopr":
            return (g("wopr_s") / g("ts_n"), g("tgt")) if g("ts_n") else None
        if mid == "air_share":
            return (100 * g("as_s") / g("ts_n"), g("tgt")) if g("ts_n") else None
        if mid == "sep":
            return (g("sep_w") / g("ngsr_n"), g("ngsr_n")) if g("ngsr_n") else None
        if mid == "yac_exp":
            return (g("yace_w") / g("ngsr_n"), g("ngsr_n")) if g("ngsr_n") else None
        if mid == "drop_pct":
            return (100 * g("drops") / g("tgt"), g("tgt")) if g("tgt") and g("pfr_rec") else None
        if mid == "yac_rec":
            return (g("yac") / g("rec"), g("rec")) if g("rec") else None
        if mid == "adot_rec":
            return (g("air") / g("tgt"), g("tgt")) if g("tgt") else None
        if mid == "snap_share":
            return (100 * g("snap_s") / g("snap_n"), g("snap_n")) if g("snap_n") else None
        if mid == "full_games":
            return (g("full"), g("snap_n")) if g("snap_n") else None
        if mid == "pressures_g":
            return (g("pres") / g("pfr_d"), g("pfr_d")) if g("pfr_d") else None
        if mid == "qbhits_g":
            return (g("qbh") / g("g"), g("g")) if g("g") else None
        if mid == "tfl_g":
            return (g("tfl") / g("g"), g("g")) if g("g") else None
        if mid == "missed_pct":
            return (100 * g("miss") / (g("tk") + g("miss")), g("tk")) if g("tk") + g("miss") else None
        if mid == "pr_allowed":
            return (g("prw") / g("dtgt"), g("dtgt")) if g("dtgt") else None
        if mid == "ypt_allowed":
            return (g("dyds") / g("dtgt"), g("dtgt")) if g("dtgt") else None
        if mid == "pd_g":
            return (g("pd") / g("g"), g("g")) if g("g") else None
        return None

    # scopes: each season, and "c" the career 2018-2026
    scopes = defaultdict(dict)  # (scope) -> key -> sums
    for k, ys in S.items():
        tot = defaultdict(float)
        for y, s in ys.items():
            scopes[str(y)][k] = s
            for a, b in s.items():
                tot[a] += b
        scopes["c"][k] = tot
    out = {}
    for scope, byk in scopes.items():
        mult = CAREER_MIN if scope == "c" else 1
        for mid, (_, poss, _, dirn, _, _, _, mn, _) in M.items():
            pool = []
            for k, s in byk.items():
                if k.split(":")[0] not in poss:
                    continue
                v = value(mid, s)
                if v and v[1] >= mn * mult and v[0] == v[0]:
                    pool.append((k.split(":")[0], k, v[0]))
            for pos in poss:
                lst = sorted([x for x in pool if x[0] == pos], key=lambda x: (x[2], x[1]))
                n = len(lst)
                if n < 8:
                    continue
                for i, (_, k, v) in enumerate(lst):
                    # rank 1 = best: high-better ranks from the top, low-better from the bottom; a style trait ranks high-first
                    below = sum(1 for x in lst if x[2] < v)
                    ties = sum(1 for x in lst if x[2] == v)
                    pct = 100 * (below + (ties - 1) / 2) / (n - 1)
                    if dirn == "low":
                        pct = 100 - pct
                    rank = 1 + (sum(1 for x in lst if x[2] < v) if dirn == "low" else sum(1 for x in lst if x[2] > v))
                    out.setdefault(k, {}).setdefault(scope, {})[mid] = [round(v, 4), round(pct, 1), rank, n]
    meta = {m: {"label": t[0], "pos": list(t[1]), "src": t[2], "dir": t[3], "unit": t[4], "dec": t[5], "min": t[7], "desc": t[8]} for m, t in M.items()}
    data = {"v": 1, "first": FIRST, "season": NOW, "careerMin": CAREER_MIN, "metrics": meta, "p": dict(sorted(out.items()))}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"advanced: {len(out)} players, {sum(len(v) for v in out.values())} scopes, {OUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
