#!/usr/bin/env node
/**
 * Test harness for the NFL Scriptable widget (public/widgets/rv-nfl-widget.js), which can't run off the phone. Same idea
 * as scripts/widget_harness.mjs: it stubs the Scriptable API, runs the script once per view and renders each widget
 * tree to HTML (DrawContext calls as SVG, the script's own output).
 *
 *   - widget data, sprites and art: served from public/data/nfl/ (or RV_NFL_WIDGET_DATA, a folder with the same layout) as raw.githubusercontent.com and GitHub Pages would serve the
 *     public repo; `raw-down` scenarios lose raw GitHub, so the script must fall back to Pages
 *   - ESPN: recorded fixtures in scripts/nfl/widget_fixtures/ (scoreboard.json, summary.json, scoreboard_upcoming.json,
 *     fetched by fetch_fixtures.py). The finished game is turned into a live one for the live views (status, clock,
 *     situation, the win probability so far); every figure is still ESPN's own
 *   - club logos: ESPN's CDN, fetched once into node_modules/.tmp/nfl-logos (offline: the script draws without them)
 *
 *   node scripts/nfl/widget_harness.mjs [outDir]       every mode x size; HTML + tree dumps in outDir (default
 *                                                       node_modules/.tmp/nfl-widget-preview)
 *   node scripts/nfl/widget_harness.mjs out live-large  only the views whose id contains that text
 *
 * Any exception fails the run (exit code 1). The local clock is pinned to America/Los_Angeles.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
process.env.TZ = 'America/Los_Angeles';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'node_modules', '.tmp', 'nfl-widget-preview'));
const ONLY = process.argv[3] || '';
mkdirSync(OUT, { recursive: true });
const SCRIPT = readFileSync(join(ROOT, 'public/widgets/rv-nfl-widget.js'), 'utf8');
const NFL = resolve(process.env.RV_NFL_WIDGET_DATA || join(ROOT, 'public/data/nfl'));
const FIX = join(ROOT, 'scripts/nfl/widget_fixtures');
const DATA = JSON.parse(readFileSync(join(NFL, 'widget.json'), 'utf8'));
const LOGOS = join(ROOT, 'node_modules/.tmp/nfl-logos');
mkdirSync(LOGOS, { recursive: true });
for (const slug of 'ari atl bal buf car chi cin cle dal den det gb hou ind jax kc lac lar lv mia min ne no nyg nyj phi pit sea sf tb ten wsh'.split(' ')) {
  const f = join(LOGOS, slug + '.png');
  if (!existsSync(f)) {
    try { execFileSync('curl', ['-s', '-m', '15', '-o', f, `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500-dark/${slug}.png&h=120&w=120`]); } catch (e) { /* offline: no logos */ }
  }
}
const fix = (n) => JSON.parse(readFileSync(join(FIX, n), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------- stubs ----------------
class Color {
  constructor(hex, alpha = 1) {
    this.hex = String(hex).startsWith('#') ? hex : '#' + hex;
    this.alpha = alpha;
  }
  static white() { return new Color('#ffffff'); }
  static black() { return new Color('#000000'); }
  static clear() { return new Color('#000000', 0); }
  get css() {
    const n = parseInt(this.hex.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${this.alpha})`;
  }
}
class Font {
  constructor(name, size) { this.name = name; this.size = size; }
  static sys(size, weight, extra = {}) { const f = new Font('system', size); f.weight = weight; Object.assign(f, extra); return f; }
  static systemFont(s) { return Font.sys(s, 400); }
  static mediumSystemFont(s) { return Font.sys(s, 500); }
  static semiboldSystemFont(s) { return Font.sys(s, 600); }
  static boldSystemFont(s) { return Font.sys(s, 700); }
  static heavySystemFont(s) { return Font.sys(s, 800); }
  static boldMonospacedSystemFont(s) { return Font.sys(s, 700, { mono: true }); }
  static heavyRoundedSystemFont(s) { return Font.sys(s, 800, { rounded: true }); }
  get css() {
    if (this.name === 'system') {
      const fam = this.mono ? 'ui-monospace, Menlo, monospace' : this.rounded ? 'ui-rounded, -apple-system, sans-serif' : '-apple-system, sans-serif';
      return `font-family:${fam};font-weight:${this.weight};font-size:${this.size}px`;
    }
    const italic = /Italic/.test(this.name);
    const weight = /Heavy/.test(this.name) ? 800 : /Bold/.test(this.name) ? 700 : 500;
    return `font-family:Avenir Next Condensed,sans-serif;font-weight:${weight};font-style:${italic ? 'italic' : 'normal'};font-size:${this.size}px`;
  }
}
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class Rect {
  constructor(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; }
  get minX() { return this.x; } get minY() { return this.y; }
}
class Path {
  constructor() { this.d = []; }
  move(p) { this.d.push(`M${p.x} ${p.y}`); }
  addLine(p) { this.d.push(`L${p.x} ${p.y}`); }
  addRect(r) { this.d.push(`M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z`); }
  addRoundedRect(r, rx, ry) {
    const { x, y, width: w, height: h } = r;
    rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    this.d.push(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
  }
  closeSubpath() { this.d.push('Z'); }
}
class Image {
  constructor(size, kind, payload) { this.size = size; this.kind = kind; this.payload = payload; }
}
const pngSize = (buf) => new Size(buf.readUInt32BE(16), buf.readUInt32BE(20));
class DrawContext {
  constructor() { this.ops = []; this.size = new Size(0, 0); this.fill = null; this.stroke = null; this.lw = 1; this.path = null; this.font = Font.systemFont(12); this.tc = Color.black(); this.align = 'left'; }
  setFillColor(c) { this.fill = c; }
  setStrokeColor(c) { this.stroke = c; }
  setLineWidth(w) { this.lw = w; }
  fillRect(r) { this.ops.push(['rect', r, this.fill]); }
  fill(r) { this.fillRect(r); }
  fillEllipse(r) { this.ops.push(['ellipse', r, this.fill]); }
  strokeEllipse(r) { this.ops.push(['sellipse', r, this.stroke, this.lw]); }
  addPath(p) { this.path = p; }
  fillPath() { if (this.path) this.ops.push(['path', this.path.d.join(''), this.fill, null]); }
  strokePath() { if (this.path) this.ops.push(['path', this.path.d.join(''), null, this.stroke, this.lw]); }
  drawImageInRect(img, r) { if (!img) throw new Error('drawImageInRect(null)'); this.ops.push(['image', img, r]); }
  drawImageAtPoint(img, p) { this.ops.push(['image', img, new Rect(p.x, p.y, img.size.width, img.size.height)]); }
  setFont(f) { this.font = f; }
  setTextColor(c) { this.tc = c; }
  setTextAlignedCenter() { this.align = 'center'; }
  setTextAlignedLeft() { this.align = 'left'; }
  setTextAlignedRight() { this.align = 'right'; }
  drawTextInRect(t, r) { this.ops.push(['text', String(t), r, this.font, this.tc, this.align]); }
  drawText(t, p) { this.ops.push(['text', String(t), new Rect(p.x, p.y, 1000, this.font.size * 1.3), this.font, this.tc, 'left']); }
  getImage() {
    if (!(this.size.width > 0 && this.size.height > 0)) throw new Error('DrawContext without a size');
    return new Image(new Size(this.size.width, this.size.height), 'draw', this.ops.slice());
  }
}
class LinearGradient { constructor() { this.colors = []; this.locations = []; } }
class Node {
  constructor(kind, parent) { this.kind = kind; this.children = []; this.parent = parent; this.layout = kind === 'stack' ? 'h' : 'v'; this.align = null; }
  addStack() { const s = new Node('stack', this); this.children.push(s); return s; }
  addText(t) { const n = new Node('text', this); n.text = String(t); n.font = Font.systemFont(17); this.children.push(n); return n; }
  addImage(img) {
    if (!img || !img.size) throw new Error('addImage(null)');
    const n = new Node('image', this); n.image = img; this.children.push(n); return n;
  }
  addSpacer(n) { const s = new Node('spacer', this); s.length = n == null ? null : n; this.children.push(s); return s; }
  addDate(d) { return this.addText(d.toISOString()); }
  layoutHorizontally() { this.layout = 'h'; }
  layoutVertically() { this.layout = 'v'; }
  topAlignContent() { this.align = 'flex-start'; }
  centerAlignContent() { this.align = 'center'; }
  bottomAlignContent() { this.align = 'flex-end'; }
  setPadding(t, l, b, r) { this.padding = [t, l, b, r]; }
  useDefaultPadding() { this.padding = null; }
  centerAlignImage() { this.imgAlign = 'center'; }
  leftAlignImage() { this.imgAlign = 'left'; }
  rightAlignImage() { this.imgAlign = 'right'; }
  centerAlignText() { this.textAlign = 'center'; }
  leftAlignText() { this.textAlign = 'left'; }
  rightAlignText() { this.textAlign = 'right'; }
  async presentLarge() {} async presentMedium() {} async presentSmall() {}
}
class ListWidget extends Node { constructor() { super('widget', null); this.layout = 'v'; } }


function makeEnv(family, opts) {
  const files = new Map();
  const fm = {
    joinPath: (a, b) => `${a}/${b}`, cacheDirectory: () => '/cache', documentsDirectory: () => '/docs',
    fileExists: (p) => p === '/cache/rv-nfl' || files.has(p), createDirectory: () => {},
    writeString: (p, s) => files.set(p, { s, t: new Date() }), readString: (p) => files.get(p).s,
    writeImage: (p, i) => files.set(p, { i, t: new Date() }), readImage: (p) => files.get(p).i,
    modificationDate: (p) => files.get(p).t,
  };
  if (opts.cacheFrom) for (const [k, v] of opts.cacheFrom) files.set(k, v);
  const requests = [];
  class Request {
    constructor(url) { this.url = url; this.response = { statusCode: 200 }; this.headers = {}; }
    async fetchLocal() {
      requests.push(this.url);
      if (opts.offline) { this.response.statusCode = 0; throw new Error('offline ' + this.url); }
      let m;
      // the widget's home: raw GitHub (widget.json on the widget-data branch, sprites and art under main's public/) and
      // GitHub Pages (widget.json at /widget/, the rest at the site's data/nfl/), all served from public/data/nfl/
      if ((m = /^https:\/\/(?:raw\.githubusercontent\.com\/sakisaki-dev\/RetroVault-NFL\/(?:widget-data|main\/public\/data\/nfl)|sakisaki-dev\.github\.io\/RetroVault-NFL\/(?:widget|data\/nfl))\/(.+)$/.exec(this.url))) {
        if (opts.rawDown && this.url.includes('raw.githubusercontent.com')) { this.response.statusCode = 503; throw new Error('raw down'); }
        const p = join(NFL, m[1]);
        if (!existsSync(p)) { this.response.statusCode = 404; throw new Error('404 ' + m[1]); }
        return { path: p, data: m[1] === 'widget.json' && opts.data ? JSON.stringify(opts.data) : null };
      }
      if ((m = /site\.api\.espn\.com\/apis\/site\/v2\/sports\/football\/nfl\/(scoreboard|summary\?event=(\d+))/.exec(this.url))) {
        const o = opts.espn;
        if (!o) { this.response.statusCode = 503; throw new Error('espn off'); }
        const body = m[1] === 'scoreboard' ? o.scoreboard : o.summary;
        if (!body) { this.response.statusCode = 404; throw new Error('404'); }
        return { data: JSON.stringify(body) };
      }
      if ((m = /teamlogos\/nfl\/500-dark\/([a-z]+)\.png/.exec(this.url))) {
        const p = join(LOGOS, m[1] + '.png');
        if (!existsSync(p)) throw new Error('logo missing');
        return { path: p };
      }
      this.response.statusCode = 404; throw new Error('404 ' + this.url);
    }
    async loadString() { const r = await this.fetchLocal(); return r.data != null ? r.data : readFileSync(r.path, 'utf8'); }
    async loadImage() { const r = await this.fetchLocal(); if (!r.path) throw new Error('not an image'); return new Image(pngSize(readFileSync(r.path)), 'file', r.path); }
  }
  let captured = null;
  const env = {
    ListWidget, DrawContext, Path, Image, Font, Color, Size, Rect, Point, LinearGradient, Request,
    FileManager: { local: () => fm, iCloud: () => fm },
    Keychain: { contains: () => !opts.noToken, get: () => 'test-token', set: () => {} },
    Device: { screenSize: () => new Size(430, 932), screenScale: () => 3, isPad: () => false },
    config: { widgetFamily: family, runsInWidget: true },
    args: { widgetParameter: opts.param || '' },
    Script: { setWidget: (w) => { captured = w; }, complete: () => {} },
    RV_FAMILY: family, RV_NOW: opts.now, RV_FORCE: opts.force || null, RV_LOG: (x) => { box.log = x; },
  };
  const box = { env, get widget() { return captured; }, requests, files, log: null };
  return box;
}
async function run(family, opts = {}) {
  const box = makeEnv(family, opts);
  const names = Object.keys(box.env);
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const fn = new AsyncFunction(...names, SCRIPT);
  await fn(...names.map((n) => box.env[n]));
  if (!box.widget) throw new Error('Script.setWidget was never called');
  return box;
}

// ---------------- tree dump ----------------
function dump(n, d = 0) {
  const pad = '  '.repeat(d);
  const sz = n.size ? ` size=${Math.round(n.size.width)}x${Math.round(n.size.height)}` : '';
  if (n.kind === 'text') return `${pad}text "${n.text.slice(0, 90)}" (${n.font.name} ${n.font.size}${n.lineLimit ? `, ${n.lineLimit} lines` : ''})\n`;
  if (n.kind === 'image') {
    const i = n.image;
    const what = i.kind === 'file' ? `file ${i.payload.replace(ROOT + '/', '')}` : `draw ${i.payload.length} ops`;
    const s = n.imageSize || i.size;
    return `${pad}image ${what} at ${Math.round(s.width)}x${Math.round(s.height)}\n`;
  }
  if (n.kind === 'spacer') return `${pad}spacer ${n.length == null ? 'flex' : n.length}\n`;
  let out = `${pad}${n.kind}${n.kind === 'stack' ? '(' + n.layout + ')' : ''}${sz}${n.backgroundImage ? ' bg=' + n.backgroundImage.payload.length + 'ops' : ''}${n.url ? ' url=' + n.url.replace(/^https:\/\/[^#]+/, '') : ''}\n`;
  for (const c of n.children) out += dump(c, d + 1);
  return out;
}

// ---------------- HTML ----------------
const dataUris = new Map();
const fileUri = (p) => {
  if (!dataUris.has(p)) dataUris.set(p, 'data:image/png;base64,' + readFileSync(p).toString('base64'));
  return dataUris.get(p);
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const col = (c) => (c ? c.css : 'none');
function svgOf(img, w, h) {
  if (img.kind === 'file') return `<img src="${fileUri(img.payload)}" style="width:${w}px;height:${h}px;image-rendering:pixelated;display:block">`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${img.size.width} ${img.size.height}" preserveAspectRatio="none" style="display:block;overflow:hidden">${svgOps(img.payload)}</svg>`;
}
function svgOps(ops) {
  let s = '';
  for (const op of ops) {
    const [k] = op;
    if (k === 'rect') s += `<rect x="${op[1].x}" y="${op[1].y}" width="${op[1].width}" height="${op[1].height}" fill="${col(op[2])}"/>`;
    else if (k === 'ellipse') s += `<ellipse cx="${op[1].x + op[1].width / 2}" cy="${op[1].y + op[1].height / 2}" rx="${op[1].width / 2}" ry="${op[1].height / 2}" fill="${col(op[2])}"/>`;
    else if (k === 'sellipse') s += `<ellipse cx="${op[1].x + op[1].width / 2}" cy="${op[1].y + op[1].height / 2}" rx="${op[1].width / 2}" ry="${op[1].height / 2}" fill="none" stroke="${col(op[2])}" stroke-width="${op[3]}"/>`;
    else if (k === 'path') s += `<path d="${op[1]}" fill="${op[2] ? col(op[2]) : 'none'}" stroke="${op[3] ? col(op[3]) : 'none'}" stroke-width="${op[4] || 0}" stroke-linejoin="round"/>`;
    else if (k === 'image') {
      const [, img, r] = op;
      if (img.kind === 'file') s += `<image href="${fileUri(img.payload)}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
      else s += `<svg x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" viewBox="0 0 ${img.size.width} ${img.size.height}" preserveAspectRatio="none">${svgOps(img.payload)}</svg>`;
    } else if (k === 'text') {
      const [, t, r, f, c, a] = op;
      s += `<foreignObject x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"><div xmlns="http://www.w3.org/1999/xhtml" style="${f.css};color:${col(c)};text-align:${a};line-height:1.15;white-space:nowrap">${esc(t)}</div></foreignObject>`;
    }
  }
  return s;
}
// A stack's own flexibility: a flexible spacer along its axis makes it grow along that axis
const flexAlong = (n) => n.children.some((c) => c.kind === 'spacer' && c.length == null);
function html(n, parentLayout) {
  if (n.kind === 'spacer') {
    if (n.length == null) return `<div style="flex:1 1 0;min-width:0;min-height:0"></div>`;
    return `<div style="flex:none;${parentLayout === 'h' ? 'width' : 'height'}:${n.length}px"></div>`;
  }
  if (n.kind === 'text') {
    const lines = n.lineLimit || 0;
    const clamp = lines ? `display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${lines};overflow:hidden;` : '';
    return `<div style="${n.font.css};color:${col(n.textColor || Color.black())};line-height:1.17;${clamp}position:relative;min-width:0;flex:0 1 auto;text-align:${n.textAlign || 'left'}">${esc(n.text)}</div>`;
  }
  if (n.kind === 'image') {
    const s = n.imageSize || n.image.size;
    const self = n.imgAlign === 'center' ? 'align-self:center;' : '';
    return `<div style="flex:none;position:relative;${self}">${svgOf(n.image, s.width, s.height)}</div>`;
  }
  const v = n.layout === 'v';
  const st = [];
  st.push(`display:flex;flex-direction:${v ? 'column' : 'row'};position:relative;box-sizing:border-box`);
  st.push(`align-items:${n.align || (v ? 'flex-start' : 'center')}`);
  if (n.padding) st.push(`padding:${n.padding.map((p) => p + 'px').join(' ')}`);
  const w = n.size && n.size.width > 0 ? n.size.width : null;
  const h = n.size && n.size.height > 0 ? n.size.height : null;
  if (w) st.push(`width:${w}px;flex-shrink:0`);
  if (h) st.push(`height:${h}px;flex-shrink:0`);
  if (n.kind !== 'widget' && n.parent) {
    const grows = flexAlong(n);
    const along = n.parent.layout === n.layout;
    if (grows && along && !(along && (v ? h : w))) st.push('flex:1 1 auto');
    if (grows && !along && !(v ? w : h)) st.push('align-self:stretch');
    if (!w && n.parent.layout === 'h') st.push('min-width:0');
  }
  if (n.backgroundColor) st.push(`background:${col(n.backgroundColor)}`);
  if (n.cornerRadius) st.push(`border-radius:${n.cornerRadius}px;overflow:hidden`);
  let inner = '';
  if (n.backgroundImage) {
    inner += `<div style="position:absolute;inset:0;z-index:0">${svgOf(n.backgroundImage, '100%', '100%').replace(/width="100%" height="100%"/, 'width="100%" height="100%"')}</div>`;
  }
  inner += `<div style="display:contents">${n.children.map((c) => html(c, n.layout)).join('')}</div>`;
  return `<div style="${st.join(';')}">${inner}</div>`;
}
// Children sit over the background image
const layer = (s) => s.replace(/<div style="display:contents">/g, '<div style="display:contents;position:relative;z-index:1">');

const SIZES = { large: [364, 382], medium: [364, 170], small: [170, 170], accessoryInline: [240, 22], accessoryCircular: [72, 72], accessoryRectangular: [172, 76] };
function widgetHtml(w, family) {
  const [W, H] = SIZES[family];
  const lock = family.startsWith('accessory');
  const st = [`width:${W}px;height:${H}px;box-sizing:border-box;position:relative;overflow:hidden;display:flex;flex-direction:column`];
  if (!lock) st.push(`border-radius:24px;background:${col(w.backgroundColor)}`);
  if (w.addAccessoryWidgetBackground) st.push(`background:rgba(255,255,255,.16);border-radius:${family === 'accessoryCircular' ? '50%' : '12px'}`);
  const pad = w.padding || (lock ? [0, 0, 0, 0] : [16, 16, 16, 16]);
  st.push(`padding:${pad.map((p) => p + 'px').join(' ')}`);
  st.push(family === 'accessoryCircular' ? 'align-items:center;justify-content:center' : 'align-items:stretch');
  const bg = w.backgroundImage ? `<div style="position:absolute;inset:0">${svgOf(w.backgroundImage, W, H)}</div>` : '';
  const kids = w.children.map((c) => html(c, 'v')).join('');
  const color = lock ? 'color:#fff;' : '';
  return layer(`<div style="${st.join(';')};${color}">${bg}<div style="display:contents">${kids}</div></div>`);
}
function inlineHtml(w) {
  const t = w.children.find((c) => c.kind === 'text');
  return `<div style="font:600 15px -apple-system,sans-serif;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:${SIZES.accessoryInline[0]}px">${esc(t ? t.text : '')}</div>`;
}
const page = (title, body, w, h, bg = '#05070f') =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>html,body{margin:0;background:${bg}}*{-webkit-font-smoothing:antialiased}</style></head><body><div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center">${body}</div></body></html>`;

// ---------------- fixtures: the recorded game, made live where a view needs it ----------------
const SB = fix('scoreboard.json'), SUM = fix('summary.json'), UP = fix('scoreboard_upcoming.json');
const MIN_EVENT = '401873077';
const side = (c, ha) => c.competitors.find((x) => x.homeAway === ha);
function setLive(ev, period, clock, away, home, extra = {}) {
  const c = ev.competitions[0];
  const st = { clock: 0, displayClock: clock, period, type: { id: '2', name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, description: 'In Progress', detail: `${clock} - Q${period}`, shortDetail: `${clock} - ${period}` } };
  ev.status = st; c.status = st;
  side(c, 'away').score = String(away); side(c, 'home').score = String(home);
  const ls = (n, total) => { const out = []; let left = total; for (let i = 0; i < n; i++) { const v = i === n - 1 ? left : Math.min(left, [7, 10, 3, 7][i % 4]); out.push({ value: v }); left -= v; } return out; };
  side(c, 'away').linescores = ls(period, away); side(c, 'home').linescores = ls(period, home);
  side(c, 'away').winner = false; side(c, 'home').winner = false;
  if (extra.situation) c.situation = extra.situation; else delete c.situation;
  ev.date = c.date = extra.date || ev.date;
  return ev;
}
function setPre(ev, iso) {
  const c = ev.competitions[0];
  const st = { clock: 0, displayClock: '0:00', period: 0, type: { id: '1', name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled', detail: 'Sun', shortDetail: 'Sun' } };
  ev.status = st; c.status = st; ev.date = c.date = iso;
  c.competitors.forEach((x) => { x.score = '0'; x.linescores = []; x.winner = false; });
  delete c.situation;
}
function minSituation(ev, over = {}) {
  const c = ev.competitions[0];
  const min = c.competitors.find((x) => x.team.abbreviation === 'MIN');
  const home = c.competitors.find((x) => x.homeAway === 'home');
  return { down: 2, distance: 6, possession: min.id, possessionText: 'SF 34', shortDownDistanceText: '2nd & 6', downDistanceText: '2nd & 6 at SF 34', isRedZone: false,
    homeTimeouts: 2, awayTimeouts: 3, lastPlay: { text: 'K. Cousins pass short right to J. Jefferson for 18 yards to the SF 34' }, ...over, _home: home.team.abbreviation };
}
function liveBoard(o = {}) {
  const { slate = false, prime = false, redzone = false } = o;
  const minLive = o.minLive != null ? o.minLive : !slate;
  const sb = clone(SB), sum = clone(SUM);
  const ev = sb.events.find((e) => e.id === MIN_EVENT);
  if (minLive) setLive(ev, 3, '6:42', 17, 20, { situation: minSituation(ev, redzone ? { possessionText: 'SF 12', shortDownDistanceText: '1st & 10', downDistanceText: '1st & 10 at SF 12', isRedZone: true, distance: 10, down: 1 } : {}) });
  if (prime) {
    const t = new Date('2026-11-29T20:20:00');
    // the club is not live: another game in primetime is
    setPre(ev, new Date('2026-12-06T21:25:00Z').toISOString());
    const other = sb.events.find((e) => e.shortName === 'BAL @ CAR');
    setLive(other, 2, '4:12', 21, 17, { date: t.toISOString(), situation: { down: 3, distance: 4, possession: side(other.competitions[0], 'home').id, possessionText: 'BAL 31', shortDownDistanceText: '3rd & 4', downDistanceText: '3rd & 4 at BAL 31', homeTimeouts: 2, awayTimeouts: 1, lastPlay: { text: 'Pass incomplete deep right' } } });
    return { scoreboard: sb, summary: null, other };
  }
  if (slate) {
    const set = (name, p, clk, a, h) => { const e = sb.events.find((x) => x.shortName === name); if (e) setLive(e, p, clk, a, h); };
    set('TEN @ DAL', 4, '11:05', 24, 30); set('TB @ DET', 4, '2:10', 31, 28); set('LV @ DEN', 3, '0:44', 21, 14);
    const n = sb.events.find((x) => x.shortName === 'NYJ @ LAC'); if (n) setLive(n, 2, 'Halftime', 13, 16);
    const j = sb.events.find((x) => x.shortName === 'JAX @ NYG'); if (j) setLive(j, 3, '9:30', 10, 13);
    const k = sb.events.find((x) => x.shortName === 'ARI @ KC'); if (k) setPre(k, new Date('2026-11-29T17:25:00-08:00').toISOString());
  }
  sum.winprobability = sum.winprobability.slice(0, 96).map((w, i) => ({ ...w, homeWinPercentage: Math.max(0.05, Math.min(0.95, 0.5 + 0.4 * Math.sin(i / 14) * (1 - i / 160) - 0.18 * (i / 96))) }));
  sum.drives = { current: { description: '7 plays, 48 yards, 3:51' }, previous: sum.drives.previous.slice(0, 6) };
  return { scoreboard: sb, summary: sum };
}
const finalBoard = () => ({ scoreboard: clone(SB), summary: clone(SUM) });
const upcomingBoard = () => ({ scoreboard: clone(UP), summary: null });

// ---------------- views ----------------
const D = DATA;
const noClubLive = (d) => { const c = clone(d); return c; };
const prevData = () => { const c = clone(DATA); c.odds.prev = 0.91; return c; };
const offseasonData = () => { const c = clone(DATA); c.status = 'final'; c.next = null; return c; };
const T0 = '2026-11-29T10:50';      // Sunday, the club's game under way (kickoff 10:00 Pacific)
const views = [];
const add = (id, family, opts) => views.push([id, family, opts]);
for (const [style, fam] of [['classic', 'large'], ['bug', 'large'], ['classic', 'medium'], ['shot', 'medium'], ['bug', 'medium'], ['live', 'small'], ['bug', 'small'], ['duel', 'small']]) {
  add(`live-${fam}-${style}`, fam, { now: T0, espn: liveBoard(), force: { mode: 'live', style } });
}
add('live-large-redzone', 'large', { now: T0, espn: liveBoard({ redzone: true }), force: { mode: 'live', style: 'classic' } });
add('live-medium-default', 'medium', { now: T0, espn: liveBoard() });
add('prime-large', 'large', { now: '2026-11-29T18:10', espn: liveBoard({ prime: true }) });
add('prime-medium', 'medium', { now: '2026-11-29T18:10', espn: liveBoard({ prime: true }), force: { style: 'classic' } });
add('slate-large', 'large', { now: '2026-11-29T11:30', espn: liveBoard({ slate: true }) });
add('slate-medium', 'medium', { now: '2026-11-29T11:30', espn: liveBoard({ slate: true }), force: { mode: 'slate', style: 'ticker' } });
add('slate-small', 'small', { now: '2026-11-29T11:30', espn: liveBoard({ slate: true }), force: { mode: 'slate' } });
add('slate-large-bottom', 'large', { now: '2026-11-29T11:30', espn: liveBoard({ slate: true }), force: { mode: 'slate', style: 'bottom' } });
add('slate-medium-bottom', 'medium', { now: '2026-11-29T11:30', espn: liveBoard({ slate: true }), force: { mode: 'slate', style: 'bottom' } });
add('final-medium', 'medium', { now: '2026-11-22T21:40', espn: finalBoard(), data: prevData(), force: { mode: 'final' } });
add('final-large', 'large', { now: '2026-11-22T21:40', espn: finalBoard(), data: prevData(), force: { mode: 'final' } });
add('final-small', 'small', { now: '2026-11-22T21:40', espn: finalBoard(), data: prevData(), force: { mode: 'final' } });
for (const fam of ['large', 'medium', 'small']) add(`preview-${fam}`, fam, { now: '2026-11-28T15:00', espn: upcomingBoard() });
for (const v of ['club', 'race', 'mvp']) for (const fam of ['large', 'medium', 'small']) add(`between-${v}-${fam}`, fam, { now: '2026-11-24T09:00', force: { mode: 'between', view: v } });
for (const fam of ['large', 'medium', 'small']) add(`offseason-${fam}`, fam, { now: '2027-03-10T09:00', data: offseasonData() });
add('final-auto', 'medium', { now: '2026-11-22T21:40', espn: finalBoard(), data: prevData() });
add('between-auto', 'medium', { now: '2026-11-24T09:00' });
add('between-auto-large', 'large', { now: '2026-11-24T09:00' });
add('offline-large', 'large', { now: T0, offline: true });
add('raw-down-large', 'large', { now: T0, rawDown: true });
for (const [id, lock, now, espn, mode, view] of [
  ['lock-inline-live', 'accessoryInline', T0, liveBoard(), 'live'], ['lock-inline-between', 'accessoryInline', '2026-11-24T09:00', null, 'between'],
  ['lock-inline-preview', 'accessoryInline', '2026-11-28T15:00', upcomingBoard(), 'preview'],
  ['lock-circ-live', 'accessoryCircular', T0, liveBoard(), 'live'], ['lock-circ-preview', 'accessoryCircular', '2026-11-28T15:00', upcomingBoard(), 'preview'],
  ['lock-circ-between', 'accessoryCircular', '2026-11-24T09:00', null, 'between'], ['lock-circ-mvp', 'accessoryCircular', '2026-11-24T09:00', null, 'between', 'mvp'], ['lock-circ-race', 'accessoryCircular', '2026-11-24T09:00', null, 'between', 'race'],
  ['lock-rect-live', 'accessoryRectangular', T0, liveBoard(), 'live'], ['lock-rect-preview', 'accessoryRectangular', '2026-11-28T15:00', upcomingBoard(), 'preview'],
  ['lock-rect-between', 'accessoryRectangular', '2026-11-24T09:00', null, 'between'], ['lock-rect-final', 'accessoryRectangular', '2026-11-22T21:40', finalBoard(), 'final'],
  ['lock-rect-offseason', 'accessoryRectangular', '2027-03-10T09:00', null, 'offseason'],
]) add(id, lock, { now, espn, data: mode === 'offseason' ? offseasonData() : undefined, force: { mode, ...(mode === 'between' ? { view: view || 'club' } : {}) } });

const kicker = (t) => `<div style="font:8px Menlo,monospace;letter-spacing:1px;color:rgba(255,255,255,.6);margin:6px 0 4px">${t}</div>`;
// offline after a good run: the cache serves the data, the sprites and the last ESPN responses
{
  const warm = await run('large', { now: T0, espn: liveBoard(), force: { mode: 'live', style: 'classic' } });
  views.push(['offline-cached-large', 'large', { now: '2026-11-29T10:55', offline: true, cacheFrom: warm.files, force: { mode: 'live', style: 'classic' } }]);
  const warm2 = await run('large', { now: '2026-11-24T09:00', force: { mode: 'between', view: 'club' } });
  views.push(['offline-cached-between', 'large', { now: '2026-11-24T10:00', offline: true, cacheFrom: warm2.files, force: { mode: 'between', view: 'club' } }]);
}
let failed = 0;
const cells = [];
const results = {};
for (const [id, family, opts] of views) {
  if (ONLY && !id.includes(ONLY)) continue;
  try {
    const box = await run(family, { ...opts });
    const w = box.widget;
    if (opts.rawDown) {
      // raw GitHub refused every file: widget.json and the sprites must have come from GitHub Pages
      const pages = box.requests.filter((u) => u.startsWith('https://sakisaki-dev.github.io/RetroVault-NFL/'));
      if (!pages.some((u) => u.endsWith('/widget/widget.json')) || !pages.some((u) => u.includes('/widget-sprites/'))) throw new Error('no GitHub Pages fallback');
    }
    results[id] = w;
    writeFileSync(join(OUT, `${id}.tree.txt`), dump(w));
    const [W, H] = SIZES[family];
    const lock = family.startsWith('accessory');
    let body;
    if (family === 'accessoryInline') body = `<div style="background:linear-gradient(#34405f,#151b2e);padding:10px;border-radius:14px">${inlineHtml(w)}</div>`;
    else if (lock) body = `<div style="background:linear-gradient(#34405f,#151b2e);padding:10px;border-radius:16px;display:inline-block"><div style="background:rgba(255,255,255,.14);border-radius:${family === 'accessoryCircular' ? '50%' : '14px'};padding:${family === 'accessoryCircular' ? '0' : '3px'}">${widgetHtml(w, family)}</div></div>`;
    else body = widgetHtml(w, family);
    cells.push(`<div class="cell" id="${id}" style="display:inline-block;margin:10px;vertical-align:top">${kicker(id.toUpperCase())}${body}</div>`);
    writeFileSync(join(OUT, `${id}.html`), page(id, body, W + 40, H + 40));
    const lg = box.log ? `mode ${box.log.mode}, refresh +${box.log.refreshMin} min` : '';
    console.log(`ok   ${id.padEnd(26)} ${family.padEnd(21)} ${lg}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${id.padEnd(26)} ${family}: ${e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e}`);
  }
}
writeFileSync(join(OUT, 'contact.html'), `<!doctype html><html><head><meta charset="utf-8"><title>NFL widget</title><style>html,body{margin:0;background:#1b1440;color:#fff}</style></head><body style="padding:12px">${cells.join('')}</body></html>`);
console.log(`\n${Object.keys(results).length} views ran, ${failed} failures; previews in ${OUT} (contact.html has them all)`);
process.exit(failed ? 1 : 0);
