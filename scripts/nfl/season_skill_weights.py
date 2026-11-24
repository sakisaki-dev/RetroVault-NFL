#!/usr/bin/env python3
"""NFL edition: the weights of the "This season" skill grade, learned from the data (owner, 2026-11-24: "count fumbles
and learn the weights from the data").

    python3 scripts/nfl/season_skill_weights.py      (after scripts/nfl/career_rating.py)

Every player-season 1999-2025 (regular season, nflverse weekly stats, players in players.json) that clears the season
qualifier scaled to that year's weeks (QB 10 attempts a week, RB 6 carries, WR / TE 2.5 catches, defenders 0.4 x weeks
games) is one row:
  features  the traits the Deep Dive's season view shows (src/config/advanced.ts compFeatures, fumbles lost included), each
            SHRUNK toward that season's qualified mean by n / (n + k) with the career k (career_rating.json; fumbles
            lost get a k computed here, the same estimator), turned into a direction-aware percentile in that season's
            pool, centred. Style descriptors (receiving share, rush share) are left out: weight 0.
  target    the player's value to his team in the same season, z-scored within the season and position: total EPA per game
            (QB passing + rushing, RB rushing + receiving, WR / TE receiving); defenders the career model's playmaking
            composite (partly circular: it is built from the same sacks, interceptions and forced fumbles).
  fit       non-negative ridge (NNLS on an augmented system), alpha by 5-fold cross-validation, fit on seasons up to 2019
            and scored out of sample on 2020-2025 (R2 reported), then refit on every season; weights normalised to 1.
A QB has no fumble tile (the similarity features carry none).
Adds `seasonWeights` {pos: {trait id: weight}}, `seasonK` (fumble k) and `seasonFit` (alpha, R2, rows) to
public/data/nfl/career_rating.json, which the site already loads. Deterministic.
"""
import csv
import gzip
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import nnls

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
FILE = ROOT / "public" / "data" / "nfl" / "career_rating.json"
NOW = 2026
PER = {"QB": 10, "RB": 6, "WR": 2.5, "TE": 2.5, "LB": 0.4, "DB": 0.4, "DL": 0.4}
LOWER = {"intPct", "fumRate"}

players = json.loads((ROOT / "data/y80/players.json").read_text())
gmap = {p["nfl"]["gsis"]: p["pos"] for p in players if p.get("nfl") and p["nfl"].get("gsis")}
COLS = ["passing_yards", "attempts", "completions", "passing_tds", "passing_interceptions", "passing_epa", "rushing_epa", "receiving_epa",
        "rushing_yards", "carries", "rushing_tds", "receptions", "targets", "receiving_yards", "receiving_tds", "fumbles_lost_total",
        "def_tackles_solo", "def_tackle_assists", "def_sacks", "def_interceptions", "def_fumbles_forced", "def_pass_defended",
        "def_tackles_for_loss", "def_qb_hits"]


def fl(x):
    try:
        return float(x)
    except Exception:
        return 0.0


acc = defaultdict(lambda: defaultdict(float))
for y in range(1999, NOW):
    with gzip.open(CACHE / f"stats_player_week_{y}.csv.gz", "rt") as fh:
        for r in csv.DictReader(fh):
            pos = gmap.get(r["player_id"])
            if r["season_type"] != "REG" or pos not in PER:
                continue
            a = acc[(pos, y, r["player_id"])]
            a["g"] += 1
            for c in COLS:
                a[c] += fl(r.get(c))
weeks = defaultdict(int)
for (pos, y, _), a in acc.items():
    weeks[y] = max(weeks[y], a["g"])


def passer_rating(a):
    att = a["attempts"]
    if att <= 0:
        return float("nan")
    c = lambda x: max(0.0, min(2.375, x))
    return (c((a["completions"] / att - .3) * 5) + c((a["passing_yards"] / att - 3) * .25) + c(a["passing_tds"] / att * 20) + c(2.375 - a["passing_interceptions"] / att * 25)) / 6 * 100


def sd(n, d):
    return n / d if d > 0 else float("nan")


def traits(pos, a):
    """trait id -> (value, exposure n, career-k stat name), as the site computes them on a season line."""
    g = a["g"]
    touches = a["carries"] + a["receptions"]
    if pos == "QB":
        att = a["attempts"]
        return {"ya": (sd(a["passing_yards"], att), att, "ya"), "cmp": (sd(a["completions"], att), att, "cmp"), "tdPct": (sd(a["passing_tds"], att), att, "td"),
                "intPct": (sd(a["passing_interceptions"], att), att, "int"), "rating": (passer_rating(a), att, "ya"),
                "passYdsG": (a["passing_yards"] / g, 0, None), "rushYdsG": (a["rushing_yards"] / g, 0, None)}
    if pos == "RB":
        return {"ypc": (sd(a["rushing_yards"], a["carries"]), a["carries"], "ypc"), "rushYdsG": (a["rushing_yards"] / g, 0, None), "recYdsG": (a["receiving_yards"] / g, 0, None),
                "td16": (16 * (a["rushing_tds"] + a["receiving_tds"]) / g, touches, "td_touch"), "fumRate": (100 * sd(a["fumbles_lost_total"], touches), touches, "fum_touch"),
                "ypt": (sd(a["rushing_yards"] + a["receiving_yards"], touches), touches, "ypt")}
    if pos in ("WR", "TE"):
        rec = a["receptions"]
        return {"recG": (rec / g, 0, None), "recYdsG": (a["receiving_yards"] / g, 0, None), "ypr": (sd(a["receiving_yards"], rec), rec, "ypr"),
                "tdPerRec": (sd(a["receiving_tds"], rec), rec, "td_rec"), "fumRate": (100 * sd(a["fumbles_lost_total"], rec), rec, "fum_rec")}
    imp = a["def_sacks"] + a["def_interceptions"] + a["def_fumbles_forced"]
    return {"tklG": ((a["def_tackles_solo"] + a["def_tackle_assists"]) / g, g, "tkl_g"), "sackG": (a["def_sacks"] / g, g, "sack_g"), "intG": (a["def_interceptions"] / g, g, "int_g"),
            "ffG": (a["def_fumbles_forced"] / g, g, "ff_g"), "impactG": (imp / g, g, "sack_g")}


def target(pos, a):
    g = a["g"]
    if pos == "QB":
        return (a["passing_epa"] + a["rushing_epa"]) / g
    if pos == "RB":
        return (a["rushing_epa"] + a["receiving_epa"]) / g
    if pos in ("WR", "TE"):
        return a["receiving_epa"] / g
    return (3 * a["def_sacks"] + 4 * a["def_interceptions"] + 3 * a["def_fumbles_forced"] + a["def_pass_defended"] + 1.5 * a["def_tackles_for_loss"] + a["def_qb_hits"] + 0.3 * (a["def_tackles_solo"] + a["def_tackle_assists"])) / g


def qualifies(pos, a, y):
    w = weeks[y]
    n = {"QB": a["attempts"], "RB": a["carries"], "WR": a["receptions"], "TE": a["receptions"]}.get(pos, a["g"])
    return n >= max(2 if pos in ("LB", "DB", "DL") else 5, round(PER[pos] * w))


def pct_rank(sorted_vals, v):
    n = len(sorted_vals)
    below = np.searchsorted(sorted_vals, v, "left")
    ties = np.searchsorted(sorted_vals, v, "right") - below
    return (100 * (below + (ties - 1) / 2) / (n - 1) if ties > 0 else 100 * below / n) if n > 1 else 100.0


career = json.loads(FILE.read_text())
K = {pos: dict(career["k"][pos]) for pos in PER}


def fum_k(pos):
    """Reliability constant for fumbles lost per touch / catch (the career_rating.py estimator: sampling variance over
    between-player variance of the rate, qualified player-seasons)."""
    xs, ds, ss, dt = [], [], 0.0, 0.0
    for (p, y, gs), a in acc.items():
        if p != pos or not qualifies(pos, a, y):
            continue
        d = a["carries"] + a["receptions"] if pos == "RB" else a["receptions"]
        if d < 10:
            continue
        r = a["fumbles_lost_total"] / d
        ss += d * r * (1 - r)
        dt += d - 1
        xs.append(r); ds.append(d)
    xs, ds = np.array(xs), np.array(ds)
    sig2 = ss / dt
    tau2 = xs.var() - np.mean(sig2 / ds)
    return float(sig2 / tau2) if tau2 > 1e-12 else None


SEASON_K = {}
for pos, st in (("RB", "fum_touch"), ("WR", "fum_rec"), ("TE", "fum_rec")):
    SEASON_K[(pos, st)] = fum_k(pos)
    print(f"fumbles lost k {pos}: {SEASON_K[(pos, st)]}")
CAP_K = 4000.0  # a fumble rate with no measurable spread is shrunk almost to the mean (k capped), never dropped


def kof(pos, st):
    if (pos, st) in SEASON_K:
        k = SEASON_K[(pos, st)]
        return CAP_K if k is None else min(k, CAP_K)
    return K[pos].get(st)


rows = defaultdict(list)  # pos -> [(year, x, y)]
ids = {}
for pos in PER:
    byy = defaultdict(list)
    for (p, y, gs), a in acc.items():
        if p == pos and qualifies(pos, a, y):
            byy[y].append(a)
    for y, lst in sorted(byy.items()):
        if len(lst) < 12:
            continue
        T = [traits(pos, a) for a in lst]
        tids = list(T[0])
        ids[pos] = tids
        mu = {t: np.nanmean([row[t][0] for row in T]) for t in tids}
        cols = []
        for t in tids:
            vals = []
            for row in T:
                v, n, st = row[t]
                k = kof(pos, st) if st else None
                if k is not None and np.isfinite(v):
                    v = mu[t] + (v - mu[t]) * (n / (n + k))
                vals.append(v)
            vals = np.array(vals)
            srt = np.sort(vals[np.isfinite(vals)])
            pc = np.array([pct_rank(srt, v) if np.isfinite(v) else 50.0 for v in vals])
            if t in LOWER:
                pc = 100 - pc
            cols.append(pc / 100 - 0.5)
        X = np.array(cols).T
        tv = np.array([target(pos, a) for a in lst])
        z = (tv - tv.mean()) / (tv.std() or 1)
        for i in range(len(lst)):
            rows[pos].append((y, X[i], z[i]))


def solve(X, y, a):
    A = np.vstack([X, np.sqrt(a) * np.eye(X.shape[1])])
    return nnls(A, np.concatenate([y, np.zeros(X.shape[1])]))[0]


def fit(X, y):
    folds = np.arange(len(y)) % 5
    best = None
    for a in (0.1, 1, 10, 30, 100, 300, 1000):
        err = sum(((X[folds == f] @ solve(X[folds != f], y[folds != f], a) - y[folds == f]) ** 2).sum() for f in range(5))
        if best is None or err < best[0]:
            best = (err, a)
    return solve(X, y, best[1]), best[1]


weights, fitinfo = {}, {}
for pos, lst in rows.items():
    X = np.array([r[1] for r in lst]); y = np.array([r[2] for r in lst]); yr = np.array([r[0] for r in lst])
    tr, te = yr <= 2019, yr >= 2020
    w, a = fit(X[tr], y[tr])
    pred = X[te] @ w
    r2 = 1 - ((y[te] - pred) ** 2).sum() / ((y[te] - y[te].mean()) ** 2).sum()           # raw fitted scale
    s = float(pred @ y[te] / (pred @ pred)) if (pred @ pred) > 0 else 0.0
    r2s = 1 - ((y[te] - s * pred) ** 2).sum() / ((y[te] - y[te].mean()) ** 2).sum()      # one free slope (the weights are normalised to 1)
    wf, af = fit(X, y)
    wf = wf / wf.sum() if wf.sum() > 0 else np.ones_like(wf) / len(wf)
    weights[pos] = {t: round(float(v), 3) for t, v in zip(ids[pos], wf)}
    fitinfo[pos] = {"alpha": af, "rows": len(y), "trainRows": int(tr.sum()), "testRows": int(te.sum()), "r2Raw": round(float(r2), 3), "r2": round(float(r2s), 3)}
    print(pos, fitinfo[pos], weights[pos])

career["seasonWeights"] = weights
career["seasonK"] = {f"{p}:{st}": round(CAP_K if v is None else min(v, CAP_K), 1) for (p, st), v in SEASON_K.items()}
career["seasonFit"] = fitinfo
FILE.write_text(json.dumps(career, ensure_ascii=False, separators=(",", ":")) + "\n")
