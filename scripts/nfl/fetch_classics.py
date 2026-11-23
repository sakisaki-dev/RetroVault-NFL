#!/usr/bin/env python3
"""Career totals for pre-1999 careers from each player's Wikipedia page -> data/nfl/classics.json.

    python3 -I scripts/nfl/fetch_classics.py [--limit N] [--refresh]

nflverse weekly stats start in 1999, so a career before that is partial (Aikman 1999-2000) or missing (Montana). This reads, per
player, the infobox (position, born, height, weight, draft, number, career history clubs and years, Super Bowl titles) and the
"Career" row of the regular-season statistics table (games, passing, rushing, receiving, tackles, sacks, interceptions...).

Who (see data/nfl/LEGENDS.md "Classics"):
  a) every partial-career player already in data/y80/players.json (nfl.partial): the full career replaces the 1999-on line;
  b) every Pro Football Hall of Fame player inductee (data/nfl/hof.json) not in the data whose career began in 1970 or later;
  c) every AP MVP / OPOY / DPOY / OROY / DROY / Super Bowl MVP since 1970 (data/nfl/awards.json) not in the data.
Kickers and punters are left out.

Politeness: at most 1 request a second, User-Agent "RetroVaultDemo/1.0", every page cached gzipped in data/nfl/wiki_cache/ (git-ignored).
Python standard library only; falls back to /etc/ssl/cert.pem when Python has no CA bundle."""
import gzip, json, os, re, sys, time, unicodedata, datetime
from collections import defaultdict
from urllib.parse import quote
import urllib.request, ssl

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import wikitab
from wikitab import squash

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
NFL = os.path.join(ROOT, "data", "nfl")
CACHE = os.path.join(NFL, "wiki_cache")
OUT = os.path.join(NFL, "classics.json")
FROM_YEAR = 1970

NICK = ["Cardinals", "Falcons", "Ravens", "Bills", "Panthers", "Bears", "Bengals", "Browns", "Cowboys", "Broncos", "Lions",
        "Packers", "Texans", "Colts", "Jaguars", "Chiefs", "Raiders", "Chargers", "Rams", "Dolphins", "Vikings", "Patriots",
        "Saints", "Giants", "Jets", "Eagles", "Steelers", "49ers", "Seahawks", "Buccaneers", "Titans", "Commanders"]
HIST = {"redskins": "Commanders", "oilers": "Titans", "staleys": "Bears"}
NOT_NFL = re.compile(r"usfl|cfl|afl\b|aafc|wfl|xfl|ufl|nfl europe|europe|college|express|showboats|generals|stallions|blitz|"
                     r"gamblers|bandits|stars\b|invaders|outlaws|breakers|wranglers|maulers|panthers \(usfl|lions \(|argonauts|"
                     r"blue bombers|tiger-cats|roughriders|alouettes|stampeders|eskimos|lions\b.*bc|bc lions|redblacks|"
                     r"sentinels|renegades|steelers.*cfl|oilers.*wfl|sun\b|hawaiians|fire\b|thunderbolts|pythons|"
                     r"hamilton|calgary|edmonton|toronto|saskatchewan|winnipeg|ottawa|montreal|british columbia|memphis|birmingham|"
                     r"portland|jacksonville bulls|orlando|tampa bay bandits|michigan panthers|oakland invaders|denver gold|"
                     r"houston gamblers|new jersey generals|chicago blitz|arizona wranglers|boston breakers|washington federals|"
                     r"pittsburgh maulers|los angeles express|san antonio gunslingers|oklahoma outlaws|philadelphia stars|"
                     r"las vegas|new orleans breakers|barcelona|rhein|frankfurt|amsterdam|berlin|scottish|london monarchs|"
                     r"new york/new jersey knights|knights\b|dragons\b|admirals\b|galaxy\b|claymores|monarchs\b", re.I)
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman(s):
    t = 0; s = s.upper()
    for i, ch in enumerate(s):
        v = ROMAN.get(ch)
        if v is None: return None
        t += -v if i + 1 < len(s) and ROMAN.get(s[i + 1], 0) > v else v
    return t


def norm(s):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", s.lower()).encode("ascii", "ignore").decode())


_ctx = None
_last = 0.0


def http(url):
    global _ctx, _last
    if _ctx is None:
        _ctx = ssl.create_default_context()
        if not _ctx.get_ca_certs() and os.path.exists("/etc/ssl/cert.pem"):
            _ctx = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    wait = 1.05 - (time.time() - _last)
    if wait > 0: time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": wikitab.UA})
    for attempt in range(4):
        try:
            _last = time.time()
            return urllib.request.urlopen(req, timeout=60, context=_ctx).read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(3 * (attempt + 1))
        except Exception:
            time.sleep(3 * (attempt + 1))
    return None


def page(title, refresh=False):
    """HTML of a Wikipedia article (cached gzipped); None when it does not exist."""
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9_.-]", "_", title) + ".html.gz")
    if os.path.exists(f) and not refresh:
        with gzip.open(f, "rt", encoding="utf-8") as fh: h = fh.read()
        return h or None
    h = http(wikitab.BASE + quote(title.replace(" ", "_")))
    with gzip.open(f, "wt", encoding="utf-8") as fh: fh.write(h or "")
    return h


def franchise(name):
    if NOT_NFL.search(name): return None
    low = re.sub(r"\(.*?\)", "", name).lower()
    w = re.sub(r"[^a-z0-9 ]", "", low).split()
    if not w: return None
    if "washington" in w and ("football" in w or "redskins" in w or "commanders" in w): return "Commanders"
    nick = w[-1]
    if nick in HIST: return HIST[nick]
    for n in NICK:
        if n.lower() == nick: return n
    return None


def years_of(s):
    """'1985–1992', '1990–1991, 1994' or '1996' -> sorted list of seasons."""
    ys = []
    for m in re.finditer(r"(\d{4})(?:\s*[–-]\s*(\d{4}|present))?", s):
        a = int(m.group(1)); b = m.group(2)
        b = a if not b else (datetime.date.today().year if b == "present" else int(b))
        ys += list(range(a, b + 1))
    return sorted(set(ys))


def num(s):
    s = squash(s).replace(",", "").replace("−", "-").replace("–", "-")
    if not s or s in ("-", "—") or s.upper() == "N/A": return None
    m = re.match(r"^-?\d+(\.\d+)?", s)
    return float(m.group()) if m else None


def infobox(tables):
    for tb in tables:
        g = wikitab.grid(tb["rows"])
        if any(r and squash(r[0]["t"]).startswith(("Career history", "Born", "Personal")) for r in g) and any(
                r and squash(r[0]["t"]).startswith(("Career information", "High school", "College")) for r in g):
            return g
    return None


def parse_infobox(g):
    d = {"clubs": [], "highlights": "", "position": "", "draft": None}
    sect = ""
    for r in g:
        if not r: continue
        a = squash(r[0]["t"]); b = squash(r[-1]["t"])
        if r[0] is r[-1] or a == b:  # a section header row, or a one-cell row (club lines, awards)
            if a in ("Personal information", "Career information", "Career history", "Awards and highlights", "Career NFL statistics",
                     "Career statistics", "Other information", "Career highlights and awards"):
                sect = a; continue
            if sect == "Career history" and a:
                if re.match(r"^(As an? |Coaching|Executive|Front office)", a) and "player" not in a.lower():
                    d["_skip"] = True; continue
                if not re.search(r"\d{4}", a): d["_skip"] = "play" not in a.lower(); continue
                if d.get("_skip"): continue
                # the list items run together: "Team A (1985–1992) Team B (1993–1998)"
                d["clubs"] += [f"{m.group(1).strip()} ({m.group(2)})" for m in re.finditer(r"([A-Z0-9][^()]*?)\s*\(([^()]*\d{4}[^()]*)\)", a)]
            elif sect.startswith("Awards") and a:
                d["highlights"] += a + " "
            elif re.match(r"No\. ?\d+", a):
                d["number"] = re.match(r"No\. ?(\d+)", a).group(1)
            continue
        if a in ("Position", "Positions"): d["position"] = b
        elif a == "Born":
            m = re.search(r"\((\d{4})-(\d\d)-(\d\d)\)", b)
            if m: d["dob"] = "-".join(m.groups())
        elif a in ("Listed height", "Height"):
            m = re.search(r"(\d+)\s*ft\s*(\d+)?", b)
            if m: d["height"] = int(m.group(1)) * 12 + int(m.group(2) or 0)
        elif a in ("Listed weight", "Weight"):
            m = re.search(r"(\d+)\s*lb", b)
            if m: d["weight"] = int(m.group(1))
        elif a in ("NFL draft", "Supplemental draft") and not d["draft"]:
            m = re.search(r"(\d{4}):\s*(\d+)\w*\s*round,\s*(\d+)\w*\s*overall", b)
            if m: d["draft"] = [m.group(1), m.group(2), m.group(3), None]
            elif re.search(r"undrafted", b, re.I):
                m = re.search(r"(\d{4})", b); d["draft"] = [m.group(1) if m else None, None, None, None]
    return d


POS_WORDS = [("quarterback", "QB"), ("running back", "RB"), ("halfback", "RB"), ("fullback", "RB"), ("wide receiver", "WR"),
             ("flanker", "WR"), ("split end", "WR"), ("tight end", "TE"), ("tackle", "OL"), ("guard", "OL"), ("center", "OL"),
             ("offensive lineman", "OL"), ("linebacker", "LB"), ("defensive end", "DL"), ("defensive tackle", "DL"),
             ("nose tackle", "DL"), ("defensive lineman", "DL"), ("cornerback", "DB"), ("safety", "DB"), ("defensive back", "DB"),
             ("kicker", None), ("punter", None)]
HOF_POS = {"QB": "QB", "RB": "RB", "FB": "RB", "HB": "RB", "WR": "WR", "TE": "TE", "OT": "OL", "T": "OL", "G": "OL", "C": "OL",
           "DE": "DL", "DT": "DL", "NT": "DL", "DL": "DL", "LB": "LB", "CB": "DB", "S": "DB", "DB": "DB", "E": None, "MG": "DL", "OLB": "LB", "ILB": "LB", "MLB": "LB", "FS": "DB", "SS": "DB", "K": None, "P": None}


def pos_of(text):
    low = text.lower()
    best = None
    for w, p in POS_WORDS:
        i = low.find(w)
        if i >= 0 and (best is None or i < best[0]) and not (w == "tackle" and ("defensive tackle" in low or "nose tackle" in low)):
            best = (i, p)
    return best[1] if best else None


# stats tables ----------------------------------------------------------------------------------------------------------
BAD_SEC = re.compile(r"post|play-?off|super bowl|college|usfl|cfl|afl|aafc|wfl|xfl|nfl europe|high school|ncaa|combine|"
                     r"draft|legend|coach|personal|references|notes|sources|see also|filmography|television", re.I)


def career_rows(tables):
    """Career row of every regular-season stats table: [(header cells [(group, sub)], row cells)]."""
    out = []
    for tb in tables:
        if BAD_SEC.search(tb.get("path") or tb["sec"] or ""): continue
        g = wikitab.grid(tb["rows"])
        if len(g) < 3: continue
        hdr = None
        for i, r in enumerate(g[:3]):
            if r and squash(r[0]["t"]).lower() == "year": hdr = i
        if hdr is None: continue
        crow = None
        for r in g[hdr + 1:]:
            if r and squash(r[0]["t"]).lower() in ("career", "total", "totals", "nfl career", "career total", "career totals", "nfl totals", "nfl"):
                crow = r
        if crow is None: continue
        sub = [squash(c["t"]).lower() for c in g[hdr]]
        grp = [squash(c["t"]).lower() for c in g[hdr - 1]] if hdr > 0 else ["" for _ in sub]
        if len(grp) != len(sub): grp = ["" for _ in sub]
        # a one-row header: the group is empty
        cols = {}
        for i, (a, b) in enumerate(zip(grp, sub)):
            if i < len(crow): cols.setdefault((a if a != b else "", b), []).append(squash(crow[i]["t"]))
        years = [squash(r[0]["t"]) for r in g[hdr + 1:] if r and re.match(r"^\d{4}", squash(r[0]["t"]))]
        out.append((cols, years, tb["sec"]))
    return out


def pick(cols, grp_re, sub_re):
    for (a, b), v in cols.items():
        if re.search(grp_re, a) and re.fullmatch(sub_re, b):
            return num(v[0])
    return None


def stats_for(pos, tbls):
    """Retro Vault career keys from the Career rows of the stats tables."""
    out = {}
    miss = set()

    def first(*args):
        for cols, _y, _s in tbls:
            v = pick(cols, *args)
            if v is not None: return v
        return None

    g = None
    for cols, _y, _s in tbls:
        for (a, b), v in cols.items():
            if b in ("gp", "g", "games played") and (a in ("", "games", "games played") or "game" in a):
                g = num(v[0]); break
        if g is not None: break
    out["g"] = g
    if pos == "QB":
        out.update(att=first("pass", r"att"), cmp=first("pass", r"cmp|comp"), yds=first("pass", r"yds|yards"), td=first("pass", r"td"),
                   int=first("pass", r"int"), sck=first("sack", r"sck|sacks") if first("sack", r"sck|sacks") is not None else first("", r"sck"),
                   ratt=first("rush", r"att"), ryds=first("rush", r"yds|yards"), rtd=first("rush", r"td"))
    elif pos == "RB":
        out.update(ratt=first("rush", r"att"), ryds=first("rush", r"yds|yards"), rtd=first("rush", r"td"),
                   fum=first("fum", r"fum"), rec=first("rece", r"rec"), recyds=first("rece", r"yds|yards"), rectd=first("rece", r"td"))
    elif pos in ("WR", "TE"):
        out.update(rec=first("rece", r"rec"), yds=first("rece", r"yds|yards"), td=first("rece", r"td"), fum=first("fum", r"fum"), lng=None)
    elif pos == "OL":
        gs = None
        for cols, _y, _s in tbls:
            for (a, b), v in cols.items():
                if b in ("gs", "games started"): gs = num(v[0]); break
            if gs is not None: break
        out["blk"] = gs if gs is not None else g
    else:
        tkl = first("tack", r"cmb|comb|total|tot|tck")
        if tkl is None:
            solo, ast = first("tack", r"solo"), first("tack", r"ast")
            if solo is not None: tkl = solo + (ast or 0)
        sck = first("tack", r"sck|sacks")
        if sck is None: sck = first("sack", r"sck|sacks")
        if sck is None: sck = first("", r"sck|sacks")
        out.update(tkl=tkl, int=first("int", r"int") if first("int", r"int") is not None else first("", r"int"), sck=sck, ff=first("fum", r"ff"))
        if out["int"] is None: out["int"] = first("inter", r"int|no\.?")
    return {k: v for k, v in out.items() if v is not None or k == "lng"}


def infobox_stats(tables):
    """The label / value rows of the infobox's "Career NFL statistics" (a nested table, right before the infobox itself)."""
    idx = None
    for i, tb in enumerate(tables):
        g = wikitab.grid(tb["rows"])
        if any(r and squash(r[0]["t"]).startswith(("Career history", "Born", "Personal")) for r in g) and any(
                r and squash(r[0]["t"]).startswith(("Career information", "High school", "College")) for r in g):
            idx = i; break
    out = {}
    if not idx: return out
    for tb in reversed(tables[max(0, idx - 3):idx]):
        g = wikitab.grid(tb["rows"])
        g = [r for r in g if not (len(r) == 2 and r[0] is r[1] and "stats at" in squash(r[0]["t"]).lower())]
        if len(g) < 2 or any(len(r) != 2 or r[0] is r[1] for r in g): continue
        for r in g:
            lab = squash(r[0]["t"]).lower(); val = squash(r[1]["t"])
            v = num(val)
            if lab in ("games played", "games", "games played / started") and v is not None: out["g"] = v
            elif lab == "games started" and v is not None: out["gs"] = v
            elif lab in ("tackles", "total tackles", "combined tackles"): out["tkl"] = v
            elif lab in ("sacks", "quarterback sacks"): out["sck"] = v
            elif lab == "interceptions": out["int"] = v
            elif lab == "forced fumbles": out["ff"] = v
            elif lab in ("passing attempts", "pass attempts"): out["att"] = v
            elif lab in ("passing completions", "pass completions"): out["cmp"] = v
            elif lab == "passing yards": out["yds"] = v
            elif lab in ("td–int", "td-int", "td\u2013int"):
                m = re.match(r"(\d+)\D+(\d+)", val.replace(",", ""))
                if m: out["td"], out["int"] = float(m.group(1)), float(m.group(2))
            elif lab in ("passing touchdowns", "pass touchdowns"): out["td"] = v
            elif lab == "rushing yards": out["ryds"] = v
            elif lab in ("rushing attempts", "rushing att"): out["ratt"] = v
            elif lab == "rushing touchdowns": out["rtd"] = v
            elif lab in ("receptions", "receiving receptions"): out["rec"] = v
            elif lab == "receiving yards": out["recyds"] = v
            elif lab == "receiving touchdowns": out["rectd"] = v
        break
    return out


def rings_of(text):
    """Super Bowl numerals in the highlights: '3× Super Bowl champion (XXVII, XXVIII, XXX)'."""
    sbs = []
    for m in re.finditer(r"Super Bowl champion[^()]{0,3}\(([^)]*)\)", text):
        for t in re.split(r"[,&\s]+|and", m.group(1)):
            t = t.strip()
            if t and re.fullmatch(r"[IVXLC]+", t) and roman(t): sbs.append(roman(t))
    mm = re.search(r"(\d+)\s*×\s*(?:\[?)Super Bowl champion", text)
    n = int(mm.group(1)) if mm else (1 if "Super Bowl champion" in text else 0)
    sbs = sorted(set(sbs))
    return max(n, len(sbs)), [1965 + s for s in sbs]


def parse(title, html, want_pos):
    n = wikitab.Node(); n.feed(html)
    ib = infobox(n.tables)
    if ib is None: return None
    d = parse_infobox(ib)
    pos = want_pos or pos_of(d["position"])
    if pos is None: return None
    tbls = career_rows(n.tables)
    st = stats_for(pos, tbls)
    ibs = infobox_stats(n.tables)
    keys = {"QB": ("g", "att", "cmp", "yds", "td", "int", "ratt", "ryds", "rtd"), "RB": ("g", "ratt", "ryds", "rtd", "rec", "recyds", "rectd"),
            "WR": ("g", "rec", "yds", "td"), "TE": ("g", "rec", "yds", "td"), "OL": ("g",)}.get(pos, ("g", "tkl", "int", "sck", "ff"))
    if pos in ("WR", "TE"):  # the infobox's receiving labels
        if "rec" in ibs and "yds" not in ibs and "recyds" in ibs: ibs["yds"] = ibs.pop("recyds")
        if "td" not in ibs and "rectd" in ibs: ibs["td"] = ibs["rectd"]
    for k in keys:
        if st.get(k) is None and ibs.get(k) is not None: st[k] = ibs[k]
    if pos == "OL":
        st["blk"] = st.get("blk") if st.get("blk") is not None else ibs.get("gs", st.get("g"))
    st = {k: v for k, v in st.items() if v is not None or k == "lng"}
    clubs = []
    for c in d["clubs"]:
        m = re.match(r"(.*?)\s*\((.*)\)\s*$", c)
        if not m: continue
        fr = franchise(m.group(1))
        ys = years_of(m.group(2))
        if fr and ys: clubs.append({"team": fr, "years": ys, "raw": m.group(1)})
    rings, ring_years = rings_of(d["highlights"])
    low = d["position"].lower()
    d["spos"] = ("S" if "safety" in low and ("cornerback" not in low or low.index("safety") < low.index("cornerback")) else "CB") if pos == "DB" else None
    d.update(pos=pos, stats=st, nclubs=clubs, rings=rings, ringYears=ring_years, tables=[y for _c, y, _s in tbls[:1]])
    return d


# targets ---------------------------------------------------------------------------------------------------------------
def targets():
    P = json.load(open(os.path.join(ROOT, "data", "y80", "players.json")))
    S = json.load(open(os.path.join(ROOT, "data", "y80", "stints.json")))
    H = json.load(open(os.path.join(NFL, "hof.json")))["inductees"]
    A = json.load(open(os.path.join(NFL, "awards.json")))
    base = lambda n: re.sub(r"\s*\(.*", "", n)
    have = {norm(base(p["n"])) for p in P}
    out = {}
    hof = {norm(e["name"]): e for e in H if e["role"] == "player"}
    for p in P:
        if (p.get("nfl") or {}).get("partial") or (p.get("nfl") or {}).get("source") == "wikipedia":
            nm = base(p["n"])
            e = hof.get(norm(nm))
            clubs = [s["team"] for s in S.get(p["n"], {}).get("stints", [])]
            out[norm(nm)] = {"name": nm, "pos": p["pos"], "from": "partial", "key": f"{p['pos']}:{p['n']}", "title": e and e.get("wikipedia_title"),
                             "clubs": clubs, "debut": (p["nfl"] or {}).get("debut")}
    for e in H:
        k = norm(e["name"])
        if e["role"] != "player" or k in have or k in out: continue
        ps = [HOF_POS.get(x) for x in e["positions"] if x in HOF_POS]
        if not [x for x in e["positions"] if x not in ("K", "P")]: continue
        if e["years_active"][0] < FROM_YEAR: continue
        pos = next((x for x in ps if x), None)
        out[k] = {"name": e["name"], "pos": None, "hint": pos, "from": "hof", "title": e.get("wikipedia_title"), "clubs": e.get("teams") or [],
                  "debut": e["years_active"][0], "hof": e["class"]}
    for kind, lst in A["awards"].items():
        for a in lst:
            if a["season"] < FROM_YEAR or a["season"] >= 1999 or a["position"] in ("K", "P"): continue
            k = norm(a["player"])
            if k in have: continue
            t = out.setdefault(k, {"name": a["player"], "pos": None, "hint": HOF_POS.get(a["position"]), "from": "award", "title": None,
                                   "clubs": [], "debut": a["season"], "awards": []})
            t.setdefault("awards", []).append(kind)
            if a["team"] not in t["clubs"]: t["clubs"].append(a["team"])
            t["debut"] = min(t["debut"] or 9999, a["season"])
    return out


def resolve(t, refresh=False):
    """The Wikipedia page of a target: a trusted title (Hall of Fame list) or the first candidate whose infobox shows an NFL
    career with one of his clubs (and, with a debut year, a season that fits)."""
    cands = []
    if t.get("title"): cands.append(t["title"])
    nm = t["name"]
    cands += [f"{nm} (American football)", f"{nm} (gridiron football)", nm, f"{nm} (football player)", f"{nm} (defensive back)",
              f"{nm} (linebacker)", f"{nm} (wide receiver)", f"{nm} (running back)", f"{nm} (quarterback)"]
    seen = []
    for c in cands:
        if c in seen: continue
        seen.append(c)
        h = page(c, refresh)
        if not h or "Infobox" not in h and "infobox" not in h: continue
        d = parse(c, h, t.get("pos") or t.get("hint"))
        if d is None or not d["nclubs"]: continue
        ys = [y for c2 in d["nclubs"] for y in c2["years"]]
        if t.get("debut") and not (min(ys) - 4 <= t["debut"] <= max(ys)): continue
        names = {c2["team"] for c2 in d["nclubs"]}
        if t.get("title") != c and t.get("clubs") and not names & set(t["clubs"]): continue
        d["title"] = c
        return d
    return None


def main():
    limit = None
    refresh = "--refresh" in sys.argv
    if "--limit" in sys.argv: limit = int(sys.argv[sys.argv.index("--limit") + 1])
    T = targets()
    order = sorted(T.values(), key=lambda t: ({"partial": 0, "hof": 1, "award": 2}[t["from"]], t["name"]))
    if limit: order = order[:limit]
    print(f"{len(order)} targets: " + ", ".join(f"{k} {sum(1 for t in order if t['from'] == k)}" for k in ("partial", "hof", "award")))
    res, fail = [], []
    for i, t in enumerate(order):
        d = resolve(t, refresh)
        if d is None:
            fail.append(t["name"]); print(f"  [{i + 1}/{len(order)}] {t['name']}: NO PAGE ({t['from']})", flush=True); continue
        res.append({**{k: t[k] for k in ("name", "from") if k in t}, **({"key": t["key"]} if "key" in t else {}),
                    **({"hof": t["hof"]} if "hof" in t else {}), "title": d["title"], "pos": d["pos"], **({"spos": d["spos"]} if d.get("spos") else {}), "stats": d["stats"],
                    "clubs": [{"team": c["team"], "from": min(c["years"]), "to": max(c["years"]), "years": c["years"]} for c in d["nclubs"]],
                    "rings": d["rings"], "ringYears": d["ringYears"], "number": d.get("number"), "dob": d.get("dob"),
                    "height": d.get("height"), "weight": d.get("weight"), "draft": d.get("draft")})
        if (i + 1) % 25 == 0: print(f"  [{i + 1}/{len(order)}]", flush=True)
    res.sort(key=lambda r: (r["from"], r["name"]))
    json.dump({"source": "https://en.wikipedia.org (each player's article: infobox and the Career row of the regular-season table)",
               "fetched": datetime.date.today().isoformat(), "count": len(res), "failed": fail, "players": res},
              open(OUT, "w"), separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {OUT}: {len(res)} players, {len(fail)} with no page: {fail}")


if __name__ == "__main__":
    main()
