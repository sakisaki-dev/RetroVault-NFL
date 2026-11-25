/**
 * Opens the Season page at a year's standings (the Teams club wall's chip). The hash router keeps only its own params, so the
 * year and the scroll target ride in a module variable that SeasonTab reads on mount and clears.
 */
let jump: { year: string; at: 'standings' } | null = null;

export const openSeasonStandings = (year: string | number) => {
  jump = { year: String(year), at: 'standings' };
  if (window.location.hash !== '#season') window.location.hash = '#season';
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
};
export const peekSeasonJump = () => jump;
export const clearSeasonJump = () => {
  jump = null;
};

/** Fired with a division ("NFC North"), a conference ("AFC") or "" when the standings board's filter changes from outside */
export const SEASON_DIV_EVENT = 'rv:season-div';
/** Reads the standings filter from the hash (#season?div=NFC%20North) */
export const hashDivision = (): string => {
  const h = window.location.hash;
  if (!/^#\/?season\b/i.test(h)) return '';
  return new URLSearchParams(h.split('?')[1] ?? '').get('div') ?? '';
};
/**
 * Opens the Season page's standings filtered to one division or conference (an ESPN story's "NFC North" link): the
 * hash carries it (#season?div=NFC%20North, linkable) and an event reaches a board that is already showing.
 */
export const openSeasonDivision = (div: string) => {
  const year = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('y');
  const hash = `#season?${year && /^#\/?season/i.test(window.location.hash) ? `y=${year}&` : ''}div=${encodeURIComponent(div)}`;
  if (window.location.hash !== hash) window.location.hash = hash;
  window.dispatchEvent(new CustomEvent(SEASON_DIV_EVENT, { detail: div }));
};
