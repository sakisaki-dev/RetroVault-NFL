// Run: npm run test:clubpair (self-test for the two-club parser behind the Games group)
import { clubPairOf } from '../src/utils/gameFinder';

const cases: [string, [string, string] | 'none'][] = [
  ['cin was', ['CIN', 'WAS']],
  ['bengals commanders', ['CIN', 'WAS']],
  ['cincinnati washington', ['CIN', 'WAS']],
  ['bengals at commanders', ['CIN', 'WAS']],
  ['bengals @ commanders', ['CIN', 'WAS']],
  ['bengals@commanders', ['CIN', 'WAS']],
  ['bengals vs commanders', ['CIN', 'WAS']],
  ['bengals v commanders', ['CIN', 'WAS']],
  ['bengals - commanders', ['CIN', 'WAS']],
  ['bengals/commanders', ['CIN', 'WAS']],
  ['bengals com', ['CIN', 'WAS']],
  ['chiefs eagles', ['KC', 'PHI']],
  ['kc phi', ['KC', 'PHI']],
  ['49ers vikings', ['SF', 'MIN']],
  ['bengals', 'none'],
  ['mahomes', 'none'],
  ['bengals bengals', 'none'],
];
let bad = 0;
for (const [q, want] of cases) {
  const got = clubPairOf(q);
  const ok = want === 'none' ? got === null : !!got && got[0] === want[0] && got[1] === want[1];
  if (!ok) bad++;
  console.log(ok ? 'ok  ' : 'FAIL', JSON.stringify(q), '->', JSON.stringify(got));
}
process.exit(bad ? 1 : 0);
