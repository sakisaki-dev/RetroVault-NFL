// Run: npm run test:trade (self-test for the fantasy trade simulator engine, src/utils/tradeSim.ts, on public/data/nfl/fantasy.json)
import { readFileSync } from 'node:fs';
import type { FanRaw } from '../src/utils/fantasy';
import { buildTradeModel, DEFAULT_SETTINGS, evaluateTrade, suggestPartner, type TradeModel, type TradeSettings, type TradeTeam } from '../src/utils/tradeSim';

const raw = JSON.parse(readFileSync('public/data/nfl/fantasy.json', 'utf8')) as FanRaw;
const build = (s: Partial<TradeSettings> = {}): TradeModel => buildTradeModel(raw, { ...DEFAULT_SETTINGS, ...s }, () => undefined);
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
process.exit(bad ? 1 : 0);
