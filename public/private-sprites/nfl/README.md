# NFL sprite folder and index.json

Built by `npm run nfl:sprites` (sprites.py, kit_colors.py, jersey_numbers.py, silhouettes.py, era_sprites.py). Local only.

Files: `{uid}_{kit:03d}[_era][_pN].png` (64x64). `kit` is the club uid (`clubs`), `800` the neutral kit, `_era` the club's
famous era kit, `_pN` pose N (none = 1 standing, 2 ball at side, 3 arm up, 4 ball tucked, 5 spinning).

index.json (written compact, one line; read it with JSON.parse, never by line):
- `clubs` club name -> kit uid. `players` `POS:Name` -> `{uid, kits: {Club: [poses]}, neutral: [poses], silhouette?, shot?, from?, eras?}`.
  `silhouette`: no sprite of his own, a donor's body at that club with a blacked-out head (one file set per club in his stints);
  retired players have the standing pose at every club plus the role pose (QB 2, RB/WR/TE 4) at the club with most seasons.
- `eras` (on a player) `{Club: {poses: [..], mid: bool}}` and `eraKits` `{Club: {id, label, from, to}}`: the files
  `{uid}_{clubkit}_era[_pN].png` are the club's era kit (src/config/eraKits.ts spans). The site wears it for a `season` inside
  `[from, to]` (GameSprite `season` prop), or, with no season, when `mid` (the middle season of his time at the club is in the span).
- `aliases` `{file name a path builds: file that holds the image}`: identical images are stored once (spritelib.Store hashes the
  PNG bytes). Resolve every path through it (`nflFile` in src/utils/gameSprites.ts) before fetching.
- `anchors` `{file: [centre x, feet row]}` only where it differs from the body template's [31.5, 58] (the site's default).
- `silhouetteHeads` uids of face templates (`standins`) whose head outline is used for silhouettes; the site's runtime silhouette
  (`silhouetteFallback`) uses them for a player with no entry at all (a neutral donor body painted into his club, his number,
  blacked-out head). Never a random face.
- `kitColors`, `sockTemplate`, `numberFont`, `numberKit`, `numberFix`: the kit repaint tables (unchanged).
If the index is sharded later, keep these keys and the alias resolution.

---

# NFL sprite index: format and loading

Everything under this folder is the real players' Retro Bowl sprites (64 x 64 PNGs, `<uid>_<kit>[_p<pose>].png`) plus
the index the site reads to pick them. The sprites agent (scripts/nfl/sprites.py and friends) writes **`index.json`**, the
full index. The site never fetches it: `python3 scripts/perf/build_core.py` (`npm run perf:core`, run after every sprite
or data rebuild) turns it into the files below, and `data/manifest.json` carries their versions.

## Files

| file | what | who reads it |
|---|---|---|
| `index.json` | the **full** index, the build input. Never edit the split files by hand. | scripts (`widget_sprite_picks.ts`, `widget_sprites.py`), `build_core.py` |
| `core.json` | everything but retirees: `size`, `clubs`, `kitColors`, `sockTemplate`, `numberFont`, `numberKit`, `numberFix`, `standins`, `coaches`, `legends`, **`players` for Active players only** (status in `data/initial-data.csv`), `anchors` that differ from the default, and `shards` | the site at startup (`utils/gameSprites.ts`) |
| `shards/<i>.json` | `{ players: { "POS:Name": entry }, anchors: { "<file>.png": [cx, foot] } }` for every non-active player; `i = fnv1a("POS:Name") % 16` (`SPRITE_SHARDS` in build_core.py, `core.json` `shards.count`) | the site, one shard when a sprite of a player in it is first drawn |

`fnv1a` is the 32-bit FNV-1a over the UTF-16 code units of the key, the same function as `fnvHash` in gameSprites.ts and
`fnv1a` in build_core.py (offset 2166136261, prime 16777619).

Entry shape is unchanged from `index.json`: `{ uid, kits: { "<Club>": [poses] }, neutral: [poses], assigned?, pool? }`. An
`anchors` entry equal to the default `[31.5, 58]` is dropped (the reader's default), so the files only hold the exceptions.

## Rules for whoever writes sprites

1. Write `index.json` exactly as before (all players, all anchors), then run `npm run perf:core`.
2. A new player needs nothing else: his status decides core vs shard.
3. Never read `players` or `anchors` straight off the fetched index in site code: call `nflSpriteFor(...)` /
   `spritePending(nfl, key)`. A player's entry may still be in an unfetched shard; `nflSpriteFor` returns null while it
   loads and the sprites republish when it lands (GameSprite redraws).
4. Real legends (`legends`) and coaches stay in core (small, always needed).

## Why

At 10,000 players the full index was ~4 MB (about 400 KB gzipped) and blocked the first draw of every page. The active
roster plus the shared tables is now the only startup cost (about a third of it); retirees cost one ~20 KB shard per
sixteenth of the roster, and only when drawn. Files are fetched as `<path>?v=<hash>` and kept in Cache Storage
(`utils/dataStore.ts`), so a revisit loads none of them.

Shard note: a player's whole entry (kits, `eras`, `eraKits`, `silhouette`) travels with him into his shard or core; `aliases`, `anchors` for shared files, `silhouetteHeads`, `standins` stay in core.json.
