#!/usr/bin/env python3
"""NFL edition: league leaders, awards, black ink and streaks for every season 1999-2026 (regular season).

    python3 scripts/nfl/season_boards.py

From the weekly nflverse player lines (data/nfl-cache/stats_player_week_<year>.csv.gz: every player of every season, not
only the site's pool) and data/nfl/awards.json (the AP awards and Super Bowl MVPs, scripts/nfl/fetch_awards.py).
Missing stats are skipped, never zeroed: a player with no line has no row. Output, all under public/data/nfl/:

  seasons/<year>.json  {season, complete, leaders: {<stat>: [[key|null, name, pos, club abbr, value, games] x5]},
                        awards: {mvp|opoy|dpoy|oroy|droy|cpoy|sbmvp: [{n, k, pos, team}]}}
  honours.json         {kinds, awards: {<year>: {<kind>: [{n, k, pos, team}]}}}  every AP award and Super Bowl MVP since 1957
  ink.json             {stats, from, last, players: {key: {<stat>: [years led]}}}    black ink: seasons a player led
                       the league in a headline stat (ties share the lead; the season in progress never counts)
  streaks.json         {thresholds, last, longest, most, runs}   runs of straight seasons over a mark, and seasons over

HEADLINE STATS (black ink, boards, one list for the whole site: src/utils/blackInk.ts reads the same ids):
  pyds passing yards, ptd passing TD, ryds rushing yards, rtd rushing TD, rec receptions, recyds receiving yards,
  rectd receiving TD, tkl tackles (solo + assists), sck sacks, int interceptions. League-wide, any position.
STREAK MARKS: 4,000 pass yds, 30 pass TD, 1,000 rush yds, 1,000 rec yds, 100 rec, 10 sacks, 100 tackles, 5 INT.
Completed seasons only for ink and streaks; a run is "alive" when it reaches the latest completed season.
Deterministic.
"""
import csv
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from game_stars import ALIAS, SITE_POS, site_keys  # noqa: E402

ROOT = HERE.parents[1]
CACHE = ROOT / "data" / "nfl-cache"
OUT = ROOT / "public" / "data" / "nfl"
FIRST, LAST = 1999, 2026

STATS = [  # id, label, columns summed
    ("pyds", "Passing yards", ["passing_yards"]), ("ptd", "Passing TD", ["passing_tds"]),
    ("ryds", "Rushing yards", ["rushing_yards"]), ("rtd", "Rushing TD", ["rushing_tds"]),
    ("rec", "Receptions", ["receptions"]), ("recyds", "Receiving yards", ["receiving_yards"]),
    ("rectd", "Receiving TD", ["receiving_tds"]),
    ("tkl", "Tackles", ["def_tackles_solo", "def_tackle_assists"]), ("sck", "Sacks", ["def_sacks"]),
    ("int", "Interceptions", ["def_interceptions"]),
]
MARKS = [("pyds", 4000, "4,000 pass yds"), ("ptd", 30, "30 pass TD"), ("ryds", 1000, "1,000 rush yds"),
         ("recyds", 1000, "1,000 rec yds"), ("rec", 100, "100 rec"), ("sck", 10, "10 sacks"),
         ("tkl", 100, "100 tackles"), ("int", 5, "5 INT")]
AWARDS = ["mvp", "opoy", "dpoy", "oroy", "droy", "cpoy", "sbmvp"]


def num(r, c):
    try:
        return float(r[c] or 0)
    except (KeyError, ValueError):
        return 0.0


def main():
    by_gsis, bare = site_keys()
    pj = json.loads((ROOT / "data" / "y80" / "players.json").read_text())
    have = {f"{p['pos']}:{p['n']}" for p in pj}
    name_pos = {}
    for k in have:
        name_pos.setdefault(k.split(":", 1)[1], []).append(k)

    # ---- aggregate every player-season ----
    seasons = {}
    for y in range(FIRST, LAST + 1):
        f = CACHE / f"stats_player_week_{y}.csv.gz"
        if not f.exists():
            continue
        agg = {}
        for r in csv.DictReader(gzip.open(f, "rt")):
            if r["season_type"] != "REG":
                continue
            a = agg.setdefault(r["player_id"], {"name": r["player_display_name"], "pos": r["position"], "games": set(),
                                               "club": defaultdict(int), "v": defaultdict(float)})
            a["games"].add(r["game_id"])
            a["club"][ALIAS.get(r["team"], r["team"])] += 1
            for sid, _, cs in STATS:
                a["v"][sid] += sum(num(r, c) for c in cs)
        seasons[y] = agg

    def key_of(pid, a):
        k = by_gsis.get(pid)
        if k:
            return k
        pos = SITE_POS.get(a["pos"])
        k = f"{pos}:{a['name']}" if pos else None
        return k if k in have else bare.get(k) if k else None

    def ident(pid, a):
        """the site's key if he has a card, else a POS:Name of his own (same shape, no card behind it)"""
        k = key_of(pid, a)
        if k:
            return k, True
        return f"{SITE_POS.get(a['pos'], a['pos'])}:{a['name']}", False

    def club_of(a):
        return sorted(a["club"].items(), key=lambda kv: (-kv[1], kv[0]))[0][0]

    last_done = max(y for y in seasons if y < LAST)  # the season in progress never counts for ink or streaks
    # a season is complete when the Super Bowl is in
    sb_years = {c["season"] for c in json.loads((ROOT / "data" / "nfl" / "awards.json").read_text())["champions"]}
    complete = {y: y in sb_years for y in seasons}
    last_done = max(y for y, c in complete.items() if c)

    awards = json.loads((ROOT / "data" / "nfl" / "awards.json").read_text())["awards"]

    def award_key(name, pos):
        sp = SITE_POS.get(pos)
        cands = name_pos.get(name, [])
        for k in cands:
            if k.startswith((sp or "?") + ":"):
                return k
        return cands[0] if len(cands) == 1 and not sp else None

    (OUT / "seasons").mkdir(parents=True, exist_ok=True)
    hon = defaultdict(dict)
    for kind in AWARDS:
        for x in awards.get(kind, []):
            hon[str(x["season"])].setdefault(kind, []).append(
                {"n": x["player"], "k": award_key(x["player"], x["position"]), "pos": x["position"], "team": x["team"]})
    (OUT / "honours.json").write_text(json.dumps(
        {"_about": "AP awards and Super Bowl MVPs by season (data/nfl/awards.json, Wikipedia); k = the site's player key when he has a card.",
         "kinds": AWARDS, "awards": {y: hon[y] for y in sorted(hon)}}, separators=(",", ":"), ensure_ascii=False) + "\n")
    ink = defaultdict(lambda: defaultdict(list))
    player_season = defaultdict(dict)   # key -> year -> {stat: v, club}
    names = {}
    for y, agg in seasons.items():
        leaders = {}
        for sid, _, _ in STATS:
            rows = [(pid, a) for pid, a in agg.items() if a["v"][sid] > 0]
            rows.sort(key=lambda t: (-t[1]["v"][sid], len(t[1]["games"]), t[1]["name"]))
            top = []
            for pid, a in rows[:5]:
                k, card = ident(pid, a)
                v = a["v"][sid]
                top.append([k if card else None, a["name"], SITE_POS.get(a["pos"], a["pos"]), club_of(a),
                            int(v) if v == int(v) else round(v, 1), len(a["games"])])
            leaders[sid] = top
            if complete[y] and rows:
                best = rows[0][1]["v"][sid]
                for pid, a in rows:
                    if a["v"][sid] != best:
                        break
                    ink[ident(pid, a)[0]][sid].append(y)
        aw = {}
        for kind in AWARDS:
            lst = []
            for x in awards.get(kind, []):
                if x["season"] == y:
                    lst.append({"n": x["player"], "k": award_key(x["player"], x["position"]), "pos": x["position"], "team": x["team"]})
            if lst:
                aw[kind] = lst
        (OUT / "seasons" / f"{y}.json").write_text(json.dumps(
            {"season": y, "complete": complete[y], "leaders": leaders, "awards": aw}, separators=(",", ":"), ensure_ascii=False) + "\n")
        if complete[y]:
            for pid, a in agg.items():
                k, _ = ident(pid, a)
                names[k] = a["name"]
                player_season[k][y] = {"club": club_of(a), "v": {sid: a["v"][sid] for sid, _, _ in STATS}}

    ink_out = {k: {s: ys for s, ys in sorted(d.items())} for k, d in sorted(ink.items())}
    (OUT / "ink.json").write_text(json.dumps(
        {"_about": "Black ink: seasons a player led the league in a headline stat (regular season, ties share). "
                   "Stat ids and labels in `stats`; the season in progress never counts.",
         "stats": {sid: label for sid, label, _ in STATS}, "last": last_done, "players": ink_out},
        separators=(",", ":"), ensure_ascii=False) + "\n")

    # ---- streaks ----
    runs, longest, most = [], {}, {}
    thresholds = []
    for sid, mark, label in MARKS:
        tid = f"{sid}{mark}"
        thresholds.append({"id": tid, "stat": sid, "mark": mark, "label": label})
        per = []   # (key, [years over])
        for k, ys in player_season.items():
            over = sorted(y for y, d in ys.items() if d["v"][sid] >= mark)
            if over:
                per.append((k, over))
        found = []
        for k, over in per:
            start = prev = None
            for y in over + [None]:
                if start is not None and (y is None or y != prev + 1):
                    found.append((k, start, prev))
                    start = None
                if y is not None:
                    if start is None:
                        start = y
                    prev = y
        for k, s, e in found:
            if e - s + 1 >= 2:
                runs.append([tid, k, s, e, [player_season[k][y]["club"] for y in range(s, e + 1)]])
        found.sort(key=lambda t: (-(t[2] - t[1]), -t[2], t[0]))
        longest[tid] = [{"k": k, "n": names[k], "from": s, "to": e, "len": e - s + 1, "alive": e == last_done,
                         "clubs": [player_season[k][y]["club"] for y in range(s, e + 1)]} for k, s, e in found[:10]]
        per.sort(key=lambda t: (-len(t[1]), -t[1][-1], t[0]))
        most[tid] = [{"k": k, "n": names[k], "seasons": len(ys), "from": ys[0], "to": ys[-1], "alive": ys[-1] == last_done}
                     for k, ys in per[:10]]
    runs.sort(key=lambda r: (r[0], r[1], r[2]))
    (OUT / "streaks.json").write_text(json.dumps(
        {"_about": "Runs of straight completed seasons over a mark (regular season). `runs` lists every run of 2+ seasons: "
                   "[mark id, key, first, last, club abbr per season]; alive = reaches `last`.",
         "last": last_done, "thresholds": thresholds, "longest": longest, "most": most, "runs": runs},
        separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"season_boards: {len(seasons)} seasons, ink for {len(ink_out)} players, {len(runs)} runs, last complete {last_done}")


if __name__ == "__main__":
    main()
