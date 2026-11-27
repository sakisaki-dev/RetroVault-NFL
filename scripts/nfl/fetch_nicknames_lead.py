#!/usr/bin/env python3
"""NFL edition: nicknames from each player's own Wikipedia page (infobox `nickname`/`nicknames` field and the lead).

    python3 scripts/nfl/fetch_nicknames_lead.py   (needs data/y80/players.json: build_players.py first)

Wikipedia is the attestation. A page counts only when it is a football biography whose birth year matches the
player's date of birth (so a namesake's page never lends a nickname). Pages are asked for by "<Name> (American football)"
and "<Name>" (25 players to a request), then, for players still without a page, by "<Name> (<position>)" with the
disambiguators Wikipedia uses (quarterback, linebacker, ...). Redirects are followed. Section 0 (infobox + lead) is read
as wikitext, so the infobox field is real, not a guess from prose.

Candidates: infobox `nickname`/`nicknames` (any list form), lead sentences ("nicknamed", "known as", "dubbed", "goes by",
"referred to as", also a run of quoted names), and a quoted name inside the bolded title (First "Nick" Last).
Rejected as junk: a double quote inside, the explicit generic list (money, kid, co-cap, rookie, captain, big, boss), his own initials or an all-caps 2-3 letter tag (D.J., JJ, IGB, DPJ, with or without dots), more than 4 words or 24 characters, bare numbers, his own first or last name (a diminutive of his
first name only for the quoted name inside the bolded title), a club name, generic descriptors ("The Rookie"), and another person's full name.

Which one is "best" (several attested): infobox AND lead beats infobox alone beats lead alone; then the one the lead
mentions most often; then the earlier one. build_players.apply_nicknames additionally prefers a candidate that the
Wikipedia list pages (fetch_nicknames.py) also give. Writes data/nfl/nicknames_infobox.json
{gsis: {"best": nick, "all": [[nick, source, mentions], ...]}}. Standard library only.
"""
import json
import os
import re
import ssl
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "https://en.wikipedia.org/w/api.php"
CTX = ssl.create_default_context()
if not CTX.get_ca_certs() and os.path.exists("/etc/ssl/cert.pem"):
    CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem")

POS_TITLES = {
    "QB": ["quarterback"], "RB": ["running back", "fullback"], "WR": ["wide receiver"], "TE": ["tight end"],
    "OL": ["offensive tackle", "offensive lineman", "guard", "center"],
    "DL": ["defensive end", "defensive tackle", "defensive lineman", "nose tackle"],
    "LB": ["linebacker"], "DB": ["cornerback", "safety", "defensive back"], "K": ["placekicker", "kicker", "punter"],
}
CLUBS = {"49ers", "bears", "bengals", "bills", "broncos", "browns", "buccaneers", "cardinals", "chargers", "chiefs", "colts",
         "commanders", "cowboys", "dolphins", "eagles", "falcons", "giants", "jaguars", "jets", "lions", "packers", "panthers",
         "patriots", "raiders", "rams", "ravens", "saints", "seahawks", "steelers", "texans", "titans", "vikings", "redskins",
         "oilers", "cardinals"}
# Generic words that are not nicknames (explicit and small on purpose; a nickname made only of these is rejected).
GENERIC = {"money", "kid", "co-cap", "rookie", "captain", "big", "boss"}
MAX_CHARS, MAX_WORDS = 24, 4


def query(titles):
    qs = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": 2, "redirects": 1, "prop": "revisions",
                                 "rvprop": "content", "rvslots": "main", "rvsection": 0, "titles": "|".join(titles)})
    req = urllib.request.Request(f"{API}?{qs}", headers={"User-Agent": "RetroVaultDemo/1.0"})
    for attempt in range(8):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=90, context=CTX).read())
        except urllib.error.HTTPError as e:  # 429: wait as long as Wikipedia says
            time.sleep(int(e.headers.get("retry-after") or 10) + 2)
        except Exception:  # noqa: BLE001
            time.sleep(3 + attempt * 3)
    return {}


def fold(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", "", s).strip()


# ---- wikitext cleaning ----
def strip_markup(t):
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    t = re.sub(r"<ref[^>]*/>", "", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"<(?!br)[^>]+>", "", t)
    for _ in range(4):  # unwrap small display templates, drop the rest (innermost first)
        t = re.sub(r"\{\{\s*(?:nowrap|small|lang\|[^|{}]*|'|\"|!)\s*\|?([^{}]*)\}\}", r"\1", t, flags=re.I)
        t = re.sub(r"\{\{(?:plainlist|unbulleted list|ubl|flatlist|hlist)\s*\|", "\n", t, flags=re.I)
        t = re.sub(r"\{\{[^{}]*\}\}", lambda m: "" if re.match(r"\{\{\s*(?:cite|sfn|efn|NFL|Birth|Death|Convert|Infobox|nfl)", m.group(), re.I) or "|" in m.group() else "", t)
    t = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", t, flags=re.I)
    t = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\[\[([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"'{2,}", "", t)
    return t


def split_infobox(wt):
    """(infobox text, lead text) of section 0."""
    m = re.search(r"\{\{\s*Infobox", wt, re.I)
    if not m:
        return "", wt
    depth, i = 0, m.start()
    while i < len(wt):
        if wt.startswith("{{", i):
            depth += 1; i += 2
        elif wt.startswith("}}", i):
            depth -= 1; i += 2
            if depth == 0:
                break
        else:
            i += 1
    return wt[m.start():i], wt[:m.start()] + wt[i:]


def infobox_field(ib, names):
    m = re.search(r"\n\s*\|\s*(?:%s)\s*=(.*?)(?=\n\s*\|\s*[\w ]+?\s*=|\n\}\}|\Z)" % "|".join(names), ib, re.S | re.I)
    return m.group(1) if m else ""


def lead_prose(lead):
    t = strip_markup(lead)
    return re.sub(r"\s+", " ", re.sub(r"\{\{[^{}]*\}\}", "", t)).strip()


# ---- guards and junk filter ----
def is_football_bio(wt, prose, year):
    ib, _ = split_infobox(wt)
    if re.search(r"may refer to|\{\{\s*(?:disambig|dab|hndis|surname)", wt[:4000], re.I):
        return False
    football = bool(re.search(r"Infobox (?:NFL|gridiron|college football|AFL|American football)", ib, re.I)) or \
        bool(re.search(r"football|quarterback|running back|receiver|linebacker|lineman|safety|cornerback|tight end|kicker|punter", prose[:700], re.I))
    if not football:
        return False
    bd = infobox_field(ib, ["birth_date", "birth date"])
    if bd:
        return year in re.findall(r"\b(1[89]\d\d|20\d\d)\b", bd)
    return year in prose[:500]


def clean_nick(s):
    s = strip_markup(s)
    s = re.sub(r"\s+", " ", s).strip(" \t\"'“”‘’«»`,;:*–—-")
    if not re.search(r"\b[A-Za-z]\.", s):  # keep the final period of initials ("L.T.")
        s = s.rstrip(".")
    s = s.strip(" ,;:")
    s = re.sub(r"^the\s+", "The ", s, flags=re.I)  # a leading "the" is always "The"
    s = re.sub(r"\s*\((?:[^)]*)\)$", "", s).strip(" \"'“”‘’,;")  # "The Freak (high school)"
    s = re.sub(r"\s*\*$", "", s)
    return s


def diminutive(nick, first):
    n, f = fold(nick).replace(" ", ""), fold(first).replace(" ", "")
    if not n or not f:
        return False
    if " " in nick:
        return False
    if f.startswith(n) or n.startswith(f):
        return True
    return n[:2] == f[:2] and len(n) <= len(f) + 1 and n.isalpha() and f.isalpha() and abs(len(n) - len(f)) <= 3 and len(set(n) - set(f)) <= 1


def junk(nick, name, dim=False):
    if not nick or len(nick) < 2 or len(nick) > MAX_CHARS or len(nick.split()) > MAX_WORDS:
        return True
    if re.search(r"[{}\[\]|=<>]|https?:|\(|\)", nick):
        return True
    if re.fullmatch(r"[#\d\s.,/-]+|(?:no\.?|number)\s*\d+", nick, re.I):
        return True
    words = [w for w in re.findall(r"[A-Za-z0-9'’]+", nick.lower())]
    if '"' in nick or "“" in nick or "”" in nick:
        return True
    core = re.sub(r"^the\s+", "", nick.lower()).strip()
    if not words or core in GENERIC or all(w == "the" or w in CLUBS for w in words):
        return True
    if not re.search(r"[A-Za-z]", nick):
        return True
    toks = fold(re.sub(r" \(.*\)$", "", name)).split()
    if not toks:
        return False
    full = " ".join(toks)
    fn = fold(nick)
    if fn in toks or fn.replace(" ", "") in toks or fn == full or fn.replace(" ", "") == "".join(toks) or fn == toks[0] + " " + toks[-1]:
        return True
    if fn and len(toks) >= 2 and fn.split()[-1] == toks[-1] and fn.split()[0] == toks[0]:
        return True
    # his own initials (first/middle/last, with or without dots or spaces): "D.J.", "A. J.", "JJ", "DPJ"
    letters = re.sub(r"[^a-z]", "", fn)
    ini = [t[0] for t in re.sub(r"[-]", " ", re.sub(r" \(.*\)$", "", name)).split() if t.lower().strip(".") not in ("jr", "sr", "ii", "iii", "iv", "v")]
    ini = [fold(t)[:1] for t in ini if fold(t)]
    if re.fullmatch(r"[A-Z]{2,3}", nick):  # initials-style tag (JJ, IGB, DPJ): not a nickname
        return True
    if letters and len(letters) <= 4 and (re.fullmatch(r"(?:[A-Za-z]\.\s?){2,}", nick) or any("".join(ini[i:j]) == letters for i in range(len(ini)) for j in range(i + 2, len(ini) + 1))):
        return True
    if dim and diminutive(nick, toks[0]):  # only for a quoted name inside the bolded title (First "Joe" Last)
        return True
    if fn in CLUBS or (len(words) == 2 and words[0] in ("the", "da") and words[1] in CLUBS):
        return True
    if re.fullmatch(r"[A-Z][a-z]+ [A-Z]\.? ?[A-Z][a-z]+", nick):  # another person's full name
        return True
    return False


Q = r"[\"“‘]([^\"”’]{2,40}?)[\"”’]"
TRIG_STRONG = r"nicknamed|nick-named|nicknames?(?:\s+(?:is|was|are|were|of))?|nicknamed\s+himself"
TRIG_WEAK = r"(?:also |better |commonly |popularly |professionally |sometimes |affectionately |simply )?known (?:by the (?:nickname|name|moniker)s?|as)|dubbed|goes by|go by|referred to as|called himself|moniker"
RUN = r"((?:\s*(?:the\s+)?[\"“‘][^\"”’]{2,40}?[\"”’](?:\s*(?:,|/|;|\bor\b|\band\b|,\s*(?:or|and))\s*)?)+)"
SENT_BAD = re.compile(r"\b(play|catch|touchdown|reception|game|win|loss|Bowl|trade|contract|draft|offense|defense|line|backfield|duo|trio|tandem|combination)\b", re.I)


def quoted_run(s):
    return [m.group(1) for m in re.finditer(Q, s)]


def lead_candidates(prose, wt_lead):
    out = []  # (nick, position)
    head = prose[:1800]
    for trig, strong in ((TRIG_STRONG, True), (TRIG_WEAK, False)):
        for m in re.finditer(r"(?:%s)\s*(?:,?\s*(?:the|simply|just)\s+)?%s" % (trig, RUN), head, re.I):
            if not strong:
                s0 = head.rfind(".", 0, m.start()) + 1
                s1 = head.find(". ", m.end())
                sent = head[s0:s1 if s1 > 0 else len(head)]
                if SENT_BAD.search(sent) and not re.search(r"\b(?:born|is an|was an|American)\b", sent):
                    continue
            for q in quoted_run(m.group(1)):
                out.append((q, m.start(), False))
    # a quoted name inside the bolded title: '''First "Nick" Last''' (born ...)
    b = re.search(r"'''([^']{3,80}?)'''", wt_lead)
    if b:
        for q in quoted_run(strip_markup(b.group(1))):
            out.append((q, 0, True))
    return out


def candidates(wt, name):
    ib, lead = split_infobox(wt)
    prose = lead_prose(lead)
    found = {}  # fold -> [text, set(sources), mentions, first]

    def add(text, src, pos, dim=False):
        t = clean_nick(text)
        if junk(t, name, dim):
            return
        k = fold(t)
        e = found.setdefault(k, [t, set(), 0, pos])
        e[1].add(src)
        e[3] = min(e[3], pos)

    raw = infobox_field(ib, ["nicknames?", "nick_names?"])
    if raw.strip():
        raw = re.sub(r"<br\s*/?>|\{\{\s*(?:plainlist|unbulleted list|ubl|flatlist|hlist|bulleted list)\s*\||\n\s*\*|\|", "\n", raw, flags=re.I)
        parts = []
        for line in raw.split("\n"):
            line = strip_markup(line)
            qs = quoted_run(line)
            parts += qs if qs else re.split(r"\s*(?:;|,| / |\bor\b)\s*", line)
        for i, p in enumerate(parts):
            add(p, "infobox", i)
    for q, pos, dim in lead_candidates(prose, lead):
        add(q, "lead", 100 + pos, dim)
    for k, e in found.items():
        e[2] = len(re.findall(re.escape(e[0]), prose, re.I)) + (1 if "infobox" in e[1] else 0)
    res = []
    for k, e in found.items():
        both = "infobox" in e[1] and "lead" in e[1]
        rank = 2 if both else (1 if "infobox" in e[1] else 0)
        res.append((rank, e[2], -e[3], e[0], "ib+lead" if both else ("infobox" if "infobox" in e[1] else "lead")))
    res.sort(key=lambda r: (-r[0], -r[1], -r[2], r[3]))
    return [[r[3], r[4], r[1]] for r in res]


def resolve(chunk, titles_for, stats):
    """chunk: [(gsis, name, year, pos)]; returns {gsis: (page_title, candidates)} for pages passing the guard."""
    titles = []
    for g, name, year, pos in chunk:
        titles += titles_for(name, pos)
    d = query(sorted(set(titles)))
    redirects = {r["from"]: r["to"] for r in d.get("query", {}).get("redirects", [])}
    pages = {}
    for pg in d.get("query", {}).get("pages", []):
        if pg.get("missing") or not pg.get("revisions"):
            continue
        pages[pg["title"]] = pg["revisions"][0]["slots"]["main"]["content"]
    out = {}
    for g, name, year, pos in chunk:
        for t in titles_for(name, pos):
            wt = pages.get(redirects.get(t, t))
            if not wt:
                continue
            _, lead = split_infobox(wt)
            if is_football_bio(wt, lead_prose(lead), year):
                out[g] = (redirects.get(t, t), candidates(wt, name))
                break
    return out


def main():
    players = json.loads((ROOT / "data/y80/players.json").read_text())
    want = []
    for p in players:
        nf = p.get("nfl") or {}
        if nf.get("gsis") and nf.get("dob") and p["g"] > 0:
            name = re.sub(r" \(.*\)$", "", p["n"]).strip()
            want.append((nf["gsis"], name, nf["dob"][:4], p["pos"], p["g"]))
    # most games first so a time budget still covers the players people know
    want.sort(key=lambda w: (-w[4], w[0]))
    want = [w[:4] for w in want]
    path = ROOT / "data/nfl/nicknames_infobox.json"
    if os.environ.get("NICK_REFRESH") and path.exists():  # cheap rerun: only players who already have one
        have = json.loads(path.read_text())
        want = [w for w in want if w[0] in have]
    budget = float(os.environ.get("NICK_MINUTES", "60")) * 60
    t0 = time.time()
    pages, nicks = {}, {}
    stats = {}
    stage1 = lambda n, pos: [f"{n} (American football)", n]
    stage2 = lambda n, pos: [f"{n} ({x})" for x in POS_TITLES.get(pos, [])]
    for label, fn, size, who in (("stage1", stage1, 25, want), ("stage2", stage2, 12, None)):
        if who is None:
            who = [w for w in want if w[0] not in pages]
        for i in range(0, len(who), size):
            for g, (title, cands) in resolve(who[i:i + size], fn, stats).items():
                pages[g] = title
                if cands:
                    nicks[g] = {"best": cands[0][0], "all": cands}
            if (i // size) % 20 == 0:
                print(f"  {label} {i}/{len(who)} asked, {len(pages)} pages, {len(nicks)} nicknames", flush=True)
            if time.time() - t0 > budget:
                print("time budget reached")
                break
            time.sleep(1.0)
    path.write_text(json.dumps(dict(sorted(nicks.items())), indent=0, ensure_ascii=False) + "\n")
    multi = sum(len(v["all"]) > 1 for v in nicks.values())
    print(f"{len(nicks)} nicknames from {len(pages)} football-biography pages ({len(want)} players asked); {multi} with several")


if __name__ == "__main__":
    main()
