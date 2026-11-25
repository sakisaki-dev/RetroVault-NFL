/**
 * The edition: the owner's Retro Bowl league (default) or the NFL demo (VITE_EDITION=nfl, local only).
 * NFL mode runs the same site on real players with their real careers: seasons are real years, there is no coach and
 * no AI-written content, and the browser storage lives under its own "nfl:" namespace.
 */
export const IS_NFL =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_EDITION === 'nfl' ||
  (typeof process !== 'undefined' && process.env?.RV_EDITION === 'nfl'); // build scripts (tsx) set RV_EDITION

/** A season label: "Y98" in the Retro Bowl league, "2026" in the NFL edition. */
export const seasonLabel = (n: number | string): string => {
  const s = String(n).replace(/^Y/, '');
  return IS_NFL ? s : `Y${s}`;
};

/** A span of seasons: "Y3–7" / "2018–2026". */
export const seasonSpan = (a: number, b: number): string =>
  a === b ? seasonLabel(a) : IS_NFL ? `${a}–${b}` : `Y${a}–${b}`;

/** Top-level tabs the NFL edition hides (everything built on the coach or the AI-written lanes). */
export const NFL_HIDDEN_TABS = ['office', 'timeline', 'hof'];
/** Tabs only the NFL edition has: News (ESPN's feed) sits where the Timeline was; College is shown once its route exists (hashRoute KNOWN_TABS) */
export const NFL_ONLY_TABS = ['news', 'college'];

/**
 * Keeps the NFL edition's browser storage apart from the Retro Vault league's: every localStorage / sessionStorage
 * key and IndexedDB database name gets an "nfl:" prefix. Installed once, before anything reads storage.
 */
export const installNflStorage = () => {
  if (!IS_NFL) return;
  const P = 'nfl:';
  try {
    const proto = Storage.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const orig = { get: proto.getItem, set: proto.setItem, remove: proto.removeItem, key: proto.key };
    proto.getItem = function (k: unknown) { return orig.get.call(this, P + String(k)); };
    proto.setItem = function (k: unknown, v: unknown) { return orig.set.call(this, P + String(k), v); };
    proto.removeItem = function (k: unknown) { return orig.remove.call(this, P + String(k)); };
    proto.key = function (i: unknown) {
      const own = Object.keys(this as object).filter((k) => k.startsWith(P));
      const k = own[Number(i)];
      return k === undefined ? null : k.slice(P.length);
    };
    const len = Object.getOwnPropertyDescriptor(Storage.prototype, 'length');
    Object.defineProperty(Storage.prototype, 'length', {
      get() { return Object.keys(this as object).filter((k) => k.startsWith(P)).length; },
      configurable: true, enumerable: len?.enumerable ?? true,
    });
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((name: string, version?: number) => open(P + name, version)) as typeof indexedDB.open;
    const del = indexedDB.deleteDatabase.bind(indexedDB);
    indexedDB.deleteDatabase = ((name: string) => del(P + name)) as typeof indexedDB.deleteDatabase;
  } catch {
    // Storage unavailable: nothing to namespace
  }
};
