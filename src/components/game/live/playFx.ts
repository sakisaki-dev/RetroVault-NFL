import type { LiveGame, LivePlay } from '@/utils/liveGames';
import { sameClub, type Situation } from './liveField';

/**
 * The latest play drawn on the field, from what ESPN's play-by-play says and nothing else: its type and text (pass
 * short/deep left/middle/right, run lane), where it began and where it ended (yard lines). There is no tracking data, so
 * no other player's route or coverage is drawn. A play whose text can't be read shows the ball moving from the old
 * spot to the new one. Points are [yards from the away goal line, 0 top .. 1 bottom of the field].
 */
export type Pt = [number, number];
export interface PlayFx {
  /** the ball's flight (2 or 3 points) and whether it arcs (a throw or a kick) */
  ball: Pt[];
  arc: number;
  /** the receiver or carrier's path, drawn as a line with a marker running it */
  runner: Pt[] | null;
  /** a ring and tag at a spot (sack, interception, fumble, incompletion, touchdown) */
  mark: { at: Pt; tag: string; tone: 'bad' | 'good' | 'plain' } | null;
}

const QB_DEPTH = 4.6;
const BACK_DEPTH = 7.4;

export const playFx = (lp: LivePlay | null | undefined, g: LiveGame, sit: Situation | null): PlayFx | null => {
  if (!lp) return null;
  const score = /touchdown/i.test(lp.type) || /touchdown/i.test(lp.text);
  // the scoreboard's spot is where the ball is now; a scoring play ends where it scored, not at the next kickoff spot
  const to = score ? lp.to ?? sit?.ball ?? null : sit?.ball ?? lp.to;
  const from = lp.from ?? to;
  if (from == null || to == null) return null;
  const dir: 1 | -1 = lp.off ? (sameClub(lp.off, g.away.abbr) ? 1 : -1) : sit?.dir ?? 1;
  const text = lp.text;
  const type = lp.type.toLowerCase();
  const qb: Pt = [from - dir * QB_DEPTH, 0.52];
  // "left" is the offence's left: up the screen when it heads right, down when it heads left
  const sideY = (side: string, wide = 0.2): number => (side === 'middle' ? 0.5 : (side === 'left') === (dir === 1) ? wide : 1 - wide);
  const td = score;
  const tdMark = td ? { at: [to, 0.5] as Pt, tag: 'TD', tone: 'good' as const } : null;

  if (/sack/.test(type)) return { ball: [qb, [to, 0.52]], arc: 0, runner: null, mark: { at: [to, 0.52], tag: 'SACK', tone: 'bad' } };
  if (/punt|kickoff|field goal|blocked/.test(type)) return { ball: [[from, 0.5], [to, 0.5]], arc: 70, runner: null, mark: tdMark };
  if (/intercept/.test(type)) {
    const side = /(left|middle|right)/.exec(text)?.[1] ?? 'middle';
    return { ball: [qb, [to, sideY(side, 0.28)]], arc: 40, runner: null, mark: { at: [to, sideY(side, 0.28)], tag: 'INT', tone: 'bad' } };
  }
  if (/fumble/.test(type)) return { ball: [[from, 0.5], [to, 0.5]], arc: 0, runner: null, mark: { at: [to, 0.5], tag: 'FUMBLE', tone: 'bad' } };

  if (/pass/.test(type) || /\bpass\b/i.test(text)) {
    const m = /pass (?:incomplete )?(short|deep)?\s*(left|middle|right)/i.exec(text);
    const side = m?.[2]?.toLowerCase();
    const deep = m?.[1]?.toLowerCase() === 'deep';
    if (/incompletion|incomplete/.test(type + ' ' + text.toLowerCase())) {
      if (!side) return { ball: [qb, [from + dir * 8, 0.5]], arc: 36, runner: null, mark: { at: [from + dir * 8, 0.5], tag: 'INC', tone: 'plain' } };
      const tx = from + dir * (deep ? 22 : 8);
      const ty = sideY(side, deep ? 0.12 : 0.22);
      return { ball: [qb, [tx, ty]], arc: deep ? 56 : 34, runner: [[from, sideY(side, 0.1)], [tx, ty]], mark: { at: [tx, ty], tag: 'INC', tone: 'plain' } };
    }
    if (!side) return { ball: [qb, [to, 0.5]], arc: 40, runner: null, mark: tdMark };
    const y = sideY(side, deep ? 0.14 : 0.24);
    return { ball: [qb, [to, y]], arc: Math.min(70, 26 + Math.abs(to - from) * 1.6), runner: [[from, side === 'middle' ? 0.62 : sideY(side, 0.1)], [to, y]], mark: tdMark };
  }

  if (/rush|run|scramble/.test(type) || /\b(left|right) (end|tackle|guard)|up the middle/i.test(text)) {
    const m = /(left|right) (end|tackle|guard)/i.exec(text);
    const y = m ? sideY(m[1].toLowerCase(), m[2].toLowerCase() === 'end' ? 0.17 : m[2].toLowerCase() === 'tackle' ? 0.34 : 0.43) : 0.5;
    const start: Pt = /scramble/i.test(text) ? qb : [from - dir * BACK_DEPTH, 0.52];
    const path: Pt[] = [start, [from, y], [to, y]];
    return { ball: path, arc: 0, runner: path, mark: tdMark };
  }
  // anything else: the ball moves from the old spot to the new one
  return { ball: [[from, 0.5], [to, 0.5]], arc: 0, runner: null, mark: tdMark };
};
