# Retro Vault: NFL edition

Fan stats hub for the real NFL (branch `nfl-demo`), built on the Retro Vault codebase. Vite + React + TypeScript +
Tailwind, `VITE_EDITION=nfl` (`IS_NFL` in code). Public at https://sakisaki-dev.github.io/RetroVault-NFL/.

**This file is kept short on purpose** (owner, 2026-11-27: token limits). The full reference, including the Retro Bowl
edition's pipeline, save import, collection economy, screensaver, Home Screen app, widget internals and every
generated-content rule, is `docs/CLAUDE_REFERENCE.md`. Read the section you need there (grep its `## ` / `### `
headings) before changing that area; don't read it whole.

## Deploy (public site)

- The site updates only by an explicit push: `git push nfl nfl-demo:main` (remote `nfl` =
  github.com/sakisaki-dev/RetroVault-NFL). That runs `.github/workflows/deploy-nfl-pages.yml`. Nothing pushes it automatically.
- **Never push `nfl-demo` to the Retro Bowl repo** (`origin`) and never merge it into `retrovault-v2`/`main` there.
- Before a push, scan the new commits for anything private (tokens `github_pat_`/`ghp_`/`gho_`/`sk-ant`/`AKIA`, emails,
  phone numbers, addresses). Raw saves (`data/saves/`) and upload images stay git-ignored; never commit them, the
  `data/nfl-cache`, `data/nfl/games`, `wiki_cache`, `league_cache` folders, or worktree symlinks.
- "Live" means the Pages deploy for that commit finished and the live site was checked, not just that the push went out.
- The daily widget job (`nfl-widget-daily.yml`) commits only to the `widget-data` branch; never push there by hand.
  Widget details: `docs/CLAUDE_REFERENCE.md` "NFL widget" and `widget/README.md`.

## Build and check

- Build: `VITE_EDITION=nfl ./node_modules/.bin/vite build --outDir dist-nfl --emptyOutDir`; preview on port 4174
  (`vite preview --outDir dist-nfl --port 4174`). Never use 4173 (the Retro Bowl preview). Helpers use their own ports.
- Typecheck `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`; `npm run -s test:trade`; data audit
  `python3 scripts/nfl/audit.py` (0 errors). Python with numpy: `/usr/bin/python3` (scipy-dependent scripts need a
  Python that has scipy).
- Data rebuild: `npm run nfl:rebuild` (players → league data → career and kicker ratings → season OVR → market snapshot →
  …). Generated files are never hand-edited. Keep a market-history change to one new snapshot per update.
- Keep every save compiling; the owner often has the dev server open. Stop servers by PID, never a broad `pkill`.

## Rules that apply everywhere

- **Data in, everything else generated.** Ratings (SZN, OVR/CAR, Career Legacy, skill grades), Hall of Fame, odds, power,
  fantasy projections, lineups, records, streaks, spotlight picks and card values are deterministic rules over real data
  (nflverse, ESPN, Wikipedia, the owner's Retro Bowl save for sprites). Nothing at runtime calls an AI model. Never use
  Retro Bowl in-game ratings.
- **Missing stats are skipped, never counted as zero or invented.** Old eras lacking a stat are scored on what was recorded,
  shrunk by coverage (`docs/STATS_REFERENCE.md`).
- **Cards are timeless:** nothing live-changing on a collectible card's face; career details freeze at the pull.
- **Design:** immersion from the site's own assets (sprites, stadium art, logos, toned club colours, Silkscreen kickers,
  Barlow Condensed); data pages may stay professional. Less text (one short line per section; methods behind an info
  toggle). Rows and grids fill their container evenly. Clickable player names are club-colour banner strips with the NFL
  logo, never underlined text. No gold hover borders; soft hovers. Phone first, no horizontal overflow at 390 px.
- **Reduced motion is real:** one source of truth (`isReducedMotion()` / `useReducedMotion()` in `src/hooks/usePerfMode.ts`,
  `html[data-reduce-motion]`); count-ups show final values, loops stop.
- **Player taps open the player card first** (`openPlayerCard(key)`), never the Deep Dive directly.

## Code notes

- Fetch data with `${import.meta.env.BASE_URL}data/...`, never `/data/...` (Pages serves under `/RetroVault-NFL/`).
- Routing is hash-based (`#stats/deepdive?p=QB:Name`): `src/components/stats/hub/hashRoute.ts`.
- Formulas: `docs/STATS_REFERENCE.md`, `src/config/ovr.ts`, `src/config/skillGrades.ts`, `src/config/advanced.ts`.
- Shared controls: `src/components/controls/` (PageTabs, Choice, Select, FilterSheet, PillScroller); swipe engine
  `src/utils/swipeSlide.ts`; sprites `src/components/GameSprite.tsx` (hover name toast built in).
- Where things live, by area (details in `docs/CLAUDE_REFERENCE.md`): Season page `src/components/tabs/SeasonTab.tsx` +
  `src/components/season/`; club sheet `src/components/clubseason/`; game page `src/components/game/`; News
  `src/components/espn/`; Fantasy `src/components/fantasy/`; trade desk `src/components/trade/`; Deep Dive
  `src/components/stats/comps/`; Collection `src/components/collection/` + `src/utils/economy.ts`; screensaver
  `src/components/screensaver/`; boot loader inline in `index.html`.

## Working with helpers (token budget)

- Do small fixes directly; spawn a helper only for genuinely separate, sizeable work, and group related asks.
- Helpers: one cropped screenshot per change at the sizes that matter, short reports, no full-page captures.
