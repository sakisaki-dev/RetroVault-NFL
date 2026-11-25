import type { Player } from '@/types/player';
import { IS_NFL } from '@/config/edition';
import { useThisSeason, type SeasonData } from '@/utils/thisSeason';
import { bannerStats } from '@/components/hof/hofUtils';
import { rate, type StatItem } from './statLines';

const keyOf = (p: Pick<Player, 'position' | 'name'>) => `${p.position}:${p.name}`;

/**
 * Active players show THIS season's numbers on the card's "at a glance" tiles and the banners; retired players (and an
 * active one with no game yet this season) keep career. NFL edition only (thisseason.json).
 */
export const useSeasonView = (player: Player | null | undefined): SeasonData | null =>
  useThisSeason(IS_NFL && player && player.status === 'Active' && !player.isRealLegend ? keyOf(player) : null);

const ord = (n: number) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** "Season at a glance": the first four season stats (his rank at the position in the title), QB's third swapped for TD:INT. */
export const seasonHeadline = (player: Player, d: SeasonData): StatItem[] => {
  const by = (l: string) => d.line.stats.find((x) => x.label === l);
  const items: StatItem[] = d.line.stats.slice(0, 4).map((x) => ({
    key: x.label,
    label: x.label === 'Cmp %' ? 'Comp %' : x.label,
    title: `${d.season} ${x.label}${x.rank ? `, ${ord(x.rank)} of ${x.of} ${player.position}s` : ''}`,
    value: x.value,
    decimals: Number.isInteger(x.value) ? 0 : 1,
  }));
  // owner: "for QBs, WRs, TEs ... cmp%, yds, tds, ints, sacks, rush yds, rush tds, and WRs similar statistics for their
  // position rather than rates (or rates if it's important)": eight counting tiles, the key rate kept
  const want: Record<string, string[]> = {
    QB: ['Pass yds', 'Pass TD', 'INT', 'Cmp %', 'Rush yds', 'Rush TD', 'Sacked'],
    WR: ['Rec yds', 'Rec TD', 'Rec', 'Targets', 'Yds / catch', 'Catch %', '1st downs'],
    TE: ['Rec yds', 'Rec TD', 'Rec', 'Targets', 'Yds / catch', 'Catch %', '1st downs'],
    RB: ['Rush yds', 'Rush TD', 'Rec yds', 'Rec TD', 'Carries', 'Yds / carry', 'Rec'],
    DL: ['Tackles', 'Sacks', 'TFL', 'QB hits', 'FF', 'Pass def', 'INT'],
    LB: ['Tackles', 'Sacks', 'TFL', 'INT', 'Pass def', 'QB hits', 'FF'],
    DB: ['Tackles', 'INT', 'Pass def', 'TFL', 'Sacks', 'FF', 'Def TD'],
  };
  const list = want[player.position];
  if (list) {
    const got = list.map(by).filter((x): x is NonNullable<typeof x> => !!x);
    if (got.length >= 4)
      return [
        ...got.map((x) => ({
          key: x.label,
          label: x.label,
          title: `${d.season} ${x.label === 'Sacked' ? 'times sacked' : x.label}${x.rank ? `, ${ord(x.rank)} of ${x.of} ${player.position}s` : ''}`,
          value: x.value,
          decimals: Number.isInteger(x.value) ? 0 : 1,
        })),
        { key: 'games', label: 'Games', title: `${d.season} games played`, value: d.line.games, decimals: 0 },
      ];
  }
  return items;
};

/**
 * The banner's three numbers and their kicker. Season view: his position's headline season stats (QB pass yds, pass TD,
 * INT; WR/TE rec yds, rec TD, catches; RB rush yds, rush TD, rec yds; defenders their first three). Rings are career by
 * nature, so a season stack drops them instead of mixing the two.
 */
export const bannerFor = (player: Player, d: SeasonData | null): { stats: { label: string; value: number | string }[]; kicker: string } => {
  if (!d) return { stats: bannerStats(player), kicker: 'Career' };
  const by = (l: string) => d.line.stats.find((x) => x.label === l);
  const order: Record<string, string[]> = {
    QB: ['Pass yds', 'Pass TD', 'INT'],
    RB: ['Rush yds', 'Rush TD', 'Rec yds'],
    WR: ['Rec yds', 'Rec TD', 'Rec'],
    TE: ['Rec yds', 'Rec TD', 'Rec'],
  };
  const want = order[player.position] ?? d.line.stats.slice(0, 3).map((x) => x.label);
  const stats = want.map(by).filter((x): x is NonNullable<typeof x> => !!x).map((x) => ({ label: x.label, value: x.value }));
  return stats.length ? { stats, kicker: `${d.season} season` } : { stats: bannerStats(player), kicker: 'Career' };
};
