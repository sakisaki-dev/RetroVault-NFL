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
