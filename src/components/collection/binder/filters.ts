import type { Position } from '@/types/player';
import type { Finish, OwnedCard, Tier, VariantCard } from '@/utils/collection';
import type { PrizmParallel, Variant } from '@/config/cardTiers';
import { ownedKits } from '../kits';
import type { CardInfo } from '../useCardPool';
import { CAREER_LABEL } from '@/config/ovr';

/** The binder's view, search, filters and sort (Binder.tsx) */
export type BinderSort = 'set' | 'ovr' | 'tier' | 'finish' | 'recent' | 'name' | 'pos' | 'club';
export interface BinderFilterState {
  q: string;
  mine: boolean;
  tier: Tier | 'all';
  finish: Finish | 'all';
  pos: Position | 'all';
  team: string;
  sort: BinderSort;
  /** Reverse the sort's natural order */
  rev: boolean;
}
export const BINDER_DEFAULTS: BinderFilterState = { q: '', mine: true, tier: 'all', finish: 'all', pos: 'all', team: 'all', sort: 'set', rev: false };

export const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'LB', 'DB', 'DL', 'K'];
export const SORTS: { key: BinderSort; label: string }[] = [
  { key: 'set', label: 'Set #' },
  { key: 'recent', label: 'Newest' },
  { key: 'tier', label: 'Rarity' },
  { key: 'finish', label: 'Finish' },
  { key: 'ovr', label: CAREER_LABEL },
  { key: 'name', label: 'Name' },
  { key: 'pos', label: 'Position' },
  { key: 'club', label: 'Club' },
];
/** What each sort puts first, for the reverse button's label */
export const SORT_FIRST: Record<BinderSort, [string, string]> = {
  set: ['No. 1 first', 'Last number first'],
  recent: ['Newest first', 'Oldest first'],
  tier: ['Rarest first', 'Commonest first'],
  finish: ['Best finish first', 'Base first'],
  ovr: ['Highest first', 'Lowest first'],
  name: ['A to Z', 'Z to A'],
  pos: ['QB first', 'DL first'],
  club: ['A to Z', 'Z to A'],
};
const MINE_KEY = 'rv:binder:mine';

export const readMinePref = (): boolean => {
  try {
    return localStorage.getItem(MINE_KEY) !== '0';
  } catch {
    return true;
  }
};
export const writeMinePref = (mine: boolean) => {
  try {
    localStorage.setItem(MINE_KEY, mine ? '1' : '0');
  } catch {
    /* storage blocked: the choice lasts this visit */
  }
};

/** Accent- and case-blind name match for the search box */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’.]/g, '').toLowerCase();
/**
 * Card-type words the binder search understands (owner: "search for specific types of cards ie prizm black kits"):
 * tiers, finishes, art variants, Prizm parallel colours and kits. They are lifted out of the query and the rest is the
 * player's name, so "prizm black", "holo auto", "brady throwback" and "legendary kit" all work. Variant, finish, colour
 * and kit words must hold on one owned copy (a Prizm Black in Holo, not a Prizm Black and some other Holo).
 */
export interface CardQuery {
  name: string;
  tier?: Tier;
  finish?: Finish;
  variant?: Variant;
  parallel?: PrizmParallel;
  kit?: 'any' | 'alt' | 'era';
}
const WORDS: Record<string, Partial<Omit<CardQuery, 'name'>>> = {
  common: { tier: 'common' }, rare: { tier: 'rare' }, epic: { tier: 'epic' }, legendary: { tier: 'legendary' }, legend: { tier: 'legendary' }, legends: { tier: 'legendary' },
  base: { finish: 'base' }, silver: { finish: 'silver' }, holo: { finish: 'holo' }, holos: { finish: 'holo' },
  prizm: { variant: 'number' }, prizms: { variant: 'number' }, prism: { variant: 'number' }, jersey: { variant: 'jersey' }, topps: { variant: 'topps' },
  locker: { variant: 'locker' }, auto: { variant: 'auto' }, autos: { variant: 'auto' }, autograph: { variant: 'auto' }, autographs: { variant: 'auto' }, signed: { variant: 'auto' },
  red: { parallel: 'red' }, blue: { parallel: 'blue' }, green: { parallel: 'green' }, black: { parallel: 'black' },
  kit: { kit: 'any' }, kits: { kit: 'any' }, alt: { kit: 'alt' }, alts: { kit: 'alt' }, alternate: { kit: 'alt' }, throwback: { kit: 'era' }, throwbacks: { kit: 'era' }, era: { kit: 'era' },
};
let last: [string, CardQuery] = ['', { name: '' }];
export const parseCardQuery = (q: string): CardQuery => {
  if (last[0] === q) return last[1];
  const out: CardQuery = { name: '' };
  const rest: string[] = [];
  fold(q.trim()).split(/\s+/).filter(Boolean).forEach((w) => {
    // "gold" is a finish and a Prizm colour: with "prizm" in the query it is the colour
    if (w === 'gold') return void (/\bprizm|\bprism/.test(fold(q)) ? (out.parallel = 'gold') : (out.finish = 'gold'));
    const hit = WORDS[w];
    if (hit) Object.assign(out, hit);
    else rest.push(w);
  });
  // a colour alone means a Prizm parallel
  if (out.parallel && !out.variant) out.variant = 'number';
  out.name = rest.join(' ');
  last = [q, out];
  return out;
};
const typed = (k: CardQuery) => !!(k.tier || k.finish || k.variant || k.parallel || k.kit);

export const matchesQuery = (c: CardInfo, q: string, card?: OwnedCard) => {
  const k = parseCardQuery(q);
  if (k.name && !(fold(c.player.name).includes(k.name) || fold(c.player.nickname ?? '').includes(k.name))) return false;
  if (!typed(k)) return true;
  if (k.tier && c.tier !== k.tier) return false;
  if (!(k.finish || k.variant || k.parallel || k.kit)) return true;
  if (!card) return false;
  return (Object.entries(card.variants) as [Variant, VariantCard | undefined][]).some(([v, vc]) => {
    if (!vc || (k.variant && v !== k.variant)) return false;
    return (Object.keys(vc.counts) as Finish[]).some((f) => {
      if (!vc.counts[f] || (k.finish && f !== k.finish)) return false;
      if (k.parallel && !vc.prizm?.[f]?.some((x) => x.c === k.parallel)) return false;
      if (k.kit) {
        const kinds = ownedKits(card, c.player, v, f).map((x) => x.kind);
        if (k.kit === 'any' ? !kinds.some((x) => x !== 'home') : !kinds.includes(k.kit)) return false;
      }
      return true;
    });
  });
};

