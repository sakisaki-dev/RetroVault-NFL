#!/usr/bin/env python3
"""NFL edition: the career rating (CAR) and career grade, public/data/nfl/career_rating.json.

    python3 scripts/nfl/career_rating.py

Owner-approved model (2026-11-23, experiments rounds 1-3): career score = 70% EFFICIENCY + 30% PRODUCTION AND HONOURS.
  efficiency   nflverse weekly stats 1999-2026, per position: (1) every rate is measured against THAT season's league
               rate at the position (era adjustment), summed over the career by exposure; (2) empirical-Bayes
               reliability shrinkage n / (n + k) toward the qualified position mean, k from the data per stat (between-player
               signal vs sampling noise of the weekly rows); (3) position weights fitted by ridge NNLS (non-negative) on
               next-season value per game (QB/RB/WR/TE EPA per game, defenders a playmaking composite; seasons 2001-2017),
               with structure imposed: RB rushing 45% / receiving 45% / shared 10%, WR/TE per-target efficiency 40% /
               per-game volume 40% / rest 20%, and stats with no signal (k >= 5,000: RB and WR/TE fumbles, DL interceptions)
               at weight 0. The weighted z-score is ranked among qualified players.
  production   career totals (QB pass yds + TD, RB scrimmage, WR/TE receiving, defenders tackles / sacks / INT / FF), 70%,
               and seasons as a qualified starter (longevity, 1999 on), 30%: percentiles among qualified players.
  honours      raw points, uncapped (MVP 30, OPOY / DPOY 18, SB MVP 12, ring 10, ROY 2), scaled to the position's maximum
               among qualified players, zero = 0.
  score        0.7 x efficiency + 0.3 x (0.5 production + 0.5 honours); a player with no weekly data (career totals only, the
               pre-1999 classics) is scored on production (totals) and honours alone, weights re-normalised, flagged.
  CAR          the score's percentile among qualified players (S = top 10%), then rating = 62 + 37 x (pct / 100) ^ 2.5.
Qualified = QB 1,500 attempts, RB 500 carries, WR / TE 150 catches, LB / DB / DL 48 games. Offensive linemen have no weekly
data and keep the League Score rating (src/config/ovr.ts). Deterministic. The site only reads the number.
"""
import csv
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import nnls

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "nfl-cache"
OUT = ROOT / "public" / "data" / "nfl" / "career_rating.json"
NOW = 2026
ZERO_K = 5000

players = json.loads((ROOT / "data/y80/players.json").read_text())
byk = {f"{p['pos']}:{p['n']}": p for p in players}
gmap = {p["nfl"]["gsis"]: (p["pos"], f"{p['pos']}:{p['n']}") for p in players if p.get("nfl") and p["nfl"].get("gsis")}
key_of = {gs: k for gs, (_, k) in gmap.items()}
pos_of = {gs: pos for gs, (pos, _) in gmap.items()}


def fl(x):
    try:
        return float(x)
    except Exception:
        return 0.0


def spec(pos):
    g = lambda r: 1.0
    if pos == "QB":
        return {"ya": (lambda r: r["passing_yards"], lambda r: r["attempts"]), "cmp": (lambda r: r["completions"], lambda r: r["attempts"]),
                "td": (lambda r: r["passing_tds"], lambda r: r["attempts"]), "int": (lambda r: r["passing_interceptions"], lambda r: r["attempts"]),
                "sack": (lambda r: r["sacks_suffered"], lambda r: r["attempts"] + r["sacks_suffered"]),
                "epa_db": (lambda r: r["passing_epa"], lambda r: r["attempts"] + r["sacks_suffered"]),
                "cpoe": (lambda r: r["passing_cpoe"] * r["attempts"], lambda r: r["attempts"]),
                "rush_epa": (lambda r: r["rushing_epa"], lambda r: r["attempts"] + r["sacks_suffered"])}
    if pos == "RB":
        t = lambda r: r["carries"] + r["receptions"]
        return {"ypc": (lambda r: r["rushing_yards"], lambda r: r["carries"]), "repa_c": (lambda r: r["rushing_epa"], lambda r: r["carries"]),
                "ypt": (lambda r: r["rushing_yards"] + r["receiving_yards"], t), "rec_epa_t": (lambda r: r["receiving_epa"], lambda r: r["targets"]),
                "td_touch": (lambda r: r["rushing_tds"] + r["receiving_tds"], t), "fum_touch": (lambda r: r["rushing_fumbles"] + r["receiving_fumbles"], t),
                "catch": (lambda r: r["receptions"], lambda r: r["targets"]), "tgt_g": (lambda r: r["targets"], g), "ryds_g": (lambda r: r["rushing_yards"], g)}
    if pos in ("WR", "TE"):
        return {"ypr": (lambda r: r["receiving_yards"], lambda r: r["receptions"]), "ypt": (lambda r: r["receiving_yards"], lambda r: r["targets"]),
                "epa_t": (lambda r: r["receiving_epa"], lambda r: r["targets"]), "td_rec": (lambda r: r["receiving_tds"], lambda r: r["receptions"]),
                "catch": (lambda r: r["receptions"], lambda r: r["targets"]), "fum_rec": (lambda r: r["rushing_fumbles"] + r["receiving_fumbles"], lambda r: r["receptions"]),
                "yac_rec": (lambda r: r["receiving_yards_after_catch"], lambda r: r["receptions"]), "tgt_g": (lambda r: r["targets"], g),
                "recyds_g": (lambda r: r["receiving_yards"], g)}
    if pos in ("LB", "DB", "DL"):
        return {"tkl_g": (lambda r: r["def_tackles_solo"] + r["def_tackle_assists"], g), "sack_g": (lambda r: r["def_sacks"], g),
                "int_g": (lambda r: r["def_interceptions"], g), "ff_g": (lambda r: r["def_fumbles_forced"], g),
                "pd_g": (lambda r: r["def_pass_defended"], g), "tfl_g": (lambda r: r["def_tackles_for_loss"], g), "qbh_g": (lambda r: r["def_qb_hits"], g)}
    return {}


SPECS = {p: spec(p) for p in ("QB", "RB", "WR", "TE", "LB", "DB", "DL")}
STATS = {p: list(s) for p, s in SPECS.items()}
POS = list(STATS)
LOWER = {"int", "sack", "fum_touch", "fum_rec"}
MAINSTAT = {"QB": "ya", "RB": "ypc", "WR": "ypt", "TE": "ypt", "LB": "tkl_g", "DB": "tkl_g", "DL": "tkl_g"}
THR_SEASON = {"QB": 150, "RB": 60, "WR": 30, "TE": 30, "LB": 10, "DB": 10, "DL": 10}
COLS = ["passing_yards", "attempts", "completions", "passing_tds", "passing_interceptions", "sacks_suffered", "passing_epa", "passing_cpoe", "rushing_epa",
        "rushing_yards", "carries", "rushing_tds", "receptions", "targets", "receiving_yards", "receiving_tds", "receiving_epa", "receiving_yards_after_catch",
        "rushing_fumbles", "receiving_fumbles", "def_tackles_solo", "def_tackle_assists", "def_sacks", "def_interceptions", "def_fumbles_forced",
        "def_pass_defended", "def_tackles_for_loss", "def_qb_hits"]
sgn = lambda st: -1.0 if st in LOWER else 1.0


def pctof(sorted_vals, v):
    n = len(sorted_vals)
    if n <= 1 or not np.isfinite(v):
        return float("nan")
    below = np.searchsorted(sorted_vals, v, "left")
    ties = np.searchsorted(sorted_vals, v, "right") - below
    return 100 * (below + (ties - 1) / 2) / (n - 1) if ties > 0 else 100 * below / n


# ---------- weekly stats -> per player-season sums
acc = defaultdict(lambda: {"g": 0})
for y in range(1999, NOW + 1):
    with gzip.open(CACHE / f"stats_player_week_{y}.csv.gz", "rt") as fh:
        for r in csv.DictReader(fh):
            if r["season_type"] != "REG":
                continue
            m = gmap.get(r["player_id"])
            if not m or m[0] not in SPECS:
                continue
            row = {c: fl(r.get(c)) for c in COLS}
            a = acc[(r["player_id"], y)]
            a["g"] += 1
            a["pos"] = m[0]
            for name, (nf, df) in SPECS[m[0]].items():
                n, d = nf(row), df(row)
                s = a.setdefault(name, [0.0] * 5)
                s[0] += n; s[1] += d; s[2] += n * n; s[3] += n * d; s[4] += d * d
            raw = a.setdefault("raw", defaultdict(float))
            for c in COLS:
                raw[c] += row[c]
by_pos_season = defaultdict(list)
for (gs, y), a in acc.items():
    by_pos_season[(a["pos"], y)].append((gs, a))
main_exp = lambda a, pos: a[MAINSTAT[pos]][1] if MAINSTAT[pos] in a else 0.0


def qualified(p):
    pos = p["pos"]
    g = lambda k: p.get(k) or 0
    return {"QB": g("att") >= 1500, "RB": g("ratt") >= 500, "WR": g("rec") >= 150, "TE": g("rec") >= 150}.get(pos, g("g") >= 48 if pos in SPECS else False)


qual = {k: qualified(p) for k, p in byk.items()}

# ---------- era adjustment, reliability, career excess
lg = {}
for (pos, y), lst in by_pos_season.items():
    for st in STATS[pos]:
        n = sum(a[st][0] for _, a in lst if st in a); d = sum(a[st][1] for _, a in lst if st in a)
        lg[(pos, y, st)] = n / d if d > 0 else 0.0


def excess(a, pos, y, st):
    if st not in a or a[st][1] <= 0:
        return None
    return a[st][0] - lg[(pos, y, st)] * a[st][1], a[st][1]


K = {}
for pos in POS:
    for st in STATS[pos]:
        xs, ds, ss, den_tot = [], [], 0.0, 0.0
        for y in range(2000, NOW):
            for gs, a in by_pos_season.get((pos, y), []):
                if main_exp(a, pos) < THR_SEASON[pos] or st not in a:
                    continue
                num, den, n2, nd, d2 = a[st]
                if den < 10:
                    continue
                r = num / den
                ss += n2 - 2 * r * nd + r * r * d2; den_tot += den - d2 / den
                xs.append(r - lg[(pos, y, st)]); ds.append(den)
        xs, ds = np.array(xs), np.array(ds)
        sig2 = ss / den_tot
        tau2 = xs.var() - np.mean(sig2 / ds)
        K[(pos, st)] = sig2 / tau2 if tau2 > 1e-12 else 1e9
career = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
seasons_of = defaultdict(list)
for (gs, y), a in acc.items():
    seasons_of[gs].append(y)
    for st in STATS[a["pos"]]:
        e = excess(a, a["pos"], y, st)
        if e:
            career[gs][st][0] += e[0]; career[gs][st][1] += e[1]
MU = {}
for pos in POS:
    for st in STATS[pos]:
        v = [career[gs][st][0] / career[gs][st][1] for gs in career if pos_of[gs] == pos and career[gs][st][1] > 0 and qual.get(key_of[gs])]
        MU[(pos, st)] = float(np.mean(v)) if v else 0.0


def shrunk_career(gs, pos, st):
    e, d = career[gs][st]
    if d <= 0:
        return None
    mu, k = MU[(pos, st)], K[(pos, st)]
    return mu + (e / d - mu) * d / (d + k)


# ---------- season rows (career-to-date prior) for the weight fit
cum = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
SEAS = {}
for y in range(1999, NOW + 1):
    for pos in POS:
        for gs, a in by_pos_season.get((pos, y), []):
            row = {}
            for st in STATS[pos]:
                e = excess(a, pos, y, st)
                if not e:
                    continue
                pe, pd_ = cum[gs][st]
                mu, k = MU[(pos, st)], K[(pos, st)]
                p0 = mu + ((pe / pd_) - mu) * pd_ / (pd_ + k) if pd_ > 0 else mu
                row[st] = p0 + (e[0] / e[1] - p0) * e[1] / (e[1] + k)
            SEAS[(gs, y)] = row
    for pos in POS:
        for gs, a in by_pos_season.get((pos, y), []):
            for st in STATS[pos]:
                e = excess(a, pos, y, st)
                if e:
                    cum[gs][st][0] += e[0]; cum[gs][st][1] += e[1]


def zpool(rows, pos):
    sts = STATS[pos]; M = np.full((len(rows), len(sts)), np.nan)
    for i, (_, r) in enumerate(rows):
        for j, st in enumerate(sts):
            if st in r:
                M[i, j] = r[st] * sgn(st)
    mu = np.nanmean(M, axis=0); sd = np.nanstd(M, axis=0); sd[sd == 0] = 1
    return (M - mu) / sd


def target_value(a, pos):
    g = max(1, a["g"])
    if pos == "QB": return (a["epa_db"][0] + a["rush_epa"][0]) / g
    if pos == "RB": return (a["repa_c"][0] + a["rec_epa_t"][0]) / g
    if pos in ("WR", "TE"): return a["epa_t"][0] / g
    r = a["raw"]
    return (3 * r["def_sacks"] + 4 * r["def_interceptions"] + 3 * r["def_fumbles_forced"] + r["def_pass_defended"] + 1.5 * r["def_tackles_for_loss"] + r["def_qb_hits"] + 0.3 * (r["def_tackles_solo"] + r["def_tackle_assists"])) / g


ROWS = defaultdict(list)
for pos in POS:
    for y in range(2000, NOW):
        pool = [(gs, SEAS[(gs, y)]) for gs, a in by_pos_season.get((pos, y), []) if main_exp(a, pos) >= THR_SEASON[pos]]
        if len(pool) < 12:
            continue
        Z = zpool(pool, pos)
        for i, (gs, _) in enumerate(pool):
            a1 = acc.get((gs, y + 1))
            nxt = target_value(a1, pos) if a1 and a1.get("pos") == pos and a1["g"] >= 8 and y + 1 < NOW else None
            ROWS[pos].append({"y": y, "z": Z[i], "next": nxt})
for pos in POS:
    by = defaultdict(list)
    for r in ROWS[pos]:
        if r["next"] is not None:
            by[r["y"]].append(r)
    for y, lst in by.items():
        v = np.array([r["next"] for r in lst]); m, s = v.mean(), v.std() or 1
        for r in lst:
            r["ny"] = (r["next"] - m) / s


def fit(pos):
    tr = [r for r in ROWS[pos] if r.get("ny") is not None and r["y"] <= 2017 and not np.isnan(r["z"]).any()]
    X = np.array([r["z"] for r in tr]); y = np.array([r["ny"] for r in tr])

    def solve(X, y, a):
        A = np.vstack([X, np.sqrt(a) * np.eye(X.shape[1])]); b = np.concatenate([y, np.zeros(X.shape[1])])
        return nnls(A, b)[0]
    best = None; folds = np.arange(len(tr)) % 5
    for a in (1, 10, 100, 300, 1000, 3000):
        err = 0
        for f in range(5):
            w = solve(X[folds != f], y[folds != f], a); err += ((X[folds == f] @ w - y[folds == f]) ** 2).sum()
        if best is None or err < best[0]:
            best = (err, a)
    w = solve(X, y, best[1])
    return w / w.sum() if w.sum() > 0 else np.ones_like(w) / len(w)


GROUPS_RB = {"rush": ["ypc", "repa_c", "ryds_g"], "rec": ["rec_epa_t", "catch", "tgt_g"], "mix": ["ypt", "td_touch"]}
GROUPS_REC = {"eff": ["ypt", "epa_t"], "vol": ["recyds_g", "tgt_g"], "rest": ["catch", "td_rec", "ypr", "yac_rec"]}


def revised_weights(pos):
    sts = STATS[pos]; w = {st: float(x) for st, x in zip(sts, fit(pos))}
    for st in sts:
        if K[(pos, st)] >= ZERO_K:
            w[st] = 0.0   # no signal: no weight, no tile

    def spread(group, share):
        tot = sum(w[s] for s in group)
        for s in group:
            w[s] = share * (w[s] / tot if tot > 0 else 1 / len(group))
    if pos == "RB":
        spread(GROUPS_RB["rush"], .45); spread(GROUPS_RB["rec"], .45); spread(GROUPS_RB["mix"], .10); w["fum_touch"] = 0.0
    if pos in ("WR", "TE"):
        spread(GROUPS_REC["eff"], .40); spread(GROUPS_REC["vol"], .40); spread(GROUPS_REC["rest"], .20); w["fum_rec"] = 0.0
    tot = sum(w.values())
    return {s: w[s] / tot for s in sts}


W = {pos: revised_weights(pos) for pos in POS}

# ---------- career efficiency percentile among qualified players (players with weekly data)
EFF = {}
for pos in POS:
    ids = [gs for gs in career if pos_of[gs] == pos]
    Z = np.full((len(ids), len(STATS[pos])), np.nan)
    for i, gs in enumerate(ids):
        for j, st in enumerate(STATS[pos]):
            v = shrunk_career(gs, pos, st)
            if v is not None:
                Z[i, j] = v * sgn(st)
    qm = np.array([bool(qual.get(key_of[gs])) for gs in ids])
    mu = np.nanmean(Z[qm], axis=0); sd = np.nanstd(Z[qm], axis=0); sd[sd == 0] = 1
    Zs = (Z - mu) / sd; w = np.array([W[pos][s] for s in STATS[pos]]); sc = []
    for i in range(len(ids)):
        ok = ~np.isnan(Zs[i]); sc.append(float((Zs[i][ok] * w[ok]).sum() / w[ok].sum()) if w[ok].sum() > 0 else np.nan)
    sc = np.array(sc); qs = np.sort(sc[qm & np.isfinite(sc)])
    for i, gs in enumerate(ids):
        if np.isfinite(sc[i]):
            EFF[key_of[gs]] = pctof(qs, sc[i])

# ---------- production and honours, then the career score
nq = defaultdict(int)
WEEKLY_G = defaultdict(int)
for (gs, y), a in acc.items():
    WEEKLY_G[key_of[gs]] += a["g"]
for (gs, y), a in acc.items():
    if main_exp(a, a["pos"]) >= THR_SEASON[a["pos"]]:
        nq[key_of[gs]] += 1


def prod_of(p):
    g = lambda k: p.get(k) or 0; pos = p["pos"]
    if pos == "QB": return g("yds") / 80 + .9 * g("td") + .9 * g("rtd") - .6 * g("int")
    if pos == "RB": return g("ryds") / 18 + 2.2 * g("rtd") + g("recyds") / 30 + 2.2 * g("rectd")
    if pos == "WR": return g("yds") / 14 + 2.5 * g("td")
    if pos == "TE": return g("yds") / 8 + 3 * g("td")
    return .7 * g("tkl") + 12 * g("int") + 14 * g("sck") + 14 * g("ff")


honours = lambda p: 30 * (p.get("mvp") or 0) + 18 * ((p.get("opoy") or 0) + (p.get("dpoy") or 0)) + 12 * (p.get("sbmvp") or 0) + 10 * (p.get("rings") or 0) + 2 * (p.get("roty") or 0)
RES = {}
for pos in POS:
    ks = [k for k, p in byk.items() if p["pos"] == pos]
    q = [k for k in ks if qual[k]]
    Pq = np.sort([prod_of(byk[k]) for k in q]); Lq = np.sort([nq.get(k, 0) for k in q]); hmax = max([honours(byk[k]) for k in q] + [1])
    score = {}
    for k in ks:
        p = byk[k]
        # weekly data must cover most of his career: a pre-1999 star with two weekly seasons is career-totals-only (his
        # efficiency would be two shrunk seasons and his longevity two seasons)
        weekly = k in EFF and WEEKLY_G.get(k, 0) >= 0.6 * max(1, p.get("g") or 0)
        prod = 0.7 * pctof(Pq, prod_of(p)) + 0.3 * pctof(Lq, nq.get(k, 0)) if weekly else pctof(Pq, prod_of(p))  # no weekly data: no longevity
        hon = 100.0 * honours(p) / hmax
        ph = 0.5 * prod + 0.5 * hon
        score[k] = (0.7 * EFF[k] + 0.3 * ph) if weekly else ph
        RES[k] = [None, EFF.get(k), prod, hon, honours(p), 0 if weekly else 1]
    qs = np.sort([score[k] for k in q])
    for k in ks:
        RES[k][0] = pctof(qs, score[k])
out = {"v": 1,
       "about": "scripts/nfl/career_rating.py: career score = 0.7 efficiency (era-adjusted, reliability-shrunk, fitted weights) + 0.3 (0.5 production + 0.5 honours); p = [CAR percentile among qualified players, efficiency pct (null: career totals only), production pct, honours pct (points scaled to the position max), raw honours points, totals-only flag]",
       "k": {pos: {st: round(float(K[(pos, st)]), 1) if K[(pos, st)] < 1e8 else None for st in STATS[pos]} for pos in POS},
       "weights": {pos: {st: round(w, 3) for st, w in W[pos].items() if w > 0} for pos in POS},
       "p": {k: [round(v[0], 1), None if v[1] is None else round(v[1], 1), round(v[2], 1), round(v[3], 1), v[4], v[5]] for k, v in sorted(RES.items()) if v[0] == v[0]}}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
top = lambda pos, n=5: ", ".join(f"{k.split(':')[1]} {RES[k][0]:.0f}" for k in sorted([k for k in RES if k.startswith(pos + ':') and qual[k]], key=lambda k: -RES[k][0])[:n])
print(f"career_rating: {len(out['p'])} players ({sum(1 for v in RES.values() if v[5])} totals-only); QB top: {top('QB')}")
