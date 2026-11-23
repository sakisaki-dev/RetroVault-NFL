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
