// Headless performance measurement of a built dist (node scripts/perf/measure.mjs --dist <dir> --label <name> [--out file.json]).
//   Cold first load per page (fresh browser context, nothing cached): requests, transferred bytes (gzip), time until the
//   page is interactive (its marker text is up AND the main thread has been idle), main-thread blocking time (long
//   tasks), JS heap after a GC; JSON / CSV parse time of the startup files; warm revisit (HTTP cache) of the Arcade;
//   typing latency in the header search and the Deep Dive picker (keystroke -> last DOM change of the results).
// External hosts (fonts, ESPN logos) are blocked so the numbers are the site's own.
import fs from 'node:fs';
import path from 'node:path';
import { launch, newPage } from './cdp.mjs';
import { serve } from './serve.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const dist = path.resolve(arg('dist', 'dist'));
const label = arg('label', path.basename(dist));
const out = arg('out');
const port = Number(arg('port', '4181'));
const only = arg('only')?.split(',');
const BASE = `http://127.0.0.1:${port}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  { id: 'arcade', hash: '#games', marker: '(?=[\\s\\S]*PRESS START)[\\s\\S]*PLAYERS\\s+[1-9]\\d{3,}\\b' },
  { id: 'stats', hash: '#stats/players', marker: '90\\+ OVR\\s+[1-9]\\d*' },
  { id: 'deepdive', hash: '#stats/deepdive?p=QB:Josh%20Allen', marker: 'SCOUTING REPORT' },
  { id: 'collection', hash: '#collection', marker: 'Draw today' },
];

const INIT = `
  window.__lt = 0; window.__ltn = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lt += Math.max(0, e.duration - 50); window.__ltn++; } }).observe({ entryTypes: ['longtask'] }); } catch {}
  window.__idle = async (marker, sel, ci, timeout = 20000) => {
    const t0 = performance.now();
    const up = () => {
      const t = document.body ? document.body.innerText : '';
      const hit = new RegExp(marker, ci ? 'i' : '').test(t);
      return hit && (!sel || document.querySelector(sel));
    };
    let calm = 0, last = performance.now(), markerAt = 0;
    while (performance.now() - t0 < timeout) {
      await new Promise((r) => setTimeout(r, 0));
      const now = performance.now(), gap = now - last; last = now;
      const isUp = up();
      if (isUp && !markerAt) markerAt = now;
      calm = gap < 40 && isUp ? calm + 1 : 0;
      if (calm >= 6) return { at: performance.now(), ok: true, markerAt };
    }
    return { at: performance.now(), ok: false };
  };
`;

const mb = (n) => +(n / 1048576).toFixed(2);

const loadPage = async (browser, pg, { warmOf } = {}) => {
  const page = warmOf || (await newPage(browser));
  await page.send('Network.setBlockedURLs', { urls: ['*googleapis*', '*gstatic*', '*espncdn*', '*espn.com*', '*bigdatacloud*', '*open-meteo*'] });
  const reqs = new Map();
  let inflight = 0, lastNet = Date.now();
  const onReq = (p) => { reqs.set(p.requestId, { url: p.request.url, enc: 0, dec: 0, t: p.timestamp }); inflight++; lastNet = Date.now(); };
  const onFin = (p) => { const r = reqs.get(p.requestId); if (r) { r.enc = p.encodedDataLength; r.end = p.timestamp; } inflight--; lastNet = Date.now(); };
  const onData = (p) => { const r = reqs.get(p.requestId); if (r) r.dec += p.dataLength; };
  const onCache = (p) => { const r = reqs.get(p.requestId); if (r) r.cached = true; };
  page.on('Network.requestWillBeSent', onReq);
  page.on('Network.loadingFinished', onFin);
  page.on('Network.loadingFailed', () => { inflight--; });
  page.on('Network.dataReceived', onData);
  page.on('Network.requestServedFromCache', onCache);
  const errors = [];
  page.on('Runtime.exceptionThrown', (p) => errors.push((p.exceptionDetails.exception?.description || p.exceptionDetails.text).slice(0, 160)));
  if (!warmOf) {
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
  } else {
    await page.send('Network.setCacheDisabled', { cacheDisabled: false });
  }
  const t0 = Date.now();
  await page.send('Page.navigate', { url: BASE + (warmOf ? 'about:blank#' : '') });
  if (warmOf) await page.send('Page.navigate', { url: BASE + pg.hash });
  else await page.send('Page.navigate', { url: BASE + pg.hash });
  await sleep(50);
  const r = await page.evaluate(`window.__idle(${JSON.stringify(pg.marker)}, ${JSON.stringify(pg.sel || '')}, ${!!pg.ci})`).catch((e) => ({ ok: false, err: String(e) }));
  const tti = r.at ?? Date.now() - t0;
  // let trailing requests (sprites, logos) finish, but they don't count towards TTI
  const settled = Date.now();
  const startupReqs = [...reqs.values()];
  await sleep(1500);
  await page.send('HeapProfiler.collectGarbage').catch(() => {});
  const heap = await page.send('Runtime.getHeapUsage');
  const lt = await page.evaluate('({ms: window.__lt, n: window.__ltn})');
  const own = (u) => u.startsWith(BASE);
  const list = startupReqs.filter((q) => own(q.url));
  const sprites = list.filter((q) => /private-sprites\/nfl\/\d|widget-sprites|\/sprites\/[^/]+\.png/.test(q.url));
  const rest = list.filter((q) => !sprites.includes(q));
  const bytes = (a) => a.reduce((s, q) => s + (q.cached ? 0 : q.enc), 0);
  const res = {
    page: pg.id, ok: r.ok, ttiMs: Math.round(tti), contentMs: Math.round(r.markerAt || 0), blockingMs: Math.round(lt.ms), longTasks: lt.n,
    requests: rest.length, kb: Math.round(bytes(rest) / 1024), spriteRequests: sprites.length, spriteKb: Math.round(bytes(sprites) / 1024),
    timeline: process.env.TIMELINE ? [...rest].sort((a, b) => a.t - b.t).map((q) => [q.url.replace(BASE, '').slice(0, 60), Math.round((q.t - rest[0].t) * 1000), Math.round(((q.end ?? q.t) - rest[0].t) * 1000)]) : undefined,
    data: rest.filter((q) => /\/data\/|index\.json|\.json$|\.csv$|\.bin$/.test(q.url)).map((q) => [q.url.replace(BASE, ''), Math.round(q.enc / 1024), Math.round(q.dec / 1024)]),
    jsKb: Math.round(rest.filter((q) => /\.js$/.test(q.url)).reduce((s, q) => s + q.enc, 0) / 1024),
    heapMb: mb(heap.usedSize), domNodes: await page.evaluate('document.getElementsByTagName("*").length'), errors: [...new Set(errors)].slice(0, 5),
  };
  if (!warmOf) return { page, res };
  return { page, res };
};

/** Typing latency: type `text` one key at a time into the focused input; per key: ms until the DOM stopped changing. */
const typing = async (page, inputSel, text, resultSel) => {
  return page.evaluate(`(async () => {
    const input = document.querySelector(${JSON.stringify(inputSel)});
    if (!input) return { err: 'no input ' + ${JSON.stringify(inputSel)} };
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const root = document.body;
    const lat = [];
    let value = '';
    for (const ch of ${JSON.stringify(text)}) {
      value += ch;
      let lastMut = 0;
      const mo = new MutationObserver(() => { lastMut = performance.now(); });
      mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
      const t0 = performance.now();
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // settled: 80 ms without a DOM change (deferred renders land in later tasks)
      await new Promise((res) => { const tick = () => { if (performance.now() - Math.max(lastMut, t0) > 80) res(); else setTimeout(tick, 5); }; setTimeout(tick, 5); });
      mo.disconnect();
      lat.push(Math.round(Math.max(lastMut, t0) - t0));
      await new Promise((r) => setTimeout(r, 40));
    }
    const n = ${JSON.stringify(resultSel)} ? document.querySelectorAll(${JSON.stringify(resultSel)}).length : -1;
    return { lat, max: Math.max(...lat), p50: lat.slice().sort((a, b) => a - b)[Math.floor(lat.length / 2)], rows: n };
  })()`);
};

const parseTimes = async (page, files) =>
  page.evaluate(`(async () => {
    const out = {};
    for (const f of ${JSON.stringify(files)}) {
      try {
        const r = await fetch(f); const t = await r.text();
        const t0 = performance.now();
        if (f.endsWith('.json')) JSON.parse(t); else { let n = 0; for (const l of t.split('\\n')) { l.split(','); n++; } }
        out[f] = Math.round((performance.now() - t0) * 10) / 10;
      } catch (e) { out[f] = -1; }
    }
    return out;
  })()`);

const srv = await serve(dist, port);
const { browser, close } = await launch();
const result = { label, dist, at: new Date().toISOString(), pages: {}, typing: {}, warm: {}, parse: {} };
try {
  for (const pg of PAGES) {
    if (only && !only.includes(pg.id)) continue;
    const { page, res } = await loadPage(browser, pg);
    result.pages[pg.id] = res;
    process.stderr.write(`${pg.id}: tti ${res.ttiMs} ms (content ${res.contentMs}), ${res.requests} req, ${res.kb} KB (+${res.spriteRequests} sprites ${res.spriteKb} KB), heap ${res.heapMb} MB, ${res.domNodes} nodes, blocking ${res.blockingMs} ms ${res.ok ? '' : 'NOT INTERACTIVE'} ${res.errors.join('|')}\n`);
    if (pg.id === 'arcade') {
      const files = res.data.map((d) => d[0]).filter((f) => /\.(json|csv)$/.test(f));
      result.parse = await parseTimes(page, files.map((f) => '/' + f));
      result.parseTotalMs = Math.round(Object.values(result.parse).filter((v) => v > 0).reduce((a, b) => a + b, 0));
      // header search: Cmd+K opens it
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 4, windowsVirtualKeyCode: 75 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 4, windowsVirtualKeyCode: 75 });
      await sleep(600);
      result.typing.header = await typing(page, 'input[cmdk-input], [role="dialog"] input', 'josh allen', '[cmdk-item]');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      // warm revisit
      const warm = await loadPage(browser, pg, { warmOf: page });
      result.warm = { ttiMs: warm.res.ttiMs, requests: warm.res.requests, kb: warm.res.kb };
      process.stderr.write(`  warm revisit: tti ${warm.res.ttiMs} ms, ${warm.res.requests} req, ${warm.res.kb} KB\n`);
    }
    if (pg.id === 'deepdive') {
      // the picker: a button opens the list with its own input
      const opened = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button,[role=combobox]')].find((x) => /search|player|pick|choose/i.test(x.innerText + (x.getAttribute('aria-label')||'')) ); if (b) { b.click(); return true; } return false; })()`);
      await sleep(500);
      result.typing.deepdive = await typing(page, '[role="dialog"] input, [cmdk-input], [role="listbox"] input, [data-radix-popper-content-wrapper] input', 'patrick mahomes', '[cmdk-item]');
      result.typing.deepdive.opened = opened;
    }
    if (pg.id === 'stats' || pg.id === 'deepdive') {
      // read the whole page: scroll to the bottom in steps; what the deferred sections cost when they mount
      const sc = await page.evaluate(`(async () => {
        const lt0 = window.__lt; const t0 = performance.now();
        for (let i = 1; i <= 16; i++) { window.scrollTo(0, (i / 16) * document.documentElement.scrollHeight); await new Promise((r) => setTimeout(r, 250)); }
        await window.__idle('.', '', false, 8000);
        return { blockingMs: Math.round(window.__lt - lt0), ms: Math.round(performance.now() - t0 - 4000), nodes: document.getElementsByTagName('*').length };
      })()`);
      result.pages[pg.id].scroll = sc;
      process.stderr.write(`  scroll through: +${sc.blockingMs} ms blocking, ${sc.nodes} nodes\n`);
    }
    await page.dispose();
  }
  if (result.typing.header) process.stderr.write(`typing header: ${JSON.stringify(result.typing.header)}\n`);
  if (result.typing.deepdive) process.stderr.write(`typing deepdive: ${JSON.stringify(result.typing.deepdive)}\n`);
} finally {
  await close();
  srv.close();
}
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.pages, (k, v) => (k === 'data' ? undefined : v)));
