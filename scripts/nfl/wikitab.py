"""Tiny shared helpers for the Wikipedia fetchers: fetch with the CA fallback, and an HTML table / list parser.
Standard library only."""
import re, os, ssl, urllib.request
from html.parser import HTMLParser
from urllib.parse import quote

UA = "RetroVaultDemo/1.0"
BASE = "https://en.wikipedia.org/wiki/"

def fetch(page):
    req = urllib.request.Request(BASE + quote(page), headers={"User-Agent": UA})
    ctx = ssl.create_default_context()
    if not ctx.get_ca_certs() and os.path.exists("/etc/ssl/cert.pem"):
        ctx = ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    return urllib.request.urlopen(req, timeout=60, context=ctx).read().decode("utf-8")

class Node(HTMLParser):
    """Collects, in document order: section headings, table rows (cells carry text, links, bold text,
    rowspan/colspan) and list items (text + links). Footnote <sup>, <style> and hidden spans are dropped."""
    def __init__(s):
        super().__init__(convert_charrefs=True)
        s.hpath = {}; s.section = ""; s.h = None; s.tables = []; s.tstack = []; s.items = []; s.istack = []
        s.skip = 0; s.cell = None
    def handle_starttag(s, t, a):
        a = dict(a)
        if t in ("h2", "h3", "h4"): s.h = {"lvl": int(t[1]), "t": ""}
        elif t == "table": s.tstack.append({"sec": s.section, "path": " > ".join(s.hpath[k] for k in sorted(s.hpath)), "rows": []})
        elif t == "tr" and s.tstack: s.tstack[-1]["rows"].append([])
        elif t in ("td", "th") and s.tstack and s.tstack[-1]["rows"]:
            c = {"t": "", "links": [], "bold": [], "rs": int(re.sub(r"\D", "", a.get("rowspan", "1")) or 1),
                 "cs": int(re.sub(r"\D", "", a.get("colspan", "1")) or 1), "th": t == "th"}
            s.tstack[-1]["rows"][-1].append(c); s.cell = c
        elif t == "li": s.istack.append({"sec": s.section, "t": "", "links": [], "bold": []})
        elif t in ("sup", "style"): s.skip += 1
        elif t == "a" and a.get("title") and not s.skip:
            tgt = s.cell if s.cell is not None else (s.istack[-1] if s.istack else None)
            if tgt is not None: tgt["links"].append(a["title"])
        elif t == "br":
            if s.cell is not None: s.cell["t"] += "\n"
        elif t == "b": s._b = ""; s._inb = True
    _inb = False
    def handle_endtag(s, t):
        if t in ("h2", "h3", "h4") and s.h:
            s.section = re.sub(r"\[.*", "", s.h["t"]).strip()
            s.hpath = {k: v for k, v in s.hpath.items() if k < s.h["lvl"]}; s.hpath[s.h["lvl"]] = s.section; s.h = None
        elif t == "table" and s.tstack: s.tables.append(s.tstack.pop()); s.cell = None
        elif t in ("td", "th"): s.cell = None
        elif t == "li" and s.istack: s.items.append(s.istack.pop())
        elif t in ("sup", "style"): s.skip = max(0, s.skip - 1)
        elif t == "b" and s._inb:
            s._inb = False
            tgt = s.cell if s.cell is not None else (s.istack[-1] if s.istack else None)
            if tgt is not None and s._b.strip(): tgt["bold"].append(s._b.strip())
    def handle_data(s, d):
        if s.skip: return
        if s.h is not None: s.h["t"] += d
        if s._inb: s._b += d
        if s.cell is not None: s.cell["t"] += d
        for i in s.istack: i["t"] += d

def grid(rows):
    out = []; pend = {}
    for r in rows:
        row = []; ci = 0; cells = list(r)
        while cells or ci in pend:
            if ci in pend:
                c, n = pend[ci]; row.append(c)
                if n > 1: pend[ci] = (c, n - 1)
                else: del pend[ci]
                ci += 1; continue
            c = cells.pop(0)
            for _ in range(c["cs"]):
                row.append(c)
                if c["rs"] > 1: pend[ci] = (c, c["rs"] - 1)
                ci += 1
        out.append(row)
    return out

def squash(s):
    s = re.sub(r"\[[^\]]*\]", "", s)
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()
