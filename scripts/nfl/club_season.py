#!/usr/bin/env python3
"""NFL edition: public/data/nfl/clubseason/<year>.json, each club's roster for each season (the club season page).

    python3 scripts/nfl/club_season.py

From the weekly lines (data/nfl/games, regular season, nflverse): every player with a game for a club in a season, his
games for that club and his season line for that club. A line key is written only when the player recorded it (missing
stats are skipped, never zero). Also his jersey number that season (the season's roster file, by gsis id), his SZN (the
season rating, scripts/season_ovr.py) and the season awards he won (data/nfl/awards.json: MVP, OPOY, DPOY, OROY, DROY,
SB MVP; AP and Super Bowl MVP voting as Wikipedia lists it). Clubs are keyed by today's abbreviation (OAK = LV ...).
Deterministic.
"""
import csv
import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
GAMES = ROOT / "data" / "nfl" / "games"
OUT = ROOT / "public" / "data" / "nfl" / "clubseason"
ABBR = {"OAK": "LV", "SD": "LAC", "STL": "LAR", "LA": "LAR", "JAC": "JAX", "WSH": "WAS", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU", "SL": "LAR"}
LINE = {  # output key -> game-log columns summed
    "pyds": ["passing_yards"], "ptd": ["passing_tds"], "pint": ["passing_interceptions"], "att": ["attempts"], "cmp": ["completions"],
    "ryds": ["rushing_yards"], "rtd": ["rushing_tds"], "car": ["carries"],
    "rec": ["receptions"], "recyds": ["receiving_yards"], "rectd": ["receiving_tds"],
    "tkl": ["def_tackles_solo", "def_tackle_assists"], "sck": ["def_sacks"], "dint": ["def_interceptions"], "ff": ["def_fumbles_forced"], "pd": ["def_pass_defended"],
    # kickers (owner, 2026-11-25) and returners (punt / kickoff returns and their yards)
    "fgm": ["fg_made"], "fga": ["fg_att"], "xpm": ["pat_made"], "xpa": ["pat_att"],
    "pr": ["punt_returns"], "pry": ["punt_return_yards"], "kr": ["kickoff_returns"], "kry": ["kickoff_return_yards"],
}
AWARD_KEYS = {"mvp": "MVP", "opoy": "OPOY", "dpoy": "DPOY", "oroy": "OROY", "droy": "DROY", "sbmvp": "SB MVP"}


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower().replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", ""))


GSIS = {}  # gsis id -> player key, set by main()
SLOTS_OFF = [("QB", 1), ("RB", 1), ("WR", 2), ("TE", 1)]
SLOTS_DEF = [("DL", 2), ("LB", 2), ("DB", 2)]
SNAP_FROM = 2013  # nflverse snap counts start in 2012 but are complete from 2013
# the busiest-player rank per spot (the rule before snap data): attempts, carries, catches, tackles
BUSY = {
    "QB": lambda r: r.get("att", 0) * 100 + r["g"],
    "RB": lambda r: r.get("car", 0) * 100 + r.get("ryds", 0) / 100,
    "WR": lambda r: r.get("rec", 0) * 100 + r.get("recyds", 0) / 100,
    "TE": lambda r: r.get("rec", 0) * 100 + r.get("recyds", 0) / 100,
    "DL": lambda r: r.get("tkl", 0) * 100 + r.get("sck", 0),
    "LB": lambda r: r.get("tkl", 0) * 100 + r.get("sck", 0),
    "DB": lambda r: r.get("tkl", 0) * 100 + r.get("dint", 0),
}


def snap_totals(players_by_gsis):
    """(season, club) -> {player key: [offense snaps, defense snaps]}, from the regular-season snap counts (2013 on).
    A snap row is matched by PFR id -> gsis id -> key, else by normalised name within that club's season roster."""
    pfr = {}
    for r in csv.DictReader(gzip.open(ROOT / "data" / "nfl-cache" / "players.csv.gz", "rt")):
        if r.get("pfr_id") and r.get("gsis_id") in players_by_gsis:
            pfr[r["pfr_id"]] = players_by_gsis[r["gsis_id"]]
    raw = defaultdict(lambda: defaultdict(lambda: [0, 0, None]))  # (season, club) -> (pfr id, name) -> [off, def]
    out = {}
    for f in sorted((ROOT / "data" / "nfl-cache").glob("snap_counts_*.csv.gz")):
        for r in csv.DictReader(gzip.open(f, "rt")):
            if r["game_type"] != "REG" or int(r["season"]) < SNAP_FROM:
                continue
            a = raw[(int(r["season"]), ABBR.get(r["team"], r["team"]))][(r["pfr_player_id"], r["player"])]
            a[0] += int(float(r["offense_snaps"] or 0))
            a[1] += int(float(r["defense_snaps"] or 0))
    return pfr, raw


def depth_starters(gsis_key):
    """club -> {site pos: [keys, the depth chart's first string, best first]} from the latest depth-chart snapshot"""
    f = ROOT / "data" / "nfl-cache" / "depth_charts_2026.csv.gz"
    if not f.exists():
        return 0, {}
    rows = list(csv.DictReader(gzip.open(f, "rt")))
    at = max(r["dt"] for r in rows)
    out = defaultdict(lambda: defaultdict(list))
    for r in sorted((r for r in rows if r["dt"] == at), key=lambda r: (int(r["pos_rank"]), int(r["pos_slot"] or 0))):
        k = gsis_key.get(r["gsis_id"])
        if not k or int(r["pos_rank"]) > (2 if r["pos_abb"] == "WR" else 1):
            continue
        # the base formation lists a player once per slot; both bases are kept, the site position decides the spot
        if k not in out[ABBR.get(r["team"], r["team"])][k.partition(":")[0]]:
            out[ABBR.get(r["team"], r["team"])][k.partition(":")[0]].append(k)
    return 2026, out


def depth_weeks(year, gsis_key):
    """club -> {player key: [weeks listed first, same]} from the weekly depth charts (nflverse, 2001-2012), regular season"""
    f = ROOT / "data" / "nfl-cache" / f"depth_charts_{year}.csv"
    if not f.exists():
        return {}
    seen = defaultdict(lambda: defaultdict(set))
    for r in csv.DictReader(open(f, newline="")):
        if r["game_type"] == "REG" and r["depth_team"] == "1":
            seen[ABBR.get(r["club_code"], r["club_code"])][(r["gsis_id"], r["full_name"])].add(r["week"])
    return {c: {k: len(w) for k, w in d.items()} for c, d in seen.items()}


def lineup_for(rows, snaps, pfr, depth=None, weeks=None):
    """One club-season's starters: {"m": "snaps" | "weeks" | "depth" | "busiest", "k": [keys in spot order]}"""
    by_key = {r["k"]: r for r in rows}
    by_name = defaultdict(list)
    for r in rows:
        by_name[norm(r["k"].partition(":")[2])].append(r["k"])
    use = None
    if snaps:
        tot = defaultdict(lambda: [0, 0])
        for (pid, name), (o, d, _) in snaps.items():
            k = pfr.get(pid)
            if k not in by_key:
                c = [x for x in by_name.get(norm(name), []) if x in by_key]
                k = c[0] if len(c) == 1 else None
            if k in by_key:
                tot[k][0] += o
                tot[k][1] += d
        use = tot
    method = "snaps" if use and sum(v[0] + v[1] for v in use.values()) > 0 else "busiest"
    if method == "busiest" and weeks:
        wk = defaultdict(lambda: [0, 0])
        for (gid, name), n in weeks.items():
            k = GSIS.get(gid)
            if k not in by_key:
                c = [x for x in by_name.get(norm(name), []) if x in by_key]
                k = c[0] if len(c) == 1 else None
            if k in by_key:
                wk[k][0] += n
                wk[k][1] += n
        use, method = wk, "weeks"
    keys = []
    for slots, side in ((SLOTS_OFF, 0), (SLOTS_DEF, 1)):
        for pos, n in slots:
            cand = [r for r in rows if r["k"].partition(":")[0] == pos and r["g"] > 0]
            if method in ("snaps", "weeks"):
                cand = [r for r in cand if use.get(r["k"], [0, 0])[side] > 0]
                cand.sort(key=lambda r: (-use[r["k"]][side], -r["g"], r["k"]))
            else:
                cand = [r for r in cand if BUSY[pos](r) > 0]
                cand.sort(key=lambda r: (-BUSY[pos](r), -r["g"], r["k"]))
            picks = []
            if depth:  # the live season: the depth chart's first string first, then the snap leaders
                have = {r["k"]: r for r in cand}
                picks = [have[k] for k in depth.get(pos, []) if k in have][:n]
            picks += [r for r in cand if r not in picks]
            keys += [r["k"] for r in picks[:n]]
    if depth:
        method = "depth"
    return {"m": method, "k": keys}


def special_teams(gsis_key):
    """season -> club -> the club's special teams, from every kicker's and returner's weekly line (not only the site's pool):
    fg [made, attempts], b [[made, attempts] x 3 for 0-39, 40-49, 50+], long, xp [made, attempts], rk / of (the club's FG % among
    the clubs with an attempt, 1 = best, ties share), k (the kicker with the most attempts, by his key), ret (the leading returner by
    punt + kickoff return yards who has a card: key, kr, kry, pr, pry). Regular season."""
    out = {}
    for y in range(1999, 2027):
        f = ROOT / "data" / "nfl-cache" / f"stats_player_week_{y}.csv.gz"
        if not f.exists():
            continue
        clubs = defaultdict(lambda: {"fg": [0, 0], "b": [[0, 0], [0, 0], [0, 0]], "long": 0, "xp": [0, 0], "kick": defaultdict(int), "ret": defaultdict(lambda: [0, 0, 0, 0])})
        for r in csv.DictReader(gzip.open(f, "rt")):
            if r["season_type"] != "REG":
                continue
            c = clubs[ABBR.get(r["team"], r["team"])]
            fl = lambda k: float(r.get(k) or 0)
            if r["position"] == "K":
                c["fg"][0] += int(fl("fg_made")); c["fg"][1] += int(fl("fg_att"))
                c["xp"][0] += int(fl("pat_made")); c["xp"][1] += int(fl("pat_att"))
                c["long"] = max(c["long"], int(fl("fg_long")))
                c["kick"][r["player_id"]] += int(fl("fg_att"))
                for i, bs in enumerate((("0_19", "20_29", "30_39"), ("40_49",), ("50_59", "60_"))):
                    m = sum(int(fl(f"fg_made_{b}")) for b in bs)
                    c["b"][i][0] += m
                    c["b"][i][1] += m + sum(int(fl(f"fg_missed_{b}")) for b in bs)
            if r["player_id"] in gsis_key and (fl("punt_returns") or fl("kickoff_returns")):
                a = c["ret"][r["player_id"]]
                a[0] += int(fl("kickoff_returns")); a[1] += int(fl("kickoff_return_yards"))
                a[2] += int(fl("punt_returns")); a[3] += int(fl("punt_return_yards"))
        pct = {t: c["fg"][0] / c["fg"][1] for t, c in clubs.items() if c["fg"][1]}
        res = {}
        for t, c in sorted(clubs.items()):
            row = {}
            if c["fg"][1]:
                row.update(fg=c["fg"], b=c["b"], long=c["long"], xp=c["xp"], rk=1 + sum(1 for v in pct.values() if v > pct[t]), of=len(pct))
                top = max(c["kick"].items(), key=lambda kv: (kv[1], kv[0]))[0]
                if top in gsis_key:
                    row["k"] = gsis_key[top]
            if c["ret"]:
                g, a = max(c["ret"].items(), key=lambda kv: (kv[1][1] + kv[1][3], kv[0]))
                if a[1] + a[3] > 0:
                    row["ret"] = {"k": gsis_key[g], "kr": a[0], "kry": a[1], "pr": a[2], "pry": a[3]}
            if row:
                res[t] = row
        out[y] = res
    return out


def main():
    import season_ovr
    sovr = season_ovr.history_ratings()
    players = {f"{p['pos']}:{p['n']}": p for p in json.loads((ROOT / "data" / "y80" / "players.json").read_text())}
    gsis_key = {p["nfl"]["gsis"]: k for k, p in players.items() if (p.get("nfl") or {}).get("gsis")}
    pfr, snap_raw = snap_totals({g: k for g, k in gsis_key.items()})
    GSIS.update(gsis_key)
    depth_year, depth = depth_starters(gsis_key)
    awards = json.loads((ROOT / "data" / "nfl" / "awards.json").read_text())["awards"]
    won = defaultdict(list)  # (season, normalised name) -> labels
    for kind, lab in AWARD_KEYS.items():
        for a in awards.get(kind, []):
            won[(int(a["season"]), norm(a["player"]))].append(lab)
    numbers = {}  # (season, gsis, club) -> jersey number
    for f in sorted((ROOT / "data" / "nfl-cache").glob("roster_*.csv")):
        for r in csv.DictReader(open(f, newline="")):
            n = r.get("jersey_number")
            if n and n.isdigit():
                numbers[(int(r["season"]), r["gsis_id"], ABBR.get(r["team"], r["team"]))] = int(n)
    by = defaultdict(lambda: defaultdict(list))  # season -> club -> rows
    for f in sorted(GAMES.glob("*.json")):
        d = json.loads(f.read_text())
        key = d["key"]
        if key not in players:
            continue
        pos, _, name = key.partition(":")
        cols = {c: i for i, c in enumerate(d["cols"])}
        grp = defaultdict(list)
        for g in d["games"]:
            if g[cols["type"]] == "REG":
                grp[(g[cols["season"]], ABBR.get(g[cols["team"]], g[cols["team"]]))].append(g)
        gsis = (players[key].get("nfl") or {}).get("gsis")
        for (y, club), rows in grp.items():
            line = {}
            for k, cs in LINE.items():
                if all(c in cols for c in cs):
                    v = sum((r[cols[c]] or 0) for r in rows for c in cs)
                    if v:
                        line[k] = int(round(v)) if k != "sck" else round(v, 1)
            row = {"k": key, "g": len(rows)}
            row.update(line)
            s = sovr.get(y, {}).get(key)
            if s is not None:
                row["szn"] = s
            n = numbers.get((y, gsis, club))
            if n is not None:
                row["no"] = n
            a = won.get((y, norm(name)))
            if a:
                row["aw"] = a
            by[y][club].append(row)
    st = special_teams(gsis_key)
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    total = 0
    for y in sorted(by):
        clubs = {c: sorted(rs, key=lambda r: (-r.get("szn", -1), -r["g"], r["k"])) for c, rs in sorted(by[y].items())}
        weeks = depth_weeks(y, gsis_key) if 2001 <= y < SNAP_FROM else {}
        lineups = {c: lineup_for(rs, snap_raw.get((y, c)) if y >= SNAP_FROM else None, pfr, depth.get(c) if y == depth_year else None, weeks.get(c)) for c, rs in clubs.items()}
        text = json.dumps({"season": y, "clubs": clubs, "lineups": lineups, **({"st": st[y]} if st.get(y) else {})}, separators=(",", ":"), ensure_ascii=False)
        (OUT / f"{y}.json").write_text(text)
        total += len(text)
    print(f"club seasons: {len(by)} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
