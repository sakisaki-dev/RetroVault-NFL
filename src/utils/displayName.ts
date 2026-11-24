/** A player's name as people read it. Two players with one name and position carry an internal "(POS, Club)" tag in
 * `name` (it keeps their POS:Name key unique); it never shows. */
export const displayName = (name: string): string => (name.includes('(') ? name.replace(/\s*\([^)]*\)\s*$/, '') : name);
