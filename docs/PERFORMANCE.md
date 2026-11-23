# Loading architecture and the contract for new per-player data

Owner (2026-11-23): the roster is about to grow from 3,012 to 8,000-10,000 players, so loading, indexing and search must
scale cross-site. This is the shape that does, and the rules other branches follow.

## How data loads

1. **`data/manifest.json`** (written by `scripts/perf/build_core.py`, `npm run perf:core`, after every data rebuild) lists
   a version (8 hex of the sha1) for every JSON/CSV the site fetches. `src/utils/dataStore.ts` (`dataFetch`, `dataJson`,
   `dataText`, `dataResponse`) fetches `<path>?v=<version>` and keeps the response in Cache Storage (`rv-data-v1`), so a
   revisit or a second page costs nothing and a data update is a new URL. No manifest, no Cache Storage, or dev: the old
   no-cache fetch. **Every new data file the site fetches goes through dataStore, never a bare `fetch`.**
2. **Core** (startup): `data/initial-data.csv` (the league), `data/core/extras.json` (banner / legacy teams, real numbers,
   retired-by, former names, cards, family, real NFL careers), `data/league/season_ovr.json`, `data/league/content.json`
   and `private-sprites/nfl/core.json` (sprite tables, active players' sprites).
3. **History** (lazy): `data/history/stints.json` and `franchises.json` load the first time a component reads
   `extras.stints` / `extras.franchises` (`usePlayerExtras()` returns getters that start the load and re-render the reader).
   `data/nfl/advanced/<POS>.json` loads with a Deep Dive on that position (`useAdvanced(pos)`), `data/nfl/games/<slug>.json`
   with a player's game log, `data/market.json` and `data/league/career_seasons.json` with the pages that read them,
   `private-sprites/nfl/shards/<i>.json` when a retiree's sprite is first drawn.

## Contract for new per-player data

- **Needed by every page to draw a player** (a name tag, a number, a team colour): put it in the core extras
  (`build_core.py split_extras`), one short value per player, and only if it must be there at startup.
- **Anything else per player** (a career line, a season row, a text, a rating history): its own lazy file, sharded when it
  is per player: `data/<topic>/<POS>.json` (like advanced) or a hash shard (`fnv1a("POS:Name") % N`, like the sprites),
  produced by `scripts/perf/build_core.py` (add a function, add it to `manifest()`'s scan: any `.json`/`.csv` under
  `public/data` that is not in `nfl/games` is listed automatically), loaded through dataStore with a
  `useX(pos | key)` hook, and kept out of the startup path. Retirees' heavy data goes here, never into the CSV or core extras.
- **Derived numbers** (ratings, percentiles, tiers, search tokens): compute them in a build script, not at startup. Where a
  client computation is unavoidable, it must be O(n log n), shared (one memo for all callers, see `useGamePool`'s
  `sharedPool`) and built only when its section is on screen (`DeferredSection`).
- **Long lists**: `useProgressiveRows` for tables in the page flow, `DeferredSection` for heavy sections, a cap with the
  shape kept for charts (`MAX_DOTS` / `MAX_DRAWN`). No list renders more than a screen or two of rows up front.
- **Search**: `usePlayerSearch` / `pooledIndex` over the shared index (warmed at idle by `useWarmPlayerSearch`). Don't build
  a second index.
- After a roster change run `npm run perf:core`, commit `public/data/manifest.json` with the rest. `npm run perf:synth` then
  `RV_PUBLIC_DIR=<dir> VITE_EDITION=nfl npx vite build --outDir <out>` and `node scripts/perf/measure.mjs --dist <out>`
  measure a synthetic 10,000-player roster (budgets below).

## Budgets (10,000 players, this Mac, cold)

First load at most 1.5x today's (910 KB at 3,012 players); header and picker typing under 100 ms; no page over 1 s to
interactive (first screen drawn and the main thread idle). Sections below the fold cost their time when scrolled to.

## Tools

`scripts/perf/measure.mjs` (headless Chrome over CDP: bytes, requests, interactive time, blocking, heap, typing latency,
scroll-through), `serve.mjs` (static server with gzip), `synth.py` (synthetic roster), `compare.mjs` (median table),
`build_core.py` (the split and the manifest).

## Classics (career-only players)

Career-only players' per-player data lives where all retirees' data does: the CSV row (career totals, blank = not recorded), history stints, game-log
files (none for them), sprite shards. The only core addition is `classics` in `data/core/extras.json` (about 200 short entries). No lazy file of their own.
