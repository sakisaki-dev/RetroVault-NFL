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
}
AWARD_KEYS = {"mvp": "MVP", "opoy": "OPOY", "dpoy": "DPOY", "oroy": "OROY", "droy": "DROY", "sbmvp": "SB MVP"}


def norm(s):
    return re.sub(r"[^a-z]", "", s.lower().replace(" jr.", "").replace(" sr.", "").replace(" ii", "").replace(" iii", ""))


def main():
    import season_ovr
    sovr = season_ovr.history_ratings()
    players = {f"{p['pos']}:{p['n']}": p for p in json.loads((ROOT / "data" / "y80" / "players.json").read_text())}
    gsis_key = {p["nfl"]["gsis"]: k for k, p in players.items() if (p.get("nfl") or {}).get("gsis")}
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
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.json"):
        old.unlink()
    total = 0
    for y in sorted(by):
        clubs = {c: sorted(rs, key=lambda r: (-r.get("szn", -1), -r["g"], r["k"])) for c, rs in sorted(by[y].items())}
        text = json.dumps({"season": y, "clubs": clubs}, separators=(",", ":"), ensure_ascii=False)
        (OUT / f"{y}.json").write_text(text)
        total += len(text)
    print(f"club seasons: {len(by)} files, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
