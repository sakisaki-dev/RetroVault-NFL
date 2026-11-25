#!/usr/bin/env python3
"""NFL edition: a light audit of the generated files the kept pages read. Exits 1 on an error."""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public" / "data"
errors, warns = [], []


def load(rel):
    p = PUB / rel
    if not p.exists():
        errors.append(f"missing public/data/{rel}")
        return None
    try:
        return json.loads(p.read_text())
    except Exception as e:  # noqa: BLE001
        errors.append(f"public/data/{rel}: {e}")
        return None


players = json.loads((ROOT / "data/y80/players.json").read_text())
keys = {f"{p['pos']}:{p['n']}" for p in players}

# bio.json and thisseason.json (Deep Dive bio pills and This season header)
for rel in ("nfl/bio.json", "nfl/thisseason.json"):
    d = load(rel)
    if d:
        ks = set(d["p"])
        if not ks <= keys:
            errors.append(f"{rel}: {len(ks - keys)} keys not in players.json")
        if not ks:
            errors.append(f"{rel}: empty")
        if rel == "nfl/bio.json":
            bad = [k for k, v in d["p"].items() if (v[0] and not 48 <= v[0] <= 94) or (v[1] and not 120 <= v[1] <= 450)]
            if bad:
                warns.append(f"bio.json: {len(bad)} implausible height/weight rows, e.g. {bad[:3]}")
rows = [r for r in csv.reader((PUB / "initial-data.csv").open()) if len(r) > 5 and r[0] not in ("Name",)]
names = {r[0] for r in rows if r[1] in ("Active", "Retired")}
if len(names) < len({p["n"] for p in players}):
    errors.append(f"initial-data.csv has {len(names)} players, players.json {len({p['n'] for p in players})}")
past_retired = {p["n"] for p in players if (p.get("nfl") or {}).get("retired")}
if any(r[1] == "Retired" and r[0] not in past_retired for r in rows):
    errors.append("a player is Retired who is not a past player (the save's players are Active)")
market = load("market.json")
if market and not any(str(x.get("season")) == "2026" for x in market.get("snapshots", [])):
    errors.append("market.json has no 2026 snapshot")
content = load("league/content.json")
sched = load("league/schedule.json")
if sched and not sched.get("seasons"):
    errors.append("schedule.json has no seasons")
recs = load("league/records.json")
if recs and not any(r.get("league") for r in recs["records"]):
    errors.append("records.json has no league marks")
hof = load("league/halloffame.json")
if hof and hof.get("members") and not all(m.get("real") for m in hof["members"]):
    errors.append("a Hall of Fame member is not a real inductee (data/nfl/hof.json)")
if hof and (hof.get("ballot") or hof.get("watch") or hof.get("soon") or hof.get("snubs") or any("score" in m or "parts" in m for m in hof.get("members", []))):
    errors.append("halloffame.json carries a Hall of Fame score, ballot or watch list (the NFL edition keeps real membership only)")
extras = load("player-extras.json")
if extras:
    stints = extras.get("stints", {})
    for p in players:
        if p["n"] not in stints:
            warns.append(f"no stints for {p['n']}")
            break
    for name, team in extras.get("signatureTeams", {}).items():
        pass
sp = ROOT / "public" / "private-sprites" / "nfl" / "index.json"
if sp.exists():
    idx = json.loads(sp.read_text())
    have = set(idx.get("players", {}))
    past = {f"{p['pos']}:{p['n']}" for p in players if (p.get("nfl") or {}).get("past")}
    miss = [k for k in keys if k not in have and k not in past]
    if miss:
        errors.append(f"{len(miss)} players without a sprite entry, e.g. {miss[:3]}")
    if len([k for k in past if k not in have]):
        warns.append(f"{len([k for k in past if k not in have])} past players have no sprite entry yet (silhouettes: nfl-sprites)")
else:
    warns.append("no sprites (run npm run nfl:sprites)")
col = load("nfl/college/index.json")
if col:
    for y, n, _rounds, _rated in col["years"]:
        f = PUB / "nfl" / "college" / "draft" / f"{y}.json"
        if not f.exists():
            errors.append(f"college: no draft file for {y}")
        elif len(json.loads(f.read_text())["picks"]) != n:
            errors.append(f"college: {y} pick count differs from the index")
    for row in col["schools"]:
        if not (PUB / "nfl" / "college" / "schools" / f"{row[0]}.json").exists():
            errors.append(f"college: no school file for {row[0]}")
    for row in col["schools"]:
        for k in json.loads((PUB / "nfl" / "college" / "schools" / f"{row[0]}.json").read_text())["players"]:
            if k[0] not in keys:
                errors.append(f"college: {row[0]} names {k[0]}, not a site player")
                break
needs = load("nfl/college/needs.json")
if needs and len(needs.get("clubs", {})) != 32:
    errors.append(f"college needs.json has {len(needs.get('clubs', {}))} clubs")
po = load("nfl/playoff_odds.json")
if po:
    cl = po.get("clubs", {})
    if len(cl) != 32:
        errors.append(f"playoff_odds.json has {len(cl)} clubs")
    else:
        if po["status"] == "live":
            for conf in ("AFC", "NFC"):
                tot = sum(c["playoffs"] for c in cl.values() if c["conf"] == conf)
                if abs(tot - 7) > 0.01:
                    errors.append(f"playoff_odds.json {conf} playoff chances sum to {tot:.3f}, not 7")
            if abs(sum(c["superBowl"] for c in cl.values()) - 1) > 0.01:
                errors.append("playoff_odds.json Super Bowl chances do not sum to 1")
            for k, c in cl.items():
                if c["tag"] in ("x", "y", "z") and c["playoffs"] < 1:
                    errors.append(f"playoff_odds.json {k} is marked clinched but is {c['playoffs']} in the simulation")
                if c["tag"] == "e" and c["playoffs"] > 0:
                    errors.append(f"playoff_odds.json {k} is marked eliminated but is {c['playoffs']} in the simulation")
        else:
            if sum(1 for c in cl.values() if c.get("seed")) != 14:
                errors.append("playoff_odds.json final field is not 14 clubs")
        # the projected draft order: every club a slot distribution summing to 1, every slot filled once per simulation
        if not po.get("draft") or sorted(po["draft"].get("order", [])) != sorted(cl):
            errors.append("playoff_odds.json has no projected draft order for all 32 clubs")
        else:
            for k, c in cl.items():
                if abs(sum(c["draft"]["dist"]) - 1) > 0.01:
                    errors.append(f"playoff_odds.json {k} draft slots sum to {sum(c['draft']['dist']):.3f}")
            for i in range(32):
                if abs(sum(c["draft"]["dist"][i] for c in cl.values()) - 1) > 0.01:
                    errors.append(f"playoff_odds.json draft pick {i + 1} is not filled once per simulation")
                    break
        if not any(str(x.get("season")) == str(po["season"]) for x in (sched or {}).get("seasonIndex", [])) and po["status"] == "live":
            warns.append("playoff_odds.json season has no schedule.json entry")
wd = load("nfl/widget.json")
if wd:
    if po and (wd["season"] != po["season"] or wd["week"] != po["week"]):
        errors.append("nfl/widget.json is stale (season or week differs from playoff_odds.json): run scripts/nfl/widget_data.py")
    sprites = {u for p in wd["players"].values() for u in p["sprites"].values()}
    art = [u for k, v in wd["art"].items() for u in (v.values() if isinstance(v, dict) else [v])]
    for u in list(sprites) + art:
        if not (PUB.parent / "public" / u).exists() and not (ROOT / "public" / u).exists():
            errors.append(f"nfl/widget.json names {u}, which is not a file")
            break
    if wd["club"]["w"] + wd["club"]["l"] + wd["club"]["t"] != sum(1 for g in wd["schedule"] if g["played"]):
        errors.append("nfl/widget.json: the club's record does not match its played games")
    if len(wd["mvp"]) < 3 or not wd.get("best"):
        warns.append("nfl/widget.json has no MVP race or club best player")
print(f"nfl audit: {len(players)} players, {len(errors)} errors, {len(warns)} warnings")
for w in warns[:10]:
    print("warn:", w)
for e in errors:
    print("ERROR:", e)
sys.exit(1 if errors else 0)
