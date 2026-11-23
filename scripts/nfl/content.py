#!/usr/bin/env python3
"""NFL edition: public/data/league/content.json, slim.

The fictional league's content (eras around the coach, storylines, rivalries, lineages, the AI lanes, the season rewind)
has no NFL counterpart in this phase. The site reads the same file, so it carries the same keys, empty, plus the real
Super Bowl list and the season. Deterministic.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "y80"
OUT = ROOT / "public" / "data" / "league" / "content.json"


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def main():
    sbs = json.loads((SRC / "super_bowls.json").read_text())
    season = max(s["season"] for s in json.loads((SRC / "coach.json").read_text())["seasons"])
    label = str(season)
    content = {
        "version": 1, "season": label, "edition": {"number": 0, "season": label, "upload": "",
                                                    "seed": fnv1a(f"{label}|nfl"), "label": f"{label} · NFL"},
        "title": f"{label} NFL", "source": "scripts/nfl/content.py (NFL edition)",
        "eras": [], "storylines": [], "rivalries": [], "rivalryFiles": [], "lineages": [], "snubs": [], "outsiders": [],
        "openQuestions": [], "playerNotes": [], "headlines": [], "headlinesInfo": {}, "hofClasses": [], "journal": [],
        "speeches": {}, "seasonStoryIndex": [], "hotTakesIndex": [], "tributeIndex": [], "tributeCandidates": [],
        "tributePlan": [], "tributeQueue": [], "seasonRewindIndex": [], "mechanics": {}, "ruleFacts": [],
        "superBowls": [{"number": s["number"], "roman": s["roman"], "year": int(s["year"]), "winner": s["winner"],
                        "loser": s["loser"], "score": s["score"], "yourResult": "not in it", "yourTeam": None}
                       for s in sbs],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(content, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(sbs)} Super Bowls, season {label}")


if __name__ == "__main__":
    main()
