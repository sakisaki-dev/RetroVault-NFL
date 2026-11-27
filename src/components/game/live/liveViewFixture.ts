import { advanceFixture, loadFixture, type FieldSpot, type LiveDetail, type LiveDrive, type LiveGame, type LiveLeader, type LiveScore } from '@/utils/liveGames';
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
  const drv = (abbr: string, plays: number, yards: number, result: string, score: boolean, from: number, to: number | null, live = false): LiveDrive => ({
    abbr, plays, yards, result, score, from: spot(away, home, from), to: to == null ? null : spot(away, home, to), live,
  });
  const log = (abbr: string, period: number, clock: string, a: number, h: number, kind: string, text: string): LiveScore => ({ abbr, period, clock, away: a, home: h, kind, text });
  const detail: LiveDetail = {
    winHome: 0.54,
    drive: '9 plays, 47 yards, 3:41',
    scoring: [],
    leaders,
    last: lastText,
    lastPlay: { id: 'fx-1', text: lastText, type: 'Pass Reception', yds: 11, from: 71, to: 82, off: away },
    drives: [
      drv(home, 8, 75, 'Touchdown', true, 75, 0),
      drv(away, 5, 23, 'Punt', false, 20, 43),
      drv(home, 4, 15, 'Punt', false, 55, 40),
      drv(away, 11, 75, 'Touchdown', true, 25, 100),
      drv(home, 7, 42, 'Field Goal', true, 70, 28),
      drv(away, 9, 47, '', false, 35, null, true),
    ],
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
  loadFixture([game], { 'fx-live': detail });
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
          'fx-live': {
            ...detail,
            winHome: 0.31,
            last: text,
            lastPlay: { id: 'fx-2', text, type: 'Passing Touchdown', yds: 18, from: 82, to: 100, off: away },
            drive: '10 plays, 65 yards, 3:53',
            drives: [...detail.drives.slice(0, -1), drv(away, 10, 65, 'Touchdown', true, 35, 100), drv(home, 0, 0, '', false, 75, null, true)],
            scoreLog: [...detail.scoreLog, log(away, 4, '1:58', 31, 27, 'TD', `${aWr ?? 'Receiver'} 18-yard pass from ${aQb ?? 'the QB'}`)],
            cur: { plays: 0, yards: 0, time: '0:00', from: spot(away, home, 75) },
          },
        },
      );
    }, 8000);
  }
};
