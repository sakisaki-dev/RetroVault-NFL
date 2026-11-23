# Past players (debut 1999 or later), data output

Built by `scripts/nfl/build_players.py` (`legend_rows()`), run by `npm run nfl:rebuild`. Same formats as the save players.

Who: every nflverse player who debuted in 1999 or later and is not in the 2026 save, with 16+ regular-season games or any
Wikipedia award (`data/nfl/awards.json`). K and P are left out. Offensive linemen only when they debuted in 2013 or later
(weekly stat lines do not list linemen; games come from snap counts, which start in 2013). 4,229 players.

Where the fields are:
- `data/y80/players.json`: one row per player, keys as for the save players. Extra `nfl` fields for past players:
  `past: true`, `retired: true` (on no 2026 roster; `team` is his last club), `partial: true` (only with the flag below),
  `uid` = `l<gsis digits>` (no save sprite), `number` (his latest jersey), `gsis`, `dob`, `height`, `weight`, `draft`.
  `nick` = nickname (see below). Status Retired is written to `data/y80/owner_facts.json` by `scripts/nfl/prepare.py`.
- Keys / names: `POS:Name`. A name the save already uses (or a better-known namesake) becomes `Name (POS, Club)`; save
  players keep their old keys, so sprites keyed by key are unaffected.
- `data/y80/stints.json`: stints from games played per club per season, rings per stint.
- `data/nfl/careers.json`, `data/nfl/season_ends.json` (git-ignored): per player per season lines; `data/nfl/cuts/` (ignored):
  the league as it stood at each season end (market history reads them).
- Game logs: `data/nfl/games/<slug>.json` (git-ignored, now a real directory) -> `public/data/nfl/games/<slug>.json`
  (scripts/nfl/games_public.py), loaded per player only.
- Hall of Fame: `scripts/nfl/(nfl-wiki: fetch_hof.py, fetch_nicknames.py) write `data/nfl/hof.json` and `nicknames.json`;
  `scripts/hall_of_fame.py` uses `hof.json` (members = real inductees who are players here, class year, site HOF score
  beside; the ballot and watch list use the site rules for the rest). `scripts/nfl/fetch_nicknames_lead.py` (first paragraph of each
  notable player's Wikipedia page) writes `nicknames_infobox.json` {gsis: nick}. build_players reads both if present.
- Classics (pre-1999 careers from Wikipedia; `scripts/nfl/fetch_classics.py` -> `data/nfl/classics.json`, read by `build_players.py` through
  `scripts/nfl/classics.py`; pages cached in `data/nfl/wiki_cache/`, git-ignored). nflverse starts in 1999, so every earlier career was partial or
  missing. Each player's article gives his career totals (the Career row of the regular-season table, else the infobox), clubs and years (infobox
  career history, NFL clubs only), Super Bowl titles and draft; MVP / OPOY / DPOY / SB MVP / rookie awards come from `awards.json` by season and club.
  Scope: (a) the 56 partial-career players already here (full career replaces the 1999-on line, their weekly lines and game logs stay, the pre-1999
  amount is a baseline under every season line), (b) every Hall of Fame player inductee whose career began in 1970 or later, (c) every AP MVP / OPOY /
  DPOY / OROY / DROY / SB MVP since 1970. 144 added (7,441 players). `nfl.source: "wikipedia"`, `debut`, `last`, `wiki`; `careerOnly: true` = no weekly
  data at all (no season lines, no game log, not in career_seasons.json); `lines1999: true` = weekly lines from 1999; `missing: [...]` = stats the page
  does not carry for his era (pre-1990s tackles): the CSV cell is blank, True Talent and the skill grades use the stats that exist (never a zero, never
  imputed); `gEst: true` = games estimated from his seasons (no games figure on the page). The site's core extras carry `classics` (`d`, `l`, `c`, `m`,
  `e`) and the Deep Dive shows one note for them.
