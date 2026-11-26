import type { KPlayer } from '@/types/player';
import PlayerStatTable, { type StatColumn } from './PlayerStatTable';

interface KickerTableProps {
  players: KPlayer[];
  searchQuery?: string;
}

// a blank source cell is a stat the data lacks (NaN): the percentage skips it, never a zero
const pct = (m: number, a: number) => (a > 0 ? (100 * m) / a : Number.NaN);

const COLUMNS: StatColumn<KPlayer>[] = [
  { key: 'games', label: 'GP', tip: 'Games played', get: (p) => p.games },
  { key: 'fgMade', label: 'FGM', tip: 'Field goals made', get: (p) => p.fgMade },
  { key: 'fgAtt', label: 'FGA', tip: 'Field goals attempted', get: (p) => p.fgAtt, leader: false },
  { key: 'fgPct', label: 'FG%', tip: 'Field goals made per attempt', get: (p) => pct(p.fgMade, p.fgAtt), decimals: 1 },
  { key: 'fg40', label: '40+%', tip: 'Field goal percentage from 40 yards and out', get: (p) => pct(p.fgMade49 + p.fgMade50, p.fgAtt49 + p.fgAtt50), decimals: 1 },
  { key: 'fg50', label: '50+%', tip: 'Field goal percentage from 50 yards and out', get: (p) => pct(p.fgMade50, p.fgAtt50), decimals: 1 },
  { key: 'longest', label: 'Long', tip: 'Longest field goal', get: (p) => p.longest },
  { key: 'xpMade', label: 'XPM', tip: 'Extra points made', get: (p) => p.xpMade },
  { key: 'xpPct', label: 'XP%', tip: 'Extra points made per attempt', get: (p) => pct(p.xpMade, p.xpAtt), decimals: 1 },
];

const KickerTable = ({ players, searchQuery = '' }: KickerTableProps) => (
  <PlayerStatTable title="Kickers" position="K" players={players} columns={COLUMNS} searchQuery={searchQuery} />
);

export default KickerTable;
