#!/usr/bin/env python3
"""Build-time split of the per-player data into what loads at startup (core) and what loads lazily (history / shards),
plus the content-version manifest the site caches by. Run after the data rebuild (`npm run perf:core`; the NFL rebuild
and the live rebuild both end with it). Deterministic: two runs give byte-identical output. Reads public/data and
public/private-sprites (or RV_PUBLIC_DIR), never writes outside them.

  data/core/extras.json            signature / legacy teams, real numbers, retired-by, former names, cards, family, real
                                   NFL careers: what every page needs to dress a player. (No stints, no franchises.)
  data/history/stints.json         career stints per player (the heavy part of player-extras.json), loaded by the pages
  data/history/franchises.json     that read them (player card, Front Office, Hall of Fame, team pages)
  data/nfl/advanced.meta.json      the advanced-stat metric table, no per-player rows
  data/nfl/advanced/<POS>.json     the per-player rows of one position (loaded with the Deep Dive of a player there)
  private-sprites/nfl/core.json    sprite index minus players and anchors (kits, number tables, standins, coaches) plus
                                   the ACTIVE players and the anchors that differ from the default
  private-sprites/nfl/shards/<i>.json   everyone else (retirees), sharded by hash of "POS:Name" (SPRITE_SHARDS)
  data/manifest.json               { v, files: { "<path under the site>": "<8 hex of its sha1>" } }, the version the site
                                   fetches each data file by (utils/dataStore.ts), so a revisit loads nothing

The sprite shard format is documented in public/private-sprites/nfl/README.md.
"""
import csv, hashlib, io, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUB = Path(os.environ.get('RV_PUBLIC_DIR') or ROOT / 'public').resolve()
DATA = PUB / 'data'
SPR = PUB / 'private-sprites'
SPRITE_SHARDS = 16
DEFAULT_ANCHOR = [31.5, 58]


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for ch in text.encode('utf-16-le').decode('utf-16-le'):  # JS charCodeAt walks UTF-16 code units
        for unit in (ord(ch),) if ord(ch) < 0x10000 else ((0xD800 + ((ord(ch) - 0x10000) >> 10)), (0xDC00 + ((ord(ch) - 0x10000) & 0x3FF))):
            h ^= unit
            h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(',', ':'), ensure_ascii=False, sort_keys=False) + '\n')


def active_keys() -> set:
    """POS:Name of every player whose status is Active (the league CSV)."""
    out = set()
    pos = None
    lines = (DATA / 'initial-data.csv').read_text().split('\n')
    for i, line in enumerate(lines):
        if line in ('QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'):
            pos = line
        elif pos and line and not line.startswith('Name,') and ',' in line:
            row = next(csv.reader([line]))
            if len(row) > 2 and row[1] == 'Active':
                out.add(f'{pos}:{row[0]}')
    return out


def split_extras() -> None:
    src = DATA / 'player-extras.json'
    if not src.exists():
        return
    d = json.loads(src.read_text())
    heavy = ('stints', 'franchises')
    dump(DATA / 'core' / 'extras.json', {k: v for k, v in d.items() if k not in heavy})
    dump(DATA / 'history' / 'stints.json', d.get('stints', {}))
    dump(DATA / 'history' / 'franchises.json', d.get('franchises', {}))


def split_advanced() -> None:
    src = DATA / 'nfl' / 'advanced.json'
    if not src.exists():
        return
    d = json.loads(src.read_text())
    p = d.pop('p', {})
    dump(DATA / 'nfl' / 'advanced.meta.json', d)
    by_pos = {}
    for key, v in p.items():
        by_pos.setdefault(key.split(':', 1)[0], {})[key] = v
    for pos, rows in by_pos.items():
        dump(DATA / 'nfl' / 'advanced' / f'{pos}.json', rows)


def split_sprites(active: set) -> None:
    src = SPR / 'nfl' / 'index.json'
    if not src.exists():
        return
    d = json.loads(src.read_text())
    players = d.pop('players', {})
    anchors = d.pop('anchors', {})
    uid_owner = {}  # uid -> key, so a player's files' anchors travel with him
    for key, e in players.items():
        uid_owner[str(e.get('uid'))] = key
    core_players, shards = {}, [{'players': {}, 'anchors': {}} for _ in range(SPRITE_SHARDS)]
    for key, e in players.items():
        (core_players if key in active else shards[fnv1a(key) % SPRITE_SHARDS]['players']).__setitem__(key, e)
    core_anchors = {}
    for f, a in anchors.items():
        if list(a) == DEFAULT_ANCHOR:  # the reader's default (nfl.anchors?.[file] ?? 31.5, 58): drop, lossless
            continue
        key = uid_owner.get(f.split('_', 1)[0])
        if key is not None and key not in active:
            shards[fnv1a(key) % SPRITE_SHARDS]['anchors'][f] = a
        else:
            core_anchors[f] = a
    core = dict(d)
    core['players'] = core_players
    core['anchors'] = core_anchors
    core['shards'] = {'count': SPRITE_SHARDS, 'hash': 'fnv1a(POS:Name) % count', 'file': 'shards/{i}.json'}
    dump(SPR / 'nfl' / 'core.json', core)
    for i, s in enumerate(shards):
        dump(SPR / 'nfl' / 'shards' / f'{i}.json', s)


def manifest(check: bool = False) -> None:
    files = {}
    for base, prefix, skip in ((DATA, 'data', {'nfl/games', 'manifest.json'}), (SPR / 'nfl', 'private-sprites/nfl', None)):
        if not base.exists():
            continue
        for p in sorted(base.rglob('*')):
            if not p.is_file() or p.suffix not in ('.json', '.csv'):
                continue
            rel = p.relative_to(base).as_posix()
            if skip and any(rel == k or rel.startswith(k + '/') for k in skip):
                continue
            if prefix.startswith('private-sprites') and rel == 'index.json':
                continue  # the full index is the build input; the site reads core.json and the shards
            files[f'{prefix}/{rel}'] = hashlib.sha1(p.read_bytes()).hexdigest()[:8]
    for extra in ('private-sprites/index.json',):
        p = PUB / extra
        if p.exists():
            files[extra] = hashlib.sha1(p.read_bytes()).hexdigest()[:8]
    if check:
        old = json.loads((DATA / 'manifest.json').read_text()).get('files', {}) if (DATA / 'manifest.json').exists() else {}
        stale = sorted(k for k in set(files) | set(old) if files.get(k) != old.get(k))
        if stale:
            print(f'manifest is stale ({len(stale)} files differ, e.g. {stale[:3]}): run npm run perf:core')
            sys.exit(1)
        print(f'manifest ok: {len(files)} files')
        return
    dump(DATA / 'manifest.json', {'v': 1, 'files': files})
    print(f'manifest: {len(files)} files')


if __name__ == '__main__':
    if '--check' in sys.argv:  # CI / audit: the committed manifest matches the files (the split files themselves are rebuilt, not checked)
        manifest(check=True)
        sys.exit(0)
    act = active_keys()
    split_extras()
    split_advanced()
    split_sprites(act)
    manifest()
    print(f'core split done ({len(act)} active players) in {PUB}')
