#!/usr/bin/env python3
"""Fit the NFL Hall of Fame Score weights (scripts/hall_of_fame.py NFL_W) to the real inductees, and print the confusion table.

    RV_EDITION=nfl python3 scripts/nfl/hof_fit.py [--fit] [--seed N] [--iters N]

Without --fit it only prints the confusion table for the weights as shipped. With --fit it random-searches the weights
(inductee recall minus a penalty per non-inductee above the bar), then prints the best set to paste into NFL_W.
Needs public/data (run the rebuild first). Standard library only."""
import json
import os
import random
import sys
from pathlib import Path

os.environ.setdefault("RV_EDITION", "nfl")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import hall_of_fame as H  # noqa: E402

KEYS = ["stand_max", "stand_decay", "elite", "elite_top", "elite_cap", "long_from", "long_pts", "long_cap", "hon_scale", "hon_cap",
        "pre_pts", "pre_cap"]


def table(w, rows, real, bar=H.BAR):
    inn = [k for k in rows if k in real]
    out = [k for k in rows if k not in real]
    sc = {k: H.nfl_score(rows[k], w)["total"] for k in rows}
    return sc, sum(sc[k] >= bar for k in inn), sum(sc[k] < bar for k in inn), sum(sc[k] >= bar for k in out), len(inn), len(out)


def main():
    d = H.data()
    real = {m["key"] for m in d["members"] if m.get("real")}
    rows = {k: f for k, f in H._FEAT.items() if k in H._RETIRED and H._RETIRED[k]}
    sc, a, b, c, ni, no = table(H.NFL_W, rows, real)
    print(f"as shipped: {ni} inductees ({a} at or above the bar {H.BAR}, {b} below), {no} other retirees ({c} at or above)")
    if "--fit" in sys.argv:
        rnd = random.Random(int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 7)
        iters = int(sys.argv[sys.argv.index("--iters") + 1]) if "--iters" in sys.argv else 4000
        best, best_s = dict(H.NFL_W), None
        for i in range(iters):
            w = dict(best)
            for k in rnd.sample(KEYS, 3):
                v = w[k]
                w[k] = max(0.05, v * rnd.uniform(0.8, 1.25)) if isinstance(v, float) else max(1, round(v * rnd.uniform(0.8, 1.25)))
            if w['stand_max'] > 62 or w['long_cap'] > 24 or w['elite_cap'] > 32 or w['pre_cap'] > 60:
                continue   # bounds: the standing, longevity and peak terms keep their shipped scale
            _, a2, b2, c2, ni2, no2 = table(w, rows, real)
            s = a2 / ni2 - 0.9 * c2 / ni2
            if best_s is None or s > best_s:
                best, best_s = w, s
            if best_s is None:
                best_s = s
        for k in KEYS:
            v = best[k]
            best[k] = round(v, 2) if isinstance(v, float) else v
        sc, a, b, c, ni, no = table(best, rows, real)
        print(f"fitted:     {ni} inductees ({a} at or above, {b} below), {no} other retirees ({c} at or above)")
        print("NFL_W =", json.dumps({k: best[k] for k in KEYS}))
        H.NFL_W.update(best)
    names = ["Troy Aikman", "Steve Young", "Joe Montana", "Jerry Rice", "Barry Sanders", "Calvin Johnson", "Luke Kuechly",
             "Patrick Willis", "Darrelle Revis", "Peyton Manning", "Ray Lewis", "Deion Sanders", "Reggie White", "Lawrence Taylor",
             "Dan Marino", "John Elway", "Brett Favre", "Emmitt Smith"]
    for nm in names:
        for k in rows:
            if k.split(":", 1)[1] == nm:
                print(f"  {nm:16s} {k.split(':')[0]:3s} score {H.nfl_score(rows[k])['total']:3d}  rank {rows[k]['rank']}  "
                      f"{'INDUCTEE' if k in real else ''}")
    if "--list" in sys.argv:
        for k, v in sorted(sc.items(), key=lambda x: -x[1]):
            if v >= H.BAR and k not in real:
                print("  non-inductee above bar:", k, v)


if __name__ == "__main__":
    main()
