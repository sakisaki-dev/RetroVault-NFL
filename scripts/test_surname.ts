// Run: npm run test:surname (self-test for surnameOf / firstAndLast in src/utils/displayName.ts)
import { firstAndLast, surnameOf } from '../src/utils/displayName';

const cases: [string, string, string][] = [
  ["Ja'Marr Chase", "Ja'Marr", 'Chase'],
  ['Amon-Ra St. Brown', 'Amon-Ra', 'St. Brown'],
  ['Marvin Harrison Jr.', 'Marvin', 'Harrison Jr.'],
  ['Kenneth Walker III', 'Kenneth', 'Walker III'],
  ['James Cook III', 'James', 'Cook III'],
  ['Deebo Samuel Sr.', 'Deebo', 'Samuel Sr.'],
  ['Brian Robinson Jr.', 'Brian', 'Robinson Jr.'],
  ['Michael Pittman Jr.', 'Michael', 'Pittman Jr.'],
  ['Odell Beckham Jr.', 'Odell', 'Beckham Jr.'],
  ['Ted Ginn Jr.', 'Ted', 'Ginn Jr.'],
  ['Calvin Ridley', 'Calvin', 'Ridley'],
  ['Jon Van der Berg', 'Jon', 'Van der Berg'],
  ['Alex De La Cruz Jr.', 'Alex', 'De La Cruz Jr.'],
  ['Jr. Smith', 'Jr.', 'Smith'],
  ['Mike Williams (WR, Jets)', 'Mike', 'Williams'],
  ['Cher', '', 'Cher'],
];
let bad = 0;
for (const [name, first, last] of cases) {
  const r = firstAndLast(name);
  if (r.first !== first || r.last !== last || surnameOf(name) !== last) {
    bad++;
    console.error(`FAIL ${name}: got ${JSON.stringify(r)}, want ${JSON.stringify({ first, last })}`);
  }
}
if (bad) process.exit(1);
console.log(`surname: ${cases.length} cases ok`);
