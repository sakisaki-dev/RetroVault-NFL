#!/usr/bin/env python3
"""NFL edition: the College tab's data -> public/data/nfl/college/.

    python3 scripts/nfl/college.py

Sources (nothing typed by hand but the school-name aliases below, which only point a draft-file spelling at ESPN's own
school entry):
  * data/nfl-cache/draft_picks.csv.gz (nflverse): every draft 1980 on, round, pick, club, player, position, college,
    and what became of the pick as the draft file records it (Pro Bowls, first-team All-Pro, Hall of Fame, games, last
    season).
  * public/data/nfl/draft.json (scripts/nfl/draft.py): each site player's college and draft line, and ESPN's school list
    (logo id, colours, white-puck flag). A pick is a site player when draft.json gives a site player that year and pick.
  * public/data/market.json (latest snapshot): each site player's career OVR (CAR) and season OVR (SZN).
  * public/data/league/halloffame.json: the site's Hall of Fame (real inductees).
  * data/y80/players.json: active or retired (nfl.retired), current club.

Outputs (kept small; each page loads only what it shows):
  college/index.json          the years (pick counts), the thresholds, every school with its totals per draft decade
  college/draft/<year>.json   that draft's picks, its steals and busts
  college/schools/<slug>.json a school's site players (best career OVR first) and every pick from it

Steals and busts come from the site's own career OVR and are only called for a draft at least JUDGE_AFTER seasons old
(a rookie's career OVR says little). The bars are derived from the data, not typed: a STEAL is a pick from round 3 on
whose career OVR reaches the upper quartile of every rated first-round pick's; a BUST is a top-10 pick whose career OVR
is at or below the lower quartile of every rated top-10 pick's. Deterministic: two runs give identical files.
"""
import csv
import gzip
import json
import re
import shutil
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "scripts"))
import draft as D  # noqa: E402
import market_history  # noqa: E402

OUT = ROOT / "public" / "data" / "nfl" / "college"
JUDGE_AFTER = 3
FIRST_YEAR = 1980
# draft-file spellings ESPN lists under another name (normalised with draft.norm)
ALIAS = {"lamonroe": "ulmonroe", "middletennstate": "middletennessee", "calpolysanluisobispo": "calpoly",
         "alabirmingham": "uab", "mcneesestate": "mcneese", "nichollsstate": "nicholls", "samhoustonstate": "samhouston",
         "semissouristate": "southeastmissouristate", "arkpinebluff": "arkansaspinebluff"}


def franchise(code, year):
    """The club (today's name) a draft-file code stood for that year: three codes moved between franchises (the Houston
    Oilers became the Titans, the Baltimore Colts moved to Indianapolis, the St. Louis Cardinals to Phoenix)."""
    if code == "HOU" and year <= 1996:
        return "Titans"
    if code == "BAL" and year <= 1983:
        return "Colts"
    if code == "STL" and year <= 1987:
        return "Cardinals"
    return D.CLUB.get(code) or code


def main():
    espn = D.fetch_espn()
    index = {}
    for t in espn:
        for k in (t["location"], t["displayName"], t.get("shortDisplayName", ""), t["location"] + " " + t.get("nickname", "")):
            index.setdefault(D.norm(k), t)

    def espn_of(name):
        n = D.norm(name)
        for k in (n, ALIAS.get(n, ""), D.norm(re.sub(r"\(.*?\)", "", name)), D.ALIAS.get(n, ""), n.replace("state", "st"),
                  re.sub(r"college$", "", n), re.sub(r"(state)?college$|university$", "", n)):
            if k and k in index:
                return index[k]
        return None

    draft = json.loads((ROOT / "public/data/nfl/draft.json").read_text())
    dcol = draft["colleges"]
    players = json.loads((ROOT / "data/y80/players.json").read_text())
    pinfo = {f'{p["pos"]}:{p["n"]}': p for p in players}
    snap = market_history.load(ROOT / "public/data/market.json")[-1]["players"]
    hof = json.loads((ROOT / "public/data/league/halloffame.json").read_text())
    hof_keys = {m["key"] for m in hof.get("members", []) if m.get("real")}

    # schools: one entry per ESPN school (else per normalised name)
    schools = {}

    def school_of(name):
        name = (name or "").strip()
        if not name:
            return None
        t = espn_of(name)
        sid = f'e{t["id"]}' if t else "n" + D.norm(name)
        if sid not in schools:
            if t:
                info = {"name": t["location"], "s": t.get("shortDisplayName") or t["location"], "id": int(t["id"]),
                        "c": t.get("color"), "a": t.get("alternateColor")}
                # the white-puck flag draft.py derived for this logo
                for v in dcol.values():
                    if v.get("id") == info["id"] and v.get("w"):
                        info["w"] = 1
            else:
                info = {"name": name, "s": name}
            schools[sid] = info
        return sid

    # site players by draft slot (year, pick), and each one's school
    by_slot = {}
    player_school = {}
    for key, v in draft["p"].items():
        if key not in pinfo:
            continue
        if len(v) > 3 and v[1] and v[3]:
            by_slot[(int(v[1]), int(v[3]))] = key
        sid = school_of(v[0]) if v[0] else None
        if sid:
            player_school[key] = sid

    rows = [r for r in csv.DictReader(gzip.open(D.CACHE / "draft_picks.csv.gz", "rt")) if int(r["season"]) >= FIRST_YEAR]
    latest = max(int(r["season"]) for r in rows)
    ovr = lambda k: (snap.get(k) or {}).get("ovr")  # noqa: E731
    num = lambda s: int(float(s)) if s not in ("", None) else None  # noqa: E731

    picks_by_year = defaultdict(list)
    school_picks = defaultdict(list)
    for r in rows:
        y, rd, pk = int(r["season"]), int(r["round"]), int(r["pick"])
        key = by_slot.get((y, pk))
        sid = school_of(r["college"])
        club = franchise(r["team"], y)
        h = 2 if key in hof_keys else 1 if r["hof"] == "TRUE" else 0
        pick = {"r": rd, "p": pk, "club": club, "n": r["pfr_player_name"], "pos": r["position"], "sc": sid, "k": key,
                "ovr": ovr(key) if key else None, "pb": num(r["probowls"]) or 0, "ap": num(r["allpro"]) or 0, "hof": h,
                "g": num(r["games"]), "to": num(r["to"])}
        picks_by_year[y].append(pick)
        if sid:
            school_picks[sid].append((y, pick))

    # the bars for steals and busts, from the rated picks of judged drafts
    judged = [p for y, ps in picks_by_year.items() if y <= latest - JUDGE_AFTER for p in ps if p["ovr"] is not None]
    first_ovr = sorted(p["ovr"] for p in judged if p["r"] == 1)
    top10_ovr = sorted(p["ovr"] for p in judged if p["p"] <= 10)
    steal_bar = statistics.quantiles(first_ovr, n=4)[2]
    bust_bar = statistics.quantiles(top10_ovr, n=4)[0]

    # one slug per school that has a pick or a site player (sorted, so the same school always gets the same slug)
    slugs, taken = {}, set()
    has = set(school_picks) | set(player_school.values())
    for sid in sorted(has, key=lambda s: (schools[s]["name"], s)):
        base = re.sub(r"[^a-z0-9]+", "-", schools[sid]["name"].lower()).strip("-") or "school"
        slug = base if base not in taken else f"{base}-{sid}"
        taken.add(slug)
        slugs[sid] = slug

    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "draft").mkdir(parents=True)
    (OUT / "schools").mkdir(parents=True)

    def pick_row(p):
        # [round, pick, club, name, pos, school id, site key, OVR, Pro Bowls, All-Pro, HOF (2 site, 1 draft file), games, last season]
        return [p["r"], p["p"], p["club"], p["n"], p["pos"], p["sc"], p["k"], p["ovr"], p["pb"], p["ap"], p["hof"], p["g"], p["to"]]

    years = []
    for y in sorted(picks_by_year):
        ps = sorted(picks_by_year[y], key=lambda p: p["p"])
        steals, busts = [], []
        if y <= latest - JUDGE_AFTER:
            steals = sorted((p for p in ps if p["r"] >= 3 and p["ovr"] is not None and p["ovr"] >= steal_bar),
                            key=lambda p: (-p["ovr"], p["p"]))[:5]
            busts = sorted((p for p in ps if p["p"] <= 10 and p["ovr"] is not None and p["ovr"] <= bust_bar),
                           key=lambda p: (p["ovr"], p["p"]))[:5]
        rated = sum(1 for p in ps if p["ovr"] is not None)
        data = {"y": y, "judged": y <= latest - JUDGE_AFTER, "rated": rated, "picks": [pick_row(p) for p in ps],
                "steals": [p["p"] for p in steals], "busts": [p["p"] for p in busts],
                "schools": {sid: {**schools[sid], "slug": slugs[sid]} for sid in sorted({p["sc"] for p in ps if p["sc"]})}}
        (OUT / "draft" / f"{y}.json").write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
        years.append([y, len(ps), max(p["r"] for p in ps), rated])

    # site players per school
    school_players = defaultdict(list)
    for key, sid in player_school.items():
        p = pinfo[key]
        v = draft["p"][key]
        nfl = p.get("nfl") or {}
        active = not nfl.get("retired")
        dl = [int(v[1]), int(v[2]), int(v[3]), v[4]] if len(v) > 3 and v[1] else None
        first = dl[0] if dl else num(nfl.get("rookie"))
        school_players[sid].append({"k": key, "ovr": ovr(key), "szn": (snap.get(key) or {}).get("szn"), "a": 1 if active else 0,
                                    "team": p.get("team") if active else None, "hof": 1 if key in hof_keys else 0,
                                    "d": dl, "y": first})

    def decade(y):
        return (y // 10) * 10 if y else None

    rows_out = []
    for sid in sorted(schools, key=lambda s: (schools[s]["name"], s)):
        info = schools[sid]
        sp = school_picks.get(sid, [])
        pl = school_players.get(sid, [])
        if not sp and not pl:
            continue
        slug = slugs[sid]
        rounds = Counter(p["r"] for _, p in sp)
        eras = defaultdict(lambda: [0, 0, 0, 0])  # drafted, first-rounders, total OVR, rated players
        for y, p in sp:
            e = eras[decade(y)]
            e[0] += 1
            e[1] += 1 if p["r"] == 1 else 0
        for p in pl:
            if p["ovr"] is not None and p["y"]:
                e = eras[decade(p["y"])]
                e[2] += p["ovr"]
                e[3] += 1
        pl.sort(key=lambda p: (-(p["ovr"] or 0), p["k"]))
        no1 = [[y, p["n"], p["club"], p["k"]] for y, p in sp if p["p"] == 1]
        firsts = [[y, p["p"], p["n"], p["pos"], p["club"], p["k"]] for y, p in sorted(sp, key=lambda x: (-x[0], x[1]["p"])) if p["r"] == 1]
        sfile = {"slug": slug, **info,
                 "players": [[p["k"], p["ovr"], p["szn"], p["a"], p["team"], p["hof"], p["d"], p["y"]] for p in pl],
                 "rounds": [rounds.get(i, 0) for i in range(1, max(rounds, default=0) + 1)],
                 "firsts": firsts, "no1": no1,
                 "picks": [[y, p["r"], p["p"], p["club"], p["n"], p["pos"], p["k"], p["ovr"], p["pb"], p["ap"], p["hof"]]
                           for y, p in sorted(sp, key=lambda x: (-x[0], x[1]["p"]))]}
        (OUT / "schools" / f"{slug}.json").write_text(json.dumps(sfile, separators=(",", ":"), ensure_ascii=False))
        # the school's Hall of Famers: its picks the draft file or the site calls one, and its undrafted site Hall of Famers
        hof_n = len({p["k"] or f'{y}:{p["p"]}' for y, p in sp if p["hof"]} | {p["k"] for p in pl if p["hof"]})
        best = next(([p["k"], p["ovr"]] for p in pl if p["ovr"] is not None), None)
        rows_out.append([slug, info["name"], info["s"], info.get("id"), info.get("c"), info.get("a"), info.get("w", 0),
                         len(sp), rounds.get(1, 0), len(no1), len(pl), sum(1 for p in pl if p["a"]),
                         {str(k): v for k, v in sorted(eras.items()) if k}, hof_n, best])

    idx = {
        "_about": "scripts/nfl/college.py: draft boards per year (college/draft/<y>.json), schools (college/schools/<slug>.json). "
                  "schools rows: [slug, name, short, espn id, colour, alt colour, white puck, drafted, first-rounders, No. 1 picks, "
                  "site players, active, per draft decade {decade: [drafted, first-rounders, total career OVR, rated players]}, "
                  "Hall of Famers, best alumnus [site key, career OVR] or null]",
        "latest": latest, "judgeAfter": JUDGE_AFTER, "stealBar": steal_bar, "bustBar": bust_bar,
        "years": years, "schools": rows_out,
    }
    nd = build_needs(snap, pinfo)
    (OUT / "needs.json").write_text(json.dumps(nd, separators=(",", ":"), ensure_ascii=False))
    (OUT / "index.json").write_text(json.dumps(idx, separators=(",", ":"), ensure_ascii=False))
    size = sum(f.stat().st_size for f in OUT.rglob("*.json")) // 1024
    print(f"college: {len(years)} drafts {years[0][0]}-{latest}, {len(rows_out)} schools, steal bar OVR {steal_bar}, "
          f"bust bar OVR {bust_bar} -> {OUT.relative_to(ROOT)} ({size} KB in all)")


# ---------------------------------------------------------------- needs (the needs-based mock)

# each need group: the depth-chart slots whose first name is the starter, by the club's base front
GROUPS = [
    ("QB", "a quarterback", {"o": ["QB"]}, {}),
    ("RB", "a running back", {"o": ["RB"]}, {}),
    ("WR", "a wide receiver", {"o": ["WR", "WR", "WR"]}, {}),
    ("TE", "a tight end", {"o": ["TE"]}, {}),
    ("OL", "an offensive lineman", {"o": ["LT", "LG", "C", "RG", "RT"]}, {}),
    ("EDGE", "an edge rusher", {"4-3": ["LDE", "RDE"], "3-4": ["WLB", "SLB"]}, {}),
    ("IDL", "an interior lineman", {"4-3": ["LDT", "RDT"], "3-4": ["LDE", "NT", "RDE"]}, {}),
    ("LB", "a linebacker", {"4-3": ["WLB", "MLB", "SLB"], "3-4": ["LILB", "RILB"]}, {}),
    ("CB", "a cornerback", {"d": ["LCB", "RCB"]}, {}),
    ("S", "a safety", {"d": ["SS", "FS"]}, {}),
]
AGE_FROM = 30  # each year of the oldest starter past this adds to the need


def starters(chart, spec):
    out = []
    for side, slots in spec.items():
        src = chart["o"] if side == "o" else chart["d"]
        if side in ("4-3", "3-4") and chart.get("base") != side:
            continue
        used = Counter()
        for sl in slots:
            names = src.get(sl) or []
            i = used[sl]
            used[sl] += 1
            if i < len(names):
                out.append(names[i])
    return out


def build_needs(snap, pinfo):
    """Each club's positional needs for the coming draft from its current depth chart (public/data/nfl/depth_charts.json):
    a group's starters' average SZN (players without a season rating are skipped, never counted as zero) against the
    league's average for that group, in league standard deviations, plus 0.25 for each year the oldest starter is past
    AGE_FROM. Contracts are not used (the contract file stops in 2022)."""
    dc = json.loads((ROOT / "public/data/nfl/depth_charts.json").read_text())
    per = {}
    for club, chart in dc["clubs"].items():
        per[club] = {}
        for gid, _, spec, _ in GROUPS:
            st = starters(chart, spec)
            szn = [(snap.get(k) or {}).get("szn") for k in st]
            rated = [x for x in szn if x is not None]
            ages = [((pinfo.get(k) or {}).get("nfl") or {}).get("age") for k in st]
            ages = [a for a in ages if a]
            oldest = max(ages) if ages else None
            old_key = next((k for k in st if (((pinfo.get(k) or {}).get("nfl") or {}).get("age")) == oldest), None) if oldest else None
            per[club][gid] = {"st": st, "szn": round(sum(rated) / len(rated), 1) if rated else None, "n": len(rated),
                              "old": oldest, "oldK": old_key}
    league = {}
    for gid, *_ in GROUPS:
        vals = [per[c][gid]["szn"] for c in per if per[c][gid]["szn"] is not None]
        if len(vals) >= 2:  # a group the data never rates (offensive line: no line stats) is left out, never guessed
            league[gid] = (statistics.mean(vals), statistics.pstdev(vals) or 1.0)
    out = {}
    for club, gs in per.items():
        rows = []
        for gid, label, *_ in GROUPS:
            g = gs[gid]
            if g["szn"] is None or gid not in league:
                continue
            mu, sd = league[gid]
            score = (mu - g["szn"]) / sd + 0.25 * max(0, (g["old"] or 0) - AGE_FROM)
            rows.append({"g": gid, "need": label, "szn": g["szn"], "lg": round(mu, 1), "old": g["old"], "oldK": g["oldK"],
                         "st": g["st"], "score": round(score, 2)})
        rows.sort(key=lambda r: (-r["score"], r["g"]))
        out[club] = rows
    return {"season": dc["season"], "at": dc.get("at"), "ageFrom": AGE_FROM, "league": {k: round(v[0], 1) for k, v in league.items()},
            "groups": [[g, l] for g, l, *_ in GROUPS if g in league],
            "unrated": [g for g, *_ in GROUPS if g not in league], "clubs": out}


if __name__ == "__main__":
    main()
