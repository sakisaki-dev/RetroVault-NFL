/**
 * Type-to-select for dropdowns (owner: "the bar can stay as a dropdown, but if I type in viking it should automatically
 * select that option"). Shared by PixelSelect and the Radix Select wrapper (components/ui/select.tsx).
 * A query matches a label by, best first: the label starting with it; every typed word starting some word of the label
 * ("viking" matches "Minnesota Vikings"); the query appearing anywhere. Case and accents don't matter.
 */
export const foldText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** 0 = no match, 3 best (starts the label), 2 = a word starts with it, 1 = it appears inside */
export const matchTier = (label: string, query: string): number => {
  const q = foldText(query).trim();
  if (!q) return 3;
  const l = foldText(label);
  if (l.startsWith(q)) return 3;
  const words = l.split(/[\s.\-_/()]+/).filter(Boolean);
  if (q.split(/\s+/).every((w) => words.some((x) => x.startsWith(w)))) return 2;
  return l.includes(q) ? 1 : 0;
};

/** Index of the best label for the query (earliest among equals), or -1 */
export const bestMatch = (labels: string[], query: string): number => {
  let best = -1;
  let tier = 0;
  labels.forEach((l, i) => {
    const t = matchTier(l, query);
    if (t > tier) (tier = t, (best = i));
  });
  return best;
};

/** The text of a label that may be a React node: strings and numbers only, else '' (give the option a `text`) */
export const plainText = (n: unknown): string => {
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(plainText).join('');
  if (n && typeof n === 'object' && 'props' in n) return plainText((n as { props?: { children?: unknown } }).props?.children);
  return '';
};

/** Keystrokes build one query; a pause of `gap` ms starts a new one */
export const typeBuffer = (gap = 900) => {
  const b = { s: '', t: 0 };
  return {
    push(ch: string) {
      const now = Date.now();
      b.s = now - b.t > gap ? ch : b.s + ch;
      b.t = now;
      return b.s;
    },
    /** True while a query is being typed (so a space belongs to it) */
    active() {
      return b.s !== '' && Date.now() - b.t <= gap;
    },
    reset() {
      b.s = '';
    },
  };
};

/** A printable key that should feed the buffer (no Ctrl / Meta / Alt) */
export const isTypeKey = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

/** Dropdowns with at least this many options get the search field in the open menu */
export const SEARCH_MIN = 8;
