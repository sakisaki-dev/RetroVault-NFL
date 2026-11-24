/**
 * Name suffixes (Jr., Sr., II, III, IV, V). The league sheet keeps them ("James Cook III", "Marvin Harrison Jr.") but
 * nflverse game lines, ESPN tags and Wikipedia award lists often drop them ("James Cook"), so every lookup by a name
 * that comes from outside the sheet goes through here: exact first, else the one player whose name differs only by a
 * suffix, and nothing when two players share the bare name.
 */
const SUFFIX = /\s+(jr|sr|ii|iii|iv|v)\.?$/i;

/** "James Cook III" -> "James Cook"; a two-word name ("Jr. Smith") is left alone. */
export const stripSuffix = (name: string): string => (name.trim().split(/\s+/).length > 2 ? name.trim().replace(SUFFIX, '') : name.trim());

/** `POS:Name` key without the suffix: "WR:Marvin Harrison Jr." -> "WR:Marvin Harrison". */
export const stripKeySuffix = (key: string): string => {
  const i = key.indexOf(':');
  return i < 0 ? stripSuffix(key) : `${key.slice(0, i)}:${stripSuffix(key.slice(i + 1))}`;
};

const cache = new WeakMap<object, Map<string, string | null>>();

/**
 * A map from the suffix-free key to the one full key it belongs to (null when several share it) over `keys`'s own
 * property names or values; built once per object.
 */
const baseIndex = (owner: object, keys: Iterable<string>): Map<string, string | null> => {
  let m = cache.get(owner);
  if (!m) {
    m = new Map();
    for (const k of keys) {
      const b = stripKeySuffix(k);
      if (b === k) continue; // only suffixed keys need an alias
      m.set(b, m.has(b) ? null : k);
    }
    cache.set(owner, m);
  }
  return m;
};

/** `key` itself when `known` has it, else the single suffixed key that matches it without the suffix, else `key`. */
export const resolveSuffixKey = (known: Record<string, unknown>, key: string): string => {
  if (key in known) return key;
  // the outside name carries a suffix the sheet doesn't ("Deebo Samuel Sr." vs the sheet's "Deebo Samuel")
  const bare = stripKeySuffix(key);
  if (bare !== key && bare in known) return bare;
  return baseIndex(known, Object.keys(known)).get(bare) ?? key;
};
