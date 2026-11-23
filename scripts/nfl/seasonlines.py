"""Player seasons from the real game logs (data/nfl/games), in Retro Vault's career keys: the season marks of the
record book. Regular season only; a player's season counts when he played 6 or more games."""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAMES = ROOT / "data" / "nfl" / "games"

# Retro Vault key -> game-log columns summed
COLS = {"att": ["attempts"], "cmp": ["completions"], "yds": ["passing_yards"], "td": ["passing_tds"],
        "int": ["passing_interceptions"], "ryds": ["rushing_yards"], "rtd": ["rushing_tds"],
        "rec": ["receptions"], "recyds": ["receiving_yards"], "rectd": ["receiving_tds"],
        "tkl": ["def_tackles_solo", "def_tackle_assists"], "sck": ["def_sacks"], "ff": ["def_fumbles_forced"]}
# a defender's interceptions and a receiver's yards share keys with a passer's: resolve by position
POS_COLS = {
    "QB": {"att": "attempts", "cmp": "completions", "yds": "passing_yards", "td": "passing_tds",
           "int": "passing_interceptions", "ryds": "rushing_yards", "rtd": "rushing_tds"},
    "RB": {"ryds": "rushing_yards", "rtd": "rushing_tds", "rec": "receptions", "recyds": "receiving_yards",
           "rectd": "receiving_tds"},
    "WR": {"rec": "receptions", "yds": "receiving_yards", "td": "receiving_tds"},
    "TE": {"rec": "receptions", "yds": "receiving_yards", "td": "receiving_tds"},
    "OL": {},
    "LB": {"int": "def_interceptions", "sck": "def_sacks", "ff": "def_fumbles_forced"},
    "DB": {"int": "def_interceptions", "sck": "def_sacks", "ff": "def_fumbles_forced"},
    "DL": {"int": "def_interceptions", "sck": "def_sacks", "ff": "def_fumbles_forced"},
}


def season_lines(min_games: int = 6):
    out = []
    for f in sorted(GAMES.glob("*.json")):
        d = json.loads(f.read_text())
        pos, _, name = d["key"].partition(":")
        cols = {c: i for i, c in enumerate(d["cols"])}
        by = defaultdict(list)
        for r in d["games"]:
            if r[cols["type"]] == "REG":
                by[r[cols["season"]]].append(r)
        for y, rows in sorted(by.items()):
            if len(rows) < min_games:
                continue
            line = {"g": len(rows)}
            for k, c in POS_COLS.get(pos, {}).items():
                line[k] = int(round(sum(r[cols[c]] for r in rows)))
            if pos in ("LB", "DB", "DL"):
                line["tkl"] = int(round(sum(r[cols["def_tackles_solo"]] + r[cols["def_tackle_assists"]] for r in rows)))
            out.append((y, pos, name, line))
    return out
