#!/usr/bin/env python3
"""SZN: a player's rating for ONE season, NFL edition (owner, 2026-11-23: "the OVR represents the current season", plus
a SZN for every past season for the career graphs). A rule over the real data, no AI, and no Retro Bowl in-game
ratings anywhere.

A season line is the sum of his regular-season game lines for that year (data/nfl/games, nflverse weekly stats).
  production  the League Score formula (data/y80/formula/ovr.py `score`) on the season line, taken at a 17-game pace
              (per-game rate x 17), awards left out (a season has none yet)
  efficiency  QB: + 1.0 per game of passing EPA; RB / WR / TE: + 0.6 per game of rushing + receiving EPA
  playing time  snap share (nflverse snap counts, 2013 on: the average share of the offensive or defensive snaps in the
              games he played; earlier seasons count as full) scales his sample: effective games = games x min(1,
              share / 0.6). A back-up who barely plays has few effective games
  small samples  adj = prior + (pace - prior) x min(1, effective games / SHRINK_GAMES): few effective games pull him
              toward the position's FLOOR (its 5th percentile pace), never toward the average, so two good games do not make
              a 99 and a bench player rates at the bottom
  kickers     K: production = points scored (3 / 4 / 5 a field goal by distance, 1 an extra point) / 4; efficiency = 3 per field
              goal above the average kicker of that season from the same distances + 0.5 per extra point above the season's
              rate (data/nfl/kick_rates.json), per game; snap share does not apply (no snaps for a kicker: full)
  no signal   OL (no blocking stats in the data) get no SZN at all: null, the site shows OVR
  rating      OVR = round(62 + 37 x pct ** 2.3), pct = his adj's rank within his position among everyone with a game that
              season (about 10% reach 90). Players with no game that season have no line (the site then shows CAR).
Only players in players.json are rated, so a past season is ranked among the players the site holds (the 1999-and-later
extension will widen it). CAR (the career rating) is src/config/ovr.ts officialOvrMap and is untouched.

Writes public/data/league/season_ovr.json: the current season's ratings plus `lines` (his 2026 line in Player fields for
the Deep Dive's "This season" skill grades). career_seasons.py adds each season's rating to its rows (`sovr`).
"""
from __future__ import annotations

import csv
import gzip
import json
from collections import defaultdict
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "nfl"))
import kick_common as kc  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "league" / "season_ovr.json"
CACHE = ROOT / "data" / "nfl-cache"
NOW = 2026
SHRINK_GAMES = 10
PACE = 17
OFF = ("QB", "RB", "WR", "TE", "OL")
# Positions whose season line carries no stat signal at all (nflverse has no blocking stats): a season there has no
# SZN (null, the site falls back to OVR), never a rating built on games alone ("missing stats are skipped, never zero").
UNRATED = ("OL",)

FIELD_MAP = {
    "QB": {"g": "games", "att": "attempts", "cmp": "completions", "yds": "passYds", "td": "passTD", "int": "interceptions", "sck": "sacks", "ratt": "rushAtt", "ryds": "rushYds", "rtd": "rushTD"},
    "RB": {"g": "games", "ratt": "rushAtt", "ryds": "rushYds", "rtd": "rushTD", "fum": "fumbles", "rec": "receptions", "recyds": "recYds", "rectd": "recTD"},
    "REC": {"g": "games", "rec": "receptions", "yds": "recYds", "td": "recTD", "fum": "fumbles", "lng": "longest"},
    "OL": {"g": "games", "blk": "blocks"},
    "DEF": {"g": "games", "tkl": "tackles", "int": "interceptions", "sck": "sacks", "ff": "forcedFumbles"},
    "K": {"g": "games", "fgm": "fgMade", "fga": "fgAtt", "fgm39": "fgMade39", "fga39": "fgAtt39", "fgm49": "fgMade49", "fga49": "fgAtt49",
          "fgm50": "fgMade50", "fga50": "fgAtt50", "xpm": "xpMade", "xpa": "xpAtt", "lng": "longest"},
}


def _group(pos):
    return pos if pos == "K" else "REC" if pos in ("WR", "TE") else "DEF" if pos in ("LB", "DB", "DL") else pos


def line_of(pos, rows, cols):
    """The season line in players.json keys from a player's game rows."""
    c = {n: i for i, n in enumerate(cols)}
    t = lambda n: sum((r[c[n]] or 0) for r in rows) if n in c else 0
    g = len(rows)
    if pos == "QB":
        return {"g": g, "att": t("attempts"), "cmp": t("completions"), "yds": t("passing_yards"), "td": t("passing_tds"), "int": t("passing_interceptions"), "sck": t("sacks_suffered"), "ratt": t("carries"), "ryds": t("rushing_yards"), "rtd": t("rushing_tds")}
    if pos == "RB":
        return {"g": g, "ratt": t("carries"), "ryds": t("rushing_yards"), "rtd": t("rushing_tds"), "fum": t("fumbles_lost_total"), "rec": t("receptions"), "recyds": t("receiving_yards"), "rectd": t("receiving_tds")}
    if pos in ("WR", "TE"):
        return {"g": g, "rec": t("receptions"), "yds": t("receiving_yards"), "td": t("receiving_tds"), "fum": t("fumbles_lost_total")}
    if pos == "OL":
        return {"g": g}
    if pos == "K":
        made, att, xm, xa = kc.season_bands(rows, cols)
        s_ = lambda d, bs: sum(d.get(b, 0) for b in bs)
        return {"g": g, "fgm": t("fg_made"), "fga": t("fg_att"), "fgm39": s_(made, ("0_19", "20_29", "30_39")), "fga39": s_(att, ("0_19", "20_29", "30_39")),
                "fgm49": s_(made, ("40_49",)), "fga49": s_(att, ("40_49",)), "fgm50": s_(made, ("50_59", "60_")), "fga50": s_(att, ("50_59", "60_")),
                "xpm": xm, "xpa": xa, "lng": max((r[c["fg_long"]] or 0 for r in rows), default=0) or None}
    return {"g": g, "tkl": t("def_tackles_solo") + t("def_tackle_assists"), "int": t("def_interceptions"), "sck": t("def_sacks"), "ff": t("def_fumbles_forced")}


def production(pos, p):
    g = lambda k: p.get(k) or 0
    if pos == "QB":
        return g("yds") / 80 + 0.9 * g("td") + 0.9 * g("rtd") - 0.6 * g("int")
    if pos == "RB":
        return g("ryds") / 18 + 2.2 * g("rtd") + g("recyds") / 30 + 2.2 * g("rectd")
    if pos in ("WR", "TE"):
        return g("yds") / (14 if pos == "WR" else 8) + (2.5 if pos == "WR" else 3) * g("td")
    if pos == "OL":
        return 2 * g("g")
    if pos == "K":
        # points scored over four: the volume a kicker brings (the accuracy part is efficiency() below)
        return kc.points(g("fgm39"), g("fgm49"), g("fgm50"), g("xpm")) / 4
    return 0.7 * g("tkl") + 12 * g("int") + 14 * g("sck") + 14 * g("ff")


def efficiency(pos, rows, cols):
    c = {n: i for i, n in enumerate(cols)}
    t = lambda n: sum((r[c[n]] or 0) for r in rows) if n in c else 0
    if pos == "QB":
        return 1.0 * t("passing_epa") / max(1, len(rows))
    if pos in ("RB", "WR", "TE"):
        return 0.6 * (t("rushing_epa") + t("receiving_epa")) / max(1, len(rows))
    if pos == "K":
        # accuracy: 3 per field goal made above what the season's average kicker makes from the same distances, 0.5 per
        # extra point above the season's rate (kick_common.py); none when the season has no baseline
        made, att, xm, xa = kc.season_bands(rows, cols)
        y = rows[0][c["season"]] if "season" in c else rows[0][0]
        fo, xo = kc.fg_over_expected(y, made, att), kc.xp_over_expected(y, xm, xa)
        return (3 * (fo or 0) + 0.5 * (xo or 0)) / max(1, len(rows))
    return 0.0


_cache = {}


def _load():
    if _cache:
        return _cache
    players = {f"{p['pos']}:{p['n']}": p for p in json.loads((ROOT / "data/y80/players.json").read_text())}
    logs = defaultdict(lambda: defaultdict(list))  # key -> season -> rows
    colsby = {}
    for f in sorted((ROOT / "data/nfl/games").glob("*.json")):
        d = json.loads(f.read_text())
        if d["key"] not in players:
            continue
        colsby[d["key"]] = d["cols"]
        for g in d["games"]:
            if g[2] == "REG":
                logs[d["key"]][g[0]].append(g)
    # snap share by (gsis, season): the mean share over the games he played
    pfr = {}
    for r in csv.DictReader(gzip.open(CACHE / "players.csv.gz", "rt")):
        if r.get("pfr_id") and r.get("gsis_id"):
            pfr[r["pfr_id"]] = r["gsis_id"]
    gsis_key = {p["nfl"]["gsis"]: k for k, p in players.items() if p.get("nfl") and p["nfl"].get("gsis")}
    snap = defaultdict(list)
    for y in range(2013, NOW + 1):
        f = CACHE / f"snap_counts_{y}.csv.gz"
        if not f.exists():
            continue
        for r in csv.DictReader(gzip.open(f, "rt")):
            if r["game_type"] != "REG":
                continue
            k = gsis_key.get(pfr.get(r["pfr_player_id"], ""))
            if not k:
                continue
            pct = float(r["offense_pct"] or 0) if k.split(":")[0] in OFF else float(r["defense_pct"] or 0)
            if pct > 0:
                snap[(k, y)].append(pct)
    _cache.update(players=players, logs=logs, cols=colsby, snap={k: sum(v) / len(v) for k, v in snap.items()})
    return _cache


def rate_season(year):
    """{key: (OVR, line)} for every player with a game in `year`."""
    d = _load()
    rows = []
    for k, seasons in d["logs"].items():
        gs = seasons.get(year)
        if not gs:
            continue
        pos = k.split(":")[0]
        line = line_of(pos, gs, d["cols"][k])
        n = len(gs)
        pace = (production(pos, line) + efficiency(pos, gs, d["cols"][k]) * n) / n * PACE
        share = d["snap"].get((k, year), 1.0 if year < 2013 else 0.0) if year >= 2013 else 1.0
        eff = n * min(1.0, share / 0.6) if year >= 2013 and pos != "K" else n   # a kicker has no snap share: every game counts
        rows.append((k, pos, line, pace, eff))
    out = {}
    by = defaultdict(list)
    for r in rows:
        if r[1] not in UNRATED:
            by[r[1]].append(r)
    for pos, lst in by.items():
        paces = sorted(r[3] for r in lst)
        prior = paces[int(0.05 * (len(paces) - 1))]
        adj = {r[0]: prior + (r[3] - prior) * min(1.0, r[4] / SHRINK_GAMES) for r in lst}
        order = sorted(adj, key=lambda k: (adj[k], k))
        n = len(order)
        for i, k in enumerate(order):
            pct = i / (n - 1) if n > 1 else 1
            out[k] = round(62 + 37 * pct ** 2.3)
    lines = {r[0]: r[2] for r in rows}
    res = {k: (v, lines[k]) for k, v in out.items()}
    res.update({k: (None, lines[k]) for k in lines if k.split(':')[0] in UNRATED})
    return res


def history_ratings():
    """{season: {key: season OVR}} for every completed season of the data (1999-2025)."""
    d = _load()
    years = sorted({y for s in d["logs"].values() for y in s if y <= NOW})
    return {y: {k: v[0] for k, v in rate_season(y).items() if v[0] is not None} for y in years}


def live_ratings():
    r = rate_season(NOW)
    return (NOW, {k: v[0] for k, v in r.items() if v[0] is not None}) if r else None


def lines_for_skills():
    r = rate_season(NOW)
    out = {}
    for k, (_, line) in r.items():
        m = FIELD_MAP[_group(k.split(":")[0])]
        out[k] = {m[f]: v for f, v in line.items() if f in m}
    return "games", dict(sorted(out.items()))


def main():
    y, ovr = live_ratings() or (NOW, {})
    source, lines = lines_for_skills()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"season": y, "live": True, "shrinkGames": SHRINK_GAMES, "ovr": dict(sorted(ovr.items())), "linesFrom": source, "lines": lines}, ensure_ascii=False, separators=(",", ":")) + "\n")
    vals = sorted(ovr.values())
    print(f"season_ovr: {y}, {len(ovr)} players rated, {sum(1 for v in vals if v >= 90)} at 90+ ({100 * sum(1 for v in vals if v >= 90) / max(1, len(vals)):.0f}%)")


if __name__ == "__main__":
    main()
