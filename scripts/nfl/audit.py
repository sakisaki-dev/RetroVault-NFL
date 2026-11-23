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
    miss = [k for k in keys if k not in have]
    if miss:
        errors.append(f"{len(miss)} players without a sprite entry, e.g. {miss[:3]}")
else:
    warns.append("no sprites (run npm run nfl:sprites)")
print(f"nfl audit: {len(players)} players, {len(errors)} errors, {len(warns)} warnings")
for w in warns[:10]:
    print("warn:", w)
for e in errors:
    print("ERROR:", e)
sys.exit(1 if errors else 0)
