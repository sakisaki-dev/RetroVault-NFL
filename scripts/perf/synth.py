#!/usr/bin/env python3
"""Synthetic big roster for the perf harness (never touches the repo's data).

    python3 scripts/perf/synth.py <out-public-dir> [--total 10000] [--seed 7]

Copies public/ into <out>, symlinking the big untouched folders (game logs, sprite PNGs), and grows every per-player
file to --total players by cloning retired players (names recombined from real first and last names, stats scaled,
cloned entries in the league CSV, player-extras, market history (keyframes and deltas), career seasons, the sprite
index with its anchors). Build the site against it with RV_PUBLIC_DIR=<out> (vite.config.ts), or run the build
precompute scripts (scripts/perf/build_core.py) with RV_PUBLIC_DIR=<out>.
"""
import csv, io, json, os, random, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[1:]
OUT = Path(args[0]).resolve()
TOTAL = int(args[args.index('--total') + 1]) if '--total' in args else 10000
SEED = int(args[args.index('--seed') + 1]) if '--seed' in args else 7
SRC = ROOT / 'public'
rnd = random.Random(SEED)

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)

# ---- copy tree: files real, big folders symlinked
SYMLINK_DIRS = {'data/nfl/games', 'private-sprites/field', 'splash', 'widgets'}
def copy_tree(src, dst, rel=''):
    dst.mkdir(exist_ok=True)
    for e in sorted(os.scandir(src), key=lambda e: e.name):
        r = f'{rel}/{e.name}' if rel else e.name
        if e.is_dir():
            if r in SYMLINK_DIRS:
                os.symlink(e.path, dst / e.name)
            else:
                copy_tree(e.path, dst / e.name, r)
        elif r.startswith('private-sprites/nfl/') and e.name.endswith('.png'):
            os.symlink(e.path, dst / e.name)
        else:
            shutil.copy2(e.path, dst / e.name)
copy_tree(SRC, OUT)

# ---- the league csv
csv_path = OUT / 'data/initial-data.csv'
lines = csv_path.read_text().split('\n')
sections = []  # (pos, header, rows, start line)
i = 0
head = []
while i < len(lines):
    if lines[i] in ('QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL'):
        pos = lines[i]; hdr = lines[i + 1]; j = i + 2; rows = []
        while j < len(lines) and lines[j].strip():
            rows.append(next(csv.reader([lines[j]]))); j += 1
        sections.append([pos, hdr, rows]); i = j
    else:
        if not sections: head.append(lines[i])
        i += 1
firsts, lasts = [], []
for _, _, rows in sections:
    for r in rows:
        parts = r[0].split(' ')
        if len(parts) >= 2:
            firsts.append(parts[0]); lasts.append(' '.join(parts[1:]))
have = {f'{s[0]}:{r[0]}' for s in sections for r in s[2]}
current_total = len(have)
need = max(0, TOTAL - current_total)
srcs = [(s[0], r) for s in sections for r in s[2]]
clones = {}  # new key -> (src key, factor, newuid)
uid_n = 990000
for n in range(need):
    pos, r = srcs[rnd.randrange(len(srcs))]
    while True:
        name = f'{rnd.choice(firsts)} {rnd.choice(lasts)}'
        if f'{pos}:{name}' not in have: break
        name += f' {rnd.choice(["Jr.", "II", "III", "Sr."])}'
        if f'{pos}:{name}' not in have: break
    have.add(f'{pos}:{name}')
    uid_n += 1
    clones[f'{pos}:{name}'] = (f'{pos}:{r[0]}', round(rnd.uniform(0.12, 0.95), 3), str(uid_n))
by_pos = {s[0]: s for s in sections}
for key, (skey, f, _) in clones.items():
    pos, name = key.split(':', 1)
    srow = next(r for r in by_pos[pos][2] if r[0] == skey.split(':', 1)[1]) if False else None
srcindex = {f'{s[0]}:{r[0]}': r for s in sections for r in s[2]}
for key, (skey, f, _) in clones.items():
    pos, name = key.split(':', 1)
    hdr = by_pos[pos][1].split(',')
    row = list(srcindex[skey]); row[0] = name; row[1] = 'Retired'
    for ci, col in enumerate(hdr):
        if ci < 3 or ci >= len(row) or not row[ci]: continue
        if col in ('Nicknames', 'Inducted', 'Career Legacy', 'Dominance', 'TPG'): row[ci] = ''
        elif col in ('Rings', 'MVP', 'OPOY', 'DPOY', 'SBMVP', 'ROTY'): row[ci] = '0' if rnd.random() < .93 else '1'
        elif col == 'True Talent': row[ci] = str(round(float(row[ci]) * f, 2))
        else:
            try: row[ci] = str(int(round(float(row[ci]) * f)))
            except ValueError: pass
    by_pos[pos][2].append(row)
out = list(head)
for pos, hdr, rows in sections:
    out += [pos, hdr]
    buf = io.StringIO(); w = csv.writer(buf, lineterminator='\n'); w.writerows(rows)
    out += buf.getvalue().rstrip('\n').split('\n') + ['']
csv_path.write_text('\n'.join(out))

# source key -> clones
by_src = {}
for k, (s, f, uid) in clones.items():
    by_src.setdefault(s, []).append(k)

def name_of(k): return k.split(':', 1)[1]

# ---- player-extras
p = OUT / 'data/player-extras.json'
d = json.loads(p.read_text())
for k, (s, f, uid) in clones.items():
    n, sn = name_of(k), name_of(s)
    for fld in ('stints', 'franchises', 'signatureTeams', 'legacyTeams'):
        if sn in d.get(fld, {}): d[fld][n] = d[fld][sn]
    if s in d.get('realNumbers', {}): d['realNumbers'][k] = d['realNumbers'][s]
p.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))

# ---- market history
p = OUT / 'data/market.json'
d = json.loads(p.read_text())
def scale_point(pt, f):
    q = dict(pt)
    for fld in ('legacy', 'value'):
        if isinstance(q.get(fld), (int, float)): q[fld] = max(0, int(q[fld] * f))
    return q
for snap in d['snapshots']:
    if 'players' in snap:
        pl = snap['players']
        for s, cs in by_src.items():
            if s in pl:
                for c in cs: pl[c] = scale_point(pl[c] if c in pl else pl[s], clones[c][1])
    else:
        dl = snap['delta']
        for fld in ('set', 'unset'):
            m = dl.get(fld, {})
            for s, cs in by_src.items():
                if s in m:
                    for c in cs: m[c] = m[s]
        if 'removed' in dl:
            dl['removed'] += [c for s, cs in by_src.items() if s in dl['removed'] for c in cs]
        if 'order' in dl:
            have_o = set(dl['order']); dl['order'] += [c for s, cs in by_src.items() if s in have_o for c in cs]
p.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))

# ---- career seasons
p = OUT / 'data/league/career_seasons.json'
d = json.loads(p.read_text())
for k, (s, f, uid) in clones.items():
    if s in d['players']: d['players'][k] = d['players'][s]
p.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))

# ---- sprite index (players + anchors)
p = OUT / 'private-sprites/nfl/index.json'
if p.exists():
    d = json.loads(p.read_text())
    for k, (s, f, uid) in clones.items():
        e = d['players'].get(s)
        if not e: continue
        e = json.loads(json.dumps(e)); old = e['uid']; e['uid'] = uid
        d['players'][k] = e
        for file, a in list(d.get('anchors', {}).items()):
            pass
    # anchors by file: clone every file of a source once per clone (same shape as real ones)
    byuid = {}
    for file in d.get('anchors', {}):
        byuid.setdefault(file.split('_')[0], []).append(file)
    for k, (s, f, uid) in clones.items():
        e = d['players'].get(s)
        if not e: continue
        for file in byuid.get(e['uid'], []):
            d['anchors'][uid + file[len(e['uid']):]] = d['anchors'][file]
    p.write_text(json.dumps(d, separators=(',', ':'), ensure_ascii=False))
print(f'synth: {current_total} real + {len(clones)} cloned = {current_total + len(clones)} players -> {OUT}')
