import { advanceFixture, loadFixture, type FieldSpot, type LiveDetail, type LiveDrive, type LiveGame, type LiveLeader, type LivePlayRow, type LiveScore } from '@/utils/liveGames';
import { findNFLTeam } from '@/utils/nflTeams';

/**
 * Dev fixture for the live game view (`?liveFixture=1` on the game page or the Season page's Next up, honoured only in
 * `import.meta.env.DEV`, see useLiveForGame.ts). It stands a recorded fourth-quarter state in for ESPN's feed for the two
 * clubs given, in the shapes ESPN's scoreboard and summary give (liveGames.ts normGame / normDetail): the away club has the
 * ball on the home club's 18, third and four, trailing 27-24. Players are the clubs' own best from the site's league data
 * (`who`), so the spotlight and the leaders open real player cards. `&liveAdvance=1` moves it on after 8 s (an away
 * touchdown), through the same detection a poll uses, to watch the in-place update.
 */
export type Who = (abbr: string, pos: 'QB' | 'RB' | 'WR' | 'TE') => string | undefined;

const spot = (away: string, home: string, abs: number): FieldSpot => (abs === 50 ? { side: '', yd: 50 } : abs < 50 ? { side: away, yd: abs } : { side: home, yd: 100 - abs });
let advanced = false;

export const installLiveViewFixture = (awayIn: string, homeIn: string, kick: number, who: Who = () => undefined) => {
  const A = findNFLTeam(awayIn);
  const H = findNFLTeam(homeIn);
  if (!A || !H) return;
  const away = A.abbreviation;
  const home = H.abbreviation;
  const aQb = who(away, 'QB');
  const aWr = who(away, 'WR');
  const aRb = who(away, 'RB');
  const hQb = who(home, 'QB');
  const hRb = who(home, 'RB');
  const hWr = who(home, 'WR');
  const last = (n?: string) => (n ? n.split(' ').slice(-1)[0] : 'the receiver');
  const lastText = `${aQb ?? 'The QB'} pass short right to ${aWr ?? 'the receiver'} to ${home} 18 for 11 yards (${last(hRb)}).`;
  const game: LiveGame = {
    id: 'fx-live',
    state: 'in',
    kick,
    period: 4,
    clock: '2:14',
    desc: '2:14 - 4th Quarter',
    away: { abbr: away, id: away, name: A.name, score: 24, ls: [7, 3, 7, 7], rec: '', timeouts: 2 },
    home: { abbr: home, id: home, name: H.name, score: 27, ls: [3, 14, 7, 3], rec: '', timeouts: 1 },
    venue: '',
    indoor: false,
    weather: '',
    sit: {
      down: 3, dist: 4, dd: '3rd & 4', poss: away, spot: { side: home, yd: 18 }, redZone: true, last: lastText, toGoal: 18,
      lastAth: aWr ? { name: aWr, pos: 'WR', abbr: away } : null, lastYds: 11, lastType: 'Pass Reception',
    },
    leaders: {},
    headline: '',
  };
  const lead = (cat: LiveLeader['cat'], name: string | undefined, pos: string, line: string): LiveLeader[] => (name ? [{ cat, name, pos, line }] : []);
  const leaders: Record<string, LiveLeader[]> = {
    [away]: [...lead('passing', aQb, 'QB', '24/33, 286 YDS, 2 TD'), ...lead('rushing', aRb, 'RB', '14 CAR, 61 YDS, 1 TD'), ...lead('receiving', aWr, 'WR', '9 REC, 131 YDS, 1 TD')],
    [home]: [...lead('passing', hQb, 'QB', '21/29, 243 YDS, 3 TD'), ...lead('rushing', hRb, 'RB', '17 CAR, 88 YDS, 1 TD'), ...lead('receiving', hWr, 'WR', '7 REC, 88 YDS, 1 TD')],
  };
  game.leaders = leaders;
  const log = (abbr: string, period: number, clock: string, a: number, h: number, kind: string, text: string): LiveScore => ({ abbr, period, clock, away: a, home: h, kind, text });
  const names = { aQb, aWr, aRb, hQb, hRb, hWr };
  const built = buildPlays(away, home, names, false);
  const detail: LiveDetail = {
    winHome: built.wp[built.wp.length - 1].h,
    drive: '9 plays, 47 yards, 3:41',
    scoring: [],
    leaders,
    last: lastText,
    lastPlay: { id: 'fx-1', text: lastText, type: 'Pass Reception', yds: 11, from: 71, to: 82, off: away },
    drives: built.drives,
    plays: built.plays,
    wp: built.wp,
    stats: statsFor(away, home),
    scoreLog: [
      log(home, 1, '10:02', 0, 3, 'FG', `${home} 41-yard field goal`),
      log(away, 1, '2:20', 7, 3, 'TD', `${aWr ?? 'Receiver'} 23-yard pass from ${aQb ?? 'the QB'}`),
      log(home, 2, '12:00', 7, 10, 'TD', `${hRb ?? 'Back'} 4-yard run`),
      log(home, 2, '5:44', 7, 17, 'TD', `${hWr ?? 'Receiver'} 31-yard pass from ${hQb ?? 'the QB'}`),
      log(away, 2, '0:41', 10, 17, 'FG', `${away} 48-yard field goal`),
      log(away, 3, '7:55', 17, 17, 'TD', `${aRb ?? 'Back'} 1-yard run`),
      log(home, 3, '1:12', 17, 24, 'TD', `${hRb ?? 'Back'} 6-yard run`),
      log(away, 4, '11:40', 24, 24, 'TD', `${aWr ?? 'Receiver'} 23-yard pass from ${aQb ?? 'the QB'}`),
      log(home, 4, '6:02', 24, 27, 'FG', `${home} 44-yard field goal`),
    ],
    cur: { plays: 9, yards: 47, time: '3:41', from: spot(away, home, 35) },
  };
  // `&liveBare=1`: what ESPN gives before the summary fills in (no plays, drives, stats or win chance), to check the calm fallback
  const bare = new URLSearchParams(window.location.search).has('liveBare');
  if (bare) game.leaders = {};
  loadFixture([game], { 'fx-live': bare ? { winHome: null, drive: '', scoring: [], leaders: {}, last: '' } : detail });
  if (!advanced && new URLSearchParams(window.location.search).has('liveAdvance')) {
    advanced = true;
    window.setTimeout(() => {
      const text = `${aQb ?? 'The QB'} pass deep left to ${aWr ?? 'the receiver'} for 18 yards, TOUCHDOWN.`;
      advanceFixture(
        (gs) =>
          gs.map((x) => ({
            ...x,
            clock: '1:58',
            away: { ...x.away, score: 31, ls: [7, 3, 7, 14] },
            sit: { ...x.sit!, poss: home, down: 1, dist: 10, dd: '1st & 10', spot: { side: home, yd: 25 }, toGoal: 75, redZone: false, last: text, lastYds: 18, lastType: 'Passing Touchdown' },
          })),
        {
          'fx-live': (() => {
            const b2 = buildPlays(away, home, names, true);
            return {
              ...detail,
              winHome: b2.wp[b2.wp.length - 1].h,
              last: text,
              lastPlay: { id: 'fx-2', text, type: 'Passing Touchdown', yds: 18, from: 82, to: 100, off: away },
              drive: '10 plays, 65 yards, 3:53',
              drives: b2.drives,
              plays: b2.plays,
              wp: b2.wp,
              scoreLog: [...detail.scoreLog!, log(away, 4, '1:58', 31, 27, 'TD', `${aWr ?? 'Receiver'} 18-yard pass from ${aQb ?? 'the QB'}`)],
              cur: { plays: 0, yards: 0, time: '0:00', from: spot(away, home, 75) },
            };
          })(),
        },
      );
    }, 8000);
  }
};

/* ---------------- the recorded game's play-by-play, generated ---------------- */

type Names = { aQb?: string; aWr?: string; aRb?: string; hQb?: string; hRb?: string; hWr?: string };
/** [offence, period, clock at the start, clock at the end, plays, from (absolute yard), to, result, scoring points] */
type Row = ['A' | 'H', number, string, string, number, number, number, string, number];
const DRIVES: Row[] = [
  ['H', 1, '15:00', '10:02', 9, 75, 24, 'Field Goal', 3],
  ['A', 1, '10:02', '7:41', 5, 25, 44, 'Punt', 0],
  ['H', 1, '7:41', '5:55', 4, 82, 68, 'Punt', 0],
  ['A', 1, '5:55', '2:20', 9, 33, 100, 'Touchdown', 7],
  ['H', 1, '2:20', '12:00', 12, 75, 0, 'Touchdown', 7],
  ['A', 2, '12:00', '9:20', 6, 25, 47, 'Punt', 0],
  ['H', 2, '9:20', '5:44', 9, 55, 0, 'Touchdown', 7],
  ['A', 2, '5:44', '0:41', 12, 25, 70, 'Field Goal', 3],
  ['H', 2, '0:41', '0:00', 3, 70, 60, 'End of Half', 0],
  ['A', 3, '15:00', '7:55', 11, 25, 100, 'Touchdown', 7],
  ['H', 3, '7:55', '1:12', 10, 70, 0, 'Touchdown', 7],
  ['A', 3, '1:12', '11:40', 11, 28, 100, 'Touchdown', 7],
  ['H', 4, '11:40', '9:30', 4, 75, 58, 'Punt', 0],
  ['A', 4, '9:30', '8:10', 3, 35, 32, 'Punt', 0],
  ['H', 4, '8:10', '6:02', 8, 61, 27, 'Field Goal', 3],
];
const secs = (c: string) => {
  const [m, s] = c.split(':').map(Number);
  return m * 60 + s;
};
/** seconds played at (period, clock) */
const elapsed = (period: number, clock: string) => (period - 1) * 900 + (900 - secs(clock));
const fmt = (e: number) => {
  const per = Math.min(4, Math.floor(e / 900) + 1);
  const left = Math.max(0, per * 900 - e);
  return { per, clock: `${Math.floor(left / 60)}:${String(Math.round(left % 60)).padStart(2, '0')}` };
};
const ord = ['', '1st', '2nd', '3rd', '4th'];
const winp = (diff: number, e: number, homeBall: boolean) => {
  const left = Math.max(1, 3600 - e);
  const z = (diff + (homeBall ? 1.2 : -1.2)) / (3 + 12 * Math.sqrt(left / 3600));
  return Math.min(0.99, Math.max(0.01, 1 / (1 + Math.exp(-1.1 * z))));
};

const buildPlays = (away: string, home: string, n: Names, adv: boolean) => {
  const last = (x?: string) => (x ? x.split(' ').slice(-1)[0] : 'the back');
  const rows: Row[] = [...DRIVES, ['A', 4, '6:02', adv ? '1:58' : '2:14', adv ? 10 : 9, 35, adv ? 100 : 82, adv ? 'Touchdown' : '', adv ? 7 : 0]];
  if (adv) rows.push(['H', 4, '1:58', '1:58', 0, 75, 75, '', 0]);
  const plays: LivePlayRow[] = [];
  const drives: LiveDrive[] = [];
  const wp: { id: string; h: number }[] = [{ id: 'k0', h: 0.5 }];
  let a = 0;
  let h = 0;
  rows.forEach((r, di) => {
    const [side, per, c0, c1, np, from, to, res, pts] = r;
    const abbr = side === 'A' ? away : home;
    const dir = side === 'A' ? 1 : -1;
    const live = di === rows.length - 1;
    const start = elapsed(per, c0);
    const e1 = elapsed(per, c1);
    const endE = e1 < start ? elapsed(per + 1, c1) : e1;
    const end = Math.max(start + np * 6, endE);
    const qb = side === 'A' ? n.aQb : n.hQb;
    const wr = side === 'A' ? n.aWr : n.hWr;
    const rb = side === 'A' ? n.aRb : n.hRb;
    let yd = from;
    let down = 1;
    let dist = 10;
    let ydsTotal = 0;
    for (let i = 0; i < np; i++) {
      const lastPlay = i === np - 1;
      const t = start + ((i + 1) / Math.max(1, np)) * (end - start);
      const { per: pp, clock } = fmt(Math.min(3600, t));
      const remain = Math.abs(to - yd);
      const seed = (di * 7 + i * 13) % 9;
      const kind = !res && lastPlay ? 'pass' : res === 'Punt' && lastPlay ? 'punt' : res === 'Field Goal' && lastPlay ? 'fg' : res === 'End of Half' && lastPlay ? 'kneel' : lastPlay && res === 'Touchdown' ? (seed % 2 ? 'tdpass' : 'tdrun') : seed % 3 === 0 ? 'run' : 'pass';
      let gain = lastPlay ? Math.round(remain) : Math.round((remain / Math.max(1, np - i)) * (0.6 + (seed % 5) * 0.2));
      if (kind === 'punt' || kind === 'fg' || kind === 'kneel') gain = 0;
      if (kind === 'pass' && seed === 4 && !lastPlay) gain = 0;
      const toYd = Math.max(0, Math.min(100, yd + dir * gain));
      const sp = (y: number) => (y === 50 ? '50' : y < 50 ? `${away} ${Math.round(y)}` : `${home} ${Math.round(100 - y)}`);
      const dd = `${ord[down]} & ${dist >= 100 - Math.abs(100 * (dir === 1 ? 1 : 0) - yd) && false ? 'Goal' : dist} at ${sp(yd)}`;
      const ls = (x?: string) => last(x);
      let text = '';
      let type = '';
      let scoring = false;
      let turnover = false;
      if (kind === 'run') { type = 'Rush'; text = `${rb ?? 'Back'} left end to ${sp(toYd)} for ${gain} yards (${ls(side === 'A' ? n.hRb : n.aRb)}).`; }
      else if (kind === 'pass') {
        if (!res && lastPlay) { type = 'Pass Reception'; text = `${qb ?? 'The QB'} pass short right to ${wr ?? 'the receiver'} to ${sp(toYd)} for ${gain} yards.`; }
        else if (gain === 0) { type = 'Pass Incompletion'; text = `${qb ?? 'The QB'} pass incomplete short left intended for ${wr ?? 'the receiver'}.`; }
        else { type = 'Pass Reception'; text = `${qb ?? 'The QB'} pass ${gain > 14 ? 'deep' : 'short'} middle to ${wr ?? 'the receiver'} to ${sp(toYd)} for ${gain} yards.`; }
      } else if (kind === 'tdpass') { type = 'Passing Touchdown'; scoring = true; text = `${qb ?? 'The QB'} pass short right to ${wr ?? 'the receiver'} for ${gain} yards, TOUCHDOWN.`; }
      else if (kind === 'tdrun') { type = 'Rushing Touchdown'; scoring = true; text = `${rb ?? 'Back'} ${gain} yard rush, TOUCHDOWN.`; }
      else if (kind === 'fg') { type = 'Field Goal Good'; scoring = true; text = `${abbr} ${Math.abs(to - (side === 'A' ? 100 : 0)) + 7}-yard field goal is GOOD.`; }
      else if (kind === 'punt') { type = 'Punt'; text = `${abbr} punts 44 yards to ${sp(to)}.`; }
      else { type = 'Kneel'; text = `${qb ?? 'The QB'} kneels at ${sp(toYd)}.`; }
      if (scoring) { if (side === 'A') a += pts; else h += pts; }
      ydsTotal += gain;
      plays.push({ id: `fx-p${di}-${i}`, driveId: `fx-d${di}`, abbr, period: pp, clock, text, type, yds: gain, scoring, turnover, dd, from: yd, to: kind === 'punt' ? to : toYd });
      wp.push({ id: `fx-p${di}-${i}`, h: winp(h - a, t, side === 'H') });
      if (gain >= dist) { down = 1; dist = 10; } else { down += 1; dist = Math.max(1, dist - gain); }
      if (down > 4) down = 4;
      yd = toYd;
    }
    drives.push({ id: `fx-d${di}`, abbr, plays: np, yards: Math.abs(to - from) > 0 && res ? Math.abs(Math.round(ydsTotal)) : ydsTotal, result: res, score: pts > 0, from: spot(away, home, from), to: res || !live ? spot(away, home, to) : null, live });
  });
  return { drives, plays, wp };
};

const statsFor = (away: string, home: string): Record<string, Record<string, string>> => ({
  [away]: { firstDowns: '21', thirdDownEff: '6-12', fourthDownEff: '1-1', totalOffensivePlays: '58', totalYards: '371', yardsPerPlay: '6.4', netPassingYards: '286', rushingYards: '85', turnovers: '1', possessionTime: '28:41', redZoneAttempts: '3-4', totalPenaltiesYards: '5-41' },
  [home]: { firstDowns: '19', thirdDownEff: '5-10', fourthDownEff: '0-1', totalOffensivePlays: '57', totalYards: '331', yardsPerPlay: '5.8', netPassingYards: '243', rushingYards: '88', turnovers: '0', possessionTime: '27:03', redZoneAttempts: '4-4', totalPenaltiesYards: '4-30' },
});
