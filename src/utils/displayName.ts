import { stripSuffix } from './nameSuffix';

/** A player's name as people read it. Two players with one name and position carry an internal "(POS, Club)" tag in
 * `name` (it keeps their POS:Name key unique); it never shows. */
export const displayName = (name: string): string => (name.includes('(') ? name.replace(/\s*\([^)]*\)\s*$/, '') : name);

/** Lower-case particles that belong to the surname that follows them ("St. Brown", "Van der Berg", "De La Cruz"). */
const PARTICLES = new Set(['st', 'st.', 'van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'du', 'la', 'le', 'mc', 'mac', 'ten', 'ter']);

/**
 * A player's name split into the given names and the surname, with any "(POS, Club)" tag dropped. A trailing suffix
 * (Jr., Sr., II, III, IV, V) stays with the surname, never as a name of its own (owner: "should be part of the last
 * name, not a third name"): "Marvin Harrison Jr." → { first: "Marvin", last: "Harrison Jr." }, "Amon-Ra St. Brown" →
 * { first: "Amon-Ra", last: "St. Brown" }. A one-word name is all `last`. Show the full `displayName` wherever the whole
 * name is meant; use this only for surname-only and first/last displays.
 */
export const firstAndLast = (name: string): { first: string; last: string } => {
  const full = displayName(name).trim();
  const bare = stripSuffix(full);
  const suffix = full.slice(bare.length).trim();
  const parts = bare.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first: '', last: [parts[0] ?? '', suffix].filter(Boolean).join(' ') };
  let i = parts.length - 1;
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i--;
  return { first: parts.slice(0, i).join(' '), last: [parts.slice(i).join(' '), suffix].filter(Boolean).join(' ') };
};

/** "Ja'Marr Chase" → "Chase", "Marvin Harrison Jr." → "Harrison Jr.", "Amon-Ra St. Brown" → "St. Brown". */
export const surnameOf = (name: string): string => firstAndLast(name).last;
