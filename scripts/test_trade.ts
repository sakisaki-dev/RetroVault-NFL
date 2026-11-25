// Run: npm run test:trade (self-test for the fantasy trade simulator engine, src/utils/tradeSim.ts, on public/data/nfl/fantasy.json)
import { readFileSync } from 'node:fs';
import type { FanRaw } from '../src/utils/fantasy';
import { buildTradeModel, gapNorm, DEFAULT_SETTINGS, evaluateTrade, suggestPartner, type TradeModel, type TradeSettings, type TradeTeam } from '../src/utils/tradeSim';

const raw = JSON.parse(readFileSync('public/data/nfl/fantasy.json', 'utf8')) as FanRaw;
const keyName = (k: string) => k.slice(k.indexOf(':') + 1);
const inj = JSON.parse(readFileSync('public/data/nfl/injuries.json', 'utf8')) as { p: Record<string, [string, string]> };
const build = (s: Partial<TradeSettings> = {}, statusOf: (k: string) => never | undefined = () => undefined): TradeModel => buildTradeModel(raw, { ...DEFAULT_SETTINGS, ...s }, statusOf);
const m = build();
let bad = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) bad++;
  console.log(ok ? 'ok  ' : 'FAIL', name, detail);
};
const oneFor = (a: string[], b: string[]): TradeTeam[] => [
  { give: a.map((key) => ({ key, to: 1 })), roster: [] },
  { give: b.map((key) => ({ key, to: 0 })), roster: [] },
];
const regs = m.ranked.filter((p) => p.pos === 'WR' && p.g >= 8 && !p.status);

// 1. a 1-for-1 between near-equal players reads Fair
let best: [string, string, number] | null = null;
const top = regs.filter((p) => p.value > 5);
for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
  const d = Math.abs(top[i].value - top[j].value) / Math.max(top[i].value, top[j].value);
  if (!best || d < best[2]) best = [top[i].key, top[j].key, d];
}
const fair = evaluateTrade(m, oneFor([best![0]], [best![1]]), false);
check('near-equal 1-for-1 reads Fair', fair.verdict === 'Fair', `${best![0]} / ${best![1]} gap ${(fair.gap * 100).toFixed(1)}%`);
check('a player for himself is level', evaluateTrade(m, oneFor([regs[0].key], [regs[0].key]), false).gap === 0);

// 2. a stud for two mid starters: the stud premium and the roster-spot line
const stud = regs[0];
const mids = regs.filter((p) => p.posRank >= 12 && p.posRank <= 40);
const sum2 = (a: number, b: number) => mids[a].vor + mids[b].vor;
let pair: [number, number] | null = null;
for (let i = 0; i < mids.length; i++) for (let j = i + 1; j < mids.length; j++)
  if (!pair || Math.abs(sum2(i, j) - stud.vor) < Math.abs(sum2(...pair) - stud.vor)) pair = [i, j];
const two = [mids[pair![0]].key, mids[pair![1]].key];
const t2 = evaluateTrade(m, oneFor(two, [stud.key]), false);
const linearGap = Math.abs(stud.vor - (mids[pair![0]].vor + mids[pair![1]].vor));
const midV = mids[pair![0]].vor + mids[pair![1]].vor, midVal = mids[pair![0]].value + mids[pair![1]].value;
check('stud premium: a stud is worth more per point of VOR than two mid starters', stud.value / stud.vor > midVal / midV && t2.teams[1].sentValue / stud.vor === stud.value / stud.vor,
  `stud VOR ${stud.vor.toFixed(1)} -> ${stud.value.toFixed(1)} (x${(stud.value / stud.vor).toFixed(2)}); two mids VOR ${midV.toFixed(1)} -> ${midVal.toFixed(1)} (x${(midVal / midV).toFixed(2)})`);
check('a stud for two lesser starters at about equal VOR favours the stud side', t2.winner === 0, `net ${t2.teams[0].net.toFixed(1)}`);
check('2-for-1 gives the two-player side a roster spot', t2.teams[0].spots === 1 && t2.teams[1].spots === 0 && t2.teams[0].credit >= 0, `credit ${t2.teams[0].credit.toFixed(2)}`);
const withCredit = { ...m, freeAgent: { ...m.freeAgent, credit: 10 } };
const t2c = evaluateTrade(withCredit, oneFor(two, [stud.key]), false);
check('the roster-spot credit moves the 2-for-1 net', Math.abs(t2c.teams[0].net - t2.teams[0].net - 10) < 1e-9);

// 3. settings change the numbers
const rb = m.ranked.find((p) => p.pos === 'RB' && p.rec.wr && p.rec.wr.reduce((a, b) => a + b, 0) > 20)!;
const te = m.ranked.find((p) => p.pos === 'TE' && p.g >= 8)!;
const std = build({ scoring: 'std' }), tep = build({ tePremium: true }), sf = build({ superflex: true }), ten = build({ teams: 10 }), pw = build({ playoffWeight: 2 });
check('standard scoring lowers a pass catcher', std.players.get(rb.key)!.ppg < rb.ppg, `${rb.key} ${rb.ppg.toFixed(1)} -> ${std.players.get(rb.key)!.ppg.toFixed(1)}`);
check('TE premium raises a TE', tep.players.get(te.key)!.ppg > te.ppg);
check('superflex lifts the QB line (replacement QB value falls)', sf.replacement.QB < m.replacement.QB && sf.starters.QB > m.starters.QB, `${m.replacement.QB.toFixed(0)} -> ${sf.replacement.QB.toFixed(0)}`);
check('10 teams lowers the replacement level', ten.replacement.WR > m.replacement.WR);
check('playoff weight 2 raises weighted ROS', pw.players.get(regs[0].key)!.rosW > m.players.get(regs[0].key)!.rosW);
const qb = m.ranked.find((p) => p.pos === 'QB')!;
check('a QB is worth more VOR in superflex', sf.players.get(qb.key)!.vor > m.players.get(qb.key)!.vor);

// 4. roster mode: a player who displaces nobody adds nothing
const rosterA = [regs[1], regs[2], regs[3]].map((p) => p.key);
const rm = evaluateTrade(m, [
  { give: [{ key: regs[20].key, to: 1 }], roster: rosterA },
  { give: [{ key: regs[0].key, to: 0 }], roster: [] },
], true);
check('roster mode: getting a better starter raises the lineup', rm.teams[0].net > 0, `net ${rm.teams[0].net.toFixed(1)}`);

// 5. three teams: nets add up and a verdict exists
const three = evaluateTrade(m, [
  { give: [{ key: regs[2].key, to: 1 }], roster: [] },
  { give: [{ key: regs[3].key, to: 2 }], roster: [] },
  { give: [{ key: regs[4].key, to: 0 }], roster: [] },
], false);
check('3 teams: each team receives one', three.teams.every((t) => t.received.length === 1) && three.verdict !== 'Empty');

// 6. suggest a partner: a fair package is found for a star
const pk = suggestPartner(m, [regs[0].key], { limit: 5 });
check('suggest finds packages, nearest first', pk.length > 0 && pk[0].gap <= pk[pk.length - 1].gap, pk.slice(0, 2).map((p) => `${p.keys.join('+')} ${(p.gap * 100).toFixed(1)}%`).join(' | '));

// 7. fairness: sample size, role, floor, scale, balance
const byVal = (mm: TradeModel, pos: string, r: number) => [...mm.ranked].filter((p) => p.pos === pos).sort((a, b) => b.value - a.value)[r - 1];
const qbs = m.ranked.filter((p) => p.pos === 'QB');
const starters = qbs.filter((p) => p.role >= 1 && p.g >= 8);
const backups = qbs.filter((p) => p.g <= 3 && p.role < 1);
const minStarterRos = Math.min(...starters.slice(0, 12).map((p) => p.ros));
check('backups project far below starters', backups.length > 3 && backups.every((p) => p.ros < 0.6 * minStarterRos), `max backup ${Math.max(...backups.map((p) => p.ros)).toFixed(0)} vs QB12 starter ${minStarterRos.toFixed(0)}`);
const allen = m.players.get('QB:Josh Allen');
check('Josh Allen has positive value', !!allen && allen.value > 0, `value ${allen?.value.toFixed(1)}`);
check('no player has a negative value', [...m.players.values()].every((p) => p.value >= 0));
const q1 = byVal(m, 'QB', 1), w1 = byVal(m, 'WR', 1), r1 = byVal(m, 'RB', 1), t1 = byVal(m, 'TE', 1);
const overall = [...m.players.values()].sort((a, b) => b.value - a.value);
const q1rank = overall.indexOf(q1) + 1;
check('QB1 is a top-15 to top-30 overall asset in 1QB', q1rank >= 12 && q1rank <= 30, `QB1 ${q1.key} #${q1rank}`);
check('top RB and WR lead the QB1', r1.value > q1.value && w1.value > q1.value && t1.value > byVal(m, 'WR', 20).value, `RB1 ${r1.value.toFixed(0)} WR1 ${w1.value.toFixed(0)} TE1 ${t1.value.toFixed(0)} QB1 ${q1.value.toFixed(0)}`);
check('superflex lifts QB value substantially', sf.players.get(q1.key)!.value > 1.5 * q1.value, `${q1.value.toFixed(0)} -> ${sf.players.get(q1.key)!.value.toFixed(0)}`);
const wr = (r: number) => byVal(m, 'WR', r).key;
const near = evaluateTrade(m, oneFor([wr(20)], [wr(21)]), false);
check('WR20 for WR21 is Fair or Leans (not a blow-up)', near.verdict === 'Fair' || near.verdict === 'Leans', `${(near.gap * 100).toFixed(1)}%`);
const twoLess = [byVal(m, 'WR', 10), byVal(m, 'WR', 14)];
const studSide = evaluateTrade(m, oneFor([wr(1)], twoLess.map((p) => p.key)), false);
check('a stud for two lesser starters favours the stud side', studSide.winner === 1 && studSide.teams[1].receivedValue > studSide.teams[1].sentValue * 0 && studSide.teams[0].sentValue > studSide.teams[1].sentValue, `${studSide.verdict} ${(studSide.gap * 100).toFixed(0)}%`);
const bench = [...m.players.values()].filter((p) => p.pos === 'WR' && p.vor < 0 && p.g >= 8).slice(0, 3);
const w5 = evaluateTrade(m, oneFor(bench.map((p) => p.key), [wr(5)]), false);
check('three bench WRs for a WR5 favours the WR5 side heavily', bench.length === 3 && w5.winner === 0 && w5.verdict === 'Lopsided' && w5.teams[0].net > 0 && w5.teams[1].net < 0, `${(w5.gap * 100).toFixed(0)}% ${bench.map((p) => p.name).join(', ')}`);
check('the gap never uses a norm below one average starter', gapNorm(m.scale, 1, 2) === m.scale);

// 8. injuries: an IR player's ROS drops
const st = (k: string) => { const r = inj.p?.[k]; return r ? (r[0] as never) : undefined; };
const withInj = build({}, st);
const irKey = Object.keys(inj.p ?? {}).find((k) => inj.p[k][0] === 'IR' && m.players.has(k) && m.players.get(k)!.ros > 20);
if (irKey) check('an IR player\'s ROS drops', withInj.players.get(irKey)!.ros < m.players.get(irKey)!.ros, `${irKey} ${m.players.get(irKey)!.ros.toFixed(0)} -> ${withInj.players.get(irKey)!.ros.toFixed(0)}`);
else check('an IR player exists to test', false);

// 9. Allen, full-time starters, IR without double counting
const qbRos = [...m.players.values()].filter((p) => p.pos === 'QB').sort((a, b) => b.ros - a.ros).map((p) => p.key);
check('Josh Allen is a top-5 QB by ROS', qbRos.indexOf('QB:Josh Allen') >= 0 && qbRos.indexOf('QB:Josh Allen') < 5, `QB${qbRos.indexOf('QB:Josh Allen') + 1}; top 5 ${qbRos.slice(0, 5).map(keyName).join(', ')}`);
const full = [...m.players.values()].filter((p) => p.g >= 8 && p.role >= 1 && !p.status);
const qbFull = full.filter((p) => p.pos === 'QB' && (p.l3 ?? p.ppg) >= 0.8 * p.ppg);
const off = qbFull.map((p) => Math.abs(p.base - p.ppg) / p.ppg);
check('a full-time QB projects within 20% of his PPR a game unless his last 3 say otherwise', qbFull.length >= 6 && Math.max(...off) <= 0.2, `${qbFull.length} QBs, worst ${(Math.max(...off) * 100).toFixed(0)}%`);
const lowL3 = [...m.players.values()].filter((p) => p.pos === 'QB' && p.g >= 8 && p.role >= 1 && (p.l3 ?? p.ppg) < 0.8 * p.ppg);
check('a QB with a weak last 3 stays within 25% of his season rate', lowL3.every((p) => p.base >= 0.75 * p.ppg), lowL3.map((p) => `${p.name} ${(p.base / p.ppg * 100).toFixed(0)}%`).join(', '));
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const valued = full.filter((p) => p.value > 0);
check('full-time starters with value: median deviation from season PPR a game under 12%', med(valued.map((p) => Math.abs(p.base - p.ppg) / p.ppg)) < 0.12, `${valued.length} players, median ${(med(valued.map((p) => Math.abs(p.base - p.ppg) / p.ppg)) * 100).toFixed(1)}%`);
const irs = Object.keys(inj.p ?? {}).filter((k) => inj.p[k][0] === 'IR' && m.players.has(k) && m.players.get(k)!.g >= 4);
check('IR: role comes from the healthy weeks (never below the no-status role)', irs.length > 0 && irs.every((k) => withInj.players.get(k)!.role >= m.players.get(k)!.role - 1e-9), `${irs.length} IR players`);
const hurts = withInj.players.get('QB:Jalen Hurts'), hurtsNo = m.players.get('QB:Jalen Hurts');
check('IR starter: role is full from his healthy weeks and only the missed games cut ROS', !!hurts && hurts.role >= 0.99 && hurts.weeks.filter((w) => w.opp && w.avail === 0).length <= 4 && Math.abs(hurts.base / hurts.ppg - 1) < 0.25, `role ${hurts?.role.toFixed(2)} (no status ${hurtsNo?.role.toFixed(2)}), rate ${hurts?.base.toFixed(1)} vs ${hurts?.ppg.toFixed(1)} a game`);

// 10. weekly finishes follow the chosen scoring
const all = [...m.players.values()];
const mism = all.filter((p) => p.sw !== p.rec.sw || p.bm !== p.rec.bm || p.bu !== p.rec.bu);
check('PPR rates reproduce fantasy.json\'s weekly-finish counts', mism.length <= all.length * 0.03, `${mism.length} of ${all.length} differ`);
const catcher = all.filter((p) => (p.pos === 'RB' || p.pos === 'WR') && p.g >= 8 && p.rec.wr).sort((a, b) => b.rec.wr!.reduce((x, y) => x + y, 0) - a.rec.wr!.reduce((x, y) => x + y, 0))[0];
const sc = std.players.get(catcher.key)!;
check('standard scoring changes a high-catch player\'s start / boom / bust rates', sc.startRate !== catcher.startRate || sc.boomRate !== catcher.boomRate || sc.bustRate !== catcher.bustRate,
  `${catcher.key}: start ${(catcher.startRate * 100).toFixed(0)}% -> ${(sc.startRate * 100).toFixed(0)}%, boom ${(catcher.boomRate * 100).toFixed(0)}% -> ${(sc.boomRate * 100).toFixed(0)}%, bust ${(catcher.bustRate * 100).toFixed(0)}% -> ${(sc.bustRate * 100).toFixed(0)}%`);
const shifted = all.filter((p) => p.g >= 8 && (p.pos === 'RB' || p.pos === 'WR') && std.players.get(p.key)!.sw !== p.sw).length;
check('standard scoring re-ranks many weekly finishes', shifted >= 10, `${shifted} RB/WR change start-worthy weeks`);
process.exit(bad ? 1 : 0);
