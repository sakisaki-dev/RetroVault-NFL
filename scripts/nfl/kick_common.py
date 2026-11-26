"""Kicker (K) maths shared by the NFL rating scripts (kicker_rating.py, season_ovr.py, this_season.py, fantasy.py).

Baselines come from data/nfl/kick_rates.json (scripts/nfl/build_players.py): every kicker's regular-season field goals by
distance band and extra points, summed per season, so every figure is measured against THAT season's league rate (the
extra-point rule changed in 2015; field goals got longer). Nothing here uses the Retro Bowl game's ratings."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANDS = ("0_19", "20_29", "30_39", "40_49", "50_59", "60_")
_rates = None


def rates():
    global _rates
    if _rates is None:
        d = json.loads((ROOT / "data" / "nfl" / "kick_rates.json").read_text())
        _rates = {int(y): v for y, v in d.items()}
    return _rates


def fg_expected(year, att_by_band):
    """Field goals an average kicker of that season makes on those attempts (by distance band)."""
    r = rates().get(year)
    if not r:
        return None
    out = 0.0
    for b, a in att_by_band.items():
        m0, a0 = r["fg"].get(b, [0, 0])
        if a and a0:
            out += a * m0 / a0
    return out


def xp_expected(year, att):
    r = rates().get(year)
    if not r or not r["xp"][1]:
        return None
    return att * r["xp"][0] / r["xp"][1]


def fg_over_expected(year, made_by_band, att_by_band):
    """Field goals made above what an average kicker makes from the same distances (negative: below)."""
    e = fg_expected(year, att_by_band)
    return None if e is None else sum(made_by_band.values()) - e


def xp_over_expected(year, made, att):
    e = xp_expected(year, att)
    return None if e is None else made - e


def points(fgm39, fgm49, fgm50, xpm):
    """Points he scored: 3 / 4 / 5 for a field goal by distance, 1 for an extra point."""
    return 3 * fgm39 + 4 * fgm49 + 5 * fgm50 + xpm


def season_bands(rows, cols):
    """(made by band, attempts by band, xp made, xp att) from game rows with the K_LOG columns."""
    c = {n: i for i, n in enumerate(cols)}
    made, att = {}, {}
    for b in BANDS:
        mi, xi = c.get(f"fg_made_{b}"), c.get(f"fg_missed_{b}")
        if mi is None:
            continue
        m = sum(r[mi] or 0 for r in rows)
        made[b] = m
        att[b] = m + sum(r[xi] or 0 for r in rows)
    t = lambda n: sum((r[c[n]] or 0) for r in rows) if n in c else 0
    return made, att, t("pat_made"), t("pat_att")
