import { advanceFixture, liveFixtureScene, loadFixture, type LiveDetail, type LiveGame, type LiveTeam } from '@/utils/liveGames';

/**
 * Dev fixture for ?saverScene=gameday|redzone (no live game to look at). Shapes ESPN's scoreboard gives, with invented
 * in-progress states; gameday shows one game and, 6 s in, the home club scores a touchdown (through the same score
 * detection a poll uses). &saverCelebrate=0 skips the score.
 */
const T = (abbr: string, name: string, score: number, ls: number[], rec: string, timeouts: number): LiveTeam => ({ abbr, id: abbr, name, score, ls, rec, timeouts });
const base = (id: string, away: LiveTeam, home: LiveTeam, period: number, clock: string, venue: string, sit: LiveGame['sit'], extra: Partial<LiveGame> = {}): LiveGame => ({
  id, state: 'in', kick: Date.now() - 90 * 60_000, period, clock, desc: '', away, home, venue, indoor: false, weather: '', sit, leaders: {}, headline: '', ...extra,
});

export const installFixture = () => {
  const scene = liveFixtureScene();
  if (!scene) return;
  const main = base('fx1', T('KC', 'Chiefs', 24, [7, 10, 0, 7], '9-1', 3), T('BUF', 'Bills', 27, [3, 14, 7, 3], '8-2', 2), 4, '4:12', 'Highmark Stadium',
    { down: 2, dist: 6, dd: '2nd & 6', poss: 'KC', spot: { side: 'BUF', yd: 14 }, redZone: true, last: 'P. Mahomes pass short left to T. Kelce to BUF 14 for 9 yds (T. Edmunds)' }, { weather: 'Snow · 29°F' });
  const more: LiveGame[] = scene === 'redzone' ? [
    base('fx2', T('GB', 'Packers', 17, [7, 10, 0, 0], '6-4', 2), T('DET', 'Lions', 21, [7, 7, 7, 0], '8-2', 3), 3, '2:10', 'Ford Field', { down: 3, dist: 8, dd: '3rd & 8', poss: 'DET', spot: { side: 'GB', yd: 41 }, redZone: false, last: 'J. Goff pass incomplete deep right to A. St. Brown' }, { indoor: true }),
    base('fx3', T('DAL', 'Cowboys', 13, [3, 10, 0, 0], '5-5', 3), T('PHI', 'Eagles', 14, [0, 7, 7, 0], '8-2', 3), 3, '9:30', 'Lincoln Financial Field', { down: 1, dist: 10, dd: '1st & 10', poss: 'PHI', spot: { side: 'PHI', yd: 33 }, redZone: false, last: 'S. Barkley rush up the middle for 4 yds' }),
    base('fx4', T('SF', '49ers', 0, [0, 0, 0, 0], '6-4', 3), T('SEA', 'Seahawks', 3, [3, 0, 0, 0], '6-4', 3), 1, '8:02', 'Lumen Field', { down: 1, dist: 10, dd: '1st & 10', poss: 'SF', spot: { side: 'SF', yd: 25 }, redZone: false, last: 'Kickoff returned to SF 25' }),
    base('fx5', T('NYG', 'Giants', 20, [7, 3, 7, 3], '3-7', 0), T('WAS', 'Commanders', 23, [3, 10, 3, 7], '7-4', 1), 4, '1:12', 'Northwest Stadium', { down: 4, dist: 2, dd: '4th & 2', poss: 'NYG', spot: { side: 'WAS', yd: 38 }, redZone: false, last: 'T. DeVito scramble for 6 yds to WAS 38' }),
    base('fx6', T('LV', 'Raiders', 10, [3, 7, 0, 0], '2-8', 3), T('DEN', 'Broncos', 16, [10, 6, 0, 0], '6-4', 3), 2, '0:00', 'Empower Field', null, { desc: 'Halftime' }),
  ] : [];
  const detail: Record<string, LiveDetail> = {
    fx1: {
      winHome: 0.58,
      drive: '6 plays, 42 yards, 2:51',
      scoring: [{ text: 'Isaiah Likely 6 Yd pass from Josh Allen (Tyler Bass Kick)', abbr: 'BUF' }],
      leaders: {
        KC: [
          { cat: 'passing', name: 'Patrick Mahomes', pos: 'QB', line: '24/35, 281 YDS, 2 TD, 1 INT' },
          { cat: 'rushing', name: 'Isiah Pacheco', pos: 'RB', line: '14 CAR, 62 YDS, 1 TD' },
          { cat: 'receiving', name: 'Travis Kelce', pos: 'TE', line: '8 REC, 97 YDS, 1 TD' },
        ],
        BUF: [
          { cat: 'passing', name: 'Josh Allen', pos: 'QB', line: '21/29, 243 YDS, 3 TD' },
          { cat: 'rushing', name: 'James Cook', pos: 'RB', line: '18 CAR, 104 YDS' },
          { cat: 'receiving', name: 'Khalil Shakir', pos: 'WR', line: '7 REC, 88 YDS, 1 TD' },
        ],
      },
      last: main.sit?.last ?? '',
    },
  };
  loadFixture([main, ...more], detail);
  const celebrate = new URLSearchParams(window.location.search).get('saverCelebrate') !== '0';
  if (celebrate) {
    window.setTimeout(() => {
      advanceFixture((gs) => gs.map((g) => (g.id === 'fx1' ? { ...g, home: { ...g.home, score: g.home.score + 7 }, clock: '3:58', sit: { ...g.sit!, poss: 'KC', redZone: false, spot: { side: 'KC', yd: 25 }, dd: '1st & 10', last: 'Kickoff returned to KC 25' } } : g)), {
        fx1: { ...detail.fx1, scoring: [...detail.fx1.scoring, { text: 'Dalton Kincaid 12 Yd pass from Josh Allen (Tyler Bass Kick)', abbr: 'BUF' }] },
      });
    }, 6000);
  }
};
