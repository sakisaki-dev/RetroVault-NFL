#!/usr/bin/env python3
"""NFL edition: the kickers' career rating (CAR), added to public/data/nfl/career_rating.json beside the other positions.

    python3 scripts/nfl/kicker_rating.py     (after career_rating.py, before season_skill_weights.py)

Same model as the other positions (career_rating.py): career score = 0.5 efficiency + 0.5 (0.5 production + 0.5 honours),
ranked ONLY within K, CAR = 62 + 37 x (pct / 100) ^ 2.5 (the site turns the percentile into the rating).
  efficiency   distance-weighted field goal accuracy: field goals made above what an average kicker of THAT season makes
               from the same distances (kick_rates.json, bands 0-19 ... 60+), per attempt, shrunk toward the average by
               n / (n + 75) attempts; plus extra point accuracy against the season's league rate, shrunk by n / (n + 100);
               80% field goals, 20% extra points, each as a z-score among the qualified kickers, then their percentile.
  production   volume: points scored (3 / 4 / 5 for a field goal 0-39 / 40-49 / 50+, 1 per extra point), 70%, and games
               played (longevity), 30%: percentiles among the qualified.
  honours      ring 10, MVP 30, Player of the Year 18, Super Bowl MVP 12, Rookie of the Year 2 (as the others), scaled to the
               position's maximum among the qualified.
Qualified = 100 career field goal attempts in the data (1999 on; a kicker who debuted earlier is rated on his 1999-on kicks).
Missing stats are skipped, never zero: a kicker with no kicks has no rating. Deterministic.
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kick_common as kc  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "nfl" / "career_rating.json"
GAMES = ROOT / "data" / "nfl" / "games"
QUALIFY = 100
K_FG, K_XP = 75, 100
W_FG = 0.8


def pctof(sorted_vals, v):
    n = len(sorted_vals)
    if n <= 1 or not np.isfinite(v):
        return float("nan")
    below = np.searchsorted(sorted_vals, v, "left")
    ties = np.searchsorted(sorted_vals, v, "right") - below
    return 100 * (below + (ties - 1) / 2) / (n - 1) if ties > 0 else 100 * below / n


def honours(p):
    return (30 * (p.get("mvp") or 0) + 18 * ((p.get("opoy") or 0) + (p.get("dpoy") or 0)) + 12 * (p.get("sbmvp") or 0)
            + 10 * (p.get("rings") or 0) + 2 * (p.get("roty") or 0))


def career_lines():
    """{key: {fgoe, att, xpoe, xpatt}} from the game logs (regular season)."""
    players = {f"{p['pos']}:{p['n']}": p for p in json.loads((ROOT / "data/y80/players.json").read_text()) if p["pos"] == "K"}
    out = {}
    for key, p in players.items():
        f = GAMES / (re.sub(r"[^a-z0-9]+", "-", key.lower()).strip("-") + ".json")
        if not f.exists():
            continue
        d = json.loads(f.read_text())
        by = defaultdict(list)
        for g in d["games"]:
            if g[2] == "REG":
                by[g[0]].append(g)
        fgoe = att = xpoe = xpatt = 0.0
        for y, rows in by.items():
            made, a, xm, xa = kc.season_bands(rows, d["cols"])
            o = kc.fg_over_expected(y, made, a)
            xo = kc.xp_over_expected(y, xm, xa)
            if o is not None:
                fgoe += o
                att += sum(a.values())
            if xo is not None:
                xpoe += xo
                xpatt += xa
        out[key] = (p, fgoe, att, xpoe, xpatt)
    return out


def rate_all():
    lines = career_lines()
    keys = sorted(lines)
    qual = {k: lines[k][2] >= QUALIFY for k in keys}
    fg = {k: lines[k][1] / (lines[k][2] + K_FG) for k in keys if lines[k][2] > 0}
    xp = {k: lines[k][3] / (lines[k][4] + K_XP) for k in keys if lines[k][4] > 0}
    q = [k for k in keys if qual[k]]

    def z(d):
        v = [d[k] for k in q if k in d]
        mu, sd = float(np.mean(v)), float(np.std(v)) or 1.0
        return {k: (d[k] - mu) / sd for k in d}

    zf, zx = z(fg), z(xp)
    eff_score = {k: W_FG * zf[k] + (1 - W_FG) * zx.get(k, zf[k]) for k in zf}
    qs = np.sort([eff_score[k] for k in q])
    eff = {k: pctof(qs, v) for k, v in eff_score.items()}
    pts = {k: kc.points(lines[k][0].get("fgm39") or 0, lines[k][0].get("fgm49") or 0, lines[k][0].get("fgm50") or 0, lines[k][0].get("xpm") or 0) for k in keys}
    Pq = np.sort([pts[k] for k in q])
    Lq = np.sort([lines[k][0].get("g") or 0 for k in q])
    hmax = max([honours(lines[k][0]) for k in q] + [1])
    score, res = {}, {}
    for k in keys:
        if k not in eff:
            continue
        p = lines[k][0]
        prod = 0.7 * pctof(Pq, pts[k]) + 0.3 * pctof(Lq, p.get("g") or 0)
        hon = 100.0 * honours(p) / hmax
        score[k] = 0.5 * eff[k] + 0.5 * (0.5 * prod + 0.5 * hon)
        res[k] = [None, eff[k], prod, hon, honours(p), 0]
    qs = np.sort([score[k] for k in q if k in score])
    for k in res:
        res[k][0] = pctof(qs, score[k])
    return res, q


def main():
    d = json.loads(OUT.read_text())
    res, q = rate_all()
    for k in [k for k in d["p"] if k.startswith("K:")]:
        del d["p"][k]
    d["p"].update({k: [round(v[0], 1), round(v[1], 1), round(v[2], 1), round(v[3], 1), v[4], v[5]] for k, v in res.items() if v[0] == v[0]})
    d["p"] = dict(sorted(d["p"].items()))
    d["k"]["K"] = {"fg": K_FG, "xp": K_XP}
    d["weights"]["K"] = {"fg": W_FG, "xp": round(1 - W_FG, 3)}
    OUT.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")) + "\n")
    top = ", ".join(f"{k.split(':')[1]} {res[k][0]:.0f}" for k in sorted(q, key=lambda k: -res[k][0])[:8])
    print(f"kicker_rating: {len(res)} kickers rated, {len(q)} qualified ({QUALIFY}+ attempts); top: {top}")


if __name__ == "__main__":
    main()
