import type { TableRow } from '@/utils/schedule';
import type { RosterEntry } from './ClubSeasonParts';

const nf = (n: number) => n.toLocaleString('en-US');
export const ordinal = (n: number) => {
  const v = n % 100;
  return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`;
};
export const surname = (name: string) => {
  const w = name.replace(/\s+(Jr\.|Sr\.|II|III|IV|V)$/, '').split(' ');
  const i = w.findIndex((x, j) => j > 0 && /^(Van|Von|De|Del|Da|St\.)$/.test(x));
  return (i > 0 ? w.slice(i) : w.slice(-1)).join(' ');
};

/** The face of the season: the best SZN off the line (OL has no rating), then awards, the skill positions, games */
export const coverStar = (rows: RosterEntry[]): RosterEntry | null =>
  [...rows]
    .filter((r) => r.szn != null && r.pos !== 'OL' && r.g > 0)
    .sort(
      (a, b) =>
        (b.szn ?? 0) - (a.szn ?? 0) ||
        (b.aw?.length ?? 0) - (a.aw?.length ?? 0) ||
        Number(['QB', 'RB', 'WR', 'TE'].includes(b.pos)) - Number(['QB', 'RB', 'WR', 'TE'].includes(a.pos)) ||
        b.g - a.g ||
        a.k.localeCompare(b.k),
    )[0] ?? null;

interface Line {
  big: string;
  text: string;
}
/** Up to three coverlines, every figure from the season's lines and table row */
export const coverLines = (rows: RosterEntry[], cell: TableRow | null): Line[] => {
  const out: Line[] = [];
  const qb = rows.filter((r) => r.pos === 'QB' && (r.pyds ?? 0) > 0).sort((a, b) => (b.att ?? 0) - (a.att ?? 0))[0];
  if (qb?.pyds) out.push({ big: nf(qb.pyds), text: `${surname(qb.name)}'s passing yards` });
  const skill = rows
    .filter((r) => r.pos !== 'QB')
    .flatMap((r) => [
      { r, v: r.ryds ?? 0, what: 'rushing yards' },
      { r, v: r.recyds ?? 0, what: 'receiving yards' },
    ])
    .sort((a, b) => b.v - a.v)[0];
  if (skill && skill.v > 0) out.push({ big: nf(skill.v), text: `${surname(skill.r.name)}'s ${skill.what}` });
  if (out.length < 2) {
    const tk = [...rows].sort((a, b) => (b.tkl ?? 0) - (a.tkl ?? 0))[0];
    if (tk?.tkl) out.push({ big: nf(tk.tkl), text: `${surname(tk.name)}'s tackles` });
  }
  if (cell) {
    const d = cell.diff;
    out.push({ big: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}`, text: `point differential${cell.oneScore ? `, ${cell.oneScore} in one-score games` : ''}` });
  }
  return out.slice(0, 3);
};
