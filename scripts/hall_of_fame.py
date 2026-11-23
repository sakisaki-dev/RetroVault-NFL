"""The Hall of Fame and the clubs' Rings of Honor (owner, Y92: "about 20-25, bar 65", "retired only", "ring of honor
yes", "every member is now treated as completely new if they fit they fit").

A rule over the data, no AI and no hand-picked names:

- Only retired players are eligible. A player's case is frozen the season he last played (the end-of-season market
  snapshot where his games last went up; a player already retired when first recorded freezes at his first snapshot),
  so a later upload can't move a retired player in or out.
- Hall of Fame Score, 0-100, from that frozen snapshot:
    standing  up to 60  his rank by Career Legacy among every player at his position in that snapshot (DBs against
                        DBs, QBs against QBs): 1st 60, 2nd 54, 3rd 49 ... 10th 27, then 2 fewer a place
    honours   up to 24  30 per MVP, 18 per OPOY/DPOY, 12 per Super Bowl MVP, 4 per ring, capped at 40, times 0.6
    records   +15 each  a league career record he held when he retired (passing, rushing and receiving yards and
                        touchdowns; tackles, sacks, interceptions, forced fumbles; blocks for OL), and +5 each
                        a league season record he held then (public/data/league/records.json, scope "season": the
                        best season among those up to his last; owner: "Count season records, at maybe +5 each. yes
                        and career blocks for OL")
- The ballot: every season, eligible retirees at or above the bar go in, highest score first, at most CAP a class
  (the first, inaugural class has no cap); the rest wait on the ballot. In the first year eligible = First Ballot.
  Once in, always in. Owner facts can override: players/<name>/hof "in" (enshrine) or "out" (exclude).
- Ring of Honor, per club: his Hall of Fame club(s) for members; for other retirees, the club he is best known for
  (owner signature team / retired_by, else the stint with the most rings, then most seasons) when his frozen Career
  Legacy reached RING_LEGACY or he won RING_RINGS rings there.

Writes public/data/league/halloffame.json; other scripts import members() / is_member(). Deterministic.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

import market_history
from owner_facts import ACTIVE_ROSTERS, FACTS, RETIRED_BY, RETIRED_WITH, SIGNATURE_TEAM, STATUS_FIXES

ROOT = Path(__file__).resolve().parent.parent
NFL = os.environ.get("RV_EDITION") == "nfl"


def lab(y) -> str:
    return str(y) if NFL else lab(y)

SRC = ROOT / "data" / "y80"
OUT = ROOT / "public" / "data" / "league" / "halloffame.json"

BAR = 65
NFL_LIST_MIN = 45   # NFL edition: the ballot, soon and snubs lists keep retirees from this score
CAP = 3
RING_LEGACY = 6000
RING_RINGS = 3
STANDING = {1: 60, 2: 54, 3: 49, 4: 45, 5: 42, 6: 39, 7: 36, 8: 33, 9: 30, 10: 27}
RECORDS = [  # (label, positions, snapshot field)
    ("Passing yards", ("QB",), "yds"), ("Passing TDs", ("QB",), "td"),
    ("Rushing yards", ("RB", "QB"), "ryds"), ("Rushing TDs", ("RB", "QB"), "rtd"),
    ("Receiving yards", ("WR", "TE"), "yds"), ("Receiving TDs", ("WR", "TE"), "td"),
    ("Tackles", ("LB", "DB", "DL"), "tkl"), ("Sacks", ("LB", "DB", "DL"), "sck"),
    ("Interceptions", ("LB", "DB", "DL"), "int"), ("Forced fumbles", ("LB", "DB", "DL"), "ff"),
    ("Blocks", ("OL",), "blk"),
]
CAREER_POINTS, SEASON_POINTS = 15, 5
# NFL edition calibration (scripts/hall_of_fame.py, tuned against the real inductees in data/nfl/hof.json; see
# docs/NFL_HOF.md): standing is the all-time rank among his position's players as of his last season; an elite season is
# a season rating (SZN) of ELITE_SZN or more; longevity counts seasons from his debut; a pre-1999 career (nfl.partial)
# stretches his Career Legacy by the seasons the data is missing, flagged `partial`.
NFL_W = {
    "stand_max": 57, "stand_decay": 0.63,  # standing: rank 1 = stand_max, -3 x decay a place to rank 10, then -decay a place
    "elite": 2, "elite_top": 2, "elite_cap": 13, "elite_szn": 93, "elite_top_szn": 97,
    "long_from": 7, "long_pts": 9, "long_cap": 20,
    "pre_pts": 7, "pre_cap": 44,           # pre-1999 seasons of a partial career, credited by debut year (flagged)
    "ped_top10": 18, "ped_r1": 12, "ped_r2": 6,   # a partial career's draft capital (the seasons the data lacks)
    "hon_scale": 0.59, "hon_cap": 39,
    "partial_rate": 0.6, "partial_cap": 2.5,
}


def draft_tier(draft) -> int:
    """1 top-10 pick, 2 other first round, 3 second round, 0 later or undrafted (nfl.draft = [year, round, pick, club])."""
    try:
        r, p = int(draft[1]), int(draft[2])
    except (TypeError, ValueError, IndexError):
        return 0
    return 1 if r == 1 and p <= 10 else 2 if r == 1 else 3 if r == 2 else 0


def nfl_standing(rank: int, w: dict = NFL_W) -> float:
    return max(0.0, w["stand_max"] - w["stand_decay"] * (3 * (rank - 1) if rank <= 10 else 27 + (rank - 10)))


def nfl_score(f: dict, w: dict = NFL_W) -> dict:
    """The NFL Hall of Fame Score parts from a player's features (rank, elite seasons, honours, records, span, pre-1999 seasons)."""
    standing = round(nfl_standing(f["rank"], w))
    peak = min(w["elite_cap"], w["elite"] * f["e1"] + w["elite_top"] * f["e2"])
    honours = round(min(f["hon_raw"], w["hon_cap"]) * w["hon_scale"])
    records = CAREER_POINTS * f["held"] + SEASON_POINTS * f["sheld"]
    longevity = min(w["long_cap"], w["long_pts"] * max(0, f["span"] - w["long_from"]))
    pre = min(w["pre_cap"], w["pre_pts"] * f["pre"])
    if f["pre"]:
        pre += w["ped_top10"] if f["ped"] == 1 else w["ped_r1"] if f["ped"] == 2 else w["ped_r2"] if f["ped"] == 3 else 0
    return {"standing": standing, "peak": peak, "honours": honours, "records": records, "longevity": longevity,
            "pre1999": pre, "total": min(100, standing + peak + honours + records + longevity + pre)}


CAREER_SEASONS = ROOT / "public" / "data" / "league" / "career_seasons.json"
LEAGUE_RECORDS = ROOT / "public" / "data" / "league" / "records.json"  # scripts/league_records.py, built before this


def season_marks() -> list[tuple[str, list[tuple[str, float, int]]]]:
    """Each league season record: (label, [(holder name, value, season)]) from its top list."""
    if not LEAGUE_RECORDS.exists():
        return []
    out = []
    for r in json.loads(LEAGUE_RECORDS.read_text()).get("records", []):
        lg = r.get("league") or {}
        if r.get("scope") != "season" or not lg.get("top"):
            continue
        rows = [(t.get("name") or t.get("player"), float(t.get("value") or 0), season_num(t.get("season"))) for t in lg["top"]]
        out.append((r["record"], [x for x in rows if x[0]]))
    return out


POS_GROUP = {"QB": "QB", "RB": "RB", "FB": "RB", "HB": "RB", "WR": "WR", "TE": "TE", "OT": "OL", "T": "OL", "G": "OL", "C": "OL",
             "DE": "DL", "DT": "DL", "NT": "DL", "DL": "DL", "LB": "LB", "CB": "DB", "S": "DB", "DB": "DB"}


def _norm(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", " ", s.replace(".", " "))
    return re.sub(r"[^a-z]", "", s)


def real_inductees(retired: dict, key: dict) -> dict[str, int]:
    """POS:Name -> class year for every real inductee (data/nfl/hof.json from scripts/nfl/fetch_hof.py, players only) who
    is a retired player here: the same name, his years active overlapping the seasons he has stints in, and a position of
    his group when the page gives one; among namesakes the one with the most games."""
    path = ROOT / "data" / "nfl" / "hof.json"
    if not path.exists():
        return {}
    stints = json.loads((SRC / "stints.json").read_text())
    span = {}
    for k, c in retired.items():
        if c:
            runs = (stints.get(c["name"]) or {}).get("stints", [])
            span[k] = (min((r["from"] for r in runs), default=0), max((r["to"] for r in runs), default=0))
    by: dict[str, list] = {}
    for k, c in retired.items():
        if c:
            by.setdefault(_norm(c["name"].split(" (")[0]), []).append(k)
    out: dict[str, int] = {}
    for e in json.loads(path.read_text())["inductees"]:
        if e.get("role") != "player":
            continue
        groups = {POS_GROUP[x] for x in e.get("positions", []) if x in POS_GROUP}
        lo, hi = (e.get("years_active") or [0, 0])
        cands = [k for k in by.get(_norm(e["name"]), [])
                 if (not groups or retired[k]["pos"] in groups) and span[k][0] <= hi and span[k][1] >= lo]
        if cands:
            out[max(cands, key=lambda k: retired[k]["games"])] = e["class"]
    return out


def standing_points(rank: int) -> int:
    return STANDING.get(rank, max(0, 27 - 2 * (rank - 10)))


def season_num(label) -> int:
    m = re.match(r"Y?(\d+)", str(label or ""))
    return int(m.group(1)) if m else 0


def status(p, sheet) -> str:
    """build_league_data.player_status: owner status, the game's team screens, the game's Player HOF screen, the
    league sheet; no sheet row = active."""
    return (STATUS_FIXES.get(p["n"]) or ("Active" if p["n"] in ACTIVE_ROSTERS else None)
            or ("Retired" if p["n"] in RETIRED_WITH else None) or (sheet.get((p["n"], p["pos"])) or {}).get("st")) or "Active"


def compute() -> dict:
    players = [p for p in json.loads((SRC / "players.json").read_text()) if not p.get("legend")]
    sheet = {(r["n"], r["pos"]): r for r in json.loads((SRC / "spreadsheet_parsed.json").read_text())}
    stints = json.loads((SRC / "stints.json").read_text())
    snaps = market_history.load(SRC / "market_history.json")
    snaps = snaps["snapshots"] if isinstance(snaps, dict) else snaps
    ends: dict[int, dict] = {}
    for s in snaps:
        if season_num(s.get("season")):
            ends[season_num(s["season"])] = s["players"]  # the last snapshot of a season wins
    seasons = sorted(ends)
    if not seasons:
        return {"bar": BAR, "cap": CAP, "members": [], "classes": [], "ballot": [], "watch": [], "ringOfHonor": {}}
    first = seasons[0]
    owner_hof = {n: f.get("hof") for n, f in FACTS.get("players", {}).items() if f.get("hof") in ("in", "out")}
    key = {f"{p['pos']}:{p['n']}": p for p in players}
    marks = season_marks()

    # NFL edition: all-time standing among the position's players as of a season, partial careers stretched, elite seasons
    cs_rows = json.loads(CAREER_SEASONS.read_text())["players"] if NFL and CAREER_SEASONS.exists() else {}
    cs_from = {}

    def career_only(k: str) -> bool:
        return bool((key[k].get("nfl") or {}).get("careerOnly"))

    def last_year(k: str) -> int:
        return int((key[k].get("nfl") or {}).get("last") or 0)

    elite_share: dict[int, tuple[float, float]] = {}   # rank bucket -> (elite, top-elite seasons per season played), from 1999-on careers

    def bucket(rank: int) -> int:
        return 0 if rank <= 3 else 1 if rank <= 10 else 2 if rank <= 25 else 3 if rank <= 60 else 4

    def est_elite(rank: int, span: int) -> tuple[int, int]:
        """A career before the weekly data has no season ratings: the elite seasons a player of that standing and length
        shows in the 1999-on careers (the median share of his seasons, by all-time rank bucket), flagged `est`."""
        a, b = elite_share.get(bucket(rank), (0.0, 0.0))
        return round(a * span), round(b * span)

    def debut(k: str) -> int:
        n = (key[k].get("nfl") or {})
        return int(n.get("debut") or n.get("rookie") or 0)

    def stretch(k: str, legacy: float, seen: int) -> float:
        """A pre-1999 career (nfl.partial) is scored on its 1999-on line only; the seasons before it are credited at
        PARTIAL_RATE of his per-season legacy (at most PARTIAL_CAP times), so a 1989 debut is not ranked as a rookie."""
        n = (key[k].get("nfl") or {})
        d = int(n.get("debut") or 0)
        if not n.get("partial") or not d or d >= 1999:
            return legacy
        return legacy * min(NFL_W['partial_cap'], 1 + NFL_W['partial_rate'] * (1999 - d) / max(1, seen))

    classic_keys = [k for k in key if career_only(k)] if NFL else []
    seen_n: dict[str, int] = {}
    for y in seasons:
        for k in ends[y]:
            seen_n[k] = seen_n.get(k, 0) + 1
    rank_cache: dict[int, dict[str, list]] = {}

    def peers(at: int) -> dict[str, list]:
        """pos -> descending legacies of everyone at the position as of the end of season `at` (a retiree keeps his last)."""
        if at not in rank_cache:
            last_seen: dict[str, float] = {}
            for y in seasons:
                if y > at:
                    break
                for k2, v2 in ends[y].items():
                    last_seen[k2] = v2.get("legacy", 0)
            by_pos: dict[str, list] = {}
            for k2, L in last_seen.items():
                by_pos.setdefault(k2.split(":")[0], []).append(-stretch(k2, L, seen_n.get(k2, 1)))
            rank_cache[at] = {p: sorted(v) for p, v in by_pos.items()}
        return rank_cache[at]

    def elite_seasons(k: str, at: int) -> tuple[int, int]:
        r = cs_rows.get(k)
        if not r:
            return 0, 0
        a = b = 0
        for i, row in enumerate(r["rows"][:-1]):
            if row and r["from"] + i <= at and row[-1] is not None:
                a += row[-1] >= NFL_W['elite_szn']
                b += row[-1] >= NFL_W['elite_top_szn']
        return a, b

    def case(k: str, at: int) -> dict | None:
        """The player's Hall of Fame case from the end-of-season snapshot of season `at`."""
        snap = ends.get(at, {})
        v = snap.get(k)
        if not v:
            return None
        pos, _, name = k.partition(":")
        p = key[k]
        legacy = v.get("legacy", 0)
        if NFL:
            import bisect
            rank = 1 + bisect.bisect_left(peers(seasons[-1]).get(pos, []), -stretch(k, legacy, seen_n.get(k, 1)) - 1e-9)
        else:
            rank = 1 + sum(1 for k2, v2 in snap.items() if k2.split(":")[0] == pos and v2.get("legacy", 0) > legacy)
        hon_raw = 30 * (p.get("mvp") or 0) + 18 * ((p.get("opoy") or 0) + (p.get("dpoy") or 0)) \
            + 12 * (p.get("sbmvp") or 0) + 4 * (p.get("rings") or 0)
        honours = round(min(hon_raw, 40) * 0.6)
        held = []
        for label, poss, f in RECORDS:
            if pos not in poss:
                continue
            mine = (v.get("s") or {}).get(f) or 0
            rivals = list(snap.items()) + ([(k2, ends[seasons[-1]][k2]) for k2 in classic_keys
                                            if last_year(k2) <= at and k2 not in snap and k2 in ends[seasons[-1]]] if NFL else [])
            if mine and all(((v2.get("s") or {}).get(f) or 0) <= mine for k2, v2 in rivals if k2.split(":")[0] in poss):
                held.append(label)
        # a season record he held when he retired: his best season among those up to `at` tops every other then
        seasons_held = []
        for label, rows in marks:
            upto = [x for x in rows if x[2] and x[2] <= at]
            mine = [x[1] for x in upto if x[0] == name]
            if mine and max(mine) >= max(x[1] for x in upto):
                seasons_held.append(label)
        standing = standing_points(rank)
        rec_pts = CAREER_POINTS * len(held) + SEASON_POINTS * len(seasons_held)
        extra, nfl, parts_x = 0, {}, {}
        if NFL:
            d = debut(k)
            pn = key[k].get("nfl") or {}
            if career_only(k):   # no season lines: his last season stands for `at`, his peak is estimated from standing
                span = last_year(k) - d + 1
                e1, e2 = est_elite(rank, span)
            else:
                e1, e2 = elite_seasons(k, at)
                span = at - (d or max(1999, at - seen_n.get(k, 1) + 1)) + 1
            f = {"rank": rank, "e1": e1, "e2": e2, "hon_raw": hon_raw, "held": len(held), "sheld": len(seasons_held),
                 "span": span, "pre": max(0, 1999 - d) if pn.get("partial") and d else 0, "ped": draft_tier(pn.get("draft"))}
            _FEAT[k] = f
            sc = nfl_score(f)
            standing, honours, rec_pts = sc["standing"], sc["honours"], sc["records"]
            extra = sc["peak"] + sc["longevity"] + sc["pre1999"]
            parts_x = {"peak": sc["peak"], "longevity": sc["longevity"], "pre1999": sc["pre1999"]}
            nfl = {"elite": e1, "seasons": span, **({"est": True} if career_only(k) else {})}
            if pn.get("partial"):
                nfl.update(partial=True, debut=pn.get("debut"))
        return {"key": k, "name": name, "pos": pos, "frozenSeason": lab(last_year(k) if NFL and career_only(k) else at), "careerLegacy": round(legacy),
                "rank": rank, "score": min(100, standing + honours + rec_pts + extra),
                "parts": {"standing": standing, "honours": honours, "records": rec_pts,
                          **parts_x}, "records": held,
                "seasonRecords": seasons_held,
                "rings": p.get("rings") or 0, "mvp": p.get("mvp") or 0, "opoy": p.get("opoy") or 0,
                "dpoy": p.get("dpoy") or 0, "sbmvp": p.get("sbmvp") or 0, "games": p.get("g") or 0,
                **({"nfl": nfl} if NFL else {})}

    # when each retired player last played: the last season his games went up between two season-end snapshots; with
    # none, he retired before he was recorded. His case is the first season-end snapshot from then on. One retired
    # before he was ever recorded joins the ballot the season he was added (a veteran, never "first ballot").
    retired, eligible_from, veteran = {}, {}, set()
    deferred = []
    for k, p in key.items():
        if status(p, sheet) != "Retired":
            continue
        present = [y for y in seasons if k in ends[y]]
        if not present:
            continue
        if NFL and career_only(k):   # a career from Wikipedia, no seasons in the snapshots: his case is the latest snapshot (final career)
            deferred.append(k)
            continue
        # seasons his games went up; a lone rise between the first two recorded seasons is the first import being
        # corrected (God Johnson 216 -> 234), not a season played
        if NFL:  # snapshots drop retirees, so compare with the last snapshot he was in (a gap is not a fresh career)
            played, prev = [], 0
            for y in present:
                g = (ends[y][k].get("s") or {}).get("g") or 0
                if g > prev:
                    played.append(y)
                prev = max(prev, g)
        else:
            played = [y for y in present[1:] if ((ends[y][k].get("s") or {}).get("g") or 0)
                      > ((ends[seasons[seasons.index(y) - 1]].get(k, {}).get("s") or {}).get("g") or 0 if seasons.index(y) else 0)]
        if played and (NFL or not (len(played) == 1 and played[0] == seasons[1])):
            last_played = played[-1]
        else:
            runs = (stints.get(p["n"]) or {}).get("stints", [])
            last_played = min(max((s["to"] for s in runs), default=0), present[0] - 1)  # retired before recorded
        at = next((y for y in present if y >= last_played), present[-1])
        retired[k] = case(k, at)
        later = [y for y in seasons if y > at]
        if at == last_played:
            eligible_from[k] = later[0] if later else at  # retired during the recorded seasons: on the next ballot
        else:
            eligible_from[k] = at             # retired before he was recorded
            if at != first:
                veteran.add(k)

    if NFL and deferred:
        # the elite share of a season by standing, from the retirees whose seasons are on record (a career of 6+ seasons)
        shares: dict[int, list] = {}
        for k, c in retired.items():
            f = _FEAT.get(k)
            if c and f and f["span"] >= 6:
                shares.setdefault(bucket(f["rank"]), []).append((f["e1"] / f["span"], f["e2"] / f["span"]))
        for b, rows in shares.items():
            rows.sort()
            elite_share[b] = (rows[len(rows) // 2][0], sorted(r[1] for r in rows)[len(rows) // 2])
        for k in deferred:
            retired[k] = case(k, seasons[-1])
            eligible_from[k] = last_year(k)

    global _RETIRED
    _RETIRED = retired
    # NFL edition: the real Pro Football Hall of Fame (data/nfl/hof.json, Wikipedia) are the members, in their real class
    # year, with the site's own Hall of Fame Score beside; the site's rules only fill the ballot (retirees at the bar who
    # are not in yet) and the watch list. Real inductees win.
    real = real_inductees(retired, key) if NFL else {}
    # the ballot, season by season
    members, waiting, classes = {}, {}, []
    if NFL:
        by_year: dict[int, list] = {}
        for k, yr in real.items():
            members[k] = {**retired[k], "class": f"Class of {yr}", "classSeason": str(yr), "firstBallot": False,
                          "veteran": False, "yearsOnBallot": 0, "real": True}
            by_year.setdefault(yr, []).append(k)
        for yr in sorted(by_year):
            classes.append({"season": str(yr), "label": f"Class of {yr}",
                            "members": [retired[k]["name"] for k in sorted(by_year[yr], key=lambda k: (-retired[k]["score"], k))]})
        # (the ballot, soon and snubs lists are built below from every retiree not in)
    for y in ([] if NFL else seasons):
        for k, c in retired.items():
            if c and eligible_from[k] == y and k not in members:
                if owner_hof.get(c["name"]) == "out":
                    continue
                if c["score"] >= BAR or owner_hof.get(c["name"]) == "in":
                    waiting[k] = y
        order = sorted(waiting, key=lambda k: (-retired[k]["score"], -retired[k]["careerLegacy"], k))
        take = order if y == first else order[:CAP]
        cls = []
        for k in take:
            members[k] = {**retired[k], "class": "Inaugural class" if y == first else lab(y), "classSeason": lab(y),
                          "firstBallot": waiting[k] == y and y != first and k not in veteran, "veteran": k in veteran,
                          "yearsOnBallot": y - waiting[k] + 1,
                          **({"owner": True} if owner_hof.get(retired[k]["name"]) == "in" else {})}
            cls.append(k)
            del waiting[k]
        if cls:
            classes.append({"season": lab(y), "label": "Inaugural class" if y == first else f"Class of {lab(y)}",
                            "members": [retired[k]["name"] for k in cls]})

    last = seasons[-1]
    nfl_lists: dict = {}
    if NFL:
        import math
        next_class = max(real.values(), default=last) + 1      # the ballot being voted on next (class of 2027)
        first_class = max(real.values(), default=last)         # the latest class held

        def chance(score: int) -> int:
            """A read-out, not a forecast: a logistic on the score, centred a little under the bar because most real
            inductees clear it (see docs/NFL_HOF.md)."""
            return max(1, min(97, round(100 / (1 + math.exp(-(score - 58) / 7)))))

        pool = []
        for k, c in retired.items():
            if not c or k in members or owner_hof.get(c["name"]) == "out" or c["score"] < NFL_LIST_MIN:
                continue
            lastp = season_num(c["frozenSeason"])
            first_elig = lastp + 6                              # five full seasons after his last, voted the year after
            row = {**c, "lastSeason": lastp, "eligibleFrom": first_elig, "chance": chance(c["score"])}
            if first_elig <= next_class:
                row["classesOnBallot"] = max(0, first_class - first_elig + 1)   # classes already held since he qualified
            pool.append(row)
        pool.sort(key=lambda r: (-r["score"], -r["careerLegacy"], r["key"]))
        nfl_lists = {
            "ballot": [r for r in pool if r["eligibleFrom"] <= next_class],
            "soon": [r for r in pool if r["eligibleFrom"] > next_class],
            "snubs": [r for r in pool if r["eligibleFrom"] <= first_class - 2 and r["score"] >= BAR],
            "nextClass": next_class,
        }
    ballot = sorted(({**retired[k], "since": lab(waiting[k]), "yearsOnBallot": last - waiting[k] + 1} for k in waiting),
                    key=lambda c: (-c["score"], c["key"]))
    near = [] if NFL else sorted((c for k, c in retired.items() if c and k not in members and k not in waiting and c["score"] >= BAR - 15),
                  key=lambda c: (-c["score"], c["key"]))[:8]
    watch = []
    for k, p in key.items():
        if status(p, sheet) == "Active" and k in ends[last]:
            c = case(k, last)
            if c and c["score"] >= BAR - 15:
                watch.append({**c, "projected": True})
    watch.sort(key=lambda c: (-c["score"], c["key"]))

    # Rings of Honor
    def best_club(name: str) -> str | None:
        own = SIGNATURE_TEAM.get(name)
        if own:
            return own
        runs = (stints.get(name) or {}).get("stints", [])
        best = min(runs, key=lambda s: (-len(s.get("rings", [])), -(s["to"] - s["from"] + 1), s["from"]), default=None)
        return best["team"] if best else None

    def short(team: str | None) -> str | None:
        return team.split()[-1] if team and team.split()[-1] != "49ers" or not team else "49ers"

    rings: dict[str, list] = {}
    for k, c in retired.items():
        if not c:
            continue
        name = c["name"]
        clubs: list[str] = []
        why = ""
        if k in members:
            clubs = [short(t) for t in (RETIRED_BY.get(name) or [best_club(name)]) if t]
            why = "Hall of Famer"
        else:
            club = best_club(name)
            runs = [s for s in (stints.get(name) or {}).get("stints", []) if club and s["team"] == short(club)]
            club_rings = sum(len(s.get("rings", [])) for s in runs)
            if club and (c["careerLegacy"] >= RING_LEGACY or club_rings >= RING_RINGS):
                clubs = [short(club)]
                why = f"{club_rings} rings with the club" if club_rings >= RING_RINGS else "Career Legacy"
        for t in clubs:
            if t:
                rings.setdefault(t, []).append({"name": name, "pos": c["pos"], "careerLegacy": c["careerLegacy"],
                                                "score": c["score"], "hof": k in members, "why": why,
                                                "frozenSeason": c["frozenSeason"]})
    for t in rings:
        rings[t].sort(key=lambda r: (not r["hof"], -r["careerLegacy"], r["name"]))

    return {"_about": "Generated by scripts/hall_of_fame.py: the rule-based Hall of Fame (retired players only, a frozen "
                      "score, a yearly ballot) and the clubs' Rings of Honor. Do not edit.",
            "bar": BAR, "cap": CAP, "season": lab(last),
            "members": sorted(members.values(), key=lambda m: (-m["score"], -m["careerLegacy"], m["key"])),
            "classes": classes, "ballot": nfl_lists.get("ballot", ballot), "near": near, "watch": watch[:25 if NFL else 10],
            **({"soon": nfl_lists["soon"], "snubs": nfl_lists["snubs"], "nextClass": nfl_lists["nextClass"], "edition": "nfl"}
               if NFL else {}),
            "ringOfHonor": dict(sorted(rings.items()))}


_CACHE: dict | None = None
_RETIRED: dict = {}
_FEAT: dict = {}


def data() -> dict:
    global _CACHE
    if _CACHE is None:
        _CACHE = compute()
    return _CACHE


def members() -> dict[str, dict]:
    """POS:Name -> member record."""
    return {m["key"]: m for m in data()["members"]}


def is_member(key: str) -> bool:
    return key in members()


def main() -> None:
    d = data()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n")
    rh = sum(len(v) for v in d["ringOfHonor"].values())
    print(f"wrote {OUT.relative_to(ROOT)}: {len(d['members'])} Hall of Famers in {len(d['classes'])} classes, "
          f"{len(d['ballot'])} waiting on the ballot, {rh} Ring of Honor places across {len(d['ringOfHonor'])} clubs")


if __name__ == "__main__":
    main()
