// node scripts/perf/compare.mjs <label>=<run1.json>,<run2.json>,... <label>=...   -> markdown table of per-page medians
import fs from 'node:fs';
const med = (a) => { const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const cols = process.argv.slice(2).map((a) => { const [label, files] = a.split('='); return { label, runs: files.split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))) }; });
const rows = [];
const pages = ['arcade', 'stats', 'deepdive', 'collection'];
const get = (c, f) => med(c.runs.map(f));
for (const pg of pages) {
  rows.push([`${pg} interactive (ms)`, ...cols.map((c) => get(c, (r) => r.pages[pg]?.ttiMs))]);
  rows.push([`${pg} KB / requests`, ...cols.map((c) => `${get(c, (r) => r.pages[pg]?.kb)} / ${get(c, (r) => r.pages[pg]?.requests)}`)]);
  rows.push([`${pg} blocking (ms)`, ...cols.map((c) => get(c, (r) => r.pages[pg]?.blockingMs))]);
  rows.push([`${pg} heap (MB)`, ...cols.map((c) => get(c, (r) => r.pages[pg]?.heapMb))]);
  if (pg === 'stats' || pg === 'deepdive') rows.push([`${pg} scroll-through blocking (ms)`, ...cols.map((c) => get(c, (r) => r.pages[pg]?.scroll?.blockingMs))]);
}
rows.push(['arcade warm revisit (ms / KB)', ...cols.map((c) => `${get(c, (r) => r.warm?.ttiMs)} / ${get(c, (r) => r.warm?.kb)}`)]);
rows.push(['JSON/CSV parse total (ms)', ...cols.map((c) => get(c, (r) => r.parseTotalMs))]);
rows.push(['header search typing max / p50 (ms)', ...cols.map((c) => `${get(c, (r) => r.typing?.header?.max)} / ${get(c, (r) => r.typing?.header?.p50)}`)]);
rows.push(['deep dive picker typing max / p50 (ms)', ...cols.map((c) => `${get(c, (r) => r.typing?.deepdive?.max)} / ${get(c, (r) => r.typing?.deepdive?.p50)}`)]);
console.log(`| metric | ${cols.map((c) => c.label).join(' | ')} |\n|---|${cols.map(() => '---').join('|')}|`);
rows.forEach((r) => console.log(`| ${r.join(' | ')} |`));
