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
- Hall of Fame: `scripts/nfl/fetch_wiki.py` writes `data/nfl/hof.json` and `nicknames.json`;
  `scripts/hall_of_fame.py` uses `hof.json` (members = real inductees who are players here, class year, site HOF score
  beside; the ballot and watch list use the site rules for the rest). `scripts/nfl/fetch_nicknames.py` (first paragraph of each
  notable player's Wikipedia page) writes `nicknames_infobox.json` {gsis: nick}. build_players reads both if present.
- Flag `RV_INCLUDE_PRE1999_HOF=1` (default off): also include real Hall of Famers who debuted before 1999 with their 1999-on
  stats only, marked `nfl.partial: true` (43 players: Peyton Manning, Brett Favre, Ray Lewis ...).

Nothing here is loaded at startup by itself; `public/data/initial-data.csv` simply has more rows.
