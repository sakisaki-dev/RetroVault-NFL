"""Parse cached Pro Football Reference year pages (data/nfl/league_cache/pfr_<year>.html, git-ignored, fetched once from
web.archive.org copies) into the league totals per season: data/nfl/league_cache/league_totals.json (also git-ignored)."""
import json
import re
from pathlib import Path

D = Path(__file__).resolve().parents[2] / "data" / "nfl" / "league_cache"


def table(s, tid):
    i = s.find(f'id="{tid}"')
    return s[i:s.find("</table>", i)] if i >= 0 else ""


def rows(tb):
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S):
        d = {m[0]: re.sub(r"<[^>]+>", "", m[1]).strip() for m in re.findall(r'data-stat="([^"]+)"[^>]*>(.*?)</t[dh]>', tr, re.S)}
        if d:
            yield d


def num(x):
    try:
        return float(x.replace(",", ""))
    except Exception:
        return None


out = {}
for f in sorted(D.glob("pfr_*.html")):
    y = int(f.stem.split("_")[1]); s = f.read_text(errors="ignore")
    r = {}
    tg = 0
    for d in rows(table(s, "passing")):
        if d.get("team") == "League Total":
            for k in ("pass_cmp", "pass_att", "pass_yds", "pass_td", "pass_int", "pass_sacked"):
                r[k] = num(d.get(k, ""))
        elif d.get("team") and d.get("team") not in ("Avg Team", "Avg Tm/G") and num(d.get("g", "")):
            tg += num(d["g"])
    for d in rows(table(s, "rushing")):
        if d.get("team") == "League Total":
            for k in ("rush_att", "rush_yds", "rush_td"):
                r[k] = num(d.get(k, ""))
    r["team_games"] = tg
    out[y] = r
(D / "league_totals.json").write_text(json.dumps(out, indent=1, sort_keys=True))
for y in sorted(out):
    r = out[y]; print(y, r.get("team_games"), r.get("pass_att"), r.get("pass_cmp"), r.get("pass_sacked"), r.get("rush_att"), r.get("pass_td"), r.get("pass_int"))
