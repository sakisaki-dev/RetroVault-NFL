# NFL Wikipedia data (hof.json, nicknames.json)

Fetched 2026-11-23 by `scripts/nfl/fetch_hof.py` and `scripts/nfl/fetch_nicknames.py` (shared helper `scripts/nfl/wikitab.py`).
Python standard library only; run with `python3 -I scripts/nfl/<script>.py` (falls back to /etc/ssl/cert.pem when Python has no CA bundle).
Local demo data only.

## Sources
- https://en.wikipedia.org/wiki/List_of_Pro_Football_Hall_of_Fame_inductees (both tables: the NFL table and "Inductees who have played for non-NFL teams")
- https://en.wikipedia.org/wiki/List_of_NFL_nicknames ("People" table; "Teams and units" for groups)
- https://en.wikipedia.org/wiki/List_of_North_American_football_nicknames ("Players" list; American football "Teams" for groups)
  (the pages named "List of American football nicknames" / "List of nicknames in American football" do not exist)

## hof.json
`{source, fetched, count, inductees[]}`: 387 inductees, classes 1963 to 2026 (64 classes), latest class 2026 (Drew Brees, Roger Craig,
Larry Fitzgerald, Luke Kuechly, Adam Vinatieri). 337 players, 25 coaches, 25 contributors. Class 2020 has 20 (Centennial Slate).
Each inductee: `name`, `class`, `role` (`player` | `coach` | `contributor`), `also_roles` (e.g. a coach who was also an owner, or a
player who coached), `positions` (abbreviated: QB RB FB HB WR TE OT T G C DE DT NT DL LB CB S DB K P KR PR E MG; empty for non-players),
`teams` (current franchise nicknames in career order), `primary_teams` (franchises with at least half the years of his longest one),
`defunct_teams` (raw names of clubs that no longer exist, e.g. Canton Bulldogs), `years_active` `[first, last]` (min and max year
across all his team rows), `premodern_era` (Wikipedia's "Pre-Modern Era: Two-Way Performer" tag), `wikipedia_title`,
`teams_detail[]` (`team_raw`, `franchise` or null, `years` as printed, `league` for the non-NFL table), and flags where present:
`first_year_eligible`, `first_year_finalist`, `charter_member`, `centennial_slate`.
Historic names are mapped to today's nickname: Redskins to Commanders, Oilers to Titans, Staleys to Bears, Pittsburgh Pirates to
Steelers, Baltimore Colts to Colts, Oakland/LA Raiders to Raiders, St. Louis/Cleveland Rams to Rams, Dallas Texans (AFL) to Chiefs, etc.

## nicknames.json
`{sources, fetched, count, players[], groups[], non_players[]}`.
- `players[]` (260, one row per player, merged by normalised name across both pages): `name`, `nicknames[]` (293 total, 28 players have
  more than one), `position` (when the list gives it or the description names one; else from hof.json for Hall of Famers), `teams[]`
  (franchise nicknames), `era_hint` `{years:[a,b], source}` (years/decades in the Wikipedia text, else hof.json `years_active`),
  `notes[]` (Wikipedia's explanation of the nickname), `sources[]`, and `hall_of_fame` (class year) when he is in hof.json.
- `groups[]` (135): team, unit and duo nicknames (Legion of Boom, The Hogs, Williams Wall...), each `{nickname, description, members[], teams[], page}`.
  Nicknames shared by two or more players in one row (e.g. "Thunder and Lightning") are moved here.
- `non_players[]` (10): People-table rows whose description reads as coach, owner, official or broadcaster.

## Known gaps
- Only what the three list pages carry (about 260 players): most players with famous nicknames in infoboxes only are missing.
  Tom Brady has "The GOAT" but not "TB12"; Peyton Manning has "The Sheriff" only.
- `position`, `teams` and `era_hint` are sparse (about 110, 92 and 79 of 260 rows): the People table has no such columns, so they come
  from description text and, for Hall of Famers, hof.json. Teams read from the description can include a club only mentioned
  in passing. Positions are absent for many modern players.
- Nickname splits on "or"/commas/slashes in the People table follow Wikipedia's bold markup; a few entries have abbreviation variants
  (Adrian Peterson: All Day, AD, AP).
- Group `members` are links in the description minus clubs and seasons; some are not people.
- hof.json: rows for modern-era NFL inductees with no NFL team row (a few early pioneers) have empty `teams`; coaches and
  contributors have no `positions`. Years for contributors are their tenure. Position cells such as "Tackle, Guard" are
  split; the rare unknown word is kept raw in `positions`.
- Tom Brady, Bill Belichick: not on the page (not yet inducted).
