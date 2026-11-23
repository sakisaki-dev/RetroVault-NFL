import type { Player } from '@/types/player';
import { bannerTeamOf } from '@/utils/playerExtras';

/**
 * NFL news: which of our players an ESPN article is about. A name index is built once per roster; each text is scanned
 * lazily (headline + description for the feed, the full story once the reader has it). A player counts when his full
 * name appears (suffixes and initials handled: "Marvin Harrison Jr.", "J.J. McCarthy"); his last name alone then counts
 * only for a player already named in full or tagged by ESPN ("Lawrence threw ..."). Coaches and anyone not on the
 * roster never match. ESPN's own athlete tags are merged in. Ranking: in the headline > in the description > body mentions.
 */

const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/;
/** Lower-case, accent-free, no dots or apostrophes, possessive cut, trailing suffix dropped: "Marvin Harrison Jr." -> "marvin harrison" */
export const nameKey = (s: string): string => {
  const t = s
    .replace(/\s*\(.*\)$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[.'’`]/g, '')
    .replace(/[^a-z0-9 -]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  while (t.length > 2 && SUFFIX.test(t[t.length - 1])) t.pop();
  return t.join(' ');
};

export interface NameIndex {
  full: Map<string, Player[]>;
}
const indexes = new WeakMap<Player[], NameIndex>();
export const nameIndexOf = (players: Player[]): NameIndex => {
  let ix = indexes.get(players);
  if (!ix) {
    const full = new Map<string, Player[]>();
    players.forEach((p) => {
      if (p.isRealLegend) return;
      const k = nameKey(p.name);
      if (k.split(' ').length < 2) return;
      const a = full.get(k);
      if (a) a.push(p);
      else full.set(k, [p]);
    });
    ix = { full };
    indexes.set(players, ix);
  }
  return ix;
};

export interface Mention {
  player: Player;
  headline: number;
  desc: number;
  body: number;
  tagged: boolean;
  score: number;
  /** A big focus of the piece: in the headline, or three or more mentions in the story */
  focus: boolean;
}

const words = (text: string) => text.match(/[\p{L}][\p{L}.'’-]*/gu) ?? [];
const lastOf = (p: Player) => nameKey(p.name).split(' ').slice(-1)[0];

/** Full-name matches in a text, then last-name-only mentions of the players found (or tagged) */
const scan = (text: string, ix: NameIndex, tagged: Player[], teams: string[], also: Iterable<Player> = []): Map<Player, number> => {
  const ws = words(text);
  const out = new Map<Player, number>();
  const covered = new Set<number>();
  const pick = (c: Player[]): Player | undefined => {
    if (c.length === 1) return c[0];
    return (
      c.find((p) => tagged.includes(p)) ??
      c.find((p) => teams.includes(bannerTeamOf(p))) ??
      [...c].sort((a, b) => Number(b.status === 'Active') - Number(a.status === 'Active') || b.careerLegacy - a.careerLegacy)[0]
    );
  };
  for (let i = 0; i < ws.length; i++) {
    for (let len = 4; len >= 2; len--) {
      if (i + len > ws.length) continue;
      const cand = ix.full.get(nameKey(ws.slice(i, i + len).join(' ')));
      if (!cand) continue;
      // a name needs capitals ("josh allen" in a lower-case phrase is not a name)
      if (!/^[A-ZÀ-Þ]/.test(ws[i]) || !/^[A-ZÀ-Þ]/.test(ws[i + len - 1])) continue;
      const p = pick(cand);
      if (!p) continue;
      out.set(p, (out.get(p) ?? 0) + 1);
      for (let j = i; j < i + len; j++) covered.add(j);
      i += len - 1;
      break;
    }
  }
  // last name alone, for a player already in the text or tagged, when no other such player shares it
  const known = new Set<Player>([...out.keys(), ...tagged, ...also]);
  const lasts = new Map<string, Player | null>();
  known.forEach((p) => {
    const l = lastOf(p);
    if (l.length >= 3) lasts.set(l, lasts.has(l) ? null : p);
  });
  ws.forEach((w, i) => {
    if (covered.has(i) || !/^[A-ZÀ-Þ]/.test(w)) return;
    const p = lasts.get(nameKey(w));
    if (p) out.set(p, (out.get(p) ?? 0) + 1);
  });
  return out;
};

export interface MentionInput {
  headline: string;
  description: string;
  /** The story's plain text once loaded */
  body?: string;
  tagged: Player[];
  teams: string[];
}

/** Everyone the piece names, best focus first. */
export const mentionsOf = (inp: MentionInput, players: Player[]): Mention[] => {
  const ix = nameIndexOf(players);
  // pass 1 finds everyone named in full anywhere; pass 2 also counts their last names ("Pickens" in a headline)
  const texts = [inp.headline, inp.description, inp.body ?? ''];
  const named = new Set<Player>(texts.flatMap((t) => [...scan(t, ix, inp.tagged, inp.teams).keys()]));
  const [h, d, b] = texts.map((t) => scan(t, ix, inp.tagged, inp.teams, named));
  const all = new Set<Player>([...inp.tagged, ...h.keys(), ...d.keys(), ...b.keys()]);
  const list: Mention[] = [...all].map((player) => {
    const headline = h.get(player) ?? 0;
    const desc = d.get(player) ?? 0;
    const body = b.get(player) ?? 0;
    const tagged = inp.tagged.includes(player);
    const score = headline * 12 + desc * 5 + Math.min(body, 12) + (tagged ? 2 : 0);
    return { player, headline, desc, body, tagged, score, focus: headline > 0 || body >= 3 };
  });
  return list.sort((a, c) => c.score - a.score || c.player.careerLegacy - a.player.careerLegacy);
};

/** The players to draw in the hero: focus players (up to 3); with none, the best-ranked tagged one(s). */
export const focusOf = (m: Mention[], max = 3): Player[] => {
  const f = m.filter((x) => x.focus);
  return (f.length ? f : m.filter((x) => x.tagged || x.desc > 0)).slice(0, max).map((x) => x.player);
};

/** Does this text name him in full (the Deep Dive's "mentions him")? */
export const namesPlayer = (text: string, p: Player): boolean => {
  const k = nameKey(p.name);
  return k.split(' ').length >= 2 && ` ${nameKey(text)} `.includes(` ${k} `);
};

